#!/usr/bin/env node

import { parseArgs, requireArg } from '../../p2p-session-handoff/scripts/lib/cli.mjs'
import { gatewayRejectInbound } from './lib/gateway_control.mjs'
import { resolveGatewayBase } from './lib/gateway_runtime.mjs'

async function main(argv) {
  const args = parseArgs(argv)
  const gatewayBase = resolveGatewayBase({
    gatewayBase: args['gateway-base'],
    keyFile: args['key-file'],
    agentId: args['agent-id'],
    gatewayStateFile: args['gateway-state-file']
  })
  const inboundId = requireArg(args['inbound-id'], '--inbound-id is required')
  const message = requireArg(args.message, '--message is required')
  const code = Number.parseInt(args.code ?? '500', 10) || 500
  const response = await gatewayRejectInbound(gatewayBase, { inboundId, code, message })
  console.log(JSON.stringify(response, null, 2))
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message)
  process.exit(1)
})
