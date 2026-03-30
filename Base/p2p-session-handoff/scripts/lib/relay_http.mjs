import { signText } from './runtime_key.mjs'
import { utcNow } from './cli.mjs'
import { requestJson } from './http_json.mjs'

export function onlineSignTarget(agentId, signedAt) {
  return `agentsquared:relay-online:${agentId}:${signedAt}`
}

export function mcpSignTarget(method, path, agentId, signedAt) {
  return `agentsquared:relay-mcp:${method.toUpperCase()}:${path}:${agentId}:${signedAt}`
}

export async function getBindingDocument(apiBase) {
  return requestJson(`${apiBase}/api/relay/bindings/libp2p-a2a-jsonrpc`)
}

export async function postOnline(apiBase, agentId, bundle, payload) {
  const signedAt = utcNow()
  const body = {
    agentId,
    signedAt,
    signature: signText(bundle, onlineSignTarget(agentId, signedAt)),
    ...payload
  }
  return requestJson(`${apiBase}/api/relay/online`, {
    method: 'POST',
    payload: body
  })
}

export function signedHeaders(method, path, agentId, bundle) {
  const signedAt = utcNow()
  return {
    'X-AgentSquared-Agent-Id': agentId,
    'X-AgentSquared-Signed-At': signedAt,
    'X-AgentSquared-Signature': signText(bundle, mcpSignTarget(method, path, agentId, signedAt))
  }
}

function appendCsv(headers, name, values = []) {
  const cleaned = values.map((value) => `${value}`.trim()).filter(Boolean)
  if (cleaned.length > 0) {
    headers[name] = cleaned.join(',')
  }
}

export function transportRefreshHeaders(transport = null) {
  if (!transport) return {}
  const headers = {}
  const peerId = `${transport.peerId ?? ''}`.trim()
  if (peerId) {
    headers['X-AgentSquared-Peer-Id'] = peerId
  }
  appendCsv(headers, 'X-AgentSquared-Listen-Addrs', transport.listenAddrs ?? [])
  appendCsv(headers, 'X-AgentSquared-Relay-Addrs', transport.relayAddrs ?? [])
  appendCsv(headers, 'X-AgentSquared-Supported-Bindings', transport.supportedBindings ?? [])
  const streamProtocol = `${transport.streamProtocol ?? ''}`.trim()
  if (streamProtocol) {
    headers['X-AgentSquared-Stream-Protocol'] = streamProtocol
  }
  const a2aProtocolVersion = `${transport.a2aProtocolVersion ?? ''}`.trim()
  if (a2aProtocolVersion) {
    headers['X-AgentSquared-A2A-Protocol-Version'] = a2aProtocolVersion
  }
  return headers
}

export async function signedJson(apiBase, method, path, agentId, bundle, payload = null, transport = null) {
  return requestJson(`${apiBase}${path}`, {
    method,
    headers: {
      ...signedHeaders(method, path, agentId, bundle),
      ...transportRefreshHeaders(transport)
    },
    payload: payload == null ? undefined : payload
  })
}

export async function createConnectTicket(apiBase, agentId, bundle, targetAgentId, skillName, transport = null) {
  return signedJson(apiBase, 'POST', '/api/relay/connect-tickets', agentId, bundle, {
    targetAgentId,
    skillName
  }, transport)
}

export async function introspectConnectTicket(apiBase, agentId, bundle, ticket, transport = null) {
  return signedJson(apiBase, 'POST', '/api/relay/connect-tickets/introspect', agentId, bundle, {
    ticket
  }, transport)
}

export async function reportSession(apiBase, agentId, bundle, payload, transport = null) {
  return signedJson(apiBase, 'POST', '/api/relay/session-reports', agentId, bundle, payload, transport)
}

export async function getFriendDirectory(apiBase, agentId, bundle, transport = null) {
  return signedJson(apiBase, 'GET', '/api/relay/friends', agentId, bundle, null, transport)
}

function normalizeAgentId(value) {
  return `${value ?? ''}`.trim().toLowerCase()
}

export function flattenFriendDirectoryAgents(directory = null) {
  const items = Array.isArray(directory?.items) ? directory.items : []
  return items.flatMap((item) => Array.isArray(item?.agents) ? item.agents : [])
}

export function findFriendAgent(directory, targetAgentId) {
  const normalizedTarget = normalizeAgentId(targetAgentId)
  if (!normalizedTarget) {
    return null
  }
  return flattenFriendDirectoryAgents(directory).find((agent) => normalizeAgentId(agent?.agentId) === normalizedTarget) ?? null
}

export function friendAgentTransportHint(directory, targetAgentId) {
  const agent = findFriendAgent(directory, targetAgentId)
  const transport = agent?.preferredTransport ?? null
  if (!transport?.peerId || !transport?.streamProtocol) {
    return null
  }
  return transport
}

export async function resolveFriendCoordination(apiBase, agentId, bundle, targetAgentId, transport = null) {
  const directory = await getFriendDirectory(apiBase, agentId, bundle, transport)
  const friendAgent = findFriendAgent(directory, targetAgentId)
  if (!friendAgent) {
    throw new Error(`target agent is not visible in friend directory: ${targetAgentId}`)
  }

  const preferredTransport = friendAgentTransportHint(directory, targetAgentId)
  if (preferredTransport) {
    return {
      source: 'friend-directory',
      directory,
      friendAgent,
      preferredTransport
    }
  }

  const agentCard = await getAgentCard(apiBase, agentId, bundle, targetAgentId, transport)
  return {
    source: 'agent-card',
    directory,
    friendAgent,
    preferredTransport: agentCard?.preferredTransport ?? null,
    agentCard
  }
}

export async function getAgentCard(apiBase, agentId, bundle, targetAgentId, transport = null) {
  return signedJson(
    apiBase,
    'GET',
    `/api/relay/agents/${encodeURIComponent(targetAgentId)}/.well-known/agent-card.json`,
    agentId,
    bundle,
    null,
    transport
  )
}
