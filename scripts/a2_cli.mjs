#!/usr/bin/env node

import { runA2Cli } from './lib/a2_cli_core.mjs'

runA2Cli(process.argv.slice(2)).catch((error) => {
  console.error(error.message)
  process.exit(1)
})
