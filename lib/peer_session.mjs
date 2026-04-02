import { randomRequestId } from './cli.mjs'
import { createConnectTicket, getAgentCard, introspectConnectTicket, postOnline, reportSession } from './relay_http.mjs'
import { currentPeerConnection, dialProtocol, openStreamOnExistingConnection, readJsonMessage, waitForPublishedTransport, writeLine } from './libp2p_a2a.mjs'

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
  const reusableTransport = allowTrustedReuse && cachedSession
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
        reuseExistingConnection: Boolean(liveConnection)
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
      const request = await readJsonMessage(stream)
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
        const remoteTransport = buildInboundRemoteTransport({
          connection,
          remotePeerId,
          binding
        })
        sessionStore?.rememberTrustedSession?.({
          peerSessionId,
          remoteAgentId,
          remotePeerId,
          remoteTransport,
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

      const cachedHandledResponse = sessionStore?.handledRequestResponse?.(peerSessionId, request?.id)
      if (cachedHandledResponse) {
        await writeLine(stream, JSON.stringify(cachedHandledResponse))
        return
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
      sessionStore?.rememberHandledRequest?.({
        peerSessionId,
        requestId: request?.id,
        response: {
          jsonrpc: '2.0',
          id: request.id,
          result: finalResult
        }
      })
    } catch (error) {
      const errorResponse = {
        jsonrpc: '2.0',
        id: request?.id ?? randomRequestId('error'),
        error: { code: Number.parseInt(`${error.code ?? 500}`, 10) || 500, message: error.message }
      }
      if (peerSessionId && request?.id) {
        sessionStore?.rememberHandledRequest?.({
          peerSessionId,
          requestId: request.id,
          response: errorResponse
        })
      }
      await writeLine(stream, JSON.stringify(errorResponse))
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
  let stream = null
  let dispatchStage = 'pre-dispatch'
  try {
    stream = reuseExistingConnection
      ? await openStreamOnExistingConnection(node, transport)
      : await dialProtocol(node, transport, { requireDirect: false })
    await writeLine(stream, JSON.stringify(request))
    dispatchStage = 'post-dispatch'
    const response = await readJsonMessage(stream)
    if (response.error) {
      throw buildJsonRpcError(response.error)
    }
    return response
  } catch (error) {
    error.a2DispatchStage = error.a2DispatchStage || dispatchStage
    if (dispatchStage === 'post-dispatch' && !error.a2DeliveryStatusKnown) {
      error.a2DeliveryStatusKnown = false
      if (!/delivery status is unknown/i.test(`${error.message ?? ''}`)) {
        error.message = `delivery status is unknown after the request was dispatched: ${error.message ?? 'response could not be confirmed'}`
      }
    }
    throw error
  } finally {
    await stream?.close?.()
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
  const lower = message.toLowerCase()
  const code = Number.parseInt(`${error?.code ?? 0}`, 10) || 0
  if (code === 401 || message.includes('relayConnectTicket or a trusted peerSessionId is required')) {
    return true
  }
  if (`${error?.a2DispatchStage ?? ''}` !== 'pre-dispatch') {
    return false
  }
  return [
    'target transport is missing dialaddrs',
    'target transport is missing peerid',
    'target transport is missing streamprotocol',
    'no connection was available',
    'no existing peer connection is available',
    'direct p2p upgrade did not complete',
    'connection refused',
    'connection reset',
    'stream reset',
    'the operation was aborted',
    'already aborted',
    'dial timeout',
    'timed out'
  ].some((pattern) => lower.includes(pattern))
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

function buildInboundRemoteTransport({
  connection,
  remotePeerId,
  binding
} = {}) {
  const remoteAddr = cleanAddr(connection?.remoteAddr?.toString?.())
  const dialAddrs = unique(remoteAddr ? [remoteAddr] : [])
  return {
    peerId: `${remotePeerId ?? ''}`.trim(),
    streamProtocol: `${binding?.streamProtocol ?? ''}`.trim(),
    dialAddrs,
    listenAddrs: dialAddrs
  }
}

function cleanAddr(value) {
  return `${value ?? ''}`.trim()
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
