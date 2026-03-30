#!/usr/bin/env node

import { parseArgs, requireArg } from './lib/cli.mjs'
import { gatewayInboxIndex } from './lib/gateway_control.mjs'
import { resolveGatewayBase } from './lib/gateway_runtime.mjs'

async function main(argv) {
  const args = parseArgs(argv)
  const gatewayBase = resolveGatewayBase({
    gatewayBase: args['gateway-base'],
    keyFile: requireArg(args['key-file'], '--key-file is required'),
    agentId: requireArg(args['agent-id'], '--agent-id is required'),
    gatewayStateFile: args['gateway-state-file']
  })
  const result = await gatewayInboxIndex(gatewayBase)
  console.log(JSON.stringify(result, null, 2))
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message)
  process.exit(1)
})
