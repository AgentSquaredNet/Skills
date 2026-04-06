import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { parseOpenClawJson, runOpenClawCli } from './cli.mjs'

function clean(value) {
  return `${value ?? ''}`.trim()
}

function readJson(filePath = '') {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeAgentEntries(value) {
  return asArray(value)
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      ...item,
      resolvedId: clean(item?.id || item?.agentId || item?.name),
      resolvedWorkspaceDir: clean(item?.workspaceDir || item?.workspace || item?.agentDir),
      isDefault: Boolean(item?.isDefault || item?.default)
    }))
    .filter((item) => item.resolvedId || item.resolvedWorkspaceDir)
}

function defaultOpenClawConfigPath() {
  return path.join(os.homedir(), '.openclaw', 'openclaw.json')
}

function summarizeConfig(configPath = '') {
  const resolvedPath = clean(configPath) || defaultOpenClawConfigPath()
  const config = readJson(resolvedPath)
  if (!config || typeof config !== 'object') {
    return {
      exists: false,
      path: resolvedPath,
      defaultAgentId: '',
      workspaceDir: '',
      agents: []
    }
  }
  const agents = normalizeAgentEntries(config?.agents?.list)
  const defaultAgent = agents.find((entry) => entry.isDefault) ?? agents[0] ?? null
  return {
    exists: true,
    path: resolvedPath,
    defaultAgentId: clean(defaultAgent?.resolvedId) || 'main',
    workspaceDir: clean(defaultAgent?.resolvedWorkspaceDir || config?.agents?.defaults?.workspace),
    agents
  }
}

function extractOpenClawAgentInfo(payload = null) {
  const root = payload && typeof payload === 'object' ? payload : {}
  const container = root?.agents && typeof root.agents === 'object' ? root.agents : root
  const nestedAgents = normalizeAgentEntries(container?.agents)
  const directAgents = normalizeAgentEntries(container)
  const agents = nestedAgents.length > 0 ? nestedAgents : directAgents
  const defaultId = clean(
    container?.defaultId
      || container?.defaultAgentId
      || root?.defaultId
      || root?.defaultAgentId
  )
  const defaultAgent = agents.find((entry) => entry.resolvedId === defaultId)
    ?? agents.find((entry) => entry.isDefault)
    ?? agents[0]
    ?? null
  return {
    defaultAgentId: defaultId || clean(defaultAgent?.resolvedId),
    workspaceDir: clean(defaultAgent?.resolvedWorkspaceDir),
    agents
  }
}

export function resolveOpenClawAgentSelection(detectedHostRuntime = null) {
  const overview = extractOpenClawAgentInfo(detectedHostRuntime?.overviewStatus)
  const gatewayHealth = extractOpenClawAgentInfo(detectedHostRuntime?.gatewayHealth)
  const configSummary = detectedHostRuntime?.configSummary && typeof detectedHostRuntime.configSummary === 'object'
    ? detectedHostRuntime.configSummary
    : summarizeConfig(clean(detectedHostRuntime?.configPath))
  const defaultAgentId = clean(
    overview.defaultAgentId
      || gatewayHealth.defaultAgentId
      || configSummary.defaultAgentId
  )
  const workspaceDir = clean(
    overview.workspaceDir
      || gatewayHealth.workspaceDir
      || configSummary.workspaceDir
  )
  return {
    defaultAgentId,
    workspaceDir,
    configSummary
  }
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
  const gatewayStatus = await runProbe(command, statusArgs, { cwd, timeoutMs: 10000 })
  const gatewayStatusJson = parseOpenClawJson(gatewayStatus.stdout)
  const configPath = clean(
    gatewayStatusJson?.config?.daemon?.path
      || gatewayStatusJson?.config?.cli?.path
      || defaultOpenClawConfigPath()
  )
  const configSummary = summarizeConfig(configPath)
  const selection = resolveOpenClawAgentSelection({
    overviewStatus: statusJson,
    gatewayStatus: gatewayStatusJson,
    configSummary,
    configPath
  })
  const workspaceDir = clean(selection.workspaceDir)
  if (gatewayStatus.ok && gatewayStatusJson) {
    return {
      id: 'openclaw',
      detected: true,
      confidence: 'high',
      reason: 'openclaw-gateway-status-json',
      gatewayStatus: gatewayStatusJson,
      overviewStatus: statusJson,
      configSummary,
      configPath,
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
      configSummary,
      configPath,
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
      configSummary,
      configPath,
      workspaceDir
    }
  }

  if (configSummary.exists) {
    return {
      id: 'openclaw',
      detected: true,
      confidence: 'low',
      reason: 'openclaw-config-present',
      overviewStatus: statusJson,
      gatewayStatus: gatewayStatusJson,
      configSummary,
      configPath,
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
