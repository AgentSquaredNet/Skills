#!/usr/bin/env node

import path from 'node:path'

import { parseArgs } from '../../runtime/scripts/lib/cli.mjs'
import { defaultInboxDir } from '../../runtime/scripts/lib/gateway_inbox.mjs'
import { gatewayHealth, gatewayInboxIndex } from '../../runtime/scripts/lib/gateway_control.mjs'
import { defaultGatewayStateFile, resolveGatewayBase } from '../../runtime/scripts/lib/gateway_runtime.mjs'
import { detectHostRuntimeEnvironment, SUPPORTED_HOST_RUNTIMES } from '../../runtime/adapters/index.mjs'

function clean(value) {
  return `${value ?? ''}`.trim()
}

async function safe(promise) {
  try {
    return { ok: true, value: await promise }
  } catch (error) {
    return { ok: false, error: clean(error?.message) || 'unknown-error' }
  }
}

async function main(argv) {
  const args = parseArgs(argv)
  const hostRuntime = `${args['host-runtime'] ?? 'auto'}`.trim().toLowerCase() || 'auto'
  const agentId = clean(args['agent-id'])
  const keyFile = clean(args['key-file'])
  const gatewayStateFile = clean(args['gateway-state-file']) || (keyFile && agentId ? defaultGatewayStateFile(keyFile, agentId) : '')
  const inboxDir = clean(args['inbox-dir']) || (keyFile && agentId ? defaultInboxDir(keyFile, agentId) : '')
  const openclawAgent = `${args['openclaw-agent'] ?? process.env.OPENCLAW_AGENT ?? ''}`.trim()
  const openclawCommand = `${args['openclaw-command'] ?? process.env.OPENCLAW_COMMAND ?? 'openclaw'}`.trim() || 'openclaw'
  const openclawCwd = `${args['openclaw-cwd'] ?? process.env.OPENCLAW_CWD ?? ''}`.trim()
  const openclawGatewayUrl = `${args['openclaw-gateway-url'] ?? process.env.OPENCLAW_GATEWAY_URL ?? ''}`.trim()
  const openclawGatewayToken = `${args['openclaw-gateway-token'] ?? process.env.OPENCLAW_GATEWAY_TOKEN ?? ''}`.trim()
  const openclawGatewayPassword = `${args['openclaw-gateway-password'] ?? process.env.OPENCLAW_GATEWAY_PASSWORD ?? ''}`.trim()

  const detected = await detectHostRuntimeEnvironment({
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

  let gatewayBase = clean(args['gateway-base'])
  if (!gatewayBase && keyFile && agentId) {
    const resolved = await safe(Promise.resolve().then(() => resolveGatewayBase({
      gatewayBase: args['gateway-base'],
      keyFile,
      agentId,
      gatewayStateFile: args['gateway-state-file']
    })))
    if (resolved.ok) {
      gatewayBase = resolved.value
    }
  }

  const health = gatewayBase ? await safe(gatewayHealth(gatewayBase)) : { ok: false, error: 'gateway-base-unavailable' }
  const inbox = gatewayBase ? await safe(gatewayInboxIndex(gatewayBase)) : { ok: false, error: 'gateway-base-unavailable' }

  const ownerFacingLines = []
  ownerFacingLines.push(`Host runtime: ${detected.resolved !== 'none' ? detected.resolved : `not bound (${detected.suggested || 'openclaw'} suggested)`}.`)
  if (health.ok) {
    ownerFacingLines.push(`Gateway is running at ${clean(health.value?.gatewayBase) || gatewayBase}.`)
  } else {
    ownerFacingLines.push(`Gateway is not confirmed running yet${health.error ? `: ${health.error}` : '.'}`)
  }
  if (inboxDir) {
    ownerFacingLines.push(`Inbox audit path: ${path.resolve(inboxDir)}.`)
  }
  if (inbox.ok) {
    ownerFacingLines.push(`Inbox audit index is ready with ${inbox.value?.index?.totalCount ?? 0} stored records.`)
  } else if (inboxDir) {
    ownerFacingLines.push('Inbox audit index is not confirmed yet.')
  }
  ownerFacingLines.push('Owner-facing notifications should come from the host runtime when available; Inbox remains the local audit history.')

  console.log(JSON.stringify({
    requestedHostRuntime: hostRuntime,
    resolvedHostRuntime: detected.resolved,
    detectedHostRuntime: detected,
    supportedHostRuntimes: SUPPORTED_HOST_RUNTIMES,
    gateway: {
      gatewayBase: gatewayBase || '',
      gatewayStateFile,
      running: Boolean(health.ok),
      health: health.ok ? health.value : null,
      error: health.ok ? '' : health.error
    },
    inbox: {
      inboxDir: inboxDir ? path.resolve(inboxDir) : '',
      indexFile: inboxDir ? path.join(path.resolve(inboxDir), 'index.json') : '',
      markdownFile: inboxDir ? path.join(path.resolve(inboxDir), 'inbox.md') : '',
      ready: Boolean(inbox.ok),
      index: inbox.ok ? inbox.value?.index ?? null : null,
      snapshot: inbox.ok ? inbox.value?.snapshot ?? null : null,
      error: inbox.ok ? '' : inbox.error
    },
    ownerFacingLines
  }, null, 2))
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message)
  process.exit(1)
})
