import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { resolveOpenClawGatewayBootstrap, withOpenClawGatewayClient } from './ws_client.mjs'

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
  const agentsList = extractOpenClawAgentInfo(detectedHostRuntime?.agentsList)
  const overview = extractOpenClawAgentInfo(detectedHostRuntime?.overviewStatus)
  const gatewayHealth = extractOpenClawAgentInfo(detectedHostRuntime?.gatewayHealth)
  const configSummary = detectedHostRuntime?.configSummary && typeof detectedHostRuntime.configSummary === 'object'
    ? detectedHostRuntime.configSummary
    : summarizeConfig(clean(detectedHostRuntime?.configPath))
  const defaultAgentId = clean(
    agentsList.defaultAgentId
      || overview.defaultAgentId
      || gatewayHealth.defaultAgentId
      || configSummary.defaultAgentId
  )
  const workspaceDir = clean(
    agentsList.workspaceDir
      || overview.workspaceDir
      || gatewayHealth.workspaceDir
      || configSummary.workspaceDir
  )
  return {
    defaultAgentId,
    workspaceDir,
    configSummary
  }
}

async function requestProbe(client, method, params = {}, timeoutMs = 10000) {
  try {
    const payload = await client.request(method, params, timeoutMs)
    return {
      ok: true,
      reason: 'ok',
      payload
    }
  } catch (error) {
    const message = clean(error?.message)
    return {
      ok: false,
      reason: message.includes('timed out after') ? 'timeout' : (message || 'request-error'),
      error: message
    }
  }
}

async function probeOpenClawGatewayWs(options = {}) {
  try {
    return await withOpenClawGatewayClient({
      ...options,
      pairingStrategy: 'none',
      connectTimeoutMs: 10000,
      requestTimeoutMs: 10000
    }, async (client, bootstrap) => {
      const [health, agentsList, status] = await Promise.all([
        requestProbe(client, 'health'),
        requestProbe(client, 'agents.list'),
        requestProbe(client, 'status')
      ])
      return {
        ok: health.ok || agentsList.ok || status.ok,
        bootstrap,
        health,
        agentsList,
        status
      }
    })
  } catch (error) {
    return {
      ok: false,
      error: clean(error?.message) || 'gateway-connect-error'
    }
  }
}

export async function detectOpenClawHostEnvironment({
  configPath = '',
  gatewayUrl = '',
  gatewayToken = '',
  gatewayPassword = ''
} = {}) {
  const bootstrap = await resolveOpenClawGatewayBootstrap({
    configPath,
    gatewayUrl,
    gatewayToken,
    gatewayPassword
  })
  const resolvedConfigPath = clean(bootstrap.configPath) || defaultOpenClawConfigPath()
  const configSummary = summarizeConfig(resolvedConfigPath)
  const wsProbe = await probeOpenClawGatewayWs({
    gatewayUrl: clean(bootstrap.gatewayUrl),
    gatewayToken: clean(bootstrap.gatewayToken),
    gatewayPassword: clean(bootstrap.gatewayPassword)
  })
  const agentsListPayload = wsProbe?.agentsList?.ok ? wsProbe.agentsList.payload : null
  const statusPayload = wsProbe?.status?.ok ? wsProbe.status.payload : null
  const healthPayload = wsProbe?.health?.ok ? wsProbe.health.payload : null
  const selection = resolveOpenClawAgentSelection({
    agentsList: agentsListPayload,
    overviewStatus: statusPayload,
    gatewayHealth: healthPayload,
    configSummary,
    configPath: resolvedConfigPath
  })
  const workspaceDir = clean(selection.workspaceDir)
  if (wsProbe?.agentsList?.ok && agentsListPayload) {
    return {
      id: 'openclaw',
      detected: true,
      confidence: 'high',
      reason: 'openclaw-ws-agents-list',
      agentsList: agentsListPayload,
      overviewStatus: statusPayload,
      gatewayHealth: healthPayload,
      configSummary,
      configPath: resolvedConfigPath,
      gatewayBootstrap: wsProbe.bootstrap || bootstrap,
      workspaceDir,
      rpcHealthy: true
    }
  }

  if (wsProbe?.status?.ok && statusPayload) {
    return {
      id: 'openclaw',
      detected: true,
      confidence: 'medium',
      reason: 'openclaw-ws-status',
      overviewStatus: statusPayload,
      gatewayHealth: healthPayload,
      configSummary,
      configPath: resolvedConfigPath,
      gatewayBootstrap: wsProbe.bootstrap || bootstrap,
      workspaceDir
    }
  }

  if (wsProbe?.health?.ok && healthPayload) {
    return {
      id: 'openclaw',
      detected: true,
      confidence: 'low',
      reason: 'openclaw-ws-health',
      gatewayHealth: healthPayload,
      overviewStatus: statusPayload,
      configSummary,
      configPath: resolvedConfigPath,
      gatewayBootstrap: wsProbe.bootstrap || bootstrap,
      workspaceDir
    }
  }

  if (configSummary.exists) {
    return {
      id: 'openclaw',
      detected: true,
      confidence: 'low',
      reason: 'openclaw-config-present',
      overviewStatus: statusPayload,
      gatewayHealth: healthPayload,
      agentsList: agentsListPayload,
      configSummary,
      configPath: resolvedConfigPath,
      gatewayBootstrap: bootstrap,
      gatewayProbeError: clean(wsProbe?.error || wsProbe?.agentsList?.error || wsProbe?.status?.error || wsProbe?.health?.error),
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
