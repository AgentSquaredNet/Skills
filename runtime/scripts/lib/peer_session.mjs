import { randomRequestId } from './cli.mjs'
import { createConnectTicket, getAgentCard, introspectConnectTicket, postOnline, reportSession } from './relay_http.mjs'
import { currentPeerConnection, dialProtocol, openStreamOnExistingConnection, readSingleLine, waitForPublishedTransport, writeLine } from './libp2p_a2a.mjs'

export function buildJsonRpcEnvelope({ id, method, message, metadata = {} }) {
  return {
    jsonrpc: '2.0',
    id: id ?? randomRequestId('a2a'),
    method,
    params: {
      message,
      metadata
    }
  }
}

export async function currentTransport(node, binding, options = {}) {
  return waitForPublishedTransport(node, binding, options)
}

export async function publishGatewayPresence(apiBase, agentId, bundle, node, binding, activitySummary, {
  availabilityStatus = 'available',
  requireRelayReservation = false
} = {}) {
  const transport = await currentTransport(node, binding, { requireRelayReservation })
  return postOnline(apiBase, agentId, bundle, {
    availabilityStatus,
    activitySummary,
    peerId: transport.peerId,
    listenAddrs: transport.listenAddrs,
    relayAddrs: transport.relayAddrs,
    supportedBindings: transport.supportedBindings,
    a2aProtocolVersion: transport.a2aProtocolVersion,
    streamProtocol: transport.streamProtocol
  })
}

export async function openDirectPeerSession({
  apiBase,
  agentId,
  bundle,
  node,
  binding,
  targetAgentId,
  skillName,
  method,
  message,
  metadata = null,
  activitySummary,
  report,
  sessionStore = null,
  allowTrustedReuse = true
}) {
  const cachedSession = sessionStore?.trustedSessionByAgent?.(targetAgentId) ?? null
  const liveConnection = cachedSession?.remotePeerId ? currentPeerConnection(node, cachedSession.remotePeerId) : null

  let ticket = null
  let peerSessionId = `${cachedSession?.peerSessionId ?? ''}`.trim()
  let targetTransport = null
  let reusedSession = false
  const reusableTransport = allowTrustedReuse && cachedSession && liveConnection
    ? mergeTargetTransport({
        primary: cachedSession.remoteTransport,
        secondary: cachedSession?.remotePeerId
          ? {
              peerId: cachedSession.remotePeerId,
              streamProtocol: binding.streamProtocol
            }
          : null,
        streamProtocol: binding.streamProtocol
      })
    : null

  if (reusableTransport?.peerId && reusableTransport?.streamProtocol) {
    try {
      sessionStore?.touchTrustedSession?.(cachedSession.peerSessionId)
      const reusedResponse = await exchangeOverTransport({
        node,
        transport: reusableTransport,
        request: buildJsonRpcEnvelope({
          method,
          message,
          metadata: {
            ...(metadata && typeof metadata === 'object' ? metadata : {}),
            relayConnectTicket: '',
            peerSessionId,
            skillHint: `${skillName ?? ''}`.trim(),
            from: agentId,
            to: targetAgentId
          }
        }),
        reuseExistingConnection: true
      })
      targetTransport = reusableTransport
      reusedSession = true

      if (peerSessionId && targetTransport?.peerId) {
        sessionStore?.rememberTrustedSession?.({
          peerSessionId,
          remoteAgentId: targetAgentId,
          remotePeerId: targetTransport.peerId,
          remoteTransport: targetTransport,
          skillHint: `${skillName ?? ''}`.trim()
        })
      }

      return { ticket, peerSessionId, response: reusedResponse, sessionReport: null, reusedSession }
    } catch (error) {
      if (!isTrustedSessionRetryable(error)) {
        throw error
      }
    }
  }

  const transport = await currentTransport(node, binding, { requireRelayReservation: true })
  const latestAgentCard = await bestEffortAgentCard(apiBase, agentId, bundle, targetAgentId, transport)
  ticket = await createConnectTicket(apiBase, agentId, bundle, targetAgentId, skillName, transport)
  targetTransport = mergeTargetTransport({
    primary: latestAgentCard?.preferredTransport ?? null,
    secondary: ticket.targetTransport ?? ticket.agentCard?.preferredTransport ?? null,
    tertiary: cachedSession?.remoteTransport ?? null,
    streamProtocol: binding.streamProtocol
  })
  peerSessionId = parseConnectTicketId(ticket.ticket) || randomRequestId('peer')

  const response = await exchangeOverTransport({
    node,
    transport: targetTransport,
    request: buildJsonRpcEnvelope({
      method,
      message,
      metadata: {
        ...(metadata && typeof metadata === 'object' ? metadata : {}),
        relayConnectTicket: ticket?.ticket ?? '',
        peerSessionId,
        skillHint: `${skillName ?? ''}`.trim(),
        from: agentId,
        to: targetAgentId
      }
    })
  })

  if (peerSessionId && targetTransport?.peerId) {
    sessionStore?.rememberTrustedSession?.({
      peerSessionId,
      remoteAgentId: targetAgentId,
      remotePeerId: targetTransport.peerId,
      remoteTransport: targetTransport,
      skillHint: `${skillName ?? ''}`.trim()
    })
  }

  let sessionReport = null
  if (report && ticket?.ticket) {
    sessionReport = await reportSession(apiBase, agentId, bundle, {
      ticket: ticket.ticket,
      taskId: report.taskId,
      status: report.status ?? 'completed',
      summary: report.summary,
      publicSummary: report.publicSummary ?? ''
    }, await bestEffortCurrentTransport(node, binding))
  }

  return { ticket, peerSessionId, response, sessionReport, reusedSession }
}

export function buildRouter(routes = {}) {
  return async ({ request, ticketView, agentId, suggestedSkill = '' }) => {
    const route = routes[`${suggestedSkill || ticketView?.skillName || 'friend-im'}`.trim()] ?? routes['friend-im']
    if (!route) {
      throw new Error(`unsupported inbound skill route: ${suggestedSkill || ticketView?.skillName || ''}`)
    }
    return route({ request, ticketView, agentId })
  }
}

export async function attachInboundRouter({
  apiBase,
  agentId,
  bundle,
  node,
  binding,
  handler,
  sessionStore
}) {
  node.handle(binding.streamProtocol, async (eventOrStream, maybeConnection) => {
    const { stream, connection } = normalizeInboundStreamContext(eventOrStream, maybeConnection)
    const remotePeerId = connection?.remotePeer?.toString?.()
      ?? stream?.stat?.connection?.remotePeer?.toString?.()
      ?? ''
    try {
      const rawLine = await readSingleLine(stream)
      const request = JSON.parse(rawLine)
      const metadata = request?.params?.metadata ?? {}
      const relayConnectTicket = `${metadata.relayConnectTicket ?? ''}`.trim()
      const requestedPeerSessionId = `${metadata.peerSessionId ?? ''}`.trim()
      let ticketView = null
      let peerSessionId = requestedPeerSessionId
      let remoteAgentId = `${metadata.from ?? ''}`.trim()
      let suggestedSkill = `${metadata.skillHint ?? ''}`.trim()

      if (relayConnectTicket) {
        ticketView = await introspectConnectTicket(
          apiBase,
          agentId,
          bundle,
          relayConnectTicket,
          await bestEffortCurrentTransport(node, binding)
        )
        peerSessionId = peerSessionId || ticketView.ticketId
        remoteAgentId = remoteAgentId || ticketView.initiatorAgentId
        suggestedSkill = suggestedSkill || `${ticketView.skillName ?? ''}`.trim()
        sessionStore?.rememberTrustedSession?.({
          peerSessionId,
          remoteAgentId,
          remotePeerId,
          remoteTransport: {
            peerId: remotePeerId,
            streamProtocol: binding.streamProtocol
          },
          ticketView,
          skillHint: suggestedSkill
        })
      } else {
        const trustedSession = sessionStore?.trustedSessionById?.(peerSessionId)
        if (!trustedSession || trustedSession.remotePeerId !== remotePeerId) {
          await writeLine(stream, JSON.stringify({
            jsonrpc: '2.0',
            id: request?.id ?? randomRequestId('invalid'),
            error: { code: 401, message: 'relayConnectTicket or a trusted peerSessionId is required' }
          }))
          return
        }
        sessionStore?.touchTrustedSession?.(trustedSession.peerSessionId)
        remoteAgentId = remoteAgentId || trustedSession.remoteAgentId
        ticketView = trustedSession.ticketView ?? null
        suggestedSkill = suggestedSkill || trustedSession.skillHint || 'friend-im'
      }

      const inbound = await sessionStore.enqueueInbound({
        request,
        ticketView,
        remotePeerId,
        remoteAgentId,
        peerSessionId,
        suggestedSkill,
        defaultSkill: 'friend-im'
      })
      const result = await inbound.responsePromise
      const finalResult = typeof result === 'object' && result != null
        ? {
            ...result,
            metadata: {
              ...(result.metadata ?? {}),
              peerSessionId
            }
          }
        : { value: result, metadata: { peerSessionId } }
      await writeLine(stream, JSON.stringify({
        jsonrpc: '2.0',
        id: request.id,
        result: finalResult
      }))
    } catch (error) {
      await writeLine(stream, JSON.stringify({
        jsonrpc: '2.0',
        id: randomRequestId('error'),
        error: { code: Number.parseInt(`${error.code ?? 500}`, 10) || 500, message: error.message }
      }))
    } finally {
      await stream.close()
    }
  }, { runOnLimitedConnection: true })
}

function normalizeInboundStreamContext(eventOrStream, maybeConnection) {
  if (maybeConnection) {
    return {
      stream: eventOrStream,
      connection: maybeConnection
    }
  }

  return {
    stream: eventOrStream?.stream ?? eventOrStream,
    connection: eventOrStream?.connection ?? null
  }
}

async function bestEffortCurrentTransport(node, binding) {
  try {
    return await currentTransport(node, binding)
  } catch {
    return null
  }
}

async function exchangeOverTransport({
  node,
  transport,
  request,
  reuseExistingConnection = false
}) {
  const stream = reuseExistingConnection
    ? await openStreamOnExistingConnection(node, transport)
    : await dialProtocol(node, transport, { requireDirect: false })
  try {
    await writeLine(stream, JSON.stringify(request))
    const rawResponse = await readSingleLine(stream)
    const response = JSON.parse(rawResponse)
    if (response.error) {
      throw buildJsonRpcError(response.error)
    }
    return response
  } finally {
    await stream.close()
  }
}

function buildJsonRpcError(error = {}) {
  const out = new Error(`${error.message ?? 'remote peer returned an error'}`)
  out.code = Number.parseInt(`${error.code ?? 500}`, 10) || 500
  return out
}

async function bestEffortAgentCard(apiBase, agentId, bundle, targetAgentId, transport) {
  try {
    return await getAgentCard(apiBase, agentId, bundle, targetAgentId, transport)
  } catch {
    return null
  }
}

function isTrustedSessionRetryable(error) {
  const message = `${error?.message ?? ''}`.trim()
  const code = Number.parseInt(`${error?.code ?? 0}`, 10) || 0
  return code === 401 || message.includes('relayConnectTicket or a trusted peerSessionId is required')
}

function mergeTargetTransport({
  primary = null,
  secondary = null,
  tertiary = null,
  streamProtocol = ''
} = {}) {
  const sources = [primary, secondary, tertiary].filter((value) => value && typeof value === 'object')
  const peerId = firstNonEmpty(sources.map((value) => value.peerId))
  const protocol = firstNonEmpty(sources.map((value) => value.streamProtocol).concat(streamProtocol))
  const dialAddrs = unique(
    sources.flatMap((value) => value.dialAddrs ?? [])
  )
  const listenAddrs = unique(
    sources.flatMap((value) => value.listenAddrs ?? [])
  )
  const relayAddrs = unique(
    sources.flatMap((value) => value.relayAddrs ?? [])
  )
  const supportedBindings = unique(
    sources.flatMap((value) => value.supportedBindings ?? [])
  )
  const a2aProtocolVersion = firstNonEmpty(sources.map((value) => value.a2aProtocolVersion))

  if (!peerId || !protocol) {
    return null
  }

  return {
    peerId,
    streamProtocol: protocol,
    dialAddrs,
    listenAddrs,
    relayAddrs,
    supportedBindings,
    a2aProtocolVersion
  }
}

function firstNonEmpty(values = []) {
  for (const value of values) {
    const cleaned = `${value ?? ''}`.trim()
    if (cleaned) {
      return cleaned
    }
  }
  return ''
}

function unique(values = []) {
  return [...new Set(values.map((value) => `${value}`.trim()).filter(Boolean))]
}

function parseConnectTicketId(token) {
  const parts = `${token ?? ''}`.trim().split('.')
  if (parts.length < 2) return ''
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    return `${payload.tid ?? payload.jti ?? ''}`.trim()
  } catch {
    return ''
  }
}
