#!/usr/bin/env node

import { parseArgs } from '../../runtime-gateway/scripts/lib/cli.mjs'
import { detectHostRuntimeEnvironment, SUPPORTED_HOST_RUNTIMES } from '../../runtime-gateway/adapters/index.mjs'

async function main(argv) {
  const args = parseArgs(argv)
  const hostRuntime = `${args['host-runtime'] ?? 'auto'}`.trim().toLowerCase() || 'auto'
  const openclawAgent = `${args['openclaw-agent'] ?? process.env.OPENCLAW_AGENT ?? ''}`.trim()
  const openclawCommand = `${args['openclaw-command'] ?? process.env.OPENCLAW_COMMAND ?? 'openclaw'}`.trim() || 'openclaw'
  const openclawCwd = `${args['openclaw-cwd'] ?? process.env.OPENCLAW_CWD ?? ''}`.trim()
  const openclawGatewayUrl = `${args['openclaw-gateway-url'] ?? process.env.OPENCLAW_GATEWAY_URL ?? ''}`.trim()
  const openclawGatewayToken = `${args['openclaw-gateway-token'] ?? process.env.OPENCLAW_GATEWAY_TOKEN ?? ''}`.trim()
  const openclawGatewayPassword = `${args['openclaw-gateway-password'] ?? process.env.OPENCLAW_GATEWAY_PASSWORD ?? ''}`.trim()
  const openclawOwnerChannel = `${args['openclaw-owner-channel'] ?? process.env.OPENCLAW_OWNER_CHANNEL ?? ''}`.trim()
  const openclawOwnerTarget = `${args['openclaw-owner-target'] ?? process.env.OPENCLAW_OWNER_TARGET ?? ''}`.trim()

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

  const recommendedArgs = []
  if ((detected.resolved || 'none') === 'openclaw') {
    recommendedArgs.push('--host-runtime openclaw')
    if (openclawAgent) {
      recommendedArgs.push(`--openclaw-agent ${openclawAgent}`)
    }
    if (openclawGatewayUrl) {
      recommendedArgs.push(`--openclaw-gateway-url ${openclawGatewayUrl}`)
    }
    if (openclawOwnerChannel && openclawOwnerTarget) {
      recommendedArgs.push(`--openclaw-owner-channel ${openclawOwnerChannel}`)
      recommendedArgs.push(`--openclaw-owner-target ${openclawOwnerTarget}`)
    }
  }

  console.log(JSON.stringify({
    requestedHostRuntime: hostRuntime,
    resolvedHostRuntime: detected.resolved,
    detected,
    supportedHostRuntimes: SUPPORTED_HOST_RUNTIMES,
    suggestedHostRuntime: detected.resolved === 'none' ? (detected.suggested || 'openclaw') : detected.resolved,
    recommendedGatewayArgs: recommendedArgs
  }, null, 2))
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message)
  process.exit(1)
})
