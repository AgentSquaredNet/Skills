#!/usr/bin/env node

import http from 'node:http'
import path from 'node:path'
import { URL } from 'node:url'

import { parseArgs, parseList, requireArg } from '../../p2p-session-handoff/scripts/lib/cli.mjs'
import { getBindingDocument } from '../../p2p-session-handoff/scripts/lib/relay_http.mjs'
import { loadRuntimeKeyBundle } from '../../p2p-session-handoff/scripts/lib/runtime_key.mjs'
import { buildRelayListenAddrs, createNode, directListenAddrs, relayReservationAddrs } from '../../p2p-session-handoff/scripts/lib/libp2p_a2a.mjs'
import { attachInboundRouter, currentTransport, openDirectPeerSession, publishGatewayPresence } from '../../p2p-session-handoff/scripts/lib/peer_session.mjs'
import { defaultGatewayStateFile, writeGatewayState } from './lib/gateway_runtime.mjs'
import { createGatewayRuntimeState } from './lib/gateway_sessions.mjs'

const DEFAULT_GATEWAY_HOST = '127.0.0.1'
const DEFAULT_GATEWAY_PORT = 0

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
  const gatewayStateFile = (args['gateway-state-file'] ?? defaultGatewayStateFile(keyFile, agentId)).trim()
  const listenAddrs = parseList(args['listen-addrs'], ['/ip4/0.0.0.0/tcp/0'])
  const bundle = loadRuntimeKeyBundle(keyFile)
  const runtimeState = createGatewayRuntimeState()

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
    sessionStore: runtimeState
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

  let gatewayBase = `http://${gatewayHost}:${gatewayPort}`
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', gatewayBase)
      if (req.method === 'GET' && url.pathname === '/health') {
        const transport = await currentTransport(node, binding, { requireRelayReservation })
        jsonResponse(res, 200, {
          agentId,
          gatewayBase,
          gatewayStateFile,
          peerId: transport.peerId,
          listenAddrs: transport.listenAddrs,
          relayAddrs: transport.relayAddrs,
          directListenAddrs: directListenAddrs(node),
          relayReservationAddrs: relayReservationAddrs(node),
          streamProtocol: transport.streamProtocol,
          supportedBindings: transport.supportedBindings,
          online,
          runtimeState: runtimeState.snapshot()
        })
        return
      }

      if (req.method === 'GET' && url.pathname === '/inbound/next') {
        const waitMs = Number.parseInt(url.searchParams.get('waitMs') ?? '30000', 10)
        const nextInbound = await runtimeState.nextInbound({ waitMs })
        jsonResponse(res, 200, { item: nextInbound })
        return
      }

      if (req.method === 'POST' && url.pathname === '/inbound/respond') {
        const body = await readJson(req)
        runtimeState.respondInbound({
          inboundId: requireArg(body.inboundId, 'inboundId is required'),
          result: body.result ?? {}
        })
        jsonResponse(res, 200, { ok: true })
        return
      }

      if (req.method === 'POST' && url.pathname === '/inbound/reject') {
        const body = await readJson(req)
        runtimeState.rejectInbound({
          inboundId: requireArg(body.inboundId, 'inboundId is required'),
          code: Number.parseInt(body.code ?? '500', 10) || 500,
          message: `${body.message ?? 'local runtime rejected the inbound request'}`
        })
        jsonResponse(res, 200, { ok: true })
        return
      }

      if (req.method === 'POST' && url.pathname === '/connect') {
        const body = await readJson(req)
        const result = await openDirectPeerSession({
          apiBase,
          agentId,
          bundle,
          node,
          binding,
          targetAgentId: requireArg(body.targetAgentId, 'targetAgentId is required'),
          skillName: (body.skillHint ?? body.skillName ?? '').trim(),
          method: requireArg(body.method, 'method is required'),
          message: body.message,
          activitySummary: (body.activitySummary ?? '').trim() || `Preparing direct peer session${(body.skillHint ?? body.skillName ?? '').trim() ? ` for ${(body.skillHint ?? body.skillName ?? '').trim()}` : ''}.`,
          report: body.report ?? null,
          sessionStore: runtimeState
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
  const controlAddress = server.address()
  const actualGatewayPort = typeof controlAddress === 'object' && controlAddress ? controlAddress.port : gatewayPort
  gatewayBase = `http://${gatewayHost}:${actualGatewayPort}`
  writeGatewayState(gatewayStateFile, {
    agentId,
    gatewayBase,
    gatewayHost,
    gatewayPort: actualGatewayPort,
    keyFile: path.resolve(keyFile),
    peerKeyFile: path.resolve(peerKeyFile),
    peerId: node.peerId.toString(),
    updatedAt: new Date().toISOString()
  })

  console.log(JSON.stringify({
    agentId,
    gatewayBase,
    gatewayStateFile,
    peerId: node.peerId.toString(),
    listenAddrs: directListenAddrs(node),
    relayAddrs: relayReservationAddrs(node),
    streamProtocol: binding.streamProtocol,
    peerKeyFile,
    runtimeState: runtimeState.snapshot()
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
