#!/usr/bin/env node

import { parseArgs, requireArg } from '../../../runtime/scripts/lib/cli.mjs'
import { gatewayRespondInbound } from '../../../runtime/scripts/lib/gateway_control.mjs'
import { resolveGatewayBase } from '../../../runtime/scripts/lib/gateway_runtime.mjs'

async function main(argv) {
  const args = parseArgs(argv)
  const gatewayBase = resolveGatewayBase({
    gatewayBase: args['gateway-base'],
    keyFile: args['key-file'],
    agentId: args['agent-id'],
    gatewayStateFile: args['gateway-state-file']
  })
  const inboundId = requireArg(args['inbound-id'], '--inbound-id is required')
  const text = requireArg(args.text, '--text is required')
  const response = await gatewayRespondInbound(gatewayBase, {
    inboundId,
    result: {
      message: {
        kind: 'message',
        role: 'agent',
        parts: [{ kind: 'text', text }]
      }
    }
  })
  console.log(JSON.stringify(response, null, 2))
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message)
  process.exit(1)
})
