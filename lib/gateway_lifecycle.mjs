import fs from 'node:fs'
import path from 'node:path'

import { gatewayHealth } from './gateway_control.mjs'
import { currentRuntimeRevision, defaultGatewayStateFile, discoverGatewayStateFiles, readGatewayState, resolveGatewayBase } from './gateway_runtime.mjs'
import { loadRuntimeKeyBundle } from './runtime_key.mjs'

function clean(value) {
  return `${value ?? ''}`.trim()
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

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
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

function defaultGatewaySearchRoots(rootDir = process.cwd()) {
  return unique([
    process.cwd(),
    rootDir,
    process.env.HOME ? path.join(process.env.HOME, '.openclaw') : '',
    process.env.HOME ? path.join(process.env.HOME, '.nanobot') : '',
    process.env.HOME ? path.join(process.env.HOME, '.agentsquared') : ''
  ])
}

function findSingletonAgentProfile(searchRoots) {
  const profiles = discoverLocalAgentProfiles(searchRoots).filter((item) => item.agentId && item.keyFile)
  if (profiles.length === 1) {
    return profiles[0]
  }
  if (profiles.length > 1) {
    throw new Error('Multiple local AgentSquared agent profiles were discovered. Pass --agent-id and --key-file explicitly.')
  }
  return null
}

function localActivationArtifacts(searchRoots) {
  return discoverLocalAgentProfiles(searchRoots).filter((item) =>
    item.gatewayRunning ||
    clean(item.gatewayStateFile) ||
    clean(item.keyFile) ||
    clean(item.receiptFile) ||
    clean(item.onboardingSummaryFile)
  )
}

function onboardingTokenTargetAgentId(authorizationToken) {
  const payload = parseJwtPayloadUnverified(authorizationToken)
  const humanName = clean(payload?.hnm)
  const agentName = clean(payload?.anm)
  if (!humanName || !agentName) {
    return ''
  }
  return `${agentName}@${humanName}`
}

function findSingletonGatewayState(searchRoots) {
  const candidates = discoverGatewayStateFiles(searchRoots)
  const valid = []
  for (const stateFile of candidates) {
    try {
      const state = readGatewayState(stateFile)
      if (!state?.agentId || !state?.keyFile || !state?.gatewayBase) {
        continue
      }
      if (!state?.runtimeRevision || state.runtimeRevision !== currentRuntimeRevision()) {
        continue
      }
      valid.push({
        stateFile,
        state
      })
    } catch {
      // ignore malformed state files
    }
  }
  if (valid.length === 1) {
    return valid[0]
  }
  if (valid.length > 1) {
    throw new Error('Multiple local AgentSquared gateway instances were discovered. Pass --agent-id and --key-file explicitly.')
  }
  return null
}

function resolveGatewayBaseIfAvailable(args, searchRoots) {
  try {
    const context = resolveAgentContext(args, { searchRoots })
    return resolveGatewayBase({
      gatewayBase: args['gateway-base'],
      keyFile: context.keyFile,
      agentId: context.agentId,
      gatewayStateFile: clean(args['gateway-state-file']) || context.gatewayStateFile
    })
  } catch {
    return ''
  }
}

async function resolveGatewayTransport(args, searchRoots) {
  const gatewayBase = resolveGatewayBaseIfAvailable(args, searchRoots)
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

export function resolvedHostRuntimeFromHealth(health = null) {
  return clean(health?.hostRuntime?.resolved || health?.hostRuntime?.id) || 'none'
}

export function toOwnerFacingText(lines = []) {
  return lines.filter(Boolean).join('\n')
}

export function buildGatewayArgs(args, fullName, keyFile, detectedHostRuntime) {
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

export async function waitForGatewayReady({ gatewayBase = '', keyFile = '', agentId = '', gatewayStateFile = '', timeoutMs = 30000 }) {
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

export function discoverLocalAgentProfiles(searchRoots = defaultGatewaySearchRoots()) {
  const files = []
  for (const root of searchRoots) {
    walkLocalFiles(root, files)
  }

  const grouped = new Map()

  function bucketFor(baseKey) {
    if (!grouped.has(baseKey)) {
      grouped.set(baseKey, {
        baseKey,
        agentId: '',
        keyFile: '',
        receiptFile: '',
        onboardingSummaryFile: '',
        gatewayStateFile: '',
        gatewayBase: '',
        gatewayPid: null
      })
    }
    return grouped.get(baseKey)
  }

  for (const filePath of unique(files)) {
    const name = path.basename(filePath)
    if (name.endsWith('_receipt.json')) {
      const baseKey = name.slice(0, -'_receipt.json'.length)
      const bucket = bucketFor(baseKey)
      const payload = safeReadJson(filePath)
      bucket.receiptFile = filePath
      bucket.agentId = bucket.agentId || clean(payload?.fullName)
    } else if (name.endsWith('_onboarding_summary.json')) {
      const baseKey = name.slice(0, -'_onboarding_summary.json'.length)
      const bucket = bucketFor(baseKey)
      const payload = safeReadJson(filePath)
      bucket.onboardingSummaryFile = filePath
      bucket.agentId = bucket.agentId || clean(payload?.registration?.fullName)
      bucket.keyFile = bucket.keyFile || clean(payload?.keyFile)
    } else if (name.endsWith('_gateway.json')) {
      const baseKey = name.slice(0, -'_gateway.json'.length)
      const bucket = bucketFor(baseKey)
      const payload = safeReadJson(filePath)
      bucket.gatewayStateFile = filePath
      bucket.agentId = bucket.agentId || clean(payload?.agentId)
      bucket.keyFile = bucket.keyFile || clean(payload?.keyFile)
      bucket.gatewayBase = bucket.gatewayBase || clean(payload?.gatewayBase)
      bucket.gatewayPid = bucket.gatewayPid || parsePid(payload?.gatewayPid)
    } else if (name.endsWith('_runtime_key.json')) {
      const baseKey = name.slice(0, -'_runtime_key.json'.length)
      const bucket = bucketFor(baseKey)
      bucket.keyFile = bucket.keyFile || filePath
    }
  }

  const normalized = Array.from(grouped.values())
    .filter((item) => item.agentId || item.keyFile || item.gatewayStateFile || item.receiptFile)
    .map((item) => ({
      ...item,
      keyFile: item.keyFile ? resolveUserPath(item.keyFile) : '',
      gatewayStateFile: item.gatewayStateFile ? resolveUserPath(item.gatewayStateFile) : '',
      receiptFile: item.receiptFile ? resolveUserPath(item.receiptFile) : '',
      onboardingSummaryFile: item.onboardingSummaryFile ? resolveUserPath(item.onboardingSummaryFile) : '',
      gatewayRunning: pidExists(item.gatewayPid)
    }))

  const merged = new Map()

  function mergedKeyFor(item) {
    return item.agentId || item.keyFile || item.baseKey
  }

  for (const item of normalized) {
    const mergedKey = mergedKeyFor(item)
    if (!merged.has(mergedKey)) {
      merged.set(mergedKey, { ...item })
      continue
    }
    const existing = merged.get(mergedKey)
    existing.baseKey = existing.baseKey || item.baseKey
    existing.agentId = existing.agentId || item.agentId
    existing.keyFile = existing.keyFile || item.keyFile
    existing.receiptFile = existing.receiptFile || item.receiptFile
    existing.onboardingSummaryFile = existing.onboardingSummaryFile || item.onboardingSummaryFile
    existing.gatewayStateFile = existing.gatewayStateFile || item.gatewayStateFile
    existing.gatewayBase = existing.gatewayBase || item.gatewayBase
    existing.gatewayPid = existing.gatewayPid || item.gatewayPid
    existing.gatewayRunning = existing.gatewayRunning || item.gatewayRunning
  }

  return Array.from(merged.values()).sort((left, right) => left.baseKey.localeCompare(right.baseKey))
}

export function reusableLocalProfiles(searchRoots = defaultGatewaySearchRoots()) {
  return discoverLocalAgentProfiles(searchRoots).filter((item) => item.agentId && item.keyFile)
}

export function assertNoExistingLocalActivation(authorizationToken, { searchRoots = defaultGatewaySearchRoots() } = {}) {
  const artifacts = localActivationArtifacts(searchRoots)
  if (artifacts.length === 0) {
    return
  }

  const profiles = artifacts.filter((item) => item.agentId && item.keyFile)
  const tokenTargetAgentId = onboardingTokenTargetAgentId(authorizationToken)
  if (profiles.length === 0) {
    const artifact = artifacts[0]
    const artifactPath = clean(artifact.gatewayStateFile) || clean(artifact.keyFile) || clean(artifact.receiptFile) || clean(artifact.onboardingSummaryFile)
    throw new Error(`Local AgentSquared activation artifacts already exist${artifactPath ? ` at ${artifactPath}` : ''}. Do not start onboarding again on this host runtime. Reuse the existing local setup or clean up the abandoned local activation intentionally before retrying.`)
  }

  if (profiles.length === 1) {
    const profile = profiles[0]
    const sameAgent = tokenTargetAgentId && tokenTargetAgentId === profile.agentId
    if (sameAgent) {
      throw new Error(`AgentSquared is already activated locally for ${profile.agentId}. Do not activate the same agent again. Use \`node a2_cli.mjs local inspect\` and then \`node a2_cli.mjs gateway restart --agent-id ${profile.agentId} --key-file ${profile.keyFile}\`.`)
    }
    throw new Error(`A reusable local AgentSquared profile already exists for ${profile.agentId}. Reinstalling or updating the official Skills does not require onboarding again. Use \`node a2_cli.mjs local inspect\` and then \`node a2_cli.mjs gateway restart --agent-id ${profile.agentId} --key-file ${profile.keyFile}\`.`)
  }

  if (tokenTargetAgentId) {
    const matchingProfile = profiles.find((item) => item.agentId === tokenTargetAgentId)
    if (matchingProfile) {
      throw new Error(`AgentSquared is already activated locally for ${matchingProfile.agentId}. Do not activate the same agent again. Run \`node a2_cli.mjs local inspect\` and then choose the existing profile instead of onboarding again.`)
    }
  }

  throw new Error('Multiple reusable local AgentSquared profiles already exist. Reinstalling or updating the official Skills does not require onboarding again. Run `node a2_cli.mjs local inspect` and then choose one profile explicitly with `--agent-id` and `--key-file`.')
}

export function resolveAgentContext(args = {}, { searchRoots = defaultGatewaySearchRoots() } = {}) {
  const explicitAgentId = clean(args['agent-id'])
  const explicitKeyFile = clean(args['key-file'])
  const explicitGatewayStateFile = clean(args['gateway-state-file'])

  if (explicitAgentId && explicitKeyFile) {
    return {
      agentId: explicitAgentId,
      keyFile: resolveUserPath(explicitKeyFile),
      gatewayStateFile: explicitGatewayStateFile || defaultGatewayStateFile(explicitKeyFile, explicitAgentId)
    }
  }

  const singleton = findSingletonGatewayState(searchRoots)
  if (singleton) {
    return {
      agentId: clean(singleton.state.agentId),
      keyFile: resolveUserPath(singleton.state.keyFile),
      gatewayStateFile: singleton.stateFile
    }
  }

  const profile = findSingletonAgentProfile(searchRoots)
  if (!profile) {
    throw new Error('No local AgentSquared gateway or agent profile could be discovered automatically. Pass --agent-id and --key-file explicitly.')
  }

  return {
    agentId: clean(profile.agentId),
    keyFile: resolveUserPath(profile.keyFile),
    gatewayStateFile: profile.gatewayStateFile || defaultGatewayStateFile(profile.keyFile, profile.agentId)
  }
}

export async function inspectExistingGateway({ gatewayBase = '', keyFile = '', agentId = '', gatewayStateFile = '' } = {}) {
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

export async function signedRelayContext(args, { searchRoots = defaultGatewaySearchRoots() } = {}) {
  const apiBase = clean(args['api-base']) || 'https://api.agentsquared.net'
  const context = resolveAgentContext(args, { searchRoots })
  const agentId = context.agentId
  const keyFile = context.keyFile
  const bundle = loadRuntimeKeyBundle(keyFile)
  const { gatewayBase, health, transport } = await resolveGatewayTransport(args, searchRoots)
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
