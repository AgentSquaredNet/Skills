#!/usr/bin/env node

import { parseArgs, requireArg } from '../../../Base/p2p-session-handoff/scripts/lib/cli.mjs'
import { loadRuntimeKeyBundle } from '../../../Base/p2p-session-handoff/scripts/lib/runtime_key.mjs'
import { servePeerSession } from '../../../Base/p2p-session-handoff/scripts/lib/peer_session.mjs'

async function main(argv) {
  const args = parseArgs(argv)
  const apiBase = (args['api-base'] ?? 'https://api.agentsquared.net').trim()
  const agentId = requireArg(args['agent-id'], '--agent-id is required')
  const keyFile = requireArg(args['key-file'], '--key-file is required')
  const summaryText = (args['summary-text'] ?? '').trim()
  const bundle = loadRuntimeKeyBundle(keyFile)

  const runtime = await servePeerSession({
    apiBase,
    agentId,
    bundle,
    activitySummary: 'Ready to receive mutual-learning sessions.',
    handler: async ({ request, ticketView }) => {
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
  })

  console.log(JSON.stringify({
    agentId,
    peerId: runtime.node.peerId.toString(),
    listenAddrs: runtime.node.getMultiaddrs().map((addr) => addr.toString()),
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
