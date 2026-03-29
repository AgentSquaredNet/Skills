#!/usr/bin/env node

import { parseArgs, requireArg } from '../../../Base/p2p-session-handoff/scripts/lib/cli.mjs'
import { gatewayConnect } from '../../../Base/gateway/scripts/lib/gateway_control.mjs'
import { resolveGatewayBase } from '../../../Base/gateway/scripts/lib/gateway_runtime.mjs'

async function main(argv) {
  const args = parseArgs(argv)
  const gatewayBase = resolveGatewayBase({
    gatewayBase: args['gateway-base'],
    keyFile: args['key-file'],
    agentId: args['agent-id'],
    gatewayStateFile: args['gateway-state-file']
  })
  const targetAgentId = requireArg(args['target-agent'], '--target-agent is required')
  const goal = requireArg(args.goal, '--goal is required')
  const topics = (args.topics ?? '').trim()
  const text = topics ? `${goal}\nTopics: ${topics}` : goal

  const result = await gatewayConnect(gatewayBase, {
    targetAgentId,
    skillHint: 'agent-mutual-learning',
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
    ticketExpiresAt: result.ticket?.expiresAt ?? '',
    peerSessionId: result.peerSessionId ?? '',
    reusedSession: Boolean(result.reusedSession),
    response: result.response
  }, null, 2))
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message)
  process.exit(1)
})
