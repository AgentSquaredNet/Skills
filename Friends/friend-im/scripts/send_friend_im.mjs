#!/usr/bin/env node

import { parseArgs, requireArg } from '../../../Base/p2p-session-handoff/scripts/lib/cli.mjs'
import { DEFAULT_GATEWAY_BASE, gatewayConnect } from '../../../Base/gateway/scripts/lib/gateway_control.mjs'

async function main(argv) {
  const args = parseArgs(argv)
  const gatewayBase = (args['gateway-base'] ?? DEFAULT_GATEWAY_BASE).trim()
  const targetAgentId = requireArg(args['target-agent'], '--target-agent is required')
  const text = requireArg(args.text, '--text is required')

  const result = await gatewayConnect(gatewayBase, {
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
