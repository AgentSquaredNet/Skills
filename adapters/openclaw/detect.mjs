import { parseOpenClawJson, runOpenClawCli } from './cli.mjs'

function clean(value) {
  return `${value ?? ''}`.trim()
}

function runProbe(command, args, {
  cwd = '',
  timeoutMs = 3000
} = {}) {
  return runOpenClawCli(command, args, { cwd, timeoutMs })
    .then((result) => ({
      ok: true,
      reason: 'ok',
      stdout: result.stdout,
      stderr: result.stderr
    }))
    .catch((error) => {
      const message = clean(error?.message)
      if (message.includes('timed out after')) {
        return { ok: false, reason: 'timeout', stdout: '', stderr: message }
      }
      return { ok: false, reason: message || 'spawn-error', stdout: '', stderr: message }
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
  const status = await runProbe(command, ['status', '--json'], { cwd, timeoutMs: 10000 })
  const statusJson = parseOpenClawJson(status.stdout)
  const workspaceDir = clean(
    statusJson?.agents?.agents?.find?.((item) => clean(item?.workspaceDir))?.workspaceDir
      ?? statusJson?.agents?.agents?.[0]?.workspaceDir
  )

  const gatewayStatus = await runProbe(command, statusArgs, { cwd, timeoutMs: 10000 })
  const gatewayStatusJson = parseOpenClawJson(gatewayStatus.stdout)
  if (gatewayStatus.ok && gatewayStatusJson) {
    return {
      id: 'openclaw',
      detected: true,
      confidence: 'high',
      reason: 'openclaw-gateway-status-json',
      gatewayStatus: gatewayStatusJson,
      overviewStatus: statusJson,
      workspaceDir,
      rpcHealthy: Boolean(gatewayStatusJson?.rpc?.ok || gatewayStatusJson?.rpcOk),
      serviceInstalled: gatewayStatusJson?.service?.installed ?? gatewayStatusJson?.installed ?? null,
      serviceRunning: gatewayStatusJson?.service?.running ?? gatewayStatusJson?.running ?? null
    }
  }

  if (status.ok && statusJson) {
    return {
      id: 'openclaw',
      detected: true,
      confidence: 'medium',
      reason: 'openclaw-status-json',
      overviewStatus: statusJson,
      workspaceDir
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
  const gatewayHealthJson = parseOpenClawJson(gatewayHealth.stdout)
  if (gatewayHealth.ok && gatewayHealthJson) {
    return {
      id: 'openclaw',
      detected: true,
      confidence: 'low',
      reason: 'openclaw-gateway-health-json',
      gatewayHealth: gatewayHealthJson,
      overviewStatus: statusJson,
      workspaceDir
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
