#!/usr/bin/env node

import { generateKeyPairSync } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

function b64url(data) {
  return Buffer.from(data).toString('base64url')
}

function parseArgs(argv) {
  const args = {
    keyType: 'ed25519',
    out: null,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--key-type') {
      args.keyType = argv[++i] ?? ''
      continue
    }
    if (arg === '--out') {
      args.out = argv[++i] ?? ''
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  if (!['ed25519', 'secp256k1'].includes(args.keyType)) {
    throw new Error('--key-type must be ed25519 or secp256k1')
  }
  if (!args.out) {
    throw new Error('--out is required')
  }
  return args
}

function buildEd25519Bundle() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const publicJwk = publicKey.export({ format: 'jwk' })
  const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' })
  const publicBytes = Buffer.from(publicJwk.x, 'base64url')
  return {
    keyType: 2,
    keyTypeName: 'agent_runtime_ed25519',
    publicKey: publicJwk.x,
    publicKeyEncoding: 'base64url-raw-32',
    publicKeyHex: publicBytes.toString('hex'),
    privateKeyPem: privatePem.toString(),
    privateKeyEncoding: 'pkcs8-pem',
    signingAlgorithm: 'ed25519',
  }
}

function buildSecp256k1Bundle() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'secp256k1' })
  const publicJwk = publicKey.export({ format: 'jwk' })
  const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' })
  const x = Buffer.from(publicJwk.x, 'base64url')
  const y = Buffer.from(publicJwk.y, 'base64url')
  const prefix = (y[y.length - 1] & 1) === 0 ? 0x02 : 0x03
  const compressed = Buffer.concat([Buffer.from([prefix]), x])
  return {
    keyType: 3,
    keyTypeName: 'agent_runtime_secp256k1',
    publicKey: compressed.toString('hex'),
    publicKeyEncoding: 'hex-compressed-33',
    publicKeyHex: compressed.toString('hex'),
    privateKeyPem: privatePem.toString(),
    privateKeyEncoding: 'pkcs8-pem',
    signingAlgorithm: 'ecdsa-secp256k1-sha256',
  }
}

function writeBundle(outFile, bundle) {
  const outPath = path.resolve(outFile.replace(/^~(?=$|\/|\\)/, process.env.HOME || '~'))
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, `${JSON.stringify(bundle, null, 2)}\n`, { mode: 0o600 })
  fs.chmodSync(outPath, 0o600)
  return outPath
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const bundle = args.keyType === 'ed25519' ? buildEd25519Bundle() : buildSecp256k1Bundle()
  bundle.generatedAt = new Date().toISOString()
  const outPath = writeBundle(args.out, bundle)
  console.log(`Wrote local runtime key bundle to ${outPath}`)
  console.log(`keyType=${bundle.keyType} publicKey=${bundle.publicKey}`)
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
