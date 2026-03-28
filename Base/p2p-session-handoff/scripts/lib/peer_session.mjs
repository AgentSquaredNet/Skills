import { randomRequestId } from './cli.mjs'
import { getBindingDocument, postOnline, createConnectTicket, introspectConnectTicket, reportSession } from './relay_http.mjs'
import { createNode, advertisedAddrs, dialProtocol, readSingleLine, writeLine } from './libp2p_a2a.mjs'

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

export async function bringNodeOnline(apiBase, agentId, bundle, node, binding, activitySummary, availabilityStatus = 'available') {
  return postOnline(apiBase, agentId, bundle, {
    availabilityStatus,
    activitySummary,
    peerId: node.peerId.toString(),
    listenAddrs: advertisedAddrs(node),
    relayAddrs: binding.relayMultiaddrs ?? [],
    supportedBindings: binding.binding ? [binding.binding] : [],
    a2aProtocolVersion: binding.a2aProtocolVersion ?? '',
    streamProtocol: binding.streamProtocol ?? ''
  })
}

export function currentTransport(node, binding) {
  return {
    peerId: node.peerId.toString(),
    listenAddrs: advertisedAddrs(node),
    relayAddrs: binding.relayMultiaddrs ?? [],
    supportedBindings: binding.binding ? [binding.binding] : [],
    a2aProtocolVersion: binding.a2aProtocolVersion ?? '',
    streamProtocol: binding.streamProtocol ?? ''
  }
}

export async function initiatePeerSession({
  apiBase,
  agentId,
  bundle,
  targetAgentId,
  skillName,
  method,
  message,
  activitySummary,
  report,
  listenAddrs = ['/ip4/127.0.0.1/tcp/0']
}) {
  const binding = await getBindingDocument(apiBase)
  const node = await createNode(listenAddrs)
  try {
    const online = await bringNodeOnline(apiBase, agentId, bundle, node, binding, activitySummary)
    const localTransport = currentTransport(node, binding)
    const ticket = await createConnectTicket(apiBase, agentId, bundle, targetAgentId, skillName, localTransport)
    const targetTransport = ticket.targetTransport ?? ticket.agentCard?.preferredTransport
    const stream = await dialProtocol(node, targetTransport)
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
    await stream.close()
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
      }, currentTransport(node, binding))
    }
    return { binding, online, ticket, response, sessionReport }
  } finally {
    await node.stop()
  }
}

export async function servePeerSession({
  apiBase,
  agentId,
  bundle,
  activitySummary,
  handler,
  listenAddrs = ['/ip4/127.0.0.1/tcp/0']
}) {
  const binding = await getBindingDocument(apiBase)
  const node = await createNode(listenAddrs)
  const online = await bringNodeOnline(apiBase, agentId, bundle, node, binding, activitySummary)

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
        currentTransport(node, binding)
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

  return {
    binding,
    online,
    node,
    stop: async () => {
      await node.stop()
    }
  }
}
