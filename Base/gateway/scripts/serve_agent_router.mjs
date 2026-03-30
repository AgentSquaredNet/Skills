#!/usr/bin/env node

import { parseArgs, parseList, requireArg } from '../../p2p-session-handoff/scripts/lib/cli.mjs'
import { gatewayHealth, gatewayNextInbound, gatewayRejectInbound, gatewayRespondInbound } from './lib/gateway_control.mjs'
import { resolveGatewayBase } from './lib/gateway_runtime.mjs'
import {
  DEFAULT_FALLBACK_SKILL,
  DEFAULT_SUPPORTED_SKILLS,
  createAgentRouter
} from './lib/agent_router.mjs'

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
  const maxActiveMailboxes = Math.max(1, Number.parseInt(args['max-active-mailboxes'] ?? '8', 10) || 8)
  const allowedSkills = parseList(args['allowed-skills'], DEFAULT_SUPPORTED_SKILLS)
  const fallbackSkill = (args['fallback-skill'] ?? DEFAULT_FALLBACK_SKILL).trim() || DEFAULT_FALLBACK_SKILL

  const health = await gatewayHealth(gatewayBase)
  console.log(JSON.stringify({
    agentId,
    gatewayBase,
    peerId: health?.peerId ?? '',
    allowedSkills,
    fallbackSkill,
    maxActiveMailboxes,
    routerMode: health?.routerMode ?? ''
  }, null, 2))

  if ((health?.routerMode ?? '').trim() !== 'external') {
    console.log('gateway already runs the official integrated Agent router; external router process is not required')
    return
  }

  const router = createAgentRouter({
    maxActiveMailboxes,
    allowedSkills,
    fallbackSkill,
    onRespond(item, result) {
      return gatewayRespondInbound(gatewayBase, {
        inboundId: item.inboundId,
        result
      })
    },
    onReject(item, payload) {
      return gatewayRejectInbound(gatewayBase, {
        inboundId: item.inboundId,
        code: payload.code,
        message: payload.message
      })
    }
  })

  let stopping = false
  const stop = async () => {
    if (stopping) {
      return
    }
    stopping = true
    await router.whenIdle()
    process.exit(0)
  }

  process.on('SIGINT', () => {
    stop().catch((error) => {
      console.error(error.message)
      process.exit(1)
    })
  })
  process.on('SIGTERM', () => {
    stop().catch((error) => {
      console.error(error.message)
      process.exit(1)
    })
  })

  while (!stopping) {
    const result = await gatewayNextInbound(gatewayBase, waitMs)
    const item = result?.item ?? null
    if (!item?.inboundId) {
      continue
    }
    router.enqueue(item).catch(async (error) => {
      try {
        await gatewayRejectInbound(gatewayBase, {
          inboundId: item.inboundId,
          code: Number.parseInt(`${error?.code ?? 500}`, 10) || 500,
          message: error?.message ?? 'agent router failed to process inbound request'
        })
      } catch (rejectError) {
        console.error(rejectError.message)
      }
      console.error(error?.message ?? 'agent router failed to process inbound request')
    })
  }
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message)
  process.exit(1)
})
