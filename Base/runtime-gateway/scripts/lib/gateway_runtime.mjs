import fs from 'node:fs'
import path from 'node:path'

function safeAgentId(agentId) {
  return `${agentId}`.replace(/[^a-zA-Z0-9_.-]+/g, '_')
}

export function defaultGatewayStateFile(keyFile, agentId) {
  if (!keyFile || !agentId) {
    throw new Error('keyFile and agentId are required to derive the gateway state file')
  }
  return path.join(path.dirname(path.resolve(keyFile)), `${safeAgentId(agentId)}_gateway.json`)
}

export function readGatewayState(gatewayStateFile) {
  const cleaned = path.resolve(gatewayStateFile)
  if (!fs.existsSync(cleaned)) {
    return null
  }
  return JSON.parse(fs.readFileSync(cleaned, 'utf8'))
}

export function writeGatewayState(gatewayStateFile, payload) {
  const cleaned = path.resolve(gatewayStateFile)
  fs.mkdirSync(path.dirname(cleaned), { recursive: true })
  fs.writeFileSync(cleaned, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 })
  fs.chmodSync(cleaned, 0o600)
}

export function resolveGatewayBase({ gatewayBase = '', keyFile = '', agentId = '', gatewayStateFile = '' } = {}) {
  const explicit = `${gatewayBase}`.trim()
  if (explicit) {
    return explicit
  }
  const envValue = `${process.env.AGENTSQUARED_GATEWAY_BASE ?? ''}`.trim()
  if (envValue) {
    return envValue
  }
  const stateFile = `${gatewayStateFile}`.trim() || (keyFile && agentId ? defaultGatewayStateFile(keyFile, agentId) : '')
  if (!stateFile) {
    throw new Error('gatewayBase was not provided. Pass --gateway-base or provide --agent-id and --key-file so the local gateway state file can be discovered.')
  }
  const state = readGatewayState(stateFile)
  const discovered = `${state?.gatewayBase ?? ''}`.trim()
  if (!discovered) {
    throw new Error(`gateway state file does not contain a gatewayBase: ${stateFile}`)
  }
  return discovered
}
