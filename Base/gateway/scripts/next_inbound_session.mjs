#!/usr/bin/env node

import { parseArgs } from '../../p2p-session-handoff/scripts/lib/cli.mjs'
import { gatewayNextInbound } from './lib/gateway_control.mjs'
import { resolveGatewayBase } from './lib/gateway_runtime.mjs'

async function main(argv) {
  const args = parseArgs(argv)
  const gatewayBase = resolveGatewayBase({
    gatewayBase: args['gateway-base'],
    keyFile: args['key-file'],
    agentId: args['agent-id'],
    gatewayStateFile: args['gateway-state-file']
  })
  const waitMs = Number.parseInt(args['wait-ms'] ?? '30000', 10)
  const result = await gatewayNextInbound(gatewayBase, waitMs)
  console.log(JSON.stringify(result, null, 2))
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message)
  process.exit(1)
})
