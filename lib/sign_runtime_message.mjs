#!/usr/bin/env node

import { createPrivateKey, sign } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)

function resolveUserPath(inputPath) {
  return path.resolve(inputPath.replace(/^~(?=$|\/|\\)/, process.env.HOME || '~'))
}

function parseArgs(argv) {
  const args = {
    keyFile: null,
    message: null,
    messageFile: null,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--key-file') {
      args.keyFile = argv[++i] ?? ''
      continue
    }
    if (arg === '--message') {
      args.message = argv[++i] ?? ''
      continue
    }
    if (arg === '--message-file') {
      args.messageFile = argv[++i] ?? ''
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  if (!args.keyFile) {
    throw new Error('--key-file is required')
  }
  if ((args.message ? 1 : 0) + (args.messageFile ? 1 : 0) !== 1) {
    throw new Error('Provide exactly one of --message or --message-file')
  }
  return args
}

function loadMessage(args) {
  if (args.message !== null) {
    return Buffer.from(args.message, 'utf8')
  }
  return fs.readFileSync(resolveUserPath(args.messageFile))
}

export function signRuntimeMessage(bundle, message) {
  if (!bundle.privateKeyPem) {
    throw new Error('Key bundle is missing privateKeyPem.')
  }
  const privateKey = createPrivateKey(bundle.privateKeyPem)

  let signature
  if (bundle.keyType === 2) {
    signature = sign(null, message, privateKey)
  } else if (bundle.keyType === 3) {
    signature = sign('sha256', message, privateKey)
  } else {
    throw new Error(`Unsupported keyType: ${JSON.stringify(bundle.keyType)}`)
  }

  const result = {
    keyType: bundle.keyType,
    signatureBase64Url: signature.toString('base64url'),
    signatureHex: signature.toString('hex'),
  }
  return result
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const bundle = JSON.parse(fs.readFileSync(resolveUserPath(args.keyFile), 'utf8'))
  const message = loadMessage(args)
  const result = signRuntimeMessage(bundle, message)
  console.log(JSON.stringify(result, null, 2))
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
