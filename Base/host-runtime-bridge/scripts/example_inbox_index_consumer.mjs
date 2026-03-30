#!/usr/bin/env node

import { parseArgs, requireArg } from '../../../Base/p2p-session-handoff/scripts/lib/cli.mjs'
import { gatewayInboxIndex } from '../../../Base/gateway/scripts/lib/gateway_control.mjs'
import { resolveGatewayBase } from '../../../Base/gateway/scripts/lib/gateway_runtime.mjs'

async function main(argv) {
  const args = parseArgs(argv)
  const gatewayBase = resolveGatewayBase({
    gatewayBase: args['gateway-base'],
    keyFile: requireArg(args['key-file'], '--key-file is required'),
    agentId: requireArg(args['agent-id'], '--agent-id is required'),
    gatewayStateFile: args['gateway-state-file']
  })

  const result = await gatewayInboxIndex(gatewayBase)
  const unread = Array.isArray(result?.index?.unread) ? result.index.unread : []
  for (const item of unread) {
    process.stdout.write(`[unread] ${item.remoteAgentId}: ${item.summary}\n`)
  }
}

main(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})
