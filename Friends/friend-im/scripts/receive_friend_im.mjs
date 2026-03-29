#!/usr/bin/env node

import { parseArgs } from '../../../Base/p2p-session-handoff/scripts/lib/cli.mjs'
import { gatewayNextInbound } from '../../../Base/gateway/scripts/lib/gateway_control.mjs'
import { resolveGatewayBase } from '../../../Base/gateway/scripts/lib/gateway_runtime.mjs'

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
  const item = result?.item ?? null
  if (!item) {
    console.log(JSON.stringify({ item: null }, null, 2))
    return
  }
  const messageText = item?.request?.params?.message?.parts?.[0]?.text ?? ''
  console.log(JSON.stringify({
    item: {
      inboundId: item.inboundId,
      receivedAt: item.receivedAt,
      from: item.remoteAgentId || item?.ticketView?.initiatorAgentId || '',
      peerSessionId: item.peerSessionId,
      suggestedSkill: item.suggestedSkill || item.defaultSkill || 'friend-im',
      defaultSkill: item.defaultSkill || 'friend-im',
      messageText,
      request: item.request,
      ticketView: item.ticketView
    }
  }, null, 2))
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message)
  process.exit(1)
})
