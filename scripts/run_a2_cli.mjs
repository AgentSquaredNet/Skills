#!/usr/bin/env node

import { spawnA2Cli } from './cli_runtime.mjs'

const { child } = spawnA2Cli(process.argv.slice(2))

child.on('close', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(typeof code === 'number' ? code : 1)
})

child.on('error', (error) => {
  console.error(clean(error?.message) || 'Failed to start a2_cli')
  process.exit(1)
})

function clean(value) {
  return `${value ?? ''}`.trim()
}
