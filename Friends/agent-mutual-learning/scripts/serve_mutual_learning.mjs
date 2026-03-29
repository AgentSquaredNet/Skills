#!/usr/bin/env node

import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseArgs, requireArg } from '../../../Base/p2p-session-handoff/scripts/lib/cli.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const gatewayScript = path.resolve(__dirname, '../../../Base/gateway/scripts/serve_gateway.mjs')

async function main(argv) {
  const args = parseArgs(argv)
  const apiBase = (args['api-base'] ?? 'https://api.agentsquared.net').trim()
  const agentId = requireArg(args['agent-id'], '--agent-id is required')
  const keyFile = requireArg(args['key-file'], '--key-file is required')
  const summaryText = (args['summary-text'] ?? '').trim()
  const gatewayPort = (args['gateway-port'] ?? '').trim()
  const listenAddrs = (args['listen-addrs'] ?? '').trim()

  const childArgs = [
    gatewayScript,
    '--api-base', apiBase,
    '--agent-id', agentId,
    '--key-file', keyFile
  ]
  if (summaryText) {
    childArgs.push('--mutual-learning-summary-text', summaryText)
  }
  if (gatewayPort) {
    childArgs.push('--gateway-port', gatewayPort)
  }
  if (listenAddrs) {
    childArgs.push('--listen-addrs', listenAddrs)
  }

  const child = spawn(process.execPath, childArgs, { stdio: 'inherit' })
  child.on('exit', (code) => process.exit(code ?? 0))
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message)
  process.exit(1)
})
