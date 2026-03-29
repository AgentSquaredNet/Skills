import { randomRequestId } from './cli.mjs'
import { createConnectTicket, introspectConnectTicket, postOnline, reportSession } from './relay_http.mjs'
import { dialProtocol, readSingleLine, waitForPublishedTransport, writeLine } from './libp2p_a2a.mjs'

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
  report
}) {
  // Require direct P2P upgrade before any private payload is treated as delivered.
  const transport = await currentTransport(node, binding, { requireRelayReservation: true })
  const ticket = await createConnectTicket(apiBase, agentId, bundle, targetAgentId, skillName, transport)
  const targetTransport = ticket.targetTransport ?? ticket.agentCard?.preferredTransport
  const stream = await dialProtocol(node, targetTransport, { requireDirect: true })

  try {
    const request = buildJsonRpcEnvelope({
      method,
      message,
      metadata: {
        relayConnectTicket: ticket.ticket,
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

    let sessionReport = null
    if (report) {
      sessionReport = await reportSession(apiBase, agentId, bundle, {
        ticket: ticket.ticket,
        taskId: report.taskId,
        status: report.status ?? 'completed',
        summary: report.summary,
        publicSummary: report.publicSummary ?? ''
      }, await currentTransport(node, binding, { requireRelayReservation: true }))
    }

    return { ticket, response, sessionReport }
  } finally {
    await stream.close()
  }
}

export function buildRouter(routes = {}) {
  return async ({ request, ticketView, agentId }) => {
    const route = routes[(ticketView?.skillName ?? '').trim()]
    if (!route) {
      throw new Error(`unsupported inbound skill route: ${ticketView?.skillName ?? ''}`)
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
  handler
}) {
  node.handle(binding.streamProtocol, async (event) => {
    const stream = event?.stream ?? event
    try {
      const rawLine = await readSingleLine(stream)
      const request = JSON.parse(rawLine)
      const relayConnectTicket = request?.params?.metadata?.relayConnectTicket?.trim()
      if (!relayConnectTicket) {
        await writeLine(stream, JSON.stringify({
          jsonrpc: '2.0',
          id: request?.id ?? randomRequestId('invalid'),
          error: { code: 401, message: 'relayConnectTicket is required' }
        }))
        return
      }

      const ticketView = await introspectConnectTicket(
        apiBase,
        agentId,
        bundle,
        relayConnectTicket,
        await currentTransport(node, binding, { requireRelayReservation: true })
      )
      const result = await handler({ request, ticketView, agentId })
      await writeLine(stream, JSON.stringify({
        jsonrpc: '2.0',
        id: request.id,
        result
      }))
    } catch (error) {
      await writeLine(stream, JSON.stringify({
        jsonrpc: '2.0',
        id: randomRequestId('error'),
        error: { code: 500, message: error.message }
      }))
    } finally {
      await stream.close()
    }
  })
}
