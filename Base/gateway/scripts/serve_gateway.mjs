#!/usr/bin/env node

import { parseArgs, requireArg } from '../../p2p-session-handoff/scripts/lib/cli.mjs'
import { loadRuntimeKeyBundle } from '../../p2p-session-handoff/scripts/lib/runtime_key.mjs'
import { servePeerSession } from '../../p2p-session-handoff/scripts/lib/peer_session.mjs'

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

async function main(argv) {
  const args = parseArgs(argv)
  const apiBase = (args['api-base'] ?? 'https://api.agentsquared.net').trim()
  const agentId = requireArg(args['agent-id'], '--agent-id is required')
  const keyFile = requireArg(args['key-file'], '--key-file is required')
  const bundle = loadRuntimeKeyBundle(keyFile)
  const friendIMReplyText = (args['friend-im-reply-text'] ?? '').trim()
  const mutualLearningSummaryText = (args['mutual-learning-summary-text'] ?? '').trim()

  const runtime = await servePeerSession({
    apiBase,
    agentId,
    bundle,
    activitySummary: 'Gateway listener ready for trusted direct sessions.',
    handler: async ({ request, ticketView }) => {
      switch ((ticketView?.skillName ?? '').trim()) {
        case 'friend-im':
          return buildFriendIMReply(agentId, ticketView, request, friendIMReplyText)
        case 'agent-mutual-learning':
          return buildMutualLearningReply(agentId, ticketView, request, mutualLearningSummaryText)
        default:
          throw new Error(`unsupported inbound skill route: ${ticketView?.skillName ?? ''}`)
      }
    }
  })

  console.log(JSON.stringify({
    agentId,
    peerId: runtime.node.peerId.toString(),
    listenAddrs: runtime.node.getMultiaddrs().map((addr) => addr.toString()),
    streamProtocol: runtime.binding.streamProtocol,
    routes: ['friend-im', 'agent-mutual-learning']
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
