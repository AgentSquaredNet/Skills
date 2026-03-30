#!/usr/bin/env node

import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseArgs, parseList, requireArg } from './lib/cli.mjs'
import { defaultGatewayStateFile, resolveGatewayBase } from '../../gateway/scripts/lib/gateway_runtime.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const gatewayScript = path.resolve(__dirname, '../../gateway/scripts/serve_gateway.mjs')

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
  const routerSkills = parseList(args['router-skills'] ?? args['allowed-skills'], [])
  const defaultSkill = (args['default-skill'] ?? args['fallback-skill'] ?? '').trim()
  const routerMode = (args['router-mode'] ?? '').trim()
  const agentExecutorMode = (args['agent-executor-mode'] ?? '').trim()
  const agentExecutorUrl = (args['agent-executor-url'] ?? '').trim()
  const agentExecutorCommand = (args['agent-executor-command'] ?? '').trim()
  const ownerNotifyMode = (args['owner-notify-mode'] ?? '').trim()
  const ownerNotifyUrl = (args['owner-notify-url'] ?? '').trim()
  const ownerNotifyCommand = (args['owner-notify-command'] ?? '').trim()
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
  if (waitMs) {
    childArgs.push('--wait-ms', waitMs)
  }
  if (maxActiveMailboxes) {
    childArgs.push('--max-active-mailboxes', maxActiveMailboxes)
  }
  if (routerSkills.length > 0) {
    childArgs.push('--router-skills', routerSkills.join(','))
  }
  if (defaultSkill) {
    childArgs.push('--default-skill', defaultSkill)
  }
  if (routerMode) {
    childArgs.push('--router-mode', routerMode)
  }
  if (agentExecutorMode) {
    childArgs.push('--agent-executor-mode', agentExecutorMode)
  }
  if (agentExecutorUrl) {
    childArgs.push('--agent-executor-url', agentExecutorUrl)
  }
  if (agentExecutorCommand) {
    childArgs.push('--agent-executor-command', agentExecutorCommand)
  }
  if (ownerNotifyMode) {
    childArgs.push('--owner-notify-mode', ownerNotifyMode)
  }
  if (ownerNotifyUrl) {
    childArgs.push('--owner-notify-url', ownerNotifyUrl)
  }
  if (ownerNotifyCommand) {
    childArgs.push('--owner-notify-command', ownerNotifyCommand)
  }

  const gateway = spawn(process.execPath, childArgs, { stdio: 'inherit' })
  await waitForGatewayBase({
    keyFile,
    agentId,
    gatewayStateFile: discoveredStateFile
  })

  let shuttingDown = false
  const stop = (exitCode = 0) => {
    if (shuttingDown) {
      return
    }
    shuttingDown = true
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
    process.exit(code ?? 1)
  })
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message)
  process.exit(1)
})
