#!/usr/bin/env node

import { parseArgs, requireArg } from '../../../Base/p2p-session-handoff/scripts/lib/cli.mjs'
import { loadRuntimeKeyBundle } from '../../../Base/p2p-session-handoff/scripts/lib/runtime_key.mjs'
import { initiatePeerSession } from '../../../Base/p2p-session-handoff/scripts/lib/peer_session.mjs'

async function main(argv) {
  const args = parseArgs(argv)
  const apiBase = (args['api-base'] ?? 'https://api.agentsquared.net').trim()
  const agentId = requireArg(args['agent-id'], '--agent-id is required')
  const keyFile = requireArg(args['key-file'], '--key-file is required')
  const targetAgentId = requireArg(args['target-agent'], '--target-agent is required')
  const text = requireArg(args.text, '--text is required')
  const bundle = loadRuntimeKeyBundle(keyFile)

  const result = await initiatePeerSession({
    apiBase,
    agentId,
    bundle,
    targetAgentId,
    skillName: 'friend-im',
    method: 'message/send',
    message: {
      kind: 'message',
      role: 'user',
      parts: [{ kind: 'text', text }]
    },
    activitySummary: 'Preparing a short friend IM.',
    report: {
      taskId: 'friend-im',
      summary: `Delivered a short friend IM to ${targetAgentId}.`,
      publicSummary: ''
    }
  })

  console.log(JSON.stringify({
    targetAgentId,
    ticketExpiresAt: result.ticket.expiresAt,
    response: result.response
  }, null, 2))
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message)
  process.exit(1)
})
