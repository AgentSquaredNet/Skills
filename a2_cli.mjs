#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { parseArgs, requireArg } from './lib/cli.mjs'
import { gatewayConnect, gatewayHealth, gatewayInboxIndex } from './lib/gateway_control.mjs'
import { resolveGatewayBase, defaultGatewayStateFile, readGatewayState, currentRuntimeRevision } from './lib/gateway_runtime.mjs'
import { getAgentCard, getBindingDocument, getFriendDirectory, createConnectTicket, introspectConnectTicket, reportSession } from './lib/relay_http.mjs'
import { loadRuntimeKeyBundle } from './lib/runtime_key.mjs'
import { generateRuntimeKeyBundle, writeRuntimeKeyBundle } from './lib/generate_runtime_keypair.mjs'
import { runGateway } from './lib/gateway_server.mjs'
import { detectHostRuntimeEnvironment } from './adapters/index.mjs'
import { defaultInboxDir } from './lib/gateway_inbox.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = __dirname

function clean(value) {
  return `${value ?? ''}`.trim()
}

function printJson(payload) {
  console.log(JSON.stringify(payload, null, 2))
}

function resolveUserPath(inputPath) {
  return path.resolve(`${inputPath}`.replace(/^~(?=$|\/|\\)/, process.env.HOME || '~'))
}

function parseFrontmatterName(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---/)
  if (!match?.[1]) {
    return ''
  }
  const nameMatch = match[1].match(/^\s*name\s*:\s*(.+)\s*$/m)
  return clean(nameMatch?.[1] ?? '').replace(/^["']|["']$/g, '')
}

function loadSharedSkillFile(skillFile) {
  const resolved = resolveUserPath(skillFile)
  const text = fs.readFileSync(resolved, 'utf8')
  return {
    path: resolved,
    name: parseFrontmatterName(text) || path.basename(path.dirname(resolved)) || path.basename(resolved, path.extname(resolved)),
    document: clean(text).slice(0, 16000)
  }
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function buildGatewayArgs(args, fullName, keyFile, detectedHostRuntime) {
  const forwarded = [
    '--api-base', clean(args['api-base']) || 'https://api.agentsquared.net',
    '--agent-id', fullName,
    '--key-file', keyFile
  ]
  for (const key of [
    'gateway-host',
    'gateway-port',
    'presence-refresh-ms',
    'health-check-ms',
    'transport-check-timeout-ms',
    'recovery-idle-wait-ms',
    'failures-before-recover',
    'router-mode',
    'wait-ms',
    'max-active-mailboxes',
    'router-skills',
    'default-skill',
    'peer-key-file',
    'gateway-state-file',
    'inbox-dir',
    'listen-addrs',
    'openclaw-agent',
    'openclaw-owner-channel',
    'openclaw-owner-target',
    'openclaw-owner-thread-id',
    'openclaw-command',
    'openclaw-cwd',
    'openclaw-session-prefix',
    'openclaw-timeout-ms',
    'openclaw-gateway-url',
    'openclaw-gateway-token',
    'openclaw-gateway-password',
    'host-runtime'
  ]) {
    const value = clean(args[key])
    if (value) {
      forwarded.push(`--${key}`, value)
    }
  }
  if (!forwarded.includes('--host-runtime') && detectedHostRuntime?.resolved && detectedHostRuntime.resolved !== 'none') {
    forwarded.push('--host-runtime', detectedHostRuntime.resolved)
  }
  return forwarded
}

async function waitForGatewayReady({ gatewayBase = '', keyFile = '', agentId = '', gatewayStateFile = '', timeoutMs = 30000 }) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const resolvedBase = gatewayBase || resolveGatewayBase({
        gatewayBase,
        keyFile,
        agentId,
        gatewayStateFile
      })
      const health = await gatewayHealth(resolvedBase)
      if (health?.peerId) {
        return { gatewayBase: resolvedBase, health }
      }
    } catch {
      // keep waiting
    }
    await new Promise((resolve) => setTimeout(resolve, 750))
  }
  throw new Error('Timed out waiting for the local AgentSquared gateway to become healthy.')
}

async function inspectExistingGateway({ gatewayBase = '', keyFile = '', agentId = '', gatewayStateFile = '' } = {}) {
  const stateFile = clean(gatewayStateFile) || (keyFile && agentId ? defaultGatewayStateFile(keyFile, agentId) : '')
  const state = stateFile ? readGatewayState(stateFile) : null
  const pid = parsePid(state?.gatewayPid)
  const discoveredBase = clean(gatewayBase) || clean(state?.gatewayBase)
  const running = pidExists(pid)
  const expectedRevision = currentRuntimeRevision()
  const stateRevision = clean(state?.runtimeRevision)
  const revisionMatches = !state || (stateRevision && stateRevision === expectedRevision)
  let health = null
  let healthy = false

  if (running && discoveredBase && revisionMatches) {
    try {
      health = await gatewayHealth(discoveredBase)
      healthy = Boolean(health?.peerId)
    } catch {
      healthy = false
    }
  }

  return {
    stateFile,
    state,
    pid,
    running,
    healthy,
    expectedRevision,
    stateRevision,
    revisionMatches,
    gatewayBase: discoveredBase,
    health
  }
}

function resolveGatewayBaseIfAvailable(args) {
  try {
    return resolveGatewayBase({
      gatewayBase: args['gateway-base'],
      keyFile: args['key-file'],
      agentId: args['agent-id'],
      gatewayStateFile: args['gateway-state-file']
    })
  } catch {
    return ''
  }
}

async function resolveGatewayTransport(args) {
  const gatewayBase = resolveGatewayBaseIfAvailable(args)
  if (!gatewayBase) {
    return { gatewayBase: '', transport: null, health: null }
  }
  try {
    const health = await gatewayHealth(gatewayBase)
    if (health?.peerId && health?.streamProtocol) {
      return {
        gatewayBase,
        health,
        transport: {
          peerId: health.peerId,
          listenAddrs: health.listenAddrs ?? [],
          relayAddrs: health.relayAddrs ?? [],
          supportedBindings: health.supportedBindings ?? [],
          streamProtocol: health.streamProtocol,
          a2aProtocolVersion: health.a2aProtocolVersion ?? ''
        }
      }
    }
    return { gatewayBase, health, transport: null }
  } catch {
    return { gatewayBase, health: null, transport: null }
  }
}

async function signedRelayContext(args) {
  const apiBase = clean(args['api-base']) || 'https://api.agentsquared.net'
  const agentId = requireArg(args['agent-id'], '--agent-id is required')
  const keyFile = requireArg(args['key-file'], '--key-file is required')
  const bundle = loadRuntimeKeyBundle(resolveUserPath(keyFile))
  const { gatewayBase, health, transport } = await resolveGatewayTransport(args)
  return {
    apiBase,
    agentId,
    keyFile,
    bundle,
    gatewayBase,
    gatewayHealth: health,
    transport
  }
}

async function registerAgent(args) {
  const apiBase = clean(args['api-base']) || 'https://api.agentsquared.net'
  const authorizationToken = requireArg(args['authorization-token'], '--authorization-token is required')
  const agentName = requireArg(args['agent-name'], '--agent-name is required')
  const keyTypeName = clean(args['key-type']) || 'ed25519'
  const displayName = clean(args['display-name']) || agentName
  const keyFile = resolveUserPath(args['key-file'] || path.join(process.cwd(), `${safeAgentId(agentName)}_runtime_key.json`))
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
  const registration = await registerAgent(args)
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
  const fullName = registration.result.fullName
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
          pid: child.pid ?? null
        }
      } catch (error) {
        const gatewayStateFile = clean(args['gateway-state-file']) || defaultGatewayStateFile(registration.keyFile, fullName)
        const gatewayState = readGatewayState(gatewayStateFile)
        const discoveredPid = gatewayState?.gatewayPid ?? child.pid ?? null
        const discoveredBase = clean(gatewayState?.gatewayBase)
        gateway.pending = pidExists(discoveredPid)
        gateway.gatewayBase = discoveredBase
        gateway.pid = parsePid(discoveredPid)
        gateway.error = error.message
      }
    }
  }

  const inboxDir = defaultInboxDir(registration.keyFile, fullName)
  const summary = {
    setupComplete: true,
    apiBase: registration.apiBase,
    hostRuntime: detectedHostRuntime,
    receiptFile: registration.receiptFile,
    keyFile: registration.keyFile,
    inboxDir,
    registration: registration.result,
    gateway,
    ownerFacingLines: [
      'AgentSquared setup is complete.',
      `Agent: ${registration.result.fullName}`,
      `Host runtime: ${detectedHostRuntime.resolved !== 'none' ? detectedHostRuntime.resolved : `not bound (${detectedHostRuntime.suggested || 'openclaw'} suggested)`}.`,
      gateway.started
        ? `Gateway was auto-started and is running at ${gateway.gatewayBase}.`
        : gateway.pending
          ? `Gateway launch was requested and the background process is still running${gateway.gatewayBase ? ` at ${gateway.gatewayBase}` : ''}, but health was not confirmed before timeout.`
          : `Gateway auto-start is not confirmed${gateway.error ? `: ${gateway.error}` : '.'}`,
      gateway.logFile
        ? `Gateway log file: ${gateway.logFile}.`
        : 'Gateway log file: unavailable.',
      `Inbox audit path: ${inboxDir}.`,
      'AgentSquared, A², and A2 all mean the same platform.',
      'Use live official reads for exact current friends, agent cards, and relay facts.'
    ]
  }
  writeJson(onboardingSummaryFileFor(registration.keyFile, fullName), summary)
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
    printJson({
      alreadyRunning: true,
      gatewayBase: existingGateway.gatewayBase,
      pid: existingGateway.pid,
      health: existingGateway.health
    })
    return
  }
  if (existingGateway.running) {
    throw new Error('An AgentSquared gateway process is already running but is not healthy. Use `node a2_cli.mjs gateway restart --agent-id <fullName> --key-file <runtime-key-file>` instead of starting another instance.')
  }
  await runGateway(rawArgs)
}

async function commandGatewayRestart(args, rawArgs) {
  const agentId = requireArg(args['agent-id'], '--agent-id is required')
  const keyFile = requireArg(args['key-file'], '--key-file is required')
  const gatewayStateFile = clean(args['gateway-state-file']) || defaultGatewayStateFile(keyFile, agentId)
  const priorState = readGatewayState(gatewayStateFile)
  const priorPid = parsePid(priorState?.gatewayPid)

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

  const child = spawn(process.execPath, [path.join(ROOT, 'a2_cli.mjs'), 'gateway', ...rawArgs], {
    detached: true,
    stdio: 'ignore'
  })
  child.unref()

  const ready = await waitForGatewayReady({
    keyFile,
    agentId,
    gatewayStateFile,
    timeoutMs: Number.parseInt(args['gateway-wait-ms'] ?? '30000', 10) || 30000
  })

  printJson({
    restarted: true,
    previousGatewayPid: priorPid,
    gatewayBase: ready.gatewayBase,
    health: ready.health
  })
}

async function commandHealth(args) {
  const gatewayBase = resolveGatewayBase({
    gatewayBase: args['gateway-base'],
    keyFile: args['key-file'],
    agentId: args['agent-id'],
    gatewayStateFile: args['gateway-state-file']
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
  const gatewayBase = resolveGatewayBase({
    gatewayBase: args['gateway-base'],
    keyFile: args['key-file'],
    agentId: args['agent-id'],
    gatewayStateFile: args['gateway-state-file']
  })
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
  const gatewayBase = resolveGatewayBase({
    gatewayBase: args['gateway-base'],
    keyFile: args['key-file'],
    agentId: args['agent-id'],
    gatewayStateFile: args['gateway-state-file']
  })
  const targetAgentId = requireArg(args['target-agent'], '--target-agent is required')
  const text = requireArg(args.text, '--text is required')
  const skillFile = clean(args['skill-file'])
  const sharedSkill = skillFile ? loadSharedSkillFile(skillFile) : null
  const explicitSkillName = clean(args['skill-name'] || args.skill)
  const skillHint = explicitSkillName || clean(sharedSkill?.name) || 'friend-im'
  const result = await gatewayConnect(gatewayBase, {
    targetAgentId,
    skillHint,
    method: 'message/send',
    message: {
      kind: 'message',
      role: 'user',
      parts: [{ kind: 'text', text }]
    },
    metadata: sharedSkill ? { sharedSkill } : null,
    activitySummary: 'Preparing a short friend IM.',
    report: {
      taskId: skillHint,
      summary: `Delivered a short friend IM to ${targetAgentId}.`,
      publicSummary: ''
    }
  })
  printJson({
    targetAgentId,
    skillHint,
    sharedSkill: sharedSkill ? { name: sharedSkill.name, path: sharedSkill.path } : null,
    ticketExpiresAt: result.ticket?.expiresAt ?? '',
    peerSessionId: result.peerSessionId ?? '',
    reusedSession: Boolean(result.reusedSession),
    response: result.response
  })
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
  const gatewayBase = resolveGatewayBase({
    gatewayBase: args['gateway-base'],
    keyFile: args['key-file'],
    agentId: args['agent-id'],
    gatewayStateFile: args['gateway-state-file']
  })
  printJson(await gatewayInboxIndex(gatewayBase))
}

function helpText() {
  return [
    'AgentSquared CLI',
    '',
    'Primary commands:',
    '  a2_cli onboard --authorization-token <jwt> --agent-name <name> --key-file <file>',
    '  a2_cli gateway --agent-id <id> --key-file <file> [gateway options]',
    '  a2_cli gateway health --agent-id <id> --key-file <file>',
    '  a2_cli gateway restart --agent-id <id> --key-file <file> [gateway options]',
    '  a2_cli friends list --agent-id <id> --key-file <file>',
    '  a2_cli friend msg --target-agent <id> --text <text> --agent-id <id> --key-file <file> [--skill-file friend-skills/<name>/skill.md]',
    '  a2_cli inbox show --agent-id <id> --key-file <file>',
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

  if (group === 'gateway' && action === '') {
    const args = parseArgs(rest)
    await commandGateway(args, rest)
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
  if (group === 'gateway' && action === 'health') {
    await commandHealth(parseArgs(rest))
    return
  }
  if (group === 'gateway' && action === 'restart') {
    await commandGatewayRestart(parseArgs(rest), rest)
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
