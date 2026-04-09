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
    return path.join(process.env.HOME, '.openclaw', 'workspace', 'AgentSquared')
  }
  return path.join(process.cwd(), 'AgentSquared')
}

export function resolveAgentScopeDir(agentNameOrId, args = {}, detectedHostRuntime = null) {
  const safeId = safeAgentId(agentNameOrId)
  if (!safeId) {
    throw new Error('agentNameOrId is required to derive the AgentSquared agent scope directory')
  }
  return path.join(resolveAgentSquaredDir(args, detectedHostRuntime), safeId)
}

export function inferAgentSquaredScopeFromArtifact(filePath) {
  const resolved = resolveUserPath(filePath)
  const name = path.basename(resolved)
  const parent = path.dirname(resolved)
  const grandparent = path.dirname(parent)

  if ((name === 'runtime-key.json' || name === 'registration-receipt.json' || name === 'onboarding-summary.json') && path.basename(parent) === 'identity') {
    return grandparent
  }
  if ((name === 'gateway.json' || name === 'gateway-peer.key' || name === 'gateway.log' || name === 'openclaw-device.json' || name === 'openclaw-device-auth.json') && path.basename(parent) === 'runtime') {
    return grandparent
  }
  if ((name === 'index.json' || name === 'inbox.md') && path.basename(parent) === 'inbox') {
    return grandparent
  }
  if (path.basename(parent) === 'entries' && path.basename(grandparent) === 'inbox') {
    return path.dirname(grandparent)
  }
  if (name === 'AGENT_RELATIONSHIPS.md') {
    return parent
  }
  return ''
}

export function resolveAgentScopeDirFromKeyFile(keyFile) {
  const scopeDir = inferAgentSquaredScopeFromArtifact(keyFile)
  if (!scopeDir || path.basename(resolveUserPath(keyFile)) !== 'runtime-key.json') {
    throw new Error(`keyFile is not inside the AgentSquared multi-agent layout: ${resolveUserPath(keyFile)}`)
  }
  return scopeDir
}

export function identityDirForAgentScope(scopeDir) {
  return path.join(resolveUserPath(scopeDir), 'identity')
}

export function runtimeDirForAgentScope(scopeDir) {
  return path.join(resolveUserPath(scopeDir), 'runtime')
}

export function inboxDirForAgentScope(scopeDir) {
  return path.join(resolveUserPath(scopeDir), 'inbox')
}

export function relationshipsFileForAgentScope(scopeDir) {
  return path.join(resolveUserPath(scopeDir), 'AGENT_RELATIONSHIPS.md')
}

export function defaultRuntimeKeyFile(agentName, args = {}, detectedHostRuntime = null) {
  return path.join(identityDirForAgentScope(resolveAgentScopeDir(agentName, args, detectedHostRuntime)), 'runtime-key.json')
}

function scopeDirForKeyAndAgent(keyFile, agentId = '') {
  try {
    return resolveAgentScopeDirFromKeyFile(keyFile)
  } catch {
    const safeId = safeAgentId(agentId)
    if (!safeId) {
      throw new Error(`Cannot derive AgentSquared scope directory from keyFile without agentId: ${resolveUserPath(keyFile)}`)
    }
    const keyDir = path.dirname(resolveUserPath(keyFile))
    const identityDir = path.basename(keyDir) === 'identity' ? keyDir : path.join(keyDir, 'identity')
    return path.dirname(identityDir)
  }
}

export function defaultGatewayStateFile(keyFile, agentId) {
  if (!keyFile || !agentId) {
    throw new Error('keyFile and agentId are required to derive the gateway state file')
  }
  return path.join(runtimeDirForAgentScope(scopeDirForKeyAndAgent(keyFile, agentId)), 'gateway.json')
}

export function defaultPeerKeyFile(keyFile, agentId) {
  if (!keyFile || !agentId) {
    throw new Error('keyFile and agentId are required to derive the peer key file')
  }
  return path.join(runtimeDirForAgentScope(scopeDirForKeyAndAgent(keyFile, agentId)), 'gateway-peer.key')
}

export function defaultGatewayLogFile(keyFile, agentId) {
  if (!keyFile || !agentId) {
    throw new Error('keyFile and agentId are required to derive the gateway log file')
  }
  return path.join(runtimeDirForAgentScope(scopeDirForKeyAndAgent(keyFile, agentId)), 'gateway.log')
}

export function defaultOpenClawStateDir(keyFile, agentId) {
  if (!keyFile || !agentId) {
    throw new Error('keyFile and agentId are required to derive the OpenClaw state directory')
  }
  return runtimeDirForAgentScope(scopeDirForKeyAndAgent(keyFile, agentId))
}

export function defaultInboxDir(keyFile, agentId) {
  if (!keyFile || !agentId) {
    throw new Error('keyFile and agentId are required to derive the inbox directory')
  }
  return inboxDirForAgentScope(scopeDirForKeyAndAgent(keyFile, agentId))
}

export function defaultReceiptFile(keyFile, fullName = '') {
  if (!keyFile) {
    throw new Error('keyFile is required to derive the receipt file')
  }
  return path.join(identityDirForAgentScope(scopeDirForKeyAndAgent(keyFile, fullName)), 'registration-receipt.json')
}

export function defaultOnboardingSummaryFile(keyFile, fullName = '') {
  if (!keyFile) {
    throw new Error('keyFile is required to derive the onboarding summary file')
  }
  return path.join(identityDirForAgentScope(scopeDirForKeyAndAgent(keyFile, fullName)), 'onboarding-summary.json')
}
