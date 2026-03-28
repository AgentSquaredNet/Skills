#!/usr/bin/env node

import assert from 'node:assert/strict'
import crypto from 'node:crypto'

import { mcpSignTarget, onlineSignTarget, transportRefreshHeaders } from './lib/relay_http.mjs'
import { createNode, advertisedAddrs, dialProtocol, readSingleLine, requireListeningTransport, writeLine } from './lib/libp2p_a2a.mjs'
import { buildJsonRpcEnvelope } from './lib/peer_session.mjs'
import { signText } from './lib/runtime_key.mjs'

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
  const responder = await createNode(['/ip4/127.0.0.1/tcp/0'])
  const initiator = await createNode(['/ip4/127.0.0.1/tcp/0'])

  try {
    const transport = requireListeningTransport(responder, {
      binding: 'libp2p-a2a-jsonrpc',
      streamProtocol: protocol,
      a2aProtocolVersion: 'a2a-jsonrpc-custom-binding/2026-03'
    }, ['/dns4/relay.agentsquared.net/tcp/4051/p2p/12D3KooWRelay'])
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
      listenAddrs: advertisedAddrs(responder)
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
  }

  console.log('p2p-session-handoff self-test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
