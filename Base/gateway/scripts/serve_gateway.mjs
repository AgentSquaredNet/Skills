#!/usr/bin/env node

import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseArgs, parseList, requireArg } from '../../p2p-session-handoff/scripts/lib/cli.mjs'
import { getBindingDocument } from '../../p2p-session-handoff/scripts/lib/relay_http.mjs'
import { loadRuntimeKeyBundle } from '../../p2p-session-handoff/scripts/lib/runtime_key.mjs'
import { buildRelayListenAddrs, createNode, directListenAddrs, relayReservationAddrs } from '../../p2p-session-handoff/scripts/lib/libp2p_a2a.mjs'
import { attachInboundRouter, buildRouter, currentTransport, openDirectPeerSession, publishGatewayPresence } from '../../p2p-session-handoff/scripts/lib/peer_session.mjs'

const DEFAULT_GATEWAY_HOST = '127.0.0.1'
const DEFAULT_GATEWAY_PORT = 46357

function jsonResponse(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk))
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  return raw ? JSON.parse(raw) : {}
}

function buildFriendIMReply(agentId, ticketView, request, replyText) {
  const incoming = request?.params?.message?.parts?.[0]?.text ?? ''
  const text = replyText || `${agentId} received your friend-im message from ${ticketView.initiatorAgentId}: ${incoming}`
  return {
    message: {
      kind: 'message',
      role: 'agent',
      parts: [{ kind: 'text', text }]
    }
  }
}

function buildMutualLearningReply(agentId, ticketView, request, summaryText) {
  const incoming = request?.params?.message?.parts?.[0]?.text ?? ''
  const text = summaryText || `${agentId} reviewed the mutual-learning goal from ${ticketView.initiatorAgentId}: ${incoming}`
  return {
    message: {
      kind: 'message',
      role: 'agent',
      parts: [{ kind: 'text', text }]
    }
  }
}

function defaultPeerKeyFile(keyFile, agentId) {
  const safeAgentId = agentId.replace(/[^a-zA-Z0-9_.-]+/g, '_')
  return path.join(path.dirname(path.resolve(keyFile)), `${safeAgentId}_gateway-peer.key`)
}

async function main(argv) {
  const args = parseArgs(argv)
  const apiBase = (args['api-base'] ?? 'https://api.agentsquared.net').trim()
  const agentId = requireArg(args['agent-id'], '--agent-id is required')
  const keyFile = requireArg(args['key-file'], '--key-file is required')
  const gatewayHost = (args['gateway-host'] ?? DEFAULT_GATEWAY_HOST).trim()
  const gatewayPort = Number.parseInt(args['gateway-port'] ?? `${DEFAULT_GATEWAY_PORT}`, 10)
  const peerKeyFile = (args['peer-key-file'] ?? defaultPeerKeyFile(keyFile, agentId)).trim()
  const listenAddrs = parseList(args['listen-addrs'], ['/ip4/0.0.0.0/tcp/0'])
  const bundle = loadRuntimeKeyBundle(keyFile)
  const friendIMReplyText = (args['friend-im-reply-text'] ?? '').trim()
  const mutualLearningSummaryText = (args['mutual-learning-summary-text'] ?? '').trim()

  const binding = await getBindingDocument(apiBase)
  const relayListenAddrs = buildRelayListenAddrs(binding.relayMultiaddrs ?? [])
  const node = await createNode({
    listenAddrs,
    relayListenAddrs,
    peerKeyFile
  })

  await attachInboundRouter({
    apiBase,
    agentId,
    bundle,
    node,
    binding,
    handler: buildRouter({
      'friend-im': async ({ request, ticketView }) => buildFriendIMReply(agentId, ticketView, request, friendIMReplyText),
      'agent-mutual-learning': async ({ request, ticketView }) => buildMutualLearningReply(agentId, ticketView, request, mutualLearningSummaryText)
    })
  })

  const requireRelayReservation = relayListenAddrs.length > 0
  const online = await publishGatewayPresence(
    apiBase,
    agentId,
    bundle,
    node,
    binding,
    'Gateway listener ready for trusted direct sessions.',
    { requireRelayReservation }
  )

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/health') {
        const transport = await currentTransport(node, binding, { requireRelayReservation })
        jsonResponse(res, 200, {
          agentId,
          gatewayBase: `http://${gatewayHost}:${gatewayPort}`,
          peerId: transport.peerId,
          listenAddrs: transport.listenAddrs,
          relayAddrs: transport.relayAddrs,
          directListenAddrs: directListenAddrs(node),
          relayReservationAddrs: relayReservationAddrs(node),
          streamProtocol: transport.streamProtocol,
          supportedBindings: transport.supportedBindings,
          routes: ['friend-im', 'agent-mutual-learning'],
          online
        })
        return
      }

      if (req.method === 'POST' && req.url === '/connect') {
        const body = await readJson(req)
        const result = await openDirectPeerSession({
          apiBase,
          agentId,
          bundle,
          node,
          binding,
          targetAgentId: requireArg(body.targetAgentId, 'targetAgentId is required'),
          skillName: requireArg(body.skillName, 'skillName is required'),
          method: requireArg(body.method, 'method is required'),
          message: body.message,
          activitySummary: (body.activitySummary ?? '').trim() || `Preparing ${body.skillName} direct peer session.`,
          report: body.report ?? null
        })
        jsonResponse(res, 200, result)
        return
      }

      jsonResponse(res, 404, { error: { message: 'Not found' } })
    } catch (error) {
      jsonResponse(res, 500, { error: { message: error.message } })
    }
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(gatewayPort, gatewayHost, resolve)
  })

  console.log(JSON.stringify({
    agentId,
    gatewayBase: `http://${gatewayHost}:${gatewayPort}`,
    peerId: node.peerId.toString(),
    listenAddrs: directListenAddrs(node),
    relayAddrs: relayReservationAddrs(node),
    streamProtocol: binding.streamProtocol,
    routes: ['friend-im', 'agent-mutual-learning'],
    peerKeyFile
  }, null, 2))

  const stop = async () => {
    await new Promise((resolve) => server.close(resolve))
    await node.stop()
    process.exit(0)
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message)
  process.exit(1)
})
