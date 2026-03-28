import crypto from 'node:crypto'
import fs from 'node:fs'

function toBase64Url(buffer) {
  return Buffer.from(buffer).toString('base64url')
}

export function loadRuntimeKeyBundle(keyFile) {
  return JSON.parse(fs.readFileSync(keyFile, 'utf8'))
}

function createPrivateKey(privateKeyPem) {
  return crypto.createPrivateKey(privateKeyPem)
}

export function signText(bundle, message) {
  const key = createPrivateKey(bundle.privateKeyPem)
  const payload = Buffer.from(message, 'utf8')
  if (bundle.keyType === 2) {
    return toBase64Url(crypto.sign(null, payload, key))
  }
  if (bundle.keyType === 3) {
    return toBase64Url(crypto.sign('sha256', payload, key))
  }
  throw new Error(`Unsupported keyType: ${bundle.keyType}`)
}

export function publicKeyFingerprint(bundle) {
  const digest = crypto.createHash('sha256').update(String(bundle.publicKey)).digest('hex')
  return `sha256:${digest.slice(0, 16)}`
}
