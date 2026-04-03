import { spawn } from 'node:child_process'

function clean(value) {
  return `${value ?? ''}`.trim()
}

export function parseOpenClawJson(text) {
  const trimmed = clean(text)
  if (!trimmed) {
    return null
  }
  try {
    return JSON.parse(trimmed)
  } catch {
    const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const candidate = lines.slice(index).join('\n')
      try {
        return JSON.parse(candidate)
      } catch {
        // keep scanning upward for the first trailing valid JSON payload
      }
    }
    return null
  }
}

export function openClawCliEnv(baseEnv = process.env) {
  return {
    ...baseEnv,
    OPENCLAW_LOG_LEVEL: 'error'
  }
}

export function runOpenClawCli(command, args, {
  cwd = '',
  timeoutMs = 10000,
  env = process.env
} = {}) {
  const normalizedCommand = clean(command) || 'openclaw'
  return new Promise((resolve, reject) => {
    const child = spawn(normalizedCommand, args, {
      cwd: clean(cwd) || undefined,
      env: openClawCliEnv(env),
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
    }, Math.max(500, timeoutMs))

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
