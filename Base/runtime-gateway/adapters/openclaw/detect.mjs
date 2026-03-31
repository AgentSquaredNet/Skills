import { spawn } from 'node:child_process'

function clean(value) {
  return `${value ?? ''}`.trim()
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
  openclawAgent = '',
  gatewayUrl = '',
  gatewayToken = '',
  gatewayPassword = '',
  env = process.env
} = {}) {
  if (clean(openclawAgent) || clean(env.OPENCLAW_AGENT)) {
    return {
      id: 'openclaw',
      detected: true,
      confidence: 'high',
      reason: 'openclaw-agent-configured'
    }
  }

  if (clean(gatewayUrl) || clean(env.OPENCLAW_GATEWAY_URL) || clean(gatewayToken) || clean(env.OPENCLAW_GATEWAY_TOKEN) || clean(gatewayPassword) || clean(env.OPENCLAW_GATEWAY_PASSWORD)) {
    return {
      id: 'openclaw',
      detected: true,
      confidence: 'high',
      reason: 'openclaw-gateway-configured'
    }
  }

  const gatewayHelp = await runProbe(command, ['gateway', '--help'], { cwd })
  if (gatewayHelp.ok) {
    return {
      id: 'openclaw',
      detected: true,
      confidence: 'medium',
      reason: 'openclaw-cli-gateway-subcommand-available'
    }
  }

  const agentHelp = await runProbe(command, ['agent', '--help'], { cwd })
  if (agentHelp.ok) {
    return {
      id: 'openclaw',
      detected: true,
      confidence: 'low',
      reason: 'openclaw-cli-agent-subcommand-available'
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
