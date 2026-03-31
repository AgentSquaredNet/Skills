#!/usr/bin/env node

import { parseArgs, requireArg } from './lib/cli.mjs'
import { runA2Cli } from '../../../scripts/lib/a2_cli_core.mjs'

async function main(argv) {
  const args = parseArgs(argv)
  const forwarded = [
    'peer',
    'open',
    '--target-agent', requireArg(args['target-agent'], '--target-agent is required')
  ]
  for (const key of ['gateway-base', 'key-file', 'agent-id', 'gateway-state-file', 'skill-hint', 'skill-name', 'method', 'text', 'message', 'activity-summary', 'report-summary', 'task-id', 'public-summary']) {
    const value = `${args[key] ?? ''}`.trim()
    if (value) {
      forwarded.push(`--${key}`, value)
    }
  }
  await runA2Cli(forwarded)
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message)
  process.exit(1)
})
