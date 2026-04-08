#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { parseArgs, randomRequestId, requireArg } from './lib/cli.mjs'
import { gatewayConnect, gatewayHealth, gatewayInboxIndex } from './lib/gateway_control.mjs'
import { resolveGatewayBase, defaultGatewayStateFile, readGatewayState, currentRuntimeRevision } from './lib/gateway_runtime.mjs'
import { getAgentCard, getBindingDocument, getFriendDirectory, createConnectTicket, introspectConnectTicket, reportSession } from './lib/relay_http.mjs'
import { generateRuntimeKeyBundle, writeRuntimeKeyBundle } from './lib/generate_runtime_keypair.mjs'
import { runGateway } from './lib/gateway_server.mjs'
import { createHostRuntimeAdapter, detectHostRuntimeEnvironment } from './adapters/index.mjs'
import { inspectOpenClawLocalSkills, resolveOpenClawOutboundSkillHint, summarizeOpenClawConversation } from './adapters/openclaw/adapter.mjs'
import { resolveOpenClawAgentSelection } from './adapters/openclaw/detect.mjs'
import { defaultInboxDir } from './lib/gateway_inbox.mjs'
import { buildSenderBaseReport, buildSenderFailureReport, buildSkillOutboundText, inferOwnerFacingLanguage, peerResponseText, renderOwnerFacingReport } from './lib/a2_message_templates.mjs'
import { buildStandardRuntimeOwnerLines, buildStandardRuntimeReport } from './lib/runtime_report.mjs'
import { chooseInboundSkill, resolveMailboxKey } from './lib/agent_router.mjs'
import { createLocalRuntimeExecutor } from './lib/local_runtime.mjs'
import { createLiveConversationStore } from './lib/live_conversation_store.mjs'
import { normalizeConversationControl, parseSkillDocumentPolicy, resolveSkillMaxTurns, shouldContinueConversation } from './lib/conversation_policy.mjs'
import {
  assertNoExistingLocalActivation,
  buildGatewayArgs,
  discoverLocalAgentProfiles,
  ensureGatewayForUse,
  inspectExistingGateway,
  resolveAgentContext,
  resolvedHostRuntimeFromHealth,
  reusableLocalProfiles,
  signedRelayContext,
  toOwnerFacingText,
  waitForGatewayReady
} from './lib/gateway_lifecycle.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = __dirname

function clean(value) {
  return `${value ?? ''}`.trim()
}

function excerpt(text, maxLength = 180) {
  const compact = clean(text).replace(/\s+/g, ' ').trim()
  if (!compact) {
    return ''
  }
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 3)}...` : compact
}

function parseJwtPayloadUnverified(token) {
  const serialized = clean(token)
  if (!serialized) {
    return null
  }
  const parts = serialized.split('.')
  if (parts.length < 2) {
    return null
  }
  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
  } catch {
    return null
  }
}

function printJson(payload) {
  console.log(JSON.stringify(payload, null, 2))
}

function toOwnerFacingLines(text = '') {
  return clean(text)
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
}

function buildOwnerReportDeliveredText(language = 'en') {
  if (`${language}`.toLowerCase().startsWith('zh')) {
    return '🅰️✌️ 完整的 AgentSquared 报告已经通过当前主人频道发送。'
  }
  return '🅰️✌️ The full AgentSquared report has already been sent through the current owner channel.'
}

async function pushCliOwnerReport({
  agentId,
  keyFile,
  args,
  targetAgentId,
  selectedSkill,
  ownerReport,
  deliveryId = ''
} = {}) {
  try {
    const hostContext = await resolveCliOpenClawHostContext({
      agentId,
      keyFile,
      args,
      purpose: 'AgentSquared owner report delivery'
    })
    const hostAdapter = createHostRuntimeAdapter({
      hostRuntime: 'openclaw',
      localAgentId: agentId,
      openclaw: {
        stateDir: hostContext.openclawStateDir,
        openclawAgent: hostContext.resolvedOpenClawAgent,
        command: hostContext.openclawCommand,
        cwd: hostContext.openclawCwd,
        configPath: hostContext.openclawConfigPath,
        sessionPrefix: hostContext.openclawSessionPrefix,
        timeoutMs: 30000,
        gatewayUrl: hostContext.openclawGatewayUrl,
        gatewayToken: hostContext.openclawGatewayToken,
        gatewayPassword: hostContext.openclawGatewayPassword
      }
    })
    if (!hostAdapter?.pushOwnerReport) {
      return { delivered: false, attempted: false, mode: 'openclaw', reason: 'host-adapter-missing-push-owner-report' }
    }
    return await hostAdapter.pushOwnerReport({
      item: {
        inboundId: clean(deliveryId) || randomRequestId('sender-owner-report'),
        remoteAgentId: targetAgentId
      },
      selectedSkill,
      ownerReport
    })
  } catch (error) {
    return {
      delivered: false,
      attempted: true,
      mode: 'openclaw',
      reason: clean(error?.message) || 'owner-report-delivery-failed'
    }
  }
}

function resolveUserPath(inputPath) {
  return path.resolve(`${inputPath}`.replace(/^~(?=$|\/|\\)/, process.env.HOME || '~'))
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)))
}

function walkLocalFiles(dirPath, out, depth = 0, maxDepth = 4) {
  if (!dirPath || !fs.existsSync(dirPath) || depth > maxDepth) {
    return
  }
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') {
        continue
      }
      walkLocalFiles(entryPath, out, depth + 1, maxDepth)
      continue
    }
    if (entry.isFile()) {
      out.push(entryPath)
    }
  }
}

function loadSharedSkillFile(skillFile) {
  const resolved = resolveUserPath(skillFile)
  const text = fs.readFileSync(resolved, 'utf8')
  const policy = parseSkillDocumentPolicy(text, {
    fallbackName: path.basename(path.dirname(resolved)) || path.basename(resolved, path.extname(resolved))
  })
  return {
    path: resolved,
    name: policy.name,
    maxTurns: policy.maxTurns,
    document: clean(text).slice(0, 16000)
  }
}

function extractPeerResponseMetadata(response = null) {
  const target = response?.result && typeof response.result === 'object'
    ? response.result
    : response
  return target?.metadata && typeof target.metadata === 'object'
    ? target.metadata
    : {}
}

function resolveConversationPolicy(skillName = '', sharedSkill = null) {
  return {
    skillName: clean(skillName) || 'friend-im',
    maxTurns: resolveSkillMaxTurns(skillName, sharedSkill)
  }
}

async function resolveCliOpenClawHostContext({
  agentId,
  keyFile,
  args,
  purpose = 'AgentSquared local runtime execution'
}) {
  const preferredHostRuntime = clean(args['host-runtime']) || 'auto'
  const openclawCommand = clean(args['openclaw-command']) || 'openclaw'
  const openclawCwd = clean(args['openclaw-cwd'])
  const openclawConfigPath = clean(args['openclaw-config-path'] || process.env.OPENCLAW_CONFIG_PATH)
  const openclawGatewayUrl = clean(args['openclaw-gateway-url'])
  const openclawGatewayToken = clean(args['openclaw-gateway-token'])
  const openclawGatewayPassword = clean(args['openclaw-gateway-password'])
  const openclawSessionPrefix = clean(args['openclaw-session-prefix']) || 'agentsquared:'
  const detectedHostRuntime = await detectHostRuntimeEnvironment({
    preferred: preferredHostRuntime,
    openclaw: {
      command: openclawCommand,
      cwd: openclawCwd,
      configPath: openclawConfigPath,
      gatewayUrl: openclawGatewayUrl,
      gatewayToken: openclawGatewayToken,
      gatewayPassword: openclawGatewayPassword
    }
  })
  const resolvedHostRuntime = detectedHostRuntime.resolved || 'none'
  if (resolvedHostRuntime !== 'openclaw') {
    const detected = detectedHostRuntime.resolved || detectedHostRuntime.id || 'none'
    const reason = clean(detectedHostRuntime.reason)
    throw new Error(
      `${clean(purpose) || 'AgentSquared local runtime execution'} currently supports only the OpenClaw host runtime. Detected host runtime: ${detected}.${reason ? ` Detection reason: ${reason}.` : ''}`
    )
  }
  const detectedOpenClawAgent = clean(resolveOpenClawAgentSelection(detectedHostRuntime).defaultAgentId)
  const resolvedOpenClawAgent = clean(args['openclaw-agent']) || detectedOpenClawAgent
  if (!resolvedOpenClawAgent) {
    throw new Error(`OpenClaw was detected for ${clean(purpose).toLowerCase() || 'local runtime execution'}, but no OpenClaw agent id could be resolved.`)
  }
  return {
    detectedHostRuntime,
    resolvedOpenClawAgent,
    openclawCommand,
    openclawCwd,
    openclawConfigPath,
    openclawGatewayUrl,
    openclawGatewayToken,
    openclawGatewayPassword,
    openclawSessionPrefix,
    openclawStateDir: path.dirname(path.resolve(keyFile)),
    agentId
  }
}

async function createCliLocalRuntimeExecutor({
  agentId,
  keyFile,
  args
}) {
  const hostContext = await resolveCliOpenClawHostContext({
    agentId,
    keyFile,
    args,
    purpose: 'local multi-turn execution'
  })
  return createLocalRuntimeExecutor({
    agentId,
    mode: 'host',
    hostRuntime: 'openclaw',
    conversationStore: createLiveConversationStore(),
    openclawStateDir: hostContext.openclawStateDir,
    openclawCommand: hostContext.openclawCommand,
    openclawCwd: hostContext.openclawCwd,
    openclawConfigPath: hostContext.openclawConfigPath,
    openclawAgent: hostContext.resolvedOpenClawAgent,
    openclawSessionPrefix: hostContext.openclawSessionPrefix,
    openclawTimeoutMs: 180000,
    openclawGatewayUrl: hostContext.openclawGatewayUrl,
    openclawGatewayToken: hostContext.openclawGatewayToken,
    openclawGatewayPassword: hostContext.openclawGatewayPassword
  })
}

async function resolveOutboundSkillHint({
  agentId,
  keyFile,
  args,
  targetAgentId,
  text,
  explicitSkillName = '',
  sharedSkill = null
}) {
  const explicit = clean(explicitSkillName)
  if (explicit) {
    return {
      skillHint: explicit,
      source: 'explicit',
      reason: 'explicit-skill-arg'
    }
  }
  const sharedSkillName = clean(sharedSkill?.name)
  if (sharedSkillName) {
    return {
      skillHint: sharedSkillName,
      source: 'shared-skill',
      reason: 'shared-skill-file'
    }
  }
  try {
    const hostContext = await resolveCliOpenClawHostContext({
      agentId,
      keyFile,
      args,
      purpose: 'outbound skill selection'
    })
    const decision = await resolveOpenClawOutboundSkillHint({
      localAgentId: agentId,
      targetAgentId,
      ownerText: text,
      openclawAgent: hostContext.resolvedOpenClawAgent,
      command: hostContext.openclawCommand,
      cwd: hostContext.openclawCwd,
      configPath: hostContext.openclawConfigPath,
      stateDir: hostContext.openclawStateDir,
      gatewayUrl: hostContext.openclawGatewayUrl,
      gatewayToken: hostContext.openclawGatewayToken,
      gatewayPassword: hostContext.openclawGatewayPassword,
      availableSkills: ['friend-im', 'agent-mutual-learning']
    })
    return {
      skillHint: clean(decision.skillHint) || 'friend-im',
      source: 'agent-decision',
      reason: clean(decision.reason) || 'agent-selected-skill'
    }
  } catch (error) {
    return {
      skillHint: 'friend-im',
      source: 'fallback',
      reason: clean(error?.message) || 'agent-decision-failed'
    }
  }
}

async function executeLocalConversationTurn({
  localRuntimeExecutor,
  localAgentId,
  targetAgentId,
  peerSessionId,
  conversationKey,
  skillHint,
  sharedSkill,
  inboundText,
  turnIndex,
  remoteControl = null
}) {
  const normalizedRemoteControl = normalizeConversationControl(remoteControl ?? {}, {
    defaultTurnIndex: Math.max(1, Number.parseInt(`${turnIndex ?? 1}`, 10) - 1),
    defaultDecision: 'done',
    defaultStopReason: '',
    defaultFinalize: false
  })
  const item = {
    inboundId: `local-turn-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    remoteAgentId: targetAgentId,
    peerSessionId,
    suggestedSkill: skillHint,
    defaultSkill: skillHint || 'friend-im',
    request: {
      id: `local-turn-${turnIndex}`,
      method: 'message/send',
      params: {
        message: {
          kind: 'message',
          role: 'agent',
          parts: [{ kind: 'text', text: clean(inboundText) }]
        },
        metadata: {
          ...(sharedSkill ? { sharedSkill } : {}),
          from: targetAgentId,
          to: localAgentId,
          originalOwnerText: clean(inboundText),
          conversationKey: clean(conversationKey),
          turnIndex,
          decision: normalizedRemoteControl.decision,
          stopReason: normalizedRemoteControl.stopReason,
          finalize: normalizedRemoteControl.finalize
        }
      }
    }
  }
  const selectedSkill = chooseInboundSkill(item, {
    defaultSkill: skillHint || 'friend-im'
  })
  return localRuntimeExecutor({
    item,
    selectedSkill,
    mailboxKey: resolveMailboxKey(item)
  })
}

function safeAgentId(value) {
  return clean(value).replace(/[^a-zA-Z0-9_.-]+/g, '_')
}

function receiptFileFor(keyFile, fullName) {
  return path.join(path.dirname(resolveUserPath(keyFile)), `${safeAgentId(fullName)}_receipt.json`)
}

function onboardingSummaryFileFor(keyFile, fullName) {
  return path.join(path.dirname(resolveUserPath(keyFile)), `${safeAgentId(fullName)}_onboarding_summary.json`)
}

function gatewayLogFileFor(keyFile, fullName) {
  return path.join(path.dirname(resolveUserPath(keyFile)), `${safeAgentId(fullName)}_gateway.log`)
}

function writeJson(filePath, payload) {
  const resolved = resolveUserPath(filePath)
  fs.mkdirSync(path.dirname(resolved), { recursive: true })
  fs.writeFileSync(resolved, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 })
  return resolved
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(resolveUserPath(filePath), 'utf8'))
}

function archiveGatewayStateFile(gatewayStateFile, reason = 'stale') {
  const resolved = clean(gatewayStateFile) ? resolveUserPath(gatewayStateFile) : ''
  if (!resolved || !fs.existsSync(resolved)) {
    return ''
  }
  const archived = `${resolved}.${clean(reason) || 'archived'}.${Date.now()}.bak`
  fs.renameSync(resolved, archived)
  return archived
}

function pidExists(pid) {
  const numeric = Number.parseInt(`${pid ?? ''}`, 10)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return false
  }
  try {
    process.kill(numeric, 0)
    return true
  } catch (error) {
    return error?.code !== 'ESRCH'
  }
}

function parsePid(value) {
  const numeric = Number.parseInt(`${value ?? ''}`, 10)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null
}

function boolFlag(value, fallback = false) {
  const normalized = clean(value).toLowerCase()
  if (!normalized) {
    return fallback
  }
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true
  }
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
    return false
  }
  return fallback
}

function classifyGatewayFailure(error = '', hostRuntime = null) {
  const message = clean(error)
  const lower = message.toLowerCase()
  if (!message) {
    return {
      code: 'gateway-startup-failed',
      retryable: true,
      guidance: [
        'Retry after updating the official Skills and restarting the local AgentSquared gateway.',
        'If the relay or host runtime still looks unstable, retry later.',
        'If the problem persists, open an issue in the official Skills repository.'
      ]
    }
  }
  if (lower.includes('host runtime preflight failed') || lower.includes('openclaw') || lower.includes('pairing') || lower.includes('loopback')) {
    return {
      code: 'adapter-startup-failed',
      retryable: true,
      guidance: [
        `The ${clean(hostRuntime?.resolved) || 'host'} adapter could not be reached during gateway startup.`,
        'Update the official Skills and restart the local AgentSquared gateway.',
        'If the local host runtime is unstable, retry later.',
        'If the adapter still fails, report it to the official Skills issue tracker.'
      ]
    }
  }
  if (lower.includes('relay') || lower.includes('reservation') || lower.includes('presence') || lower.includes('too many requests') || lower.includes('429')) {
    return {
      code: 'relay-startup-failed',
      retryable: true,
      guidance: [
        'The AgentSquared relay path was not healthy enough during gateway startup.',
        'Retry after updating the official Skills or wait and retry later if the remote service looks unstable.',
        'If relay startup keeps failing, report it to the official Skills issue tracker.'
      ]
    }
  }
  return {
    code: 'gateway-startup-failed',
    retryable: true,
    guidance: [
      'Retry after updating the official Skills and restarting the local AgentSquared gateway.',
      'If the problem persists, retry later or report it to the official Skills issue tracker.'
    ]
  }
}

function describeDetectedHostRuntime(detectedHostRuntime = null) {
  const resolved = clean(detectedHostRuntime?.resolved)
  if (resolved && resolved !== 'none') {
    return resolved
  }
  const requested = clean(detectedHostRuntime?.requested)
  if (requested && requested !== 'auto') {
    return requested
  }
  return clean(detectedHostRuntime?.id) || 'unknown'
}

function assertSupportedActivationHostRuntime(detectedHostRuntime = null) {
  if (clean(detectedHostRuntime?.resolved) === 'openclaw') {
    return
  }
  const detected = describeDetectedHostRuntime(detectedHostRuntime)
  const reason = clean(detectedHostRuntime?.reason)
  const suggested = clean(detectedHostRuntime?.suggested) || 'openclaw'
  const detail = reason ? ` Detection reason: ${reason}.` : ''
  throw new Error(
    `AgentSquared activation currently supports only the OpenClaw host runtime. Detected host runtime: ${detected}.${detail} Finish installing/configuring OpenClaw first, then retry onboarding. Other host runtimes are not adapted yet, so activation stops before registration. Suggested host runtime: ${suggested}.`
  )
}

function isFlagToken(value) {
  return clean(value).startsWith('-')
}

function resolveHostWorkspaceDir(detectedHostRuntime = null) {
  return clean(
    detectedHostRuntime?.workspaceDir
      ?? detectedHostRuntime?.overviewStatus?.agents?.agents?.find?.((item) => clean(item?.workspaceDir))?.workspaceDir
      ?? detectedHostRuntime?.overviewStatus?.agents?.agents?.[0]?.workspaceDir
  )
}

function resolveAgentSquaredDir(args = {}, detectedHostRuntime = null) {
  const explicit = clean(args['agentsquared-dir'])
  if (explicit) {
    return resolveUserPath(explicit)
  }
  const workspaceDir = resolveHostWorkspaceDir(detectedHostRuntime)
  if (workspaceDir) {
    return path.join(resolveUserPath(workspaceDir), 'AgentSquared')
  }
  if (process.env.HOME) {
    return path.join(process.env.HOME, '.agentsquared')
  }
  return path.join(process.cwd(), 'AgentSquared')
}

function defaultRuntimeKeyFile(agentName, args = {}, detectedHostRuntime = null) {
  return path.join(resolveAgentSquaredDir(args, detectedHostRuntime), `${safeAgentId(agentName)}_runtime_key.json`)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function classifyOutboundFailure(error = '', targetAgentId = '') {
  const message = clean(error)
  const lower = message.toLowerCase()
  if (lower.includes('request receipt timed out after')) {
    return {
      code: 'turn-receipt-timeout',
      reason: `${clean(targetAgentId) || 'The target agent'} did not confirm receipt of this AgentSquared turn within 20 seconds, so delivery for this turn could not be confirmed.`,
      nextStep: 'Do not continue the conversation automatically. Tell the owner this specific turn did not receive a delivery receipt in time, then ask whether they want to retry later.'
    }
  }
  if (lower.includes('turn response timed out after')) {
    return {
      code: 'turn-response-timeout',
      reason: `${clean(targetAgentId) || 'The target agent'} accepted this AgentSquared turn, but did not return a final response before the per-turn response timeout.`,
      nextStep: 'Do not automatically resend the same turn. Tell the owner the remote side acknowledged the turn but did not finish responding in time, then ask whether they want to wait for a later reply or retry later.'
    }
  }
  if (lower.includes('delivery status is unknown after the request was dispatched')) {
    return {
      code: 'delivery-status-unknown',
      reason: `${clean(targetAgentId) || 'The target agent'} may already have received and processed this AgentSquared message, but the response could not be confirmed locally.`,
      nextStep: 'Do not automatically retry this same message. First tell the owner that delivery status is unknown and ask whether they want to check for a reply or retry later.'
    }
  }
  if (lower.includes('no local agent runtime adapter is configured')) {
    return {
      code: 'target-runtime-unavailable',
      reason: `${clean(targetAgentId) || 'The target agent'} is online in AgentSquared, but its local host runtime is not attached correctly right now. The target gateway appears to be running without a supported inbound runtime adapter.`,
      nextStep: 'Do not switch to another target automatically. Stop here and tell the owner the target Agent must restart its AgentSquared gateway after fixing or re-detecting the supported host runtime.'
    }
  }
  if (lower.includes('peer identity') || lower.includes('not visible in friend directory')) {
    return {
      code: 'target-unreachable',
      reason: `${clean(targetAgentId) || 'The target agent'} is not currently reachable through AgentSquared. Relay did not provide a usable live peer identity for this target.`,
      nextStep: 'Do not switch to another target automatically. Stop here and tell the owner this exact target is offline or unavailable. The owner can retry this same target later.'
    }
  }
  if (lower.includes('missing dialaddrs')) {
    return {
      code: 'target-unreachable',
      reason: `${clean(targetAgentId) || 'The target agent'} does not currently expose any dialable AgentSquared transport addresses. The target may be offline, reconnecting, or missing fresh relay-backed transport publication.`,
      nextStep: 'Do not switch to another target automatically. Stop here and tell the owner this exact target is not currently reachable. The owner can retry the same target later.'
    }
  }
  if (lower.includes('gateway transport is unavailable') || lower.includes('recovering') || lower.includes('429') || lower.includes('too many requests') || lower.includes('relay')) {
    return {
      code: 'relay-or-gateway-unavailable',
      reason: message || 'The local AgentSquared gateway or relay path was not healthy enough to deliver this message.',
      nextStep: 'Do not switch to another target automatically. Stop here and tell the owner this delivery failed because the current AgentSquared path is unstable. The owner can retry the same target later.'
    }
  }
  return {
    code: 'delivery-failed',
    reason: message || 'The AgentSquared message could not be delivered.',
    nextStep: 'Do not switch to another target automatically. Stop here and ask the owner whether they want to retry this same target later.'
  }
}


async function registerAgent(args) {
  const apiBase = clean(args['api-base']) || 'https://api.agentsquared.net'
  const authorizationToken = requireArg(args['authorization-token'], '--authorization-token is required')
  const agentName = requireArg(args['agent-name'], '--agent-name is required')
  const keyTypeName = clean(args['key-type']) || 'ed25519'
  const displayName = clean(args['display-name']) || agentName
  const detectedHostRuntime = args.__detectedHostRuntime ?? null
  const keyFile = resolveUserPath(args['key-file'] || defaultRuntimeKeyFile(agentName, args, detectedHostRuntime))
  const keyBundle = generateRuntimeKeyBundle(keyTypeName)
  writeRuntimeKeyBundle(keyFile, keyBundle)

  const response = await fetch(`${apiBase.replace(/\/$/, '')}/api/onboard/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      authorizationToken,
      agentName,
      keyType: keyBundle.keyType,
      publicKey: keyBundle.publicKey,
      displayName
    })
  })
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || `Agent registration failed with status ${response.status}`)
  }
  const result = payload?.value ?? payload
  const receiptFile = receiptFileFor(keyFile, result.fullName || `${agentName}@unknown`)
  writeJson(receiptFile, result)
  return {
    apiBase,
    keyFile,
    keyBundle,
    receiptFile,
    result
  }
}

async function commandOnboard(args) {
  const authorizationToken = clean(args['authorization-token'])
  assertNoExistingLocalActivation(authorizationToken)
  const detectedHostRuntime = await detectHostRuntimeEnvironment({
    preferred: clean(args['host-runtime']) || 'auto',
    openclaw: {
      command: clean(args['openclaw-command']) || 'openclaw',
      cwd: clean(args['openclaw-cwd']),
      openclawAgent: clean(args['openclaw-agent']),
      gatewayUrl: clean(args['openclaw-gateway-url']),
      gatewayToken: clean(args['openclaw-gateway-token']),
      gatewayPassword: clean(args['openclaw-gateway-password'])
    }
  })
  assertSupportedActivationHostRuntime(detectedHostRuntime)
  if (!authorizationToken) {
    throw new Error('--authorization-token is required for first-time onboarding.')
  }
  const registration = await registerAgent({
    ...args,
    __detectedHostRuntime: detectedHostRuntime
  })
  const fullName = registration.result.fullName
  const gatewayStateFile = clean(args['gateway-state-file']) || defaultGatewayStateFile(registration.keyFile, fullName)
  const previousGatewayState = readGatewayState(gatewayStateFile)
  const shouldStartGateway = boolFlag(args['start-gateway'], true)
  let gateway = {
    started: false,
    launchRequested: false,
    pending: false,
    gatewayBase: '',
    health: null,
    error: '',
    logFile: '',
    pid: null
  }

  if (shouldStartGateway) {
    gateway.launchRequested = true
    const gatewayArgs = buildGatewayArgs(args, fullName, registration.keyFile, detectedHostRuntime)
    const existingGateway = await inspectExistingGateway({
      keyFile: registration.keyFile,
      agentId: fullName,
      gatewayStateFile: clean(args['gateway-state-file'])
    })
    if (existingGateway.running && !existingGateway.revisionMatches) {
      gateway = {
        started: false,
        launchRequested: true,
        pending: false,
        gatewayBase: existingGateway.gatewayBase,
        health: existingGateway.health,
        error: 'An existing AgentSquared gateway process is running from an older Skills revision. Use `node a2_cli.mjs gateway restart ...` before onboarding tries to reuse it.',
        logFile: gatewayLogFileFor(registration.keyFile, fullName),
        pid: existingGateway.pid
      }
    } else if (existingGateway.running && existingGateway.healthy) {
      gateway = {
        started: true,
        launchRequested: true,
        pending: false,
        gatewayBase: existingGateway.gatewayBase,
        health: existingGateway.health,
        error: '',
        logFile: gatewayLogFileFor(registration.keyFile, fullName),
        pid: existingGateway.pid
      }
	    } else if (existingGateway.running) {
	      gateway = {
        started: false,
        launchRequested: true,
        pending: true,
        gatewayBase: existingGateway.gatewayBase,
        health: existingGateway.health,
        error: 'An existing AgentSquared gateway process is already running but is not healthy yet. Use `node a2_cli.mjs gateway restart ...` instead of starting another one.',
        logFile: gatewayLogFileFor(registration.keyFile, fullName),
	        pid: existingGateway.pid
	      }
	    } else {
	      let archivedGatewayStateFile = ''
	      if (existingGateway.stateFile && existingGateway.state) {
	        const staleState = !existingGateway.revisionMatches || !clean(existingGateway.state?.gatewayBase)
	        if (staleState) {
	          archivedGatewayStateFile = archiveGatewayStateFile(existingGateway.stateFile, 'restart-required')
	        }
	      }
	      const gatewayLogFile = gatewayLogFileFor(registration.keyFile, fullName)
      fs.mkdirSync(path.dirname(gatewayLogFile), { recursive: true })
      const stdoutFd = fs.openSync(gatewayLogFile, 'a')
      const stderrFd = fs.openSync(gatewayLogFile, 'a')
      const child = spawn(process.execPath, [path.join(ROOT, 'a2_cli.mjs'), 'gateway', ...gatewayArgs], {
        detached: true,
        cwd: ROOT,
        stdio: ['ignore', stdoutFd, stderrFd]
      })
      fs.closeSync(stdoutFd)
      fs.closeSync(stderrFd)
      child.unref()
      gateway.logFile = gatewayLogFile
      gateway.pid = child.pid ?? null
      try {
        const ready = await waitForGatewayReady({
          keyFile: registration.keyFile,
          agentId: fullName,
          gatewayStateFile: clean(args['gateway-state-file']),
          timeoutMs: Number.parseInt(args['gateway-wait-ms'] ?? '90000', 10) || 90000
        })
	        gateway = {
	          started: true,
	          launchRequested: true,
	          pending: false,
	          gatewayBase: ready.gatewayBase,
	          health: ready.health,
	          error: '',
	          logFile: gatewayLogFile,
	          pid: child.pid ?? null,
	          archivedGatewayStateFile
	        }
	      } catch (error) {
        const gatewayState = readGatewayState(gatewayStateFile)
        const discoveredPid = gatewayState?.gatewayPid ?? child.pid ?? null
        const discoveredBase = clean(gatewayState?.gatewayBase)
        const failure = classifyGatewayFailure(error.message, detectedHostRuntime)
	        gateway.pending = pidExists(discoveredPid)
	        gateway.gatewayBase = discoveredBase
	        gateway.pid = parsePid(discoveredPid)
	        gateway.error = error.message
	        gateway.failure = failure
	        gateway.archivedGatewayStateFile = archivedGatewayStateFile
	      }
	    }
  }

  const agentsquaredDir = path.dirname(resolveUserPath(registration.keyFile))
  const inboxDir = defaultInboxDir(registration.keyFile, fullName)
  const onboardingSummaryFile = onboardingSummaryFileFor(registration.keyFile, fullName)
  const standardReport = buildStandardRuntimeReport({
    apiBase: registration.apiBase,
    agentId: fullName,
    keyFile: registration.keyFile,
    detectedHostRuntime,
    registration: registration.result,
    gateway,
    gatewayHealth: gateway.health,
    previousState: previousGatewayState
  })
  const summary = {
    setupComplete: true,
    apiBase: registration.apiBase,
    agentsquaredDir,
    hostRuntime: detectedHostRuntime,
    receiptFile: registration.receiptFile,
    keyFile: registration.keyFile,
    inboxDir,
    memoryReminder: {
      required: true,
      instruction: 'Store the AgentSquared platform introduction, this local AgentSquared directory, the runtime key path, and the common a2_cli commands in the host runtime memory system.'
    },
    registration: registration.result,
    gateway,
    standardReport,
    ownerFacingLines: [
      'AgentSquared setup is complete.',
      `Agent: ${registration.result.fullName}`,
      `AgentSquared directory: ${agentsquaredDir}.`,
      `Host runtime: ${detectedHostRuntime.resolved !== 'none' ? detectedHostRuntime.resolved : `not bound (${detectedHostRuntime.suggested || 'openclaw'} suggested)`}.`,
      gateway.started
        ? `Gateway was auto-started and is running at ${gateway.gatewayBase}.`
        : gateway.pending
          ? `Gateway launch was requested and the background process is still running${gateway.gatewayBase ? ` at ${gateway.gatewayBase}` : ''}, but health was not confirmed before timeout.`
          : `Gateway auto-start is not confirmed${gateway.error ? `: ${gateway.error}` : '.'}`,
      gateway.logFile
        ? `Gateway log file: ${gateway.logFile}.`
        : 'Gateway log file: unavailable.',
      ...(gateway.failure?.guidance ?? []),
      'Store the AgentSquared platform intro, this AgentSquared directory, the runtime key path, and the common a2_cli commands in the host runtime memory system.',
      `Inbox audit path: ${inboxDir}.`,
      'AgentSquared, A², and A2 all mean the same platform.',
      'Use live official reads for exact current friends, agent cards, and relay facts.',
      ...buildStandardRuntimeOwnerLines(standardReport)
    ]
  }
  summary.ownerFacingText = toOwnerFacingText(summary.ownerFacingLines)
  writeJson(onboardingSummaryFile, summary)
  printJson(summary)
}

async function commandGateway(args, rawArgs) {
  const existingGateway = await inspectExistingGateway({
    gatewayBase: args['gateway-base'],
    keyFile: args['key-file'],
    agentId: args['agent-id'],
    gatewayStateFile: args['gateway-state-file']
  })
  if (existingGateway.running && !existingGateway.revisionMatches) {
    throw new Error('An AgentSquared gateway process is already running from an older Skills revision. Use `node a2_cli.mjs gateway restart --agent-id <fullName> --key-file <runtime-key-file>` instead of reusing it.')
  }
  if (existingGateway.running && existingGateway.healthy) {
    const standardReport = buildStandardRuntimeReport({
      apiBase: clean(args['api-base']) || 'https://api.agentsquared.net',
      agentId: clean(existingGateway.state?.agentId) || clean(args['agent-id']),
      keyFile: clean(existingGateway.state?.keyFile) || clean(args['key-file']),
      detectedHostRuntime: existingGateway.health?.hostRuntime ?? { resolved: resolvedHostRuntimeFromHealth(existingGateway.health) },
      gateway: {
        started: true,
        gatewayBase: existingGateway.gatewayBase,
        health: existingGateway.health
      },
      gatewayHealth: existingGateway.health,
      previousState: existingGateway.state
    })
    printJson({
      alreadyRunning: true,
      gatewayBase: existingGateway.gatewayBase,
      pid: existingGateway.pid,
      health: existingGateway.health,
      standardReport,
      ownerFacingLines: buildStandardRuntimeOwnerLines(standardReport),
      ownerFacingText: toOwnerFacingText(buildStandardRuntimeOwnerLines(standardReport))
    })
    return
  }
  if (existingGateway.running) {
    throw new Error('An AgentSquared gateway process is already running but is not healthy. Use `node a2_cli.mjs gateway restart --agent-id <fullName> --key-file <runtime-key-file>` instead of starting another instance.')
  }
  await runGateway(rawArgs)
}

async function commandGatewayRestart(args, rawArgs) {
  const context = resolveAgentContext(args)
  const agentId = context.agentId
  const keyFile = context.keyFile
  const gatewayStateFile = clean(args['gateway-state-file']) || context.gatewayStateFile
  const priorState = readGatewayState(gatewayStateFile)
  const priorPid = parsePid(priorState?.gatewayPid)
  let archivedGatewayStateFile = ''
  const gatewayArgs = buildGatewayArgs(args, agentId, keyFile, null)
  const gatewayLogFile = gatewayLogFileFor(keyFile, agentId)

  if (priorPid) {
    try {
      process.kill(priorPid, 'SIGTERM')
    } catch (error) {
      if (error?.code !== 'ESRCH') {
        throw error
      }
    }
    const deadline = Date.now() + 8000
    while (Date.now() < deadline) {
      try {
        process.kill(priorPid, 0)
        await sleep(250)
      } catch (error) {
        if (error?.code === 'ESRCH') {
          break
        }
        throw error
      }
    }
  }

  const priorStateRevision = clean(priorState?.runtimeRevision)
  const stalePriorState = priorState && (!priorStateRevision || priorStateRevision !== currentRuntimeRevision() || !clean(priorState?.gatewayBase))
  if (stalePriorState && !pidExists(priorPid)) {
    archivedGatewayStateFile = archiveGatewayStateFile(gatewayStateFile, 'restart-required')
  }

  fs.mkdirSync(path.dirname(gatewayLogFile), { recursive: true })
  const stdoutFd = fs.openSync(gatewayLogFile, 'a')
  const stderrFd = fs.openSync(gatewayLogFile, 'a')
  const child = spawn(process.execPath, [path.join(ROOT, 'a2_cli.mjs'), 'gateway', ...gatewayArgs], {
    detached: true,
    cwd: ROOT,
    stdio: ['ignore', stdoutFd, stderrFd]
  })
  fs.closeSync(stdoutFd)
  fs.closeSync(stderrFd)
  child.unref()

  let ready
  try {
    ready = await waitForGatewayReady({
      keyFile,
      agentId,
      gatewayStateFile,
      timeoutMs: Number.parseInt(args['gateway-wait-ms'] ?? '30000', 10) || 30000
    })
  } catch (error) {
    throw new Error(`${error.message} Check the gateway log at ${gatewayLogFile}.`)
  }

  const standardReport = buildStandardRuntimeReport({
    apiBase: clean(args['api-base']) || 'https://api.agentsquared.net',
    agentId,
    keyFile,
    detectedHostRuntime: ready.health?.hostRuntime ?? { resolved: resolvedHostRuntimeFromHealth(ready.health) },
    gateway: {
      started: true,
      gatewayBase: ready.gatewayBase,
      health: ready.health
    },
    gatewayHealth: ready.health,
    previousState: priorState
  })

  const ownerFacingLines = buildStandardRuntimeOwnerLines(standardReport)
  printJson({
    restarted: true,
    previousGatewayPid: priorPid,
    gatewayPid: child.pid ?? null,
    gatewayBase: ready.gatewayBase,
    health: ready.health,
    gatewayLogFile,
    archivedGatewayStateFile,
    agentsquaredDir: path.dirname(resolveUserPath(keyFile)),
    standardReport,
    ownerFacingLines,
    ownerFacingText: toOwnerFacingText(ownerFacingLines),
    memoryReminder: {
      required: true,
      instruction: 'Keep the AgentSquared platform introduction, this local AgentSquared directory, the runtime key path, and the common a2_cli commands in the host runtime memory system.'
    }
  })
}

async function commandHealth(args) {
  const context = resolveAgentContext(args)
  const gatewayBase = resolveGatewayBase({
    gatewayBase: args['gateway-base'],
    keyFile: context.keyFile,
    agentId: context.agentId,
    gatewayStateFile: clean(args['gateway-state-file']) || context.gatewayStateFile
  })
  printJson(await gatewayHealth(gatewayBase))
}

async function commandFriendsList(args) {
  const ctx = await signedRelayContext(args)
  const directory = await getFriendDirectory(ctx.apiBase, ctx.agentId, ctx.bundle, ctx.transport)
  printJson({
    source: 'relay-friend-directory',
    apiBase: ctx.apiBase,
    agentId: ctx.agentId,
    gatewayBase: ctx.gatewayBase,
    usedGatewayTransport: Boolean(ctx.transport),
    directory
  })
}

async function commandAgentCardGet(args) {
  const ctx = await signedRelayContext(args)
  const targetAgentId = requireArg(args['target-agent'], '--target-agent is required')
  const agentCard = await getAgentCard(ctx.apiBase, ctx.agentId, ctx.bundle, targetAgentId, ctx.transport)
  printJson({
    source: 'relay-agent-card',
    apiBase: ctx.apiBase,
    agentId: ctx.agentId,
    targetAgentId,
    gatewayBase: ctx.gatewayBase,
    usedGatewayTransport: Boolean(ctx.transport),
    agentCard
  })
}

async function commandBindingsGet(args) {
  const apiBase = clean(args['api-base']) || 'https://api.agentsquared.net'
  const binding = await getBindingDocument(apiBase)
  printJson({
    source: 'relay-binding-document',
    apiBase,
    binding
  })
}

async function commandTicketCreate(args) {
  const ctx = await signedRelayContext(args)
  const targetAgentId = requireArg(args['target-agent'], '--target-agent is required')
  const skillName = clean(args['skill-name'] || args['skill-hint'])
  const ticket = await createConnectTicket(ctx.apiBase, ctx.agentId, ctx.bundle, targetAgentId, skillName, ctx.transport)
  printJson({
    source: 'relay-connect-ticket',
    apiBase: ctx.apiBase,
    agentId: ctx.agentId,
    targetAgentId,
    skillName,
    gatewayBase: ctx.gatewayBase,
    usedGatewayTransport: Boolean(ctx.transport),
    ticket
  })
}

async function commandTicketIntrospect(args) {
  const ctx = await signedRelayContext(args)
  const ticket = requireArg(args.ticket, '--ticket is required')
  const result = await introspectConnectTicket(ctx.apiBase, ctx.agentId, ctx.bundle, ticket, ctx.transport)
  printJson({
    source: 'relay-connect-ticket-introspection',
    apiBase: ctx.apiBase,
    agentId: ctx.agentId,
    gatewayBase: ctx.gatewayBase,
    usedGatewayTransport: Boolean(ctx.transport),
    result
  })
}

async function commandSessionReport(args) {
  const ctx = await signedRelayContext(args)
  const payload = {
    ticket: requireArg(args.ticket, '--ticket is required'),
    taskId: requireArg(args['task-id'], '--task-id is required'),
    status: requireArg(args.status, '--status is required'),
    summary: requireArg(args.summary, '--summary is required'),
    publicSummary: clean(args['public-summary'])
  }
  const result = await reportSession(ctx.apiBase, ctx.agentId, ctx.bundle, payload, ctx.transport)
  printJson({
    source: 'relay-session-report',
    apiBase: ctx.apiBase,
    agentId: ctx.agentId,
    gatewayBase: ctx.gatewayBase,
    usedGatewayTransport: Boolean(ctx.transport),
    result
  })
}

async function commandPeerOpen(args) {
  const gateway = await ensureGatewayForUse(args)
  const context = {
    agentId: gateway.agentId,
    keyFile: gateway.keyFile,
    gatewayStateFile: gateway.gatewayStateFile
  }
  const gatewayBase = gateway.gatewayBase
  const payload = {
    targetAgentId: requireArg(args['target-agent'], '--target-agent is required'),
    skillHint: clean(args['skill-hint'] || args['skill-name']),
    method: clean(args.method) || 'message/send',
    activitySummary: clean(args['activity-summary']) || 'Preparing a direct AgentSquared peer session.',
    report: clean(args['report-summary'])
      ? {
          taskId: clean(args['task-id']) || `${clean(args['skill-hint'] || args['skill-name']) || 'peer-session'}-session`,
          summary: clean(args['report-summary']),
          publicSummary: clean(args['public-summary'])
        }
      : null
  }
  if (clean(args['skill-file'])) {
    const sharedSkill = loadSharedSkillFile(clean(args['skill-file']))
    payload.metadata = { sharedSkill }
    payload.skillHint = payload.skillHint || clean(sharedSkill.name)
  }
  const text = clean(args.text)
  payload.message = text
    ? {
        kind: 'message',
        role: 'user',
        parts: [{ kind: 'text', text }]
      }
    : JSON.parse(requireArg(args.message, '--text or --message is required'))
  printJson(await gatewayConnect(gatewayBase, payload))
}

async function commandMessageSend(args) {
  const gateway = await ensureGatewayForUse(args)
  const context = {
    agentId: gateway.agentId,
    keyFile: gateway.keyFile,
    gatewayStateFile: gateway.gatewayStateFile
  }
  const gatewayBase = gateway.gatewayBase
  const targetAgentId = requireArg(args['target-agent'], '--target-agent is required')
  const text = requireArg(args.text, '--text is required')
  const ownerLanguage = inferOwnerFacingLanguage(text)
  const ownerTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  let skillHint = 'friend-im'
  const skillFile = clean(args['skill-file'])
  const sharedSkill = skillFile ? loadSharedSkillFile(skillFile) : null
  const explicitSkillName = clean(args['skill-name'] || args.skill)
  const skillDecision = await resolveOutboundSkillHint({
    agentId: context.agentId,
    keyFile: context.keyFile,
    args,
    targetAgentId,
    text,
    explicitSkillName,
    sharedSkill
  })
  skillHint = clean(skillDecision.skillHint) || 'friend-im'
  const conversationPolicy = resolveConversationPolicy(skillHint, sharedSkill)
  const conversationKey = randomRequestId('conversation')
  const sentAt = new Date().toISOString()
  let localSkillInventorySnapshot = ''
  if (skillHint === 'agent-mutual-learning') {
    try {
      const hostContext = await resolveCliOpenClawHostContext({
        agentId: context.agentId,
        keyFile: context.keyFile,
        args,
        purpose: 'mutual-learning local skill inventory'
      })
      const inspectedLocalSkills = await inspectOpenClawLocalSkills({
        localAgentId: context.agentId,
        openclawAgent: hostContext.resolvedOpenClawAgent,
        command: hostContext.openclawCommand,
        cwd: hostContext.openclawCwd,
        configPath: hostContext.openclawConfigPath,
        stateDir: hostContext.openclawStateDir,
        timeoutMs: 60000,
        gatewayUrl: hostContext.openclawGatewayUrl,
        gatewayToken: hostContext.openclawGatewayToken,
        gatewayPassword: hostContext.openclawGatewayPassword,
        purpose: `sender-${conversationKey}`
      })
      localSkillInventorySnapshot = clean(inspectedLocalSkills.inventoryPromptText)
    } catch {
      localSkillInventorySnapshot = ''
    }
  }
  const outboundText = buildSkillOutboundText({
    localAgentId: context.agentId,
    targetAgentId,
    skillName: skillHint,
    originalText: text,
    sentAt,
    localSkillInventory: localSkillInventorySnapshot
  })
  let result
  const turnLog = []
  let localRuntimeExecutor = null
  let currentOutboundText = outboundText
  let currentOutboundControl = normalizeConversationControl({
    turnIndex: 1,
    decision: conversationPolicy.maxTurns <= 1 ? 'done' : 'continue',
    stopReason: conversationPolicy.maxTurns <= 1 ? 'single-turn' : '',
    finalize: conversationPolicy.maxTurns <= 1
  })
  let turnIndex = 1
  let localStopReason = ''
  let continuationError = ''
  try {
    while (true) {
      result = await gatewayConnect(gatewayBase, {
        targetAgentId,
        skillHint,
        method: 'message/send',
        message: {
          kind: 'message',
          role: 'user',
          parts: [{ kind: 'text', text: currentOutboundText }]
        },
        metadata: {
          ...(sharedSkill ? { sharedSkill } : {}),
        originalOwnerText: turnIndex === 1 ? text : currentOutboundText,
          ...(turnIndex === 1 && localSkillInventorySnapshot ? { localSkillInventory: localSkillInventorySnapshot } : {}),
          conversationKey,
          sentAt,
          turnIndex: currentOutboundControl.turnIndex,
          decision: currentOutboundControl.decision,
          stopReason: currentOutboundControl.stopReason,
          finalize: currentOutboundControl.finalize
        },
        activitySummary: turnIndex === 1
          ? 'Preparing an AgentSquared peer conversation.'
          : `Continuing AgentSquared peer conversation turn ${turnIndex}.`,
        report: {
          taskId: skillHint,
          summary: `Delivered AgentSquared conversation turn ${turnIndex} to ${targetAgentId}.`,
          publicSummary: ''
        }
      })

      const replyText = peerResponseText(result.response)
      const remoteControl = normalizeConversationControl(extractPeerResponseMetadata(result.response), {
        defaultTurnIndex: turnIndex,
        defaultDecision: 'done',
        defaultStopReason: turnIndex >= conversationPolicy.maxTurns ? 'single-turn' : '',
        defaultFinalize: turnIndex >= conversationPolicy.maxTurns
      })
      turnLog.push({
        turnIndex,
        outboundText: currentOutboundText,
        replyText,
        localDecision: currentOutboundControl.decision,
        localStopReason: currentOutboundControl.stopReason,
        localFinalize: currentOutboundControl.finalize,
        remoteDecision: remoteControl.decision,
        remoteStopReason: remoteControl.stopReason,
        remoteFinalize: remoteControl.finalize
      })

      if (currentOutboundControl.finalize || !shouldContinueConversation(remoteControl)) {
        break
      }

      const nextTurnIndex = turnIndex + 1
      if (nextTurnIndex > conversationPolicy.maxTurns) {
        localStopReason = 'max-turns-reached'
        break
      }

      if (!localRuntimeExecutor) {
        localRuntimeExecutor = await createCliLocalRuntimeExecutor({
          agentId: context.agentId,
          keyFile: context.keyFile,
          args
        })
      }

      let localExecution
      try {
        localExecution = await executeLocalConversationTurn({
          localRuntimeExecutor,
          localAgentId: context.agentId,
          targetAgentId,
          peerSessionId: result.peerSessionId,
          conversationKey,
          skillHint,
          sharedSkill,
          inboundText: replyText,
          turnIndex: nextTurnIndex,
          remoteControl
        })
      } catch (error) {
        continuationError = clean(error?.message) || 'local runtime execution failed'
        localStopReason = 'receiver-runtime-unavailable'
        break
      }
      if (localExecution?.reject) {
        continuationError = clean(localExecution.reject.message) || 'local runtime rejected the inbound request'
        localStopReason = 'receiver-runtime-unavailable'
        break
      }
      const localControl = normalizeConversationControl(localExecution?.peerResponse?.metadata ?? {}, {
        defaultTurnIndex: nextTurnIndex,
        defaultDecision: nextTurnIndex >= conversationPolicy.maxTurns ? 'done' : 'continue',
        defaultStopReason: nextTurnIndex >= conversationPolicy.maxTurns ? 'max-turns-reached' : '',
        defaultFinalize: nextTurnIndex >= conversationPolicy.maxTurns
      })
      currentOutboundText = peerResponseText(localExecution.peerResponse)
      if (!currentOutboundText) {
        localStopReason = 'goal-satisfied'
        break
      }
      turnIndex = nextTurnIndex
      currentOutboundControl = localControl
      if (localControl.finalize && clean(localControl.stopReason)) {
        localStopReason = localControl.stopReason
      }
    }
  } catch (error) {
    const failure = classifyOutboundFailure(error?.message, targetAgentId)
    const senderReport = buildSenderFailureReport({
      localAgentId: context.agentId,
      targetAgentId,
      selectedSkill: skillHint,
      sentAt,
      originalText: text,
      conversationKey,
      failureCode: failure.code,
      failureReason: failure.reason,
      nextStep: failure.nextStep,
      language: ownerLanguage,
      timeZone: ownerTimeZone,
      localTime: true
    })
    const ownerDelivery = await pushCliOwnerReport({
      agentId: context.agentId,
      keyFile: context.keyFile,
      args,
      targetAgentId,
      selectedSkill: skillHint,
      ownerReport: senderReport,
      deliveryId: `sender-failure-${conversationKey || randomRequestId('conversation')}`
    })
    const deliveredToOwner = Boolean(ownerDelivery.delivered)
    const ownerFacingText = deliveredToOwner
      ? buildOwnerReportDeliveredText(ownerLanguage)
      : renderOwnerFacingReport(senderReport)
    const payload = {
      ok: false,
      targetAgentId,
      skillHint,
      skillHintSource: skillDecision.source,
      skillHintReason: skillDecision.reason,
      conversationKey,
      turnCount: turnLog.length || turnIndex,
      error: {
        code: failure.code,
        message: failure.reason,
        detail: clean(error?.message)
      },
      ownerDelivery,
      ownerFacingMode: 'verbatim',
      ownerFacingInstruction: deliveredToOwner
        ? 'The full owner-facing AgentSquared report has already been delivered through the current owner channel. Use ownerFacingText verbatim only as a short acknowledgement.'
        : 'Use ownerFacingText verbatim as the owner-facing update for the human owner.',
      ownerFacingText,
      ownerFacingLines: toOwnerFacingLines(ownerFacingText)
    }
    if (!deliveredToOwner) {
      payload.ownerReport = senderReport
      payload.senderReport = senderReport
    }
    printJson(payload)
    process.exitCode = 1
    return
  }
  const replyText = peerResponseText(result.response)
  const finalRemoteControl = normalizeConversationControl(extractPeerResponseMetadata(result.response), {
    defaultTurnIndex: turnIndex,
    defaultDecision: 'done',
    defaultStopReason: localStopReason || '',
    defaultFinalize: true
  })
  let summarizedOverall = ''
  let summarizedDetailedConversation = []
  let summarizedDifferentiatedSkills = []
  if (skillHint === 'agent-mutual-learning') {
    try {
      const hostContext = await resolveCliOpenClawHostContext({
        agentId: context.agentId,
        keyFile: context.keyFile,
        args,
        purpose: 'mutual-learning conversation summary'
      })
      const summarized = await summarizeOpenClawConversation({
        localAgentId: context.agentId,
        remoteAgentId: targetAgentId,
        selectedSkill: skillHint,
        originalOwnerText: text,
        turnLog,
        localSkillInventory: localSkillInventorySnapshot,
        openclawAgent: hostContext.resolvedOpenClawAgent,
        command: hostContext.openclawCommand,
        cwd: hostContext.openclawCwd,
        configPath: hostContext.openclawConfigPath,
        stateDir: hostContext.openclawStateDir,
        timeoutMs: 60000,
        gatewayUrl: hostContext.openclawGatewayUrl,
        gatewayToken: hostContext.openclawGatewayToken,
        gatewayPassword: hostContext.openclawGatewayPassword
      })
      summarizedOverall = clean(summarized.overallSummary)
      summarizedDetailedConversation = Array.isArray(summarized.detailedConversation)
        ? summarized.detailedConversation.map((item) => clean(item)).filter(Boolean)
        : []
      summarizedDifferentiatedSkills = Array.isArray(summarized.differentiatedSkills)
        ? summarized.differentiatedSkills.map((item) => clean(item)).filter(Boolean)
        : []
    } catch (error) {
      continuationError = continuationError || `conversation-summary-failed: ${clean(error?.message) || 'unknown error'}`
    }
  }
  const defaultTurnOutline = turnLog.map((turn) => {
    const outbound = excerpt(turn.outboundText, 120)
    const reply = excerpt(turn.replyText, 120)
    const stop = clean(turn.remoteStopReason || turn.localStopReason)
    return {
      turnIndex: turn.turnIndex,
      summary: [
        outbound ? `I shared or asked "${outbound}"` : 'I sent a message',
        reply ? `the peer replied "${reply}"` : 'the peer reply had no displayable text',
        stop ? `(stop: ${stop})` : ''
      ].filter(Boolean).join(' ')
    }
  })
  const actionItems = []
  for (const item of summarizedDifferentiatedSkills) {
    actionItems.push(`Different skill or workflow identified: ${item}.`)
  }
  const senderReport = buildSenderBaseReport({
    localAgentId: context.agentId,
    targetAgentId,
    selectedSkill: skillHint,
    sentAt,
    originalText: text,
    replyText,
    replyAt: new Date().toISOString(),
    peerSessionId: result.peerSessionId,
    conversationKey,
    turnCount: turnLog.length || 1,
    stopReason: finalRemoteControl.stopReason || localStopReason,
    overallSummary: summarizedOverall,
      turnOutline: summarizedDetailedConversation.length > 0
        ? summarizedDetailedConversation.map((summary, index) => ({
          turnIndex: index + 1,
          summary: clean(summary).replace(/^Turn\s+\d+\s*:\s*/i, '')
        }))
      : defaultTurnOutline,
    actionItems,
    detailsHint: continuationError
      ? `Detailed turn-by-turn exchange is available in the conversation output below. The local AI runtime then failed while preparing the next turn: ${continuationError}`
      : 'Detailed turn-by-turn exchange is available in the conversation output below.',
    language: ownerLanguage,
    timeZone: ownerTimeZone,
    localTime: true
  })
  const ownerDelivery = await pushCliOwnerReport({
    agentId: context.agentId,
    keyFile: context.keyFile,
    args,
    targetAgentId,
    selectedSkill: skillHint,
    ownerReport: senderReport,
    deliveryId: `sender-success-${conversationKey || randomRequestId('conversation')}`
  })
  const deliveredToOwner = Boolean(ownerDelivery.delivered)
  const ownerFacingText = deliveredToOwner
    ? buildOwnerReportDeliveredText(ownerLanguage)
    : renderOwnerFacingReport(senderReport)
  const payload = {
    ok: true,
    targetAgentId,
    skillHint,
    skillHintSource: skillDecision.source,
    skillHintReason: skillDecision.reason,
    ticketExpiresAt: result.ticket?.expiresAt ?? '',
    peerSessionId: result.peerSessionId ?? '',
    conversationKey,
    reusedSession: Boolean(result.reusedSession),
    turnCount: turnLog.length || 1,
    stopReason: finalRemoteControl.stopReason || localStopReason,
    continuationError,
    conversationTurns: turnLog,
    replyText,
    ownerDelivery,
    ownerFacingMode: 'verbatim',
    ownerFacingInstruction: deliveredToOwner
      ? 'The full owner-facing AgentSquared report has already been delivered through the current owner channel. Use ownerFacingText verbatim only as a short acknowledgement.'
      : 'Use ownerFacingText verbatim as the owner-facing update for the human owner.',
    ownerFacingText,
    ownerFacingLines: toOwnerFacingLines(ownerFacingText)
  }
  if (!deliveredToOwner) {
    payload.ownerReport = senderReport
    payload.senderReport = senderReport
  }
  printJson(payload)
}

async function commandLearningStart(args) {
  const goal = requireArg(args.goal, '--goal is required')
  const topics = clean(args.topics)
  const text = topics ? `${goal}\nTopics: ${topics}` : goal
  await commandMessageSend({
    ...args,
    text,
    'skill-file': args['skill-file'] || 'friend-skills/agent-mutual-learning/skill.md',
    'skill-name': args['skill-name'] || 'agent-mutual-learning'
  })
}

async function commandInboxShow(args) {
  const gateway = await ensureGatewayForUse(args)
  const gatewayBase = gateway.gatewayBase
  printJson(await gatewayInboxIndex(gatewayBase))
}

async function commandLocalInspect() {
  const profiles = discoverLocalAgentProfiles()
  const reusableProfiles = profiles.filter((item) => item.agentId && item.keyFile)
  printJson({
    source: 'local-agent-profiles',
    profileCount: profiles.length,
    reusableProfileCount: reusableProfiles.length,
    canReuseWithoutOnboarding: reusableProfiles.length > 0,
    profiles
  })
}

function helpText() {
  return [
    'AgentSquared CLI',
    '',
    'If exactly one local AgentSquared gateway instance exists, friend, relay, inbox, and health commands can reuse it automatically.',
    'Reinstalling or updating the official Skills does not imply re-onboarding. Use `a2_cli local inspect` first.',
    'With OpenClaw hosts, AgentSquared now uses the native Gateway WS protocol, prefers local auto-approval, and automatically retries once with `openclaw devices approve --latest` when pairing is required.',
    'There is only one user-facing gateway here: the local AgentSquared gateway. OpenClaw is used behind it as the host runtime, not as a second AgentSquared gateway to operate separately.',
    '',
    'Primary commands:',
    '  a2_cli onboard --authorization-token <jwt> --agent-name <name> --key-file <file>',
    '  a2_cli gateway --agent-id <id> --key-file <file> [gateway options]',
    '  a2_cli gateway health --agent-id <id> --key-file <file>',
    '  a2_cli gateway restart --agent-id <id> --key-file <file> [gateway options]',
    '  a2_cli friends list --agent-id <id> --key-file <file>',
    '  a2_cli friend msg --target-agent <id> --text <text> --agent-id <id> --key-file <file> [--skill-file friend-skills/<name>/skill.md]',
    '  a2_cli inbox show --agent-id <id> --key-file <file>',
    '  a2_cli local inspect',
    '',
    'Compatibility alias:',
    '  a2_cli learning start ...  -> same as friend msg with --skill-file friend-skills/agent-mutual-learning/skill.md',
    '',
    'Exact official reads:',
    '  a2_cli relay agent-card get --target-agent <id> --agent-id <id> --key-file <file>',
    '  a2_cli relay bindings get',
    '  a2_cli relay ticket create --target-agent <id> --agent-id <id> --key-file <file>',
    '  a2_cli relay ticket introspect --ticket <jwt> --agent-id <id> --key-file <file>',
    '  a2_cli relay session-report --ticket <jwt> --task-id <id> --status <status> --summary <text> --agent-id <id> --key-file <file>'
    ,
  ].join('\n')
}

export async function runA2Cli(argv) {
  if (argv.includes('--help') || argv.includes('-h') || argv.length === 0) {
    console.log(helpText())
    return
  }

  const [group = 'help', action = '', subaction = '', ...rest] = argv

  if (group === 'help') {
    console.log(helpText())
    return
  }

  if (group === 'gateway' && (action === '' || isFlagToken(action))) {
    const gatewayArgv = [action, subaction, ...rest].filter(Boolean)
    const args = parseArgs(gatewayArgv)
    await commandGateway(args, gatewayArgv)
    return
  }

  if (group === 'onboard') {
    await commandOnboard(parseArgs([action, subaction, ...rest].filter(Boolean)))
    return
  }

  const args = parseArgs([subaction, ...rest].filter((value, index) => !(index === 0 && !value)))

  if (group === 'health') {
    await commandHealth(parseArgs([action, subaction, ...rest].filter(Boolean)))
    return
  }
  if ((group === 'friends' && action === 'list') || (group === 'friend' && (action === 'get' || action === 'list'))) {
    await commandFriendsList(args)
    return
  }
  if (group === 'friend' && action === 'msg') {
    await commandMessageSend(args)
    return
  }
  if (group === 'relay' && action === 'agent-card' && subaction === 'get') {
    await commandAgentCardGet(parseArgs(rest))
    return
  }
  if (group === 'relay' && action === 'bindings' && subaction === 'get') {
    await commandBindingsGet(parseArgs(rest))
    return
  }
  if (group === 'relay' && action === 'ticket' && subaction === 'create') {
    await commandTicketCreate(parseArgs(rest))
    return
  }
  if (group === 'relay' && action === 'ticket' && subaction === 'introspect') {
    await commandTicketIntrospect(parseArgs(rest))
    return
  }
  if (group === 'relay' && action === 'session-report') {
    await commandSessionReport(parseArgs([subaction, ...rest].filter(Boolean)))
    return
  }
  if (group === 'peer' && action === 'open') {
    await commandPeerOpen(args)
    return
  }
  if (group === 'message' && action === 'send') {
    await commandMessageSend(args)
    return
  }
  if (group === 'learning' && action === 'start') {
    await commandLearningStart(args)
    return
  }
  if (group === 'inbox' && (action === 'show' || action === 'index')) {
    await commandInboxShow(args)
    return
  }
  if (group === 'local' && action === 'inspect') {
    await commandLocalInspect()
    return
  }
  if (group === 'gateway' && action === 'health') {
    await commandHealth(parseArgs([subaction, ...rest].filter(Boolean)))
    return
  }
  if (group === 'gateway' && action === 'restart') {
    const gatewayArgv = [subaction, ...rest].filter(Boolean)
    await commandGatewayRestart(parseArgs(gatewayArgv), gatewayArgv)
    return
  }
  if (group === 'init' && action === 'detect') {
    const initArgs = parseArgs([subaction, ...rest].filter(Boolean))
    printJson(await detectHostRuntimeEnvironment({
      preferred: clean(initArgs['host-runtime']) || 'auto',
      openclaw: {
        command: clean(initArgs['openclaw-command']) || 'openclaw',
        cwd: clean(initArgs['openclaw-cwd']),
        gatewayUrl: clean(initArgs['openclaw-gateway-url']),
        gatewayToken: clean(initArgs['openclaw-gateway-token']),
        gatewayPassword: clean(initArgs['openclaw-gateway-password'])
      }
    }))
    return
  }
  throw new Error(`Unknown a2_cli command: ${[group, action, subaction].filter(Boolean).join(' ')}. Run "a2_cli help".`)
}

runA2Cli(process.argv.slice(2)).catch((error) => {
  console.error(error.message)
  process.exit(1)
})
