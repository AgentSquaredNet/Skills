import fs from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const SKILLS_ROOT = path.resolve(__dirname, '..')

function clean(value) {
  return `${value ?? ''}`.trim()
}

function fileExists(targetPath = '') {
  return Boolean(targetPath) && fs.existsSync(targetPath)
}

function isNodeScript(targetPath = '') {
  return /\.(mjs|cjs|js)$/i.test(clean(targetPath))
}

function commandOnPath(command = '') {
  const normalized = clean(command)
  if (!normalized) {
    return ''
  }
  const result = spawnSync('which', [normalized], {
    encoding: 'utf8'
  })
  return result.status === 0 ? clean(result.stdout) : ''
}

function toInvocation(target, mode) {
  if (mode === 'node-script') {
    return {
      mode,
      resolved: target,
      command: process.execPath,
      baseArgs: [target]
    }
  }
  return {
    mode,
    resolved: target,
    command: target,
    baseArgs: []
  }
}

export function resolveA2CliInvocation() {
  const envBin = clean(process.env.AGENTSQUARED_CLI_BIN)
  if (fileExists(envBin)) {
    return toInvocation(envBin, isNodeScript(envBin) ? 'env-script' : 'env-binary')
  }

  const localBin = path.join(SKILLS_ROOT, 'node_modules', '.bin', 'a2_cli')
  if (fileExists(localBin)) {
    return toInvocation(localBin, 'local-binary')
  }

  const siblingScript = path.resolve(SKILLS_ROOT, '..', 'agentsquared-cli', 'bin', 'a2_cli.js')
  if (fileExists(siblingScript)) {
    return toInvocation(siblingScript, 'sibling-script')
  }

  const globalCommand = commandOnPath('a2_cli')
  if (globalCommand) {
    return toInvocation('a2_cli', 'global-command')
  }

  throw new Error(
    'Unable to resolve `a2_cli`. Install or expose the AgentSquared CLI runtime first, or set AGENTSQUARED_CLI_BIN.'
  )
}

export function spawnA2Cli(argv = [], options = {}) {
  const invocation = resolveA2CliInvocation()
  return {
    invocation,
    child: spawn(invocation.command, [...invocation.baseArgs, ...argv], {
      cwd: options.cwd || SKILLS_ROOT,
      stdio: options.stdio || 'inherit',
      env: {
        ...process.env,
        ...(options.env || {})
      }
    })
  }
}

export function execA2Cli(argv = [], options = {}) {
  return new Promise((resolve, reject) => {
    const invocation = resolveA2CliInvocation()
    const child = spawn(invocation.command, [...invocation.baseArgs, ...argv], {
      cwd: options.cwd || SKILLS_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...(options.env || {})
      }
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', reject)
    child.on('close', (code, signal) => {
      resolve({
        code: typeof code === 'number' ? code : 1,
        signal: clean(signal),
        stdout,
        stderr,
        invocation
      })
    })
  })
}
