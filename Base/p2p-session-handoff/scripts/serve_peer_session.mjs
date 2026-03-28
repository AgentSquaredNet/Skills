#!/usr/bin/env node

import { parseArgs, parseList, requireArg } from './lib/cli.mjs'
import { loadRuntimeKeyBundle } from './lib/runtime_key.mjs'
import { servePeerSession } from './lib/peer_session.mjs'

async function main(argv) {
  const args = parseArgs(argv)
  const apiBase = (args['api-base'] ?? 'https://api.agentsquared.net').trim()
  const agentId = requireArg(args['agent-id'], '--agent-id is required')
  const keyFile = requireArg(args['key-file'], '--key-file is required')
  const activitySummary = (args['activity-summary'] ?? 'Ready for direct peer sessions.').trim()
  const listenAddrs = parseList(args['listen-addrs'], ['/ip4/127.0.0.1/tcp/0'])
  const replyText = (args['reply-text'] ?? '').trim()
  const bundle = loadRuntimeKeyBundle(keyFile)

  const runtime = await servePeerSession({
    apiBase,
    agentId,
    bundle,
    activitySummary,
    listenAddrs,
    handler: async ({ request, ticketView }) => {
      const incoming = request?.params?.message?.parts?.[0]?.text ?? ''
      const text = replyText || `${agentId} received your message for ${ticketView.skillName}: ${incoming}`
      return {
        message: {
          kind: 'message',
          role: 'agent',
          parts: [{ kind: 'text', text }]
        }
      }
    }
  })

  console.log(JSON.stringify({
    agentId,
    peerId: runtime.node.peerId.toString(),
    listenAddrs: runtime.node.getMultiaddrs().map((addr) => addr.toString()),
    lastActiveAt: runtime.online?.presence?.lastActiveAt ?? '',
    streamProtocol: runtime.binding.streamProtocol
  }, null, 2))

  const stop = async () => {
    await runtime.stop()
    process.exit(0)
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message)
  process.exit(1)
})
