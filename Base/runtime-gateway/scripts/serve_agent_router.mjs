#!/usr/bin/env node

import { parseArgs, parseList, requireArg } from './lib/cli.mjs'
import { gatewayHealth, gatewayNextInbound, gatewayRejectInbound, gatewayRespondInbound } from './lib/gateway_control.mjs'
import { defaultGatewayStateFile, resolveGatewayBase } from './lib/gateway_runtime.mjs'
import {
  DEFAULT_ROUTER_DEFAULT_SKILL,
  DEFAULT_ROUTER_SKILLS,
  createAgentRouter
} from './lib/agent_router.mjs'
import { createLocalRuntimeExecutor, createOwnerNotifier } from './lib/local_runtime.mjs'
import { createInboxStore, defaultInboxDir } from './lib/gateway_inbox.mjs'
import { detectHostRuntimeEnvironment } from '../adapters/index.mjs'

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
  const routerSkills = parseList(args['router-skills'] ?? args['allowed-skills'], DEFAULT_ROUTER_SKILLS)
  const defaultSkill = (args['default-skill'] ?? args['fallback-skill'] ?? DEFAULT_ROUTER_DEFAULT_SKILL).trim() || DEFAULT_ROUTER_DEFAULT_SKILL
  const hostRuntime = `${args['host-runtime'] ?? process.env.AGENTSQUARED_HOST_RUNTIME ?? 'auto'}`.trim().toLowerCase() || 'auto'
  const openclawAgent = `${args['openclaw-agent'] ?? process.env.OPENCLAW_AGENT ?? ''}`.trim()
  const openclawOwnerChannel = `${args['openclaw-owner-channel'] ?? process.env.OPENCLAW_OWNER_CHANNEL ?? ''}`.trim()
  const openclawOwnerTarget = `${args['openclaw-owner-target'] ?? process.env.OPENCLAW_OWNER_TARGET ?? ''}`.trim()
  const agentExecutorUrl = `${args['agent-executor-url'] ?? ''}`.trim()
  const agentExecutorCommand = `${args['agent-executor-command'] ?? ''}`.trim()
  const ownerNotifyUrl = `${args['owner-notify-url'] ?? ''}`.trim()
  const ownerNotifyCommand = `${args['owner-notify-command'] ?? ''}`.trim()
  const openclawCommand = `${args['openclaw-command'] ?? process.env.OPENCLAW_COMMAND ?? 'openclaw'}`.trim() || 'openclaw'
  const openclawCwd = `${args['openclaw-cwd'] ?? process.env.OPENCLAW_CWD ?? ''}`.trim()
  const openclawSessionPrefix = `${args['openclaw-session-prefix'] ?? args['openclaw-peer-target-prefix'] ?? process.env.OPENCLAW_SESSION_PREFIX ?? process.env.OPENCLAW_PEER_TARGET_PREFIX ?? 'agentsquared:peer:'}`.trim() || 'agentsquared:peer:'
  const openclawTimeoutMs = Math.max(1000, Number.parseInt(args['openclaw-timeout-ms'] ?? `${process.env.OPENCLAW_TIMEOUT_MS ?? '180000'}`, 10) || 180000)
  const openclawOwnerThreadId = `${args['openclaw-owner-thread-id'] ?? process.env.OPENCLAW_OWNER_THREAD_ID ?? ''}`.trim()
  const openclawGatewayUrl = `${args['openclaw-gateway-url'] ?? process.env.OPENCLAW_GATEWAY_URL ?? ''}`.trim()
  const openclawGatewayToken = `${args['openclaw-gateway-token'] ?? process.env.OPENCLAW_GATEWAY_TOKEN ?? ''}`.trim()
  const openclawGatewayPassword = `${args['openclaw-gateway-password'] ?? process.env.OPENCLAW_GATEWAY_PASSWORD ?? ''}`.trim()
  const inboxDir = `${args['inbox-dir'] ?? defaultInboxDir(keyFile, agentId)}`.trim() || defaultInboxDir(keyFile, agentId)
  const inboxStore = createInboxStore({ inboxDir })
  const detectedHostRuntime = await detectHostRuntimeEnvironment({
    preferred: hostRuntime,
    openclaw: {
      command: openclawCommand,
      cwd: openclawCwd,
      openclawAgent,
      gatewayUrl: openclawGatewayUrl,
      gatewayToken: openclawGatewayToken,
      gatewayPassword: openclawGatewayPassword
    }
  })
  const resolvedHostRuntime = detectedHostRuntime.resolved || 'none'
  const agentExecutorMode = `${args['agent-executor-mode'] ?? (resolvedHostRuntime !== 'none' ? 'host' : 'reject')}`.trim().toLowerCase() || 'reject'
  const ownerNotifyMode = `${args['owner-notify-mode'] ?? (resolvedHostRuntime !== 'none' && openclawOwnerChannel && openclawOwnerTarget ? 'host' : 'inbox')}`.trim().toLowerCase() || 'inbox'
  const localRuntimeExecutor = createLocalRuntimeExecutor({
    agentId,
    mode: agentExecutorMode,
    hostRuntime: resolvedHostRuntime,
    url: agentExecutorUrl,
    command: agentExecutorCommand,
    openclawCommand,
    openclawCwd,
    openclawAgent,
    openclawSessionPrefix,
    openclawTimeoutMs,
    openclawOwnerChannel,
    openclawOwnerTarget,
    openclawOwnerThreadId,
    openclawGatewayUrl,
    openclawGatewayToken,
    openclawGatewayPassword
  })
  const ownerNotifier = createOwnerNotifier({
    agentId,
    mode: ownerNotifyMode,
    hostRuntime: resolvedHostRuntime,
    url: ownerNotifyUrl,
    command: ownerNotifyCommand,
    inbox: inboxStore,
    openclawCommand,
    openclawCwd,
    openclawAgent,
    openclawSessionPrefix,
    openclawTimeoutMs,
    openclawOwnerChannel,
    openclawOwnerTarget,
    openclawOwnerThreadId,
    openclawGatewayUrl,
    openclawGatewayToken,
    openclawGatewayPassword
  })

  const health = await gatewayHealth(gatewayBase)
  console.log(JSON.stringify({
    agentId,
    gatewayBase,
    peerId: health?.peerId ?? '',
    routerSkills,
    defaultSkill,
    hostRuntime: detectedHostRuntime,
    executorMode: localRuntimeExecutor.mode,
    ownerNotifyMode: ownerNotifier.mode,
    maxActiveMailboxes,
    routerMode: health?.routerMode ?? ''
  }, null, 2))

  if ((health?.routerMode ?? '').trim() !== 'external') {
    console.log('gateway already runs the official integrated Agent router; external router process is not required')
    return
  }

  const router = createAgentRouter({
    maxActiveMailboxes,
    routerSkills,
    defaultSkill,
    executeInbound: localRuntimeExecutor,
    notifyOwner: ownerNotifier,
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
