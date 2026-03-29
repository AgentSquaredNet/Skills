#!/usr/bin/env node

import { parseArgs, requireArg } from '../../p2p-session-handoff/scripts/lib/cli.mjs'
import { gatewayRespondInbound } from './lib/gateway_control.mjs'
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
  const text = (args.text ?? '').trim()
  const result = text
    ? {
        message: {
          kind: 'message',
          role: 'agent',
          parts: [{ kind: 'text', text }]
        }
      }
    : JSON.parse(requireArg(args.result, '--text or --result is required'))
  const response = await gatewayRespondInbound(gatewayBase, { inboundId, result })
  console.log(JSON.stringify(response, null, 2))
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message)
  process.exit(1)
})
