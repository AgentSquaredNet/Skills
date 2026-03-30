#!/usr/bin/env node

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { mcpSignTarget, onlineSignTarget, transportRefreshHeaders } from './lib/relay_http.mjs'
import { createNode, dialProtocol, readSingleLine, requireListeningTransport, writeLine } from './lib/libp2p_a2a.mjs'
import { buildJsonRpcEnvelope } from './lib/peer_session.mjs'
import { signText } from './lib/runtime_key.mjs'
import { createGatewayRuntimeState } from '../../gateway/scripts/lib/gateway_sessions.mjs'
import { chooseInboundSkill, createMailboxScheduler } from '../../gateway/scripts/lib/agent_router.mjs'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  const { privateKey } = crypto.generateKeyPairSync('ed25519')
  const bundle = {
    keyType: 2,
    publicKey: 'test',
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' })
  }

  const signedAt = '2026-03-28T12:00:00Z'
  const onlineTarget = onlineSignTarget('bot1@Skiyo', signedAt)
  const mcpTarget = mcpSignTarget('POST', '/api/relay/connect-tickets', 'bot1@Skiyo', signedAt)
  assert.match(onlineTarget, /^agentsquared:relay-online:/)
  assert.match(mcpTarget, /^agentsquared:relay-mcp:POST:/)
  assert.ok(signText(bundle, onlineTarget).length > 20)

  const protocol = '/agentsquared/test/1.0'
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsquared-gateway-test-'))
  const responder = await createNode({
    listenAddrs: ['/ip4/127.0.0.1/tcp/0'],
    peerKeyFile: path.join(tempDir, 'responder.peer')
  })
  const initiator = await createNode({
    listenAddrs: ['/ip4/127.0.0.1/tcp/0'],
    peerKeyFile: path.join(tempDir, 'initiator.peer')
  })

  try {
    const gatewayState = createGatewayRuntimeState({ inboundTimeoutMs: 1000, peerSessionTTLms: 1000 })
    gatewayState.rememberTrustedSession({
      peerSessionId: 'peer_demo',
      remoteAgentId: 'bot1@Skiyo',
      remotePeerId: '12D3KooWDemoPeer'
    })
    assert.equal(gatewayState.trustedSessionByAgent('bot1@Skiyo').peerSessionId, 'peer_demo')
    const inboundPromise = gatewayState.nextInbound({ waitMs: 100 })
    const queued = await gatewayState.enqueueInbound({
      request: { jsonrpc: '2.0', id: 'q1', method: 'message/send', params: { metadata: {} } },
      remotePeerId: '12D3KooWDemoPeer',
      remoteAgentId: 'bot1@Skiyo',
      peerSessionId: 'peer_demo',
      suggestedSkill: 'friend-im'
    })
    const inbound = await inboundPromise
    assert.equal(inbound.inboundId, queued.inboundId)
    gatewayState.respondInbound({
      inboundId: queued.inboundId,
      result: { message: { kind: 'message', role: 'agent', parts: [{ kind: 'text', text: 'queued' }] } }
    })
    const queuedResult = await queued.responsePromise
    assert.equal(queuedResult.message.parts[0].text, 'queued')

    assert.equal(chooseInboundSkill({
      suggestedSkill: '',
      defaultSkill: 'friend-im',
      request: {
        method: 'message/send',
        params: {
          message: {
            parts: [{ kind: 'text', text: 'Compare our strongest workflows and skills worth learning.' }]
          }
        }
      }
    }), 'agent-mutual-learning')
    assert.equal(chooseInboundSkill({
      suggestedSkill: '',
      defaultSkill: 'friend-im',
      request: {
        method: 'message/send',
        params: {
          message: {
            parts: [{ kind: 'text', text: 'Hello there' }]
          }
        }
      }
    }), 'friend-im')

    const schedulerEvents = []
    const scheduler = createMailboxScheduler({
      maxActiveMailboxes: 2,
      async handleItem(item, { mailboxKey }) {
        schedulerEvents.push(`start:${mailboxKey}:${item.inboundId}`)
        await sleep(item.delayMs)
        schedulerEvents.push(`finish:${mailboxKey}:${item.inboundId}`)
      }
    })
    const b1 = scheduler.enqueue({ inboundId: 'b1', remoteAgentId: 'B@Test', delayMs: 50 })
    const b2 = scheduler.enqueue({ inboundId: 'b2', remoteAgentId: 'B@Test', delayMs: 10 })
    const c1 = scheduler.enqueue({ inboundId: 'c1', remoteAgentId: 'C@Test', delayMs: 10 })
    await Promise.all([b1, b2, c1])
    await scheduler.whenIdle()
    const startB1 = schedulerEvents.indexOf('start:agent:b@test:b1')
    const finishB1 = schedulerEvents.indexOf('finish:agent:b@test:b1')
    const startB2 = schedulerEvents.indexOf('start:agent:b@test:b2')
    const startC1 = schedulerEvents.indexOf('start:agent:c@test:c1')
    assert.ok(startB1 >= 0)
    assert.ok(finishB1 > startB1)
    assert.ok(startB2 > finishB1)
    assert.ok(startC1 > startB1)
    assert.ok(startC1 < finishB1)

    const transport = requireListeningTransport(responder, {
      binding: 'libp2p-a2a-jsonrpc',
      streamProtocol: protocol,
      a2aProtocolVersion: 'a2a-jsonrpc-custom-binding/2026-03'
    })
    const refreshHeaders = transportRefreshHeaders(transport)
    assert.equal(refreshHeaders['X-AgentSquared-Peer-Id'], transport.peerId)
    assert.ok(refreshHeaders['X-AgentSquared-Listen-Addrs'].length > 0)

    responder.handle(protocol, async (event) => {
      const stream = event?.stream ?? event
      const raw = await readSingleLine(stream)
      const request = JSON.parse(raw)
      assert.equal(request.params.metadata.relayConnectTicket, 'ticket-demo')
      await writeLine(stream, JSON.stringify({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          message: {
            kind: 'message',
            role: 'agent',
            parts: [{ kind: 'text', text: 'pong' }]
          }
        }
      }))
      await stream.close()
    })

    const stream = await dialProtocol(initiator, {
      streamProtocol: protocol,
      peerId: responder.peerId.toString(),
      listenAddrs: responder.getMultiaddrs().map((addr) => addr.toString())
    })
    const request = buildJsonRpcEnvelope({
      id: 'req_test',
      method: 'message/send',
      message: {
        kind: 'message',
        role: 'user',
        parts: [{ kind: 'text', text: 'ping' }]
      },
      metadata: {
        relayConnectTicket: 'ticket-demo',
        from: 'assistant@Skiyo',
        to: 'bot1@Skiyo'
      }
    })
    await writeLine(stream, JSON.stringify(request))
    const raw = await readSingleLine(stream)
    const response = JSON.parse(raw)
    assert.equal(response.result.message.parts[0].text, 'pong')
    await stream.close()
  } finally {
    await initiator.stop()
    await responder.stop()
    fs.rmSync(tempDir, { recursive: true, force: true })
  }

  console.log('p2p-session-handoff self-test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
