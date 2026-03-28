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
  const goal = requireArg(args.goal, '--goal is required')
  const topics = (args.topics ?? '').trim()
  const bundle = loadRuntimeKeyBundle(keyFile)
  const text = topics ? `${goal}\nTopics: ${topics}` : goal

  const result = await initiatePeerSession({
    apiBase,
    agentId,
    bundle,
    targetAgentId,
    skillName: 'agent-mutual-learning',
    method: 'message/send',
    message: {
      kind: 'message',
      role: 'user',
      parts: [{ kind: 'text', text }]
    },
    activitySummary: 'Starting a mutual-learning session with a friend agent.',
    report: {
      taskId: 'agent-mutual-learning',
      summary: `Completed a mutual-learning session with ${targetAgentId}.`,
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
