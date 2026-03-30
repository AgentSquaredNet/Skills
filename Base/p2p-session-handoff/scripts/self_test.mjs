#!/usr/bin/env node

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { mcpSignTarget, onlineSignTarget, transportRefreshHeaders } from './lib/relay_http.mjs'
import { createNode, dialProtocol, readSingleLine, requireListeningTransport, writeLine } from './lib/libp2p_a2a.mjs'
import { attachInboundRouter, buildJsonRpcEnvelope } from './lib/peer_session.mjs'
import { signText } from './lib/runtime_key.mjs'
import { createInboxStore } from '../../gateway/scripts/lib/gateway_inbox.mjs'
import { createGatewayRuntimeState } from '../../gateway/scripts/lib/gateway_sessions.mjs'
import { chooseInboundSkill, createAgentRouter, createMailboxScheduler } from '../../gateway/scripts/lib/agent_router.mjs'
import { createLocalRuntimeExecutor } from '../../gateway/scripts/lib/local_runtime.mjs'

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

    const responded = []
    const rejected = []
    const ownerReports = []
    const integratedRouter = createAgentRouter({
      maxActiveMailboxes: 2,
      routerSkills: ['friend-im', 'agent-mutual-learning'],
      defaultSkill: 'friend-im',
      async executeInbound({ item, selectedSkill, mailboxKey }) {
        return {
          peerResponse: {
            message: {
              kind: 'message',
              role: 'agent',
              parts: [{ kind: 'text', text: `handled:${selectedSkill}:${mailboxKey}` }]
            },
            metadata: {
              selectedSkill,
              mailboxKey
            }
          },
          ownerReport: {
            summary: `owner saw ${item.inboundId}`,
            selectedSkill
          }
        }
      },
      async notifyOwner(payload) {
        ownerReports.push(payload)
      },
      async onRespond(item, result) {
        responded.push({ item, result })
      },
      async onReject(item, payload) {
        rejected.push({ item, payload })
      }
    })
    await integratedRouter.enqueue({
      inboundId: 'router1',
      remoteAgentId: 'peer@Test',
      request: {
        method: 'message/send',
        params: {
          message: {
            parts: [{ kind: 'text', text: 'hello there' }]
          }
        }
      }
    })
    await integratedRouter.whenIdle()
    assert.equal(rejected.length, 0)
    assert.equal(responded.length, 1)
    assert.equal(responded[0].result.message.parts[0].text, 'handled:friend-im:agent:peer@test')
    assert.equal(responded[0].result.metadata.selectedSkill, 'friend-im')
    assert.equal(ownerReports.length, 1)
    assert.equal(ownerReports[0].ownerReport.summary, 'owner saw router1')

    const rejectExecutor = createLocalRuntimeExecutor({ agentId: 'bot1@Skiyo' })
    const rejectExecution = await rejectExecutor({
      item: { inboundId: 'router2' },
      selectedSkill: 'friend-im',
      mailboxKey: 'agent:peer@test'
    })
    assert.equal(rejectExecution.peerResponse.message.parts[0].text.includes('received your message'), true)

    const inboxStore = createInboxStore({
      inboxDir: path.join(tempDir, 'gateway-inbox')
    })
    const appended = inboxStore.appendEntry({
      agentId: 'bot1@Skiyo',
      selectedSkill: 'friend-im',
      mailboxKey: 'agent:peer@test',
      item: {
        inboundId: 'router3',
        remoteAgentId: 'peer@Test',
        peerSessionId: 'peer-router3',
        request: {
          params: {
            message: {
              parts: [{ kind: 'text', text: 'Hello inbox' }]
            }
          }
        }
      },
      ownerReport: {
        summary: 'peer@Test sent: Hello inbox'
      },
      peerResponse: {
        message: {
          kind: 'message',
          role: 'agent',
          parts: [{ kind: 'text', text: 'ack' }]
        }
      }
    })
    assert.equal(appended.index.unreadCount, 1)
    assert.equal(inboxStore.readIndex().unread[0].id, 'router3')
    const marked = inboxStore.markStatus('router3', 'reported')
    assert.equal(marked.index.unreadCount, 0)
    assert.equal(marked.index.reportedCount, 1)

    const routerProtocol = '/agentsquared/router-test/1.0'
    const responderState = createGatewayRuntimeState({ inboundTimeoutMs: 1000, peerSessionTTLms: 1000 })
    responderState.rememberTrustedSession({
      peerSessionId: 'peer_existing',
      remoteAgentId: 'assistant@Skiyo',
      remotePeerId: initiator.peerId.toString(),
      remoteTransport: {
        peerId: initiator.peerId.toString(),
        streamProtocol: routerProtocol
      }
    })
    await attachInboundRouter({
      apiBase: 'https://api.agentsquared.net',
      agentId: 'bot1@Skiyo',
      bundle,
      node: responder,
      binding: { streamProtocol: routerProtocol },
      sessionStore: responderState
    })
    const inboundHandled = (async () => {
      const inbound = await responderState.nextInbound({ waitMs: 1000 })
      assert.ok(inbound)
      assert.equal(inbound.remotePeerId, initiator.peerId.toString())
      assert.equal(inbound.remoteAgentId, 'assistant@Skiyo')
      assert.equal(inbound.peerSessionId, 'peer_existing')
      responderState.respondInbound({
        inboundId: inbound.inboundId,
        result: {
          message: {
            kind: 'message',
            role: 'agent',
            parts: [{ kind: 'text', text: 'trusted-ok' }]
          }
        }
      })
    })()
    const routerStream = await dialProtocol(initiator, {
      streamProtocol: routerProtocol,
      peerId: responder.peerId.toString(),
      listenAddrs: responder.getMultiaddrs().map((addr) => addr.toString())
    })
    await writeLine(routerStream, JSON.stringify(buildJsonRpcEnvelope({
      id: 'req_router',
      method: 'message/send',
      message: {
        kind: 'message',
        role: 'user',
        parts: [{ kind: 'text', text: 'ping trusted session' }]
      },
      metadata: {
        peerSessionId: 'peer_existing',
        from: 'assistant@Skiyo',
        to: 'bot1@Skiyo'
      }
    })))
    const rawTrusted = await readSingleLine(routerStream)
    const trustedResponse = JSON.parse(rawTrusted)
    assert.equal(trustedResponse.result.message.parts[0].text, 'trusted-ok')
    await routerStream.close()
    await inboundHandled

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
