import fs from 'node:fs'
import path from 'node:path'

function clean(value) {
  return `${value ?? ''}`.trim()
}

export function safeAgentId(value) {
  return clean(value).replace(/[^a-zA-Z0-9_.-]+/g, '_')
}

export function resolveUserPath(inputPath) {
  return path.resolve(`${inputPath ?? ''}`.replace(/^~(?=$|\/|\\)/, process.env.HOME || '~'))
}

export function resolveHostWorkspaceDir(detectedHostRuntime = null) {
  return clean(
    detectedHostRuntime?.workspaceDir
      ?? detectedHostRuntime?.overviewStatus?.agents?.agents?.find?.((item) => clean(item?.workspaceDir))?.workspaceDir
      ?? detectedHostRuntime?.overviewStatus?.agents?.agents?.[0]?.workspaceDir
  )
}

export function resolveAgentSquaredDir(args = {}, detectedHostRuntime = null) {
  const explicit = clean(args?.['agentsquared-dir'])
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

export function resolveAgentSquaredRootFromKeyFile(keyFile) {
  const resolvedKeyFile = resolveUserPath(keyFile)
  const keyDir = path.dirname(resolvedKeyFile)
  if (path.basename(resolvedKeyFile) === 'runtime-key.json' && path.basename(keyDir) === 'identity') {
    return path.dirname(keyDir)
  }
  return keyDir
}

export function identityDirForRoot(rootDir) {
  return path.join(resolveUserPath(rootDir), 'identity')
}

export function runtimeDirForRoot(rootDir) {
  return path.join(resolveUserPath(rootDir), 'runtime')
}

export function inboxDirForRoot(rootDir) {
  return path.join(resolveUserPath(rootDir), 'inbox')
}

export function relationshipsFileForRoot(rootDir) {
  return path.join(resolveUserPath(rootDir), 'AGENT_RELATIONSHIPS.md')
}

export function defaultRuntimeKeyFile(agentName, args = {}, detectedHostRuntime = null) {
  return path.join(identityDirForRoot(resolveAgentSquaredDir(args, detectedHostRuntime)), 'runtime-key.json')
}

function preferExisting(primaryPath, fallbackPath) {
  const primary = resolveUserPath(primaryPath)
  const fallback = resolveUserPath(fallbackPath)
  if (fs.existsSync(primary)) {
    return primary
  }
  if (fs.existsSync(fallback)) {
    return fallback
  }
  return primary
}

export function defaultGatewayStateFile(keyFile, agentId) {
  if (!keyFile || !agentId) {
    throw new Error('keyFile and agentId are required to derive the gateway state file')
  }
  const rootDir = resolveAgentSquaredRootFromKeyFile(keyFile)
  const current = path.join(runtimeDirForRoot(rootDir), 'gateway.json')
  const legacy = path.join(path.dirname(resolveUserPath(keyFile)), `${safeAgentId(agentId)}_gateway.json`)
  return preferExisting(current, legacy)
}

export function defaultPeerKeyFile(keyFile, agentId) {
  if (!keyFile || !agentId) {
    throw new Error('keyFile and agentId are required to derive the peer key file')
  }
  const rootDir = resolveAgentSquaredRootFromKeyFile(keyFile)
  const current = path.join(runtimeDirForRoot(rootDir), 'gateway-peer.key')
  const legacy = path.join(path.dirname(resolveUserPath(keyFile)), `${safeAgentId(agentId)}_gateway-peer.key`)
  return preferExisting(current, legacy)
}

export function defaultGatewayLogFile(keyFile, agentId) {
  if (!keyFile || !agentId) {
    throw new Error('keyFile and agentId are required to derive the gateway log file')
  }
  const rootDir = resolveAgentSquaredRootFromKeyFile(keyFile)
  const current = path.join(runtimeDirForRoot(rootDir), 'gateway.log')
  const legacy = path.join(path.dirname(resolveUserPath(keyFile)), `${safeAgentId(agentId)}_gateway.log`)
  return preferExisting(current, legacy)
}

export function defaultInboxDir(keyFile, agentId) {
  if (!keyFile || !agentId) {
    throw new Error('keyFile and agentId are required to derive the inbox directory')
  }
  const rootDir = resolveAgentSquaredRootFromKeyFile(keyFile)
  const current = inboxDirForRoot(rootDir)
  const legacy = path.join(path.dirname(resolveUserPath(keyFile)), `${safeAgentId(agentId)}_inbox`)
  return preferExisting(current, legacy)
}

export function defaultReceiptFile(keyFile, fullName = '') {
  if (!keyFile) {
    throw new Error('keyFile is required to derive the receipt file')
  }
  const rootDir = resolveAgentSquaredRootFromKeyFile(keyFile)
  const current = path.join(identityDirForRoot(rootDir), 'registration-receipt.json')
  const full = clean(fullName)
  const legacySameDir = full
    ? path.join(path.dirname(resolveUserPath(keyFile)), `${safeAgentId(full)}_receipt.json`)
    : ''
  const legacyWorkspaceRoot = path.join(path.dirname(rootDir), 'registration_receipt.json')
  return preferExisting(current, legacySameDir || legacyWorkspaceRoot)
}

export function defaultOnboardingSummaryFile(keyFile, fullName = '') {
  if (!keyFile) {
    throw new Error('keyFile is required to derive the onboarding summary file')
  }
  const rootDir = resolveAgentSquaredRootFromKeyFile(keyFile)
  const current = path.join(identityDirForRoot(rootDir), 'onboarding-summary.json')
  const full = clean(fullName)
  const legacy = full
    ? path.join(path.dirname(resolveUserPath(keyFile)), `${safeAgentId(full)}_onboarding_summary.json`)
    : current
  return preferExisting(current, legacy)
}

export function inferAgentSquaredRootFromArtifact(filePath) {
  const resolved = resolveUserPath(filePath)
  const name = path.basename(resolved)
  const parent = path.dirname(resolved)
  const grandparent = path.dirname(parent)

  if ((name === 'runtime-key.json' || name === 'registration-receipt.json' || name === 'onboarding-summary.json') && path.basename(parent) === 'identity') {
    return grandparent
  }
  if ((name === 'gateway.json' || name === 'gateway-peer.key' || name === 'gateway.log') && path.basename(parent) === 'runtime') {
    return grandparent
  }
  if ((name === 'index.json' || name === 'inbox.md') && path.basename(parent) === 'inbox') {
    return grandparent
  }
  if (path.basename(parent) === 'entries' && path.basename(grandparent) === 'inbox') {
    return path.dirname(grandparent)
  }
  return ''
}
