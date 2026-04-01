import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const RUNTIME_GATEWAY_ROOT = path.resolve(__dirname, '..')
const REVISION_FILE_PATHS = [
  path.join(RUNTIME_GATEWAY_ROOT, 'a2_cli.mjs'),
  path.join(RUNTIME_GATEWAY_ROOT, 'package.json'),
  path.join(RUNTIME_GATEWAY_ROOT, 'package-lock.json')
]
const REVISION_DIR_PATHS = [
  path.join(RUNTIME_GATEWAY_ROOT, 'lib'),
  path.join(RUNTIME_GATEWAY_ROOT, 'adapters'),
  path.join(RUNTIME_GATEWAY_ROOT, 'friend-skills')
]

function safeAgentId(agentId) {
  return `${agentId}`.replace(/[^a-zA-Z0-9_.-]+/g, '_')
}

export function defaultGatewayStateFile(keyFile, agentId) {
  if (!keyFile || !agentId) {
    throw new Error('keyFile and agentId are required to derive the gateway state file')
  }
  return path.join(path.dirname(path.resolve(keyFile)), `${safeAgentId(agentId)}_gateway.json`)
}

export function readGatewayState(gatewayStateFile) {
  const cleaned = path.resolve(gatewayStateFile)
  if (!fs.existsSync(cleaned)) {
    return null
  }
  return JSON.parse(fs.readFileSync(cleaned, 'utf8'))
}

export function writeGatewayState(gatewayStateFile, payload) {
  const cleaned = path.resolve(gatewayStateFile)
  fs.mkdirSync(path.dirname(cleaned), { recursive: true })
  fs.writeFileSync(cleaned, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 })
  fs.chmodSync(cleaned, 0o600)
}

function walkFiles(dirPath, out) {
  if (!fs.existsSync(dirPath)) {
    return
  }
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      walkFiles(entryPath, out)
      continue
    }
    if (!entry.isFile()) {
      continue
    }
    if (!['.mjs', '.json'].includes(path.extname(entry.name))) {
      continue
    }
    out.push(entryPath)
  }
}

function walkGatewayStateFiles(dirPath, out, depth = 0, maxDepth = 4) {
  if (!fs.existsSync(dirPath) || depth > maxDepth) {
    return
  }
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') {
        continue
      }
      walkGatewayStateFiles(entryPath, out, depth + 1, maxDepth)
      continue
    }
    if (!entry.isFile()) {
      continue
    }
    if (!entry.name.endsWith('_gateway.json')) {
      continue
    }
    out.push(entryPath)
  }
}

export function currentRuntimeRevision() {
  const hash = crypto.createHash('sha256')
  const files = []
  for (const filePath of REVISION_FILE_PATHS) {
    if (fs.existsSync(filePath)) {
      files.push(filePath)
    }
  }
  for (const dirPath of REVISION_DIR_PATHS) {
    walkFiles(dirPath, files)
  }
  files.sort()
  for (const filePath of files) {
    hash.update(path.relative(RUNTIME_GATEWAY_ROOT, filePath))
    hash.update('\n')
    hash.update(fs.readFileSync(filePath))
    hash.update('\n')
  }
  return hash.digest('hex').slice(0, 16)
}

function buildInitRequiredMessage({ stateFile, currentRevision, expectedRevision, reason }) {
  const parts = [
    'The local AgentSquared gateway must be re-initialized before reuse.',
    reason,
    `gatewayStateFile=${stateFile}`,
    `expectedRuntimeRevision=${expectedRevision}`,
    `stateRuntimeRevision=${currentRevision || 'missing'}`,
    'Restart the shared gateway from the current Skills checkout with `node a2_cli.mjs gateway --agent-id <fullName> --key-file <runtime-key-file>` and then retry the current task.'
  ]
  return parts.join(' ')
}

export function assertGatewayStateFresh(state, stateFile) {
  const expectedRevision = currentRuntimeRevision()
  const currentRevision = `${state?.runtimeRevision ?? ''}`.trim()
  if (!state) {
    return { expectedRevision, currentRevision: '', stale: false }
  }
  if (!currentRevision) {
    throw new Error(buildInitRequiredMessage({
      stateFile,
      currentRevision,
      expectedRevision,
      reason: 'The discovered gateway state was written by an older runtime that does not record runtimeRevision metadata.'
    }))
  }
  if (currentRevision !== expectedRevision) {
    throw new Error(buildInitRequiredMessage({
      stateFile,
      currentRevision,
      expectedRevision,
      reason: 'The discovered gateway was started from older shared runtime code than the current official Skills checkout.'
    }))
  }
  return { expectedRevision, currentRevision, stale: false }
}

export function resolveGatewayBase({ gatewayBase = '', keyFile = '', agentId = '', gatewayStateFile = '' } = {}) {
  const explicit = `${gatewayBase}`.trim()
  if (explicit) {
    return explicit
  }
  const envValue = `${process.env.AGENTSQUARED_GATEWAY_BASE ?? ''}`.trim()
  if (envValue) {
    return envValue
  }
  const stateFile = `${gatewayStateFile}`.trim() || (keyFile && agentId ? defaultGatewayStateFile(keyFile, agentId) : '')
  if (!stateFile) {
    throw new Error('gatewayBase was not provided. Pass --gateway-base or provide --agent-id and --key-file so the local gateway state file can be discovered.')
  }
  const state = readGatewayState(stateFile)
  assertGatewayStateFresh(state, stateFile)
  const discovered = `${state?.gatewayBase ?? ''}`.trim()
  if (!discovered) {
    throw new Error(`gateway state file does not contain a gatewayBase: ${stateFile}`)
  }
  return discovered
}

export function discoverGatewayStateFiles(searchRoots = []) {
  const files = []
  const seen = new Set()
  for (const root of searchRoots) {
    const resolved = `${root ?? ''}`.trim() ? path.resolve(root) : ''
    if (!resolved || seen.has(resolved)) {
      continue
    }
    seen.add(resolved)
    walkGatewayStateFiles(resolved, files)
  }
  return Array.from(new Set(files)).sort()
}
