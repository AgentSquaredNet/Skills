#!/usr/bin/env node

import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseArgs, parseList, requireArg } from './lib/cli.mjs'
import { defaultGatewayStateFile, resolveGatewayBase } from '../../gateway/scripts/lib/gateway_runtime.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const gatewayScript = path.resolve(__dirname, '../../gateway/scripts/serve_gateway.mjs')
const routerScript = path.resolve(__dirname, '../../gateway/scripts/serve_agent_router.mjs')

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForGatewayBase({ keyFile, agentId, gatewayStateFile, retries = 50 }) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      return resolveGatewayBase({ keyFile, agentId, gatewayStateFile })
    } catch {
      await sleep(200)
    }
  }
  throw new Error('gateway did not publish its local control endpoint in time')
}

async function main(argv) {
  const args = parseArgs(argv)
  const apiBase = (args['api-base'] ?? 'https://api.agentsquared.net').trim()
  const agentId = requireArg(args['agent-id'], '--agent-id is required')
  const keyFile = requireArg(args['key-file'], '--key-file is required')
  const gatewayPort = (args['gateway-port'] ?? '').trim()
  const gatewayStateFile = (args['gateway-state-file'] ?? '').trim()
  const listenAddrs = (args['listen-addrs'] ?? '').trim()
  const waitMs = (args['wait-ms'] ?? '').trim()
  const maxActiveMailboxes = (args['max-active-mailboxes'] ?? '').trim()
  const allowedSkills = parseList(args['allowed-skills'], [])
  const fallbackSkill = (args['fallback-skill'] ?? '').trim()
  const discoveredStateFile = gatewayStateFile || defaultGatewayStateFile(keyFile, agentId)

  const childArgs = [
    gatewayScript,
    '--api-base', apiBase,
    '--agent-id', agentId,
    '--key-file', keyFile
  ]
  if (gatewayPort) {
    childArgs.push('--gateway-port', gatewayPort)
  }
  if (gatewayStateFile) {
    childArgs.push('--gateway-state-file', gatewayStateFile)
  }
  if (listenAddrs) {
    childArgs.push('--listen-addrs', listenAddrs)
  }

  const gateway = spawn(process.execPath, childArgs, { stdio: 'inherit' })
  await waitForGatewayBase({
    keyFile,
    agentId,
    gatewayStateFile: discoveredStateFile
  })

  const routerArgs = [
    routerScript,
    '--agent-id', agentId,
    '--key-file', keyFile,
    '--gateway-state-file', discoveredStateFile
  ]
  if (waitMs) {
    routerArgs.push('--wait-ms', waitMs)
  }
  if (maxActiveMailboxes) {
    routerArgs.push('--max-active-mailboxes', maxActiveMailboxes)
  }
  if (allowedSkills.length > 0) {
    routerArgs.push('--allowed-skills', allowedSkills.join(','))
  }
  if (fallbackSkill) {
    routerArgs.push('--fallback-skill', fallbackSkill)
  }
  const router = spawn(process.execPath, routerArgs, { stdio: 'inherit' })

  let shuttingDown = false
  const stop = (exitCode = 0) => {
    if (shuttingDown) {
      return
    }
    shuttingDown = true
    router.kill('SIGTERM')
    gateway.kill('SIGTERM')
    setTimeout(() => process.exit(exitCode), 50)
  }

  process.on('SIGINT', () => stop(0))
  process.on('SIGTERM', () => stop(0))

  gateway.on('exit', (code) => {
    if (shuttingDown) {
      return
    }
    shuttingDown = true
    router.kill('SIGTERM')
    process.exit(code ?? 1)
  })

  router.on('exit', (code) => {
    if (shuttingDown) {
      return
    }
    shuttingDown = true
    gateway.kill('SIGTERM')
    process.exit(code ?? 1)
  })
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message)
  process.exit(1)
})
