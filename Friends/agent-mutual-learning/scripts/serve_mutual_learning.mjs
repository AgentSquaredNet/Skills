#!/usr/bin/env node

import { parseArgs, requireArg } from '../../../Base/runtime-gateway/scripts/lib/cli.mjs'
import { gatewayNextInbound, gatewayRejectInbound, gatewayRespondInbound } from '../../../Base/runtime-gateway/scripts/lib/gateway_control.mjs'
import { resolveGatewayBase } from '../../../Base/runtime-gateway/scripts/lib/gateway_runtime.mjs'

function extractInboundText(item) {
  const parts = item?.request?.params?.message?.parts ?? []
  const texts = parts
    .filter((part) => `${part?.kind ?? ''}`.trim() === 'text')
    .map((part) => `${part?.text ?? ''}`.trim())
    .filter(Boolean)
  return texts.join('\n').trim()
}

function buildLearningReply(item) {
  const goal = extractInboundText(item)
  const summary = goal
    ? `I reviewed your learning request: ${goal.replace(/\s+/g, ' ').trim().slice(0, 180)}`
    : 'I reviewed your learning request.'
  return `${summary}\nCurrent recommendation: compare concrete workflows first, then summarize reusable lessons without exposing private memory.`
}

function inboundSkill(item) {
  const suggested = `${item?.suggestedSkill ?? ''}`.trim()
  if (suggested) {
    return suggested
  }
  const fallback = `${item?.defaultSkill ?? ''}`.trim()
  return fallback || 'friend-im'
}

async function main(argv) {
  const args = parseArgs(argv)
  const agentId = requireArg(args['agent-id'], '--agent-id is required')
  const keyFile = requireArg(args['key-file'], '--key-file is required')
  const gatewayBase = resolveGatewayBase({
    gatewayBase: args['gateway-base'],
    keyFile,
    agentId,
    gatewayStateFile: args['gateway-state-file']
  })
  const waitMs = Math.max(0, Number.parseInt(args['wait-ms'] ?? '30000', 10) || 30000)

  while (true) {
    const result = await gatewayNextInbound(gatewayBase, waitMs)
    const item = result?.item ?? null
    if (!item?.inboundId) {
      continue
    }

    const skill = inboundSkill(item)
    if (skill !== 'agent-mutual-learning') {
      await gatewayRejectInbound(gatewayBase, {
        inboundId: item.inboundId,
        code: 409,
        message: `local mutual-learning test worker cannot handle inbound skill: ${skill}`
      })
      continue
    }

    await gatewayRespondInbound(gatewayBase, {
      inboundId: item.inboundId,
      result: {
        message: {
          kind: 'message',
          role: 'agent',
          parts: [{ kind: 'text', text: buildLearningReply(item) }]
        }
      }
    })
  }
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message)
  process.exit(1)
})
