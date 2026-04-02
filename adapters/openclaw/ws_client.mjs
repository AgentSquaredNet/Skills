import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

import { WebSocket } from 'ws'

const PROTOCOL_VERSION = 3
const DEFAULT_GATEWAY_URL = 'ws://127.0.0.1:18789'
const DEFAULT_CONNECT_TIMEOUT_MS = 15000
const DEFAULT_REQUEST_TIMEOUT_MS = 180000
const DEFAULT_CLIENT_ID = 'gateway-client'
const DEFAULT_CLIENT_MODE = 'backend'
const DEFAULT_DEVICE_FAMILY = 'agentsquared'
const DEFAULT_ROLE = 'operator'
const DEFAULT_SCOPES = [
  'operator.read',
  'operator.write',
  'operator.admin',
  'operator.approvals',
  'operator.pairing'
]

function clean(value) {
  return `${value ?? ''}`.trim()
}

function base64UrlEncode(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/g, '')
}

function randomId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function parseJson(text, label = 'JSON payload') {
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`${label} was not valid JSON: ${error.message}`)
  }
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function writeJson(filePath, value) {
  ensureDir(filePath)
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  try {
    fs.chmodSync(filePath, 0o600)
  } catch {
    // best-effort on non-posix filesystems
  }
}

function ed25519PublicKeyRaw(publicKeyPem) {
  const key = crypto.createPublicKey(publicKeyPem)
  const spki = key.export({ type: 'spki', format: 'der' })
  const prefix = Buffer.from('302a300506032b6570032100', 'hex')
  if (spki.length === prefix.length + 32 && spki.subarray(0, prefix.length).equals(prefix)) {
    return spki.subarray(prefix.length)
  }
  return spki
}

function fingerprintPublicKey(publicKeyPem) {
  return crypto.createHash('sha256').update(ed25519PublicKeyRaw(publicKeyPem)).digest('hex')
}

function loadOrCreateDeviceIdentity(filePath) {
  const existing = readJson(filePath)
  if (
    existing?.version === 1
    && clean(existing.deviceId)
    && clean(existing.publicKeyPem)
    && clean(existing.privateKeyPem)
  ) {
    return {
      deviceId: clean(existing.deviceId),
      publicKeyPem: existing.publicKeyPem,
      privateKeyPem: existing.privateKeyPem
    }
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
  const identity = {
    version: 1,
    deviceId: '',
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    createdAtMs: Date.now()
  }
  identity.deviceId = fingerprintPublicKey(identity.publicKeyPem)
  writeJson(filePath, identity)
  return {
    deviceId: identity.deviceId,
    publicKeyPem: identity.publicKeyPem,
    privateKeyPem: identity.privateKeyPem
  }
}

function signDevicePayload(privateKeyPem, payload) {
  const key = crypto.createPrivateKey(privateKeyPem)
  const signature = crypto.sign(null, Buffer.from(payload, 'utf8'), key)
  return base64UrlEncode(signature)
}

function publicKeyRawBase64UrlFromPem(publicKeyPem) {
  return base64UrlEncode(ed25519PublicKeyRaw(publicKeyPem))
}

function buildDeviceAuthPayloadV3({
  deviceId,
  clientId,
  clientMode,
  role,
  scopes,
  signedAtMs,
  token,
  nonce,
  platform,
  deviceFamily
}) {
  return [
    'v3',
    clean(deviceId),
    clean(clientId),
    clean(clientMode),
    clean(role),
    (Array.isArray(scopes) ? scopes : []).map((scope) => clean(scope)).filter(Boolean).join(','),
    String(signedAtMs),
    clean(token),
    clean(nonce),
    clean(platform),
    clean(deviceFamily)
  ].join('|')
}

function authStorePath(stateDir) {
  return path.join(stateDir, 'openclaw-device-auth.json')
}

function identityPath(stateDir) {
  return path.join(stateDir, 'openclaw-device.json')
}

function loadStoredDeviceToken(stateDir, { deviceId, role }) {
  const store = readJson(authStorePath(stateDir))
  if (store?.version !== 1 || clean(store?.deviceId) !== clean(deviceId)) {
    return null
  }
  const entry = store.tokens?.[clean(role)]
  if (!entry || typeof entry !== 'object') {
    return null
  }
  return {
    token: clean(entry.token),
    scopes: Array.isArray(entry.scopes) ? entry.scopes.map((scope) => clean(scope)).filter(Boolean) : []
  }
}

function storeDeviceToken(stateDir, {
  deviceId,
  role,
  token,
  scopes = []
}) {
  const filePath = authStorePath(stateDir)
  const existing = readJson(filePath)
  const next = existing?.version === 1 && clean(existing.deviceId) === clean(deviceId)
    ? existing
    : {
        version: 1,
        deviceId: clean(deviceId),
        tokens: {}
      }
  next.tokens = next.tokens && typeof next.tokens === 'object' ? next.tokens : {}
  next.tokens[clean(role)] = {
    token: clean(token),
    scopes: Array.isArray(scopes) ? scopes.map((scope) => clean(scope)).filter(Boolean) : [],
    updatedAtMs: Date.now()
  }
  writeJson(filePath, next)
}

function clearDeviceToken(stateDir, {
  deviceId,
  role
}) {
  const filePath = authStorePath(stateDir)
  const existing = readJson(filePath)
  if (existing?.version !== 1 || clean(existing.deviceId) !== clean(deviceId)) {
    return
  }
  if (!existing.tokens || typeof existing.tokens !== 'object') {
    return
  }
  delete existing.tokens[clean(role)]
  writeJson(filePath, existing)
}

function resolveDefaultConfigPath() {
  return path.join(os.homedir(), '.openclaw', 'openclaw.json')
}

function readGatewayAuthFromConfig(configPath) {
  const config = readJson(configPath)
  const auth = config?.gateway?.auth
  if (!auth || typeof auth !== 'object') {
    return { mode: '', token: '', password: '' }
  }
  return {
    mode: clean(auth.mode),
    token: typeof auth.token === 'string' ? auth.token : '',
    password: typeof auth.password === 'string' ? auth.password : ''
  }
}

function parseGatewayStatusJson(payload) {
  const gatewayUrl = clean(payload?.rpc?.url || payload?.gateway?.probeUrl || payload?.gateway?.url)
  const configPath = clean(payload?.config?.daemon?.path || payload?.config?.cli?.path)
  return {
    gatewayUrl,
    configPath
  }
}

function runProcess(command, args, {
  cwd = '',
  timeoutMs = 10000
} = {}) {
  const normalizedCommand = clean(command) || 'openclaw'
  return new Promise((resolve, reject) => {
    const child = spawn(normalizedCommand, args, {
      cwd: clean(cwd) || undefined,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) {
        return
      }
      settled = true
      child.kill('SIGTERM')
      reject(new Error(`${normalizedCommand} ${args.join(' ')} timed out after ${timeoutMs}ms`))
    }, Math.max(1000, timeoutMs))

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      if (code !== 0) {
        reject(new Error(clean(stderr) || `${normalizedCommand} ${args.join(' ')} exited with status ${code}`))
        return
      }
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim()
      })
    })
  })
}

async function discoverGatewayBootstrap(command, cwd) {
  try {
    const result = await runProcess(command, ['gateway', 'status', '--json'], {
      cwd,
      timeoutMs: 15000
    })
    return parseGatewayStatusJson(parseJson(result.stdout, 'OpenClaw gateway status'))
  } catch {
    return {
      gatewayUrl: '',
      configPath: ''
    }
  }
}

async function resolveGatewayBootstrap({
  command = 'openclaw',
  cwd = '',
  gatewayUrl = '',
  gatewayToken = '',
  gatewayPassword = ''
} = {}) {
  const discovered = await discoverGatewayBootstrap(command, cwd)
  const configPath = clean(discovered.configPath) || resolveDefaultConfigPath()
  const authFromConfig = readGatewayAuthFromConfig(configPath)
  return {
    gatewayUrl: clean(gatewayUrl) || clean(discovered.gatewayUrl) || DEFAULT_GATEWAY_URL,
    gatewayToken: clean(gatewayToken) || clean(process.env.OPENCLAW_GATEWAY_TOKEN) || authFromConfig.token,
    gatewayPassword: clean(gatewayPassword) || clean(process.env.OPENCLAW_GATEWAY_PASSWORD) || authFromConfig.password,
    authMode: authFromConfig.mode,
    configPath
  }
}

function isGatewayRequestError(error, code) {
  return clean(error?.detailCode || error?.details?.code).toUpperCase() === clean(code).toUpperCase()
}

function toRequestError(error) {
  const details = error?.details && typeof error.details === 'object' ? error.details : {}
  const requestId = clean(details.requestId)
  const detailCode = clean(details.code)
  const reason = clean(error?.message) || 'gateway request failed'
  const next = new Error(reason)
  next.details = details
  next.detailCode = detailCode
  next.requestId = requestId
  return next
}

async function approveLatestPairing({
  command = 'openclaw',
  cwd = '',
  gatewayUrl = '',
  gatewayToken = '',
  gatewayPassword = ''
} = {}) {
  const args = ['devices', 'approve', '--latest', '--json']
  if (clean(gatewayUrl)) {
    args.push('--url', clean(gatewayUrl))
    if (clean(gatewayToken)) {
      args.push('--token', clean(gatewayToken))
    }
    if (clean(gatewayPassword)) {
      args.push('--password', clean(gatewayPassword))
    }
  }
  const result = await runProcess(command, args, {
    cwd,
    timeoutMs: 20000
  })
  return result.stdout ? parseJson(result.stdout, 'OpenClaw devices approve response') : {}
}

class OpenClawGatewayWsSession {
  constructor({
    url,
    gatewayToken = '',
    gatewayPassword = '',
    stateDir,
    clientId = DEFAULT_CLIENT_ID,
    clientVersion = 'agentsquared',
    clientMode = DEFAULT_CLIENT_MODE,
    role = DEFAULT_ROLE,
    scopes = DEFAULT_SCOPES,
    connectTimeoutMs = DEFAULT_CONNECT_TIMEOUT_MS,
    requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    deviceFamily = DEFAULT_DEVICE_FAMILY
  }) {
    this.url = clean(url) || DEFAULT_GATEWAY_URL
    this.gatewayToken = clean(gatewayToken)
    this.gatewayPassword = clean(gatewayPassword)
    this.stateDir = stateDir
    this.clientId = clean(clientId) || DEFAULT_CLIENT_ID
    this.clientVersion = clean(clientVersion) || 'agentsquared'
    this.clientMode = clean(clientMode) || DEFAULT_CLIENT_MODE
    this.role = clean(role) || DEFAULT_ROLE
    this.scopes = Array.isArray(scopes) ? scopes.map((scope) => clean(scope)).filter(Boolean) : [...DEFAULT_SCOPES]
    this.connectTimeoutMs = Math.max(1000, connectTimeoutMs)
    this.requestTimeoutMs = Math.max(1000, requestTimeoutMs)
    this.deviceFamily = clean(deviceFamily) || DEFAULT_DEVICE_FAMILY
    this.identity = loadOrCreateDeviceIdentity(identityPath(stateDir))
    this.ws = null
    this.pending = new Map()
    this.connected = false
    this.connectionPromise = null
    this.connectChallengeNonce = ''
    this.connectChallengeError = null
    this.connectChallengeResolve = null
    this.connectChallengeReject = null
  }

  async connect() {
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
      return
    }
    if (this.connectionPromise) {
      return this.connectionPromise
    }
    this.connectionPromise = this.#connectInternal()
    try {
      await this.connectionPromise
    } finally {
      this.connectionPromise = null
    }
  }

  async #connectInternal() {
    const ws = new WebSocket(this.url)
    this.ws = ws
    ws.on('message', (chunk) => this.#handleMessage(chunk.toString()))
    ws.on('close', (code, reasonBuffer) => {
      this.connected = false
      const reason = Buffer.isBuffer(reasonBuffer) ? reasonBuffer.toString('utf8') : `${reasonBuffer ?? ''}`
      if (this.pending.size === 0) {
        return
      }
      const error = new Error(`OpenClaw gateway closed (${code}): ${clean(reason) || 'no close reason'}`)
      for (const [id, pending] of this.pending.entries()) {
        clearTimeout(pending.timer)
        pending.reject(error)
        this.pending.delete(id)
      }
    })

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`OpenClaw gateway open timed out after ${this.connectTimeoutMs}ms`))
      }, this.connectTimeoutMs)
      ws.once('open', () => {
        clearTimeout(timer)
        resolve(true)
      })
      ws.once('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
    })

    const nonce = await this.#waitForConnectChallenge()
    const connectId = randomId()
    const connectParams = this.#buildConnectParams(nonce)
    const hello = await this.#sendRequest(connectId, 'connect', connectParams, this.connectTimeoutMs)
    this.connected = true
    const issuedDeviceToken = clean(hello?.auth?.deviceToken)
    if (issuedDeviceToken) {
      storeDeviceToken(this.stateDir, {
        deviceId: this.identity.deviceId,
        role: clean(hello?.auth?.role) || this.role,
        token: issuedDeviceToken,
        scopes: Array.isArray(hello?.auth?.scopes) ? hello.auth.scopes : this.scopes
      })
    }
  }

  async #waitForConnectChallenge() {
    if (clean(this.connectChallengeNonce)) {
      const nonce = this.connectChallengeNonce
      this.connectChallengeNonce = ''
      return nonce
    }
    if (this.connectChallengeError) {
      const error = this.connectChallengeError
      this.connectChallengeError = null
      throw error
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`OpenClaw connect challenge timed out after ${this.connectTimeoutMs}ms`))
      }, this.connectTimeoutMs)
      this.connectChallengeResolve = (nonce) => {
        clearTimeout(timer)
        resolve(nonce)
      }
      this.connectChallengeReject = (error) => {
        clearTimeout(timer)
        reject(error)
      }
    })
  }

  #selectAuth() {
    const storedToken = loadStoredDeviceToken(this.stateDir, {
      deviceId: this.identity.deviceId,
      role: this.role
    })
    if (clean(storedToken?.token) && !this.gatewayPassword) {
      return {
        authToken: this.gatewayToken || clean(storedToken.token),
        authDeviceToken: this.gatewayToken ? clean(storedToken.token) : '',
        signatureToken: this.gatewayToken || clean(storedToken.token),
        usingStoredDeviceToken: true
      }
    }
    return {
      authToken: this.gatewayToken,
      authDeviceToken: '',
      authPassword: this.gatewayPassword,
      signatureToken: this.gatewayToken,
      usingStoredDeviceToken: false
    }
  }

  #buildConnectParams(nonce) {
    const selected = this.#selectAuth()
    const signedAtMs = Date.now()
    const payload = buildDeviceAuthPayloadV3({
      deviceId: this.identity.deviceId,
      clientId: this.clientId,
      clientMode: this.clientMode,
      role: this.role,
      scopes: this.scopes,
      signedAtMs,
      token: selected.signatureToken || null,
      nonce,
      platform: process.platform,
      deviceFamily: this.deviceFamily
    })
    return {
      minProtocol: PROTOCOL_VERSION,
      maxProtocol: PROTOCOL_VERSION,
      client: {
        id: this.clientId,
        version: this.clientVersion,
        platform: process.platform,
        deviceFamily: this.deviceFamily,
        mode: this.clientMode
      },
      role: this.role,
      scopes: this.scopes,
      caps: [],
      commands: [],
      auth: (selected.authToken || selected.authDeviceToken || selected.authPassword)
        ? {
            token: selected.authToken || undefined,
            deviceToken: selected.authDeviceToken || undefined,
            password: selected.authPassword || undefined
          }
        : undefined,
      device: {
        id: this.identity.deviceId,
        publicKey: publicKeyRawBase64UrlFromPem(this.identity.publicKeyPem),
        signature: signDevicePayload(this.identity.privateKeyPem, payload),
        signedAt: signedAtMs,
        nonce
      }
    }
  }

  #handleMessage(raw) {
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      return
    }
    if (parsed?.type === 'event' && parsed.event === 'connect.challenge') {
      const nonce = clean(parsed?.payload?.nonce)
      if (!nonce) {
        const error = new Error('OpenClaw gateway connect challenge was missing a nonce.')
        if (this.connectChallengeReject) {
          this.connectChallengeReject(error)
        } else {
          this.connectChallengeError = error
        }
        return
      }
      if (this.connectChallengeResolve) {
        this.connectChallengeResolve(nonce)
        this.connectChallengeResolve = null
        this.connectChallengeReject = null
      } else {
        this.connectChallengeNonce = nonce
      }
      return
    }
    if (parsed?.type === 'res' && clean(parsed.id)) {
      const pending = this.pending.get(clean(parsed.id))
      if (!pending) {
        return
      }
      clearTimeout(pending.timer)
      this.pending.delete(clean(parsed.id))
      if (parsed.ok) {
        pending.resolve(parsed.payload ?? null)
        return
      }
      pending.reject(toRequestError(parsed.error ?? { message: 'OpenClaw request failed' }))
    }
  }

  async #sendRequest(id, method, params, timeoutMs) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('OpenClaw gateway socket is not open.')
    }
    const result = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`OpenClaw ${method} timed out after ${timeoutMs}ms`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      this.ws.send(JSON.stringify({
        type: 'req',
        id,
        method,
        params
      }))
    })
    return result
  }

  async request(method, params = {}, timeoutMs = this.requestTimeoutMs) {
    await this.connect()
    return this.#sendRequest(randomId(), clean(method), params, timeoutMs)
  }

  async close() {
    const ws = this.ws
    this.ws = null
    this.connected = false
    if (!ws) {
      return
    }
    await new Promise((resolve) => {
      if (ws.readyState === WebSocket.CLOSED) {
        resolve(true)
        return
      }
      const timer = setTimeout(() => {
        try {
          ws.terminate()
        } catch {
          // ignore
        }
        resolve(true)
      }, 500)
      ws.once('close', () => {
        clearTimeout(timer)
        resolve(true)
      })
      try {
        ws.close(1000, 'normal closure')
      } catch {
        clearTimeout(timer)
        resolve(true)
      }
    })
  }
}

export async function withOpenClawGatewayClient(options, fn) {
  const bootstrap = await resolveGatewayBootstrap(options)
  const stateDir = clean(options?.stateDir) || path.join(os.homedir(), '.agentsquared')
  const clientOptions = {
    url: clean(bootstrap.gatewayUrl) || DEFAULT_GATEWAY_URL,
    gatewayToken: clean(bootstrap.gatewayToken),
    gatewayPassword: clean(bootstrap.gatewayPassword),
    stateDir,
    connectTimeoutMs: options?.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
    requestTimeoutMs: options?.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
  }

  const tryConnect = async () => {
    const client = new OpenClawGatewayWsSession(clientOptions)
    await client.connect()
    return client
  }

  let client
  try {
    client = await tryConnect()
  } catch (error) {
    if (!isGatewayRequestError(error, 'PAIRING_REQUIRED')) {
      throw error
    }
    await approveLatestPairing({
      command: options?.command,
      cwd: options?.cwd,
      gatewayUrl: clean(bootstrap.gatewayUrl),
      gatewayToken: clean(bootstrap.gatewayToken),
      gatewayPassword: clean(bootstrap.gatewayPassword)
    })
    client = await tryConnect()
  }

  try {
    return await fn(client, {
      gatewayUrl: clean(bootstrap.gatewayUrl),
      configPath: clean(bootstrap.configPath),
      authMode: clean(bootstrap.authMode)
    })
  } finally {
    await client.close()
  }
}
