#!/usr/bin/env node

import readline from 'node:readline'

function clean(value) {
  return `${value ?? ''}`.trim()
}

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity
  })

  for await (const line of rl) {
    const trimmed = clean(line)
    if (!trimmed) {
      continue
    }

    let payload = null
    try {
      payload = JSON.parse(trimmed)
    } catch {
      continue
    }

    if (clean(payload?.type) !== 'agentsquared.owner-report') {
      continue
    }

    const summary = clean(payload?.report?.summary) || 'owner report received'
    const remoteAgentId = clean(payload?.remoteAgentId) || 'unknown'
    process.stdout.write(`[owner-report] ${remoteAgentId}: ${summary}\n`)
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})
