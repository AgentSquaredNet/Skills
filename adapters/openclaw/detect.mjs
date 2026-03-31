import { spawn } from 'node:child_process'

function clean(value) {
  return `${value ?? ''}`.trim()
}

function parseJson(text) {
  const trimmed = clean(text)
  if (!trimmed) {
    return null
  }
  try {
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

function runProbe(command, args, {
  cwd = '',
  timeoutMs = 3000
} = {}) {
  const normalizedCommand = clean(command) || 'openclaw'
  return new Promise((resolve) => {
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
      resolve({ ok: false, reason: 'timeout', stdout, stderr })
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
      resolve({ ok: false, reason: clean(error?.message) || 'spawn-error', stdout, stderr })
    })
    child.on('close', (code) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      resolve({
        ok: code === 0,
        reason: code === 0 ? 'ok' : `exit-${code}`,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      })
    })
  })
}

export async function detectOpenClawHostEnvironment({
  command = 'openclaw',
  cwd = '',
  gatewayUrl = '',
  gatewayToken = '',
  gatewayPassword = ''
} = {}) {
  // Prefer the official OpenClaw machine-readable status probes:
  // `openclaw gateway status --json`, `openclaw status --json`,
  // and `openclaw gateway health --json`.
  const statusArgs = ['gateway', 'status', '--json']
  if (clean(gatewayUrl)) {
    statusArgs.push('--url', clean(gatewayUrl))
  }
  if (clean(gatewayToken)) {
    statusArgs.push('--token', clean(gatewayToken))
  }
  if (clean(gatewayPassword)) {
    statusArgs.push('--password', clean(gatewayPassword))
  }
  const gatewayStatus = await runProbe(command, statusArgs, { cwd, timeoutMs: 10000 })
  const gatewayStatusJson = parseJson(gatewayStatus.stdout)
  if (gatewayStatus.ok && gatewayStatusJson) {
    return {
      id: 'openclaw',
      detected: true,
      confidence: 'high',
      reason: 'openclaw-gateway-status-json',
      gatewayStatus: gatewayStatusJson,
      rpcHealthy: Boolean(gatewayStatusJson?.rpc?.ok || gatewayStatusJson?.rpcOk),
      serviceInstalled: gatewayStatusJson?.service?.installed ?? gatewayStatusJson?.installed ?? null,
      serviceRunning: gatewayStatusJson?.service?.running ?? gatewayStatusJson?.running ?? null
    }
  }

  const status = await runProbe(command, ['status', '--json'], { cwd, timeoutMs: 10000 })
  const statusJson = parseJson(status.stdout)
  if (status.ok && statusJson) {
    return {
      id: 'openclaw',
      detected: true,
      confidence: 'medium',
      reason: 'openclaw-status-json',
      overviewStatus: statusJson
    }
  }

  const healthArgs = ['gateway', 'health', '--json']
  if (clean(gatewayUrl)) {
    healthArgs.push('--url', clean(gatewayUrl))
  }
  if (clean(gatewayToken)) {
    healthArgs.push('--token', clean(gatewayToken))
  }
  if (clean(gatewayPassword)) {
    healthArgs.push('--password', clean(gatewayPassword))
  }
  const gatewayHealth = await runProbe(command, healthArgs, { cwd, timeoutMs: 10000 })
  const gatewayHealthJson = parseJson(gatewayHealth.stdout)
  if (gatewayHealth.ok && gatewayHealthJson) {
    return {
      id: 'openclaw',
      detected: true,
      confidence: 'low',
      reason: 'openclaw-gateway-health-json',
      gatewayHealth: gatewayHealthJson
    }
  }

  return {
    id: 'none',
    detected: false,
    confidence: 'low',
    reason: 'no-supported-host-runtime-detected',
    suggested: 'openclaw'
  }
}
