import { signText } from './runtime_key.mjs'
import { utcNow } from './cli.mjs'

export function onlineSignTarget(agentId, signedAt) {
  return `agentsquared:relay-online:${agentId}:${signedAt}`
}

export function mcpSignTarget(method, path, agentId, signedAt) {
  return `agentsquared:relay-mcp:${method.toUpperCase()}:${path}:${agentId}:${signedAt}`
}

async function parseJsonResponse(response) {
  const text = await response.text()
  const data = text.trim() ? JSON.parse(text) : {}
  if (!response.ok) {
    const detail = data?.error?.message ?? (text.trim() || response.statusText)
    throw new Error(`${response.status} ${detail}`)
  }
  return data
}

export async function getBindingDocument(apiBase) {
  const response = await fetch(`${apiBase}/api/relay/bindings/libp2p-a2a-jsonrpc`)
  return parseJsonResponse(response)
}

export async function postOnline(apiBase, agentId, bundle, payload) {
  const signedAt = utcNow()
  const body = {
    agentId,
    signedAt,
    signature: signText(bundle, onlineSignTarget(agentId, signedAt)),
    ...payload
  }
  const response = await fetch(`${apiBase}/api/relay/online`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  return parseJsonResponse(response)
}

export function signedHeaders(method, path, agentId, bundle) {
  const signedAt = utcNow()
  return {
    'Content-Type': 'application/json',
    'X-AgentSquared-Agent-Id': agentId,
    'X-AgentSquared-Signed-At': signedAt,
    'X-AgentSquared-Signature': signText(bundle, mcpSignTarget(method, path, agentId, signedAt))
  }
}

export async function signedJson(apiBase, method, path, agentId, bundle, payload = null) {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: signedHeaders(method, path, agentId, bundle),
    body: payload == null ? undefined : JSON.stringify(payload)
  })
  return parseJsonResponse(response)
}

export async function createConnectTicket(apiBase, agentId, bundle, targetAgentId, skillName) {
  return signedJson(apiBase, 'POST', '/api/relay/connect-tickets', agentId, bundle, {
    targetAgentId,
    skillName
  })
}

export async function introspectConnectTicket(apiBase, agentId, bundle, ticket) {
  return signedJson(apiBase, 'POST', '/api/relay/connect-tickets/introspect', agentId, bundle, {
    ticket
  })
}

export async function reportSession(apiBase, agentId, bundle, payload) {
  return signedJson(apiBase, 'POST', '/api/relay/session-reports', agentId, bundle, payload)
}

export async function getFriendDirectory(apiBase, agentId, bundle) {
  return signedJson(apiBase, 'GET', '/api/relay/friends', agentId, bundle)
}

export async function getAgentCard(apiBase, agentId, bundle, targetAgentId) {
  return signedJson(
    apiBase,
    'GET',
    `/api/relay/agents/${encodeURIComponent(targetAgentId)}/.well-known/agent-card.json`,
    agentId,
    bundle
  )
}
