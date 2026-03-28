#!/usr/bin/env node

import { parseArgs, parseList, requireArg } from './lib/cli.mjs'
import { loadRuntimeKeyBundle } from './lib/runtime_key.mjs'
import { initiatePeerSession } from './lib/peer_session.mjs'

async function main(argv) {
  const args = parseArgs(argv)
  const apiBase = (args['api-base'] ?? 'https://api.agentsquared.net').trim()
  const agentId = requireArg(args['agent-id'], '--agent-id is required')
  const keyFile = requireArg(args['key-file'], '--key-file is required')
  const targetAgentId = requireArg(args['target-agent'], '--target-agent is required')
  const skillName = requireArg(args['skill-name'], '--skill-name is required')
  const method = (args.method ?? 'message/send').trim()
  const text = (args.text ?? '').trim()
  const activitySummary = (args['activity-summary'] ?? `Preparing ${skillName} direct peer session.`).trim()
  const listenAddrs = parseList(args['listen-addrs'], ['/ip4/127.0.0.1/tcp/0'])
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

  const bundle = loadRuntimeKeyBundle(keyFile)
  const result = await initiatePeerSession({
    apiBase,
    agentId,
    bundle,
    targetAgentId,
    skillName,
    method,
    message,
    activitySummary,
    report,
    listenAddrs
  })
  console.log(JSON.stringify(result, null, 2))
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message)
  process.exit(1)
})
