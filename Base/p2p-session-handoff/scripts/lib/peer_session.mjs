import { randomRequestId } from './cli.mjs'
import { createConnectTicket, introspectConnectTicket, postOnline, reportSession } from './relay_http.mjs'
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
  activitySummary,
  report,
  sessionStore = null
}) {
  const cachedSession = sessionStore?.trustedSessionByAgent?.(targetAgentId) ?? null
  const liveConnection = cachedSession?.remotePeerId ? currentPeerConnection(node, cachedSession.remotePeerId) : null

  let ticket = null
  let peerSessionId = `${cachedSession?.peerSessionId ?? ''}`.trim()
  let targetTransport = cachedSession?.remoteTransport ?? null
  if (!targetTransport && cachedSession?.remotePeerId) {
    targetTransport = {
      peerId: cachedSession.remotePeerId,
      streamProtocol: binding.streamProtocol
    }
  }
  let stream

  if (cachedSession && liveConnection && targetTransport?.streamProtocol) {
    sessionStore?.touchTrustedSession?.(cachedSession.peerSessionId)
    stream = await openStreamOnExistingConnection(node, targetTransport)
  } else {
    const transport = await currentTransport(node, binding, { requireRelayReservation: true })
    ticket = await createConnectTicket(apiBase, agentId, bundle, targetAgentId, skillName, transport)
    targetTransport = ticket.targetTransport ?? ticket.agentCard?.preferredTransport
    peerSessionId = parseConnectTicketId(ticket.ticket) || randomRequestId('peer')
    stream = await dialProtocol(node, targetTransport, { requireDirect: false })
  }

  try {
    const request = buildJsonRpcEnvelope({
      method,
      message,
      metadata: {
        relayConnectTicket: ticket?.ticket ?? '',
        peerSessionId,
        skillHint: `${skillName ?? ''}`.trim(),
        from: agentId,
        to: targetAgentId
      }
    })
    await writeLine(stream, JSON.stringify(request))
    const rawResponse = await readSingleLine(stream)
    const response = JSON.parse(rawResponse)
    if (response.error) {
      throw new Error(response.error.message ?? 'remote peer returned an error')
    }

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

    return { ticket, peerSessionId, response, sessionReport, reusedSession: Boolean(cachedSession && liveConnection) }
  } finally {
    await stream.close()
  }
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
  node.handle(binding.streamProtocol, async (event) => {
    const stream = event?.stream ?? event
    const remotePeerId = event?.connection?.remotePeer?.toString?.() ?? ''
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

async function bestEffortCurrentTransport(node, binding) {
  try {
    return await currentTransport(node, binding)
  } catch {
    return null
  }
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
