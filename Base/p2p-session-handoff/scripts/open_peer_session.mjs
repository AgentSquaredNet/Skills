#!/usr/bin/env node

import { parseArgs, requireArg } from './lib/cli.mjs'
import { gatewayConnect } from '../../gateway/scripts/lib/gateway_control.mjs'
import { resolveGatewayBase } from '../../gateway/scripts/lib/gateway_runtime.mjs'

async function main(argv) {
  const args = parseArgs(argv)
  const gatewayBase = resolveGatewayBase({
    gatewayBase: args['gateway-base'],
    keyFile: args['key-file'],
    agentId: args['agent-id'],
    gatewayStateFile: args['gateway-state-file']
  })
  const targetAgentId = requireArg(args['target-agent'], '--target-agent is required')
  const skillName = requireArg(args['skill-name'], '--skill-name is required')
  const method = (args.method ?? 'message/send').trim()
  const text = (args.text ?? '').trim()
  const activitySummary = (args['activity-summary'] ?? `Preparing ${skillName} direct peer session.`).trim()
  const report = args['report-summary']
    ? {
        taskId: (args['task-id'] ?? `${skillName}-session`).trim(),
        summary: args['report-summary'],
        publicSummary: (args['public-summary'] ?? '').trim()
      }
    : null

  const message = text
    ? {
        kind: 'message',
        role: 'user',
        parts: [{ kind: 'text', text }]
      }
    : JSON.parse(requireArg(args.message, '--text or --message is required'))

  const result = await gatewayConnect(gatewayBase, {
    targetAgentId,
    skillName,
    method,
    message,
    activitySummary,
    report
  })
  console.log(JSON.stringify(result, null, 2))
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message)
  process.exit(1)
})
