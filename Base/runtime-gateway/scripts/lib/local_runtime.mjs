import { spawn } from 'node:child_process'

import { requestJson } from './http_json.mjs'
import { extractInboundText } from './agent_router.mjs'
import { createOpenClawAdapter } from './openclaw_adapter.mjs'

function clean(value) {
  return `${value ?? ''}`.trim()
}

function buildTextMessageResult(text, metadata = {}) {
  return {
    message: {
      kind: 'message',
      role: 'agent',
      parts: [{ kind: 'text', text: clean(text) }]
    },
    metadata
  }
}

function excerpt(text, maxLength = 180) {
  const compact = clean(text).replace(/\s+/g, ' ').trim()
  if (!compact) {
    return ''
  }
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 3)}...` : compact
}

function normalizePeerResponse(value, metadata = {}) {
  if (typeof value === 'string') {
    return buildTextMessageResult(value, metadata)
  }
  if (value && typeof value === 'object') {
    return {
      ...value,
      metadata: {
        ...(value.metadata ?? {}),
        ...metadata
      }
    }
  }
  return null
}

export function normalizeExecutionResult(raw, {
  selectedSkill,
  mailboxKey
} = {}) {
  const baseMetadata = {
    selectedSkill: clean(selectedSkill),
    mailboxKey: clean(mailboxKey)
  }

  if (typeof raw === 'string') {
    return {
      peerResponse: buildTextMessageResult(raw, baseMetadata),
      ownerReport: null
    }
  }

  if (!raw || typeof raw !== 'object') {
    throw new Error('local runtime executor returned an invalid result')
  }

  if (raw.reject && typeof raw.reject === 'object') {
    return {
      reject: {
        code: Number.parseInt(`${raw.reject.code ?? 500}`, 10) || 500,
        message: clean(raw.reject.message) || 'local runtime rejected the inbound request'
      }
    }
  }

  const directPeerResponse = normalizePeerResponse(raw.peerResponse, baseMetadata)
  if (directPeerResponse) {
    return {
      peerResponse: directPeerResponse,
      ownerReport: raw.ownerReport ?? null
    }
  }

  const shorthandPeerResponse = normalizePeerResponse(
    raw.message || raw.result || (raw.parts ? { message: raw } : null),
    baseMetadata
  )
  if (shorthandPeerResponse) {
    return {
      peerResponse: shorthandPeerResponse,
      ownerReport: raw.ownerReport ?? null
    }
  }

  throw new Error('local runtime executor did not provide peerResponse or reject')
}

function buildExecutorPayload({
  agentId,
  selectedSkill,
  mailboxKey,
  item
}) {
  return {
    type: 'agentsquared.inbound-execute',
    agentId,
    selectedSkill,
    mailboxKey,
    inbound: item
  }
}

function buildOwnerReportPayload({
  agentId,
  selectedSkill,
  mailboxKey,
  item,
  ownerReport
}) {
  return {
    type: 'agentsquared.owner-report',
    agentId,
    selectedSkill,
    mailboxKey,
    remoteAgentId: clean(item?.remoteAgentId),
    peerSessionId: clean(item?.peerSessionId),
    inboundId: clean(item?.inboundId),
    report: ownerReport
  }
}

async function runJsonCommand(command, payload) {
  const shell = process.env.SHELL || '/bin/sh'
  return new Promise((resolve, reject) => {
    const child = spawn(shell, ['-lc', command], {
      stdio: ['pipe', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(clean(stderr) || `command exited with status ${code}`))
        return
      }
      try {
        const trimmed = stdout.trim()
        resolve(trimmed ? JSON.parse(trimmed) : {})
      } catch (error) {
        reject(new Error(`command did not return valid JSON: ${error.message}`))
      }
    })

    child.stdin.write(JSON.stringify(payload))
    child.stdin.end()
  })
}

export function createLocalRuntimeExecutor({
  agentId,
  mode = 'reject',
  url = '',
  command = '',
  openclawCommand = 'openclaw',
  openclawCwd = '',
  openclawAgent = '',
  openclawSessionPrefix = 'agentsquared:peer:',
  openclawTimeoutMs = 180000,
  openclawOwnerChannel = '',
  openclawOwnerTarget = '',
  openclawOwnerThreadId = '',
  openclawGatewayUrl = '',
  openclawGatewayToken = '',
  openclawGatewayPassword = ''
} = {}) {
  const normalizedMode = clean(mode).toLowerCase() || 'reject'
  const normalizedUrl = clean(url)
  const normalizedCommand = clean(command)
  const openclawAdapter = normalizedMode === 'openclaw'
    ? createOpenClawAdapter({
        localAgentId: agentId,
        openclawAgent,
        command: openclawCommand,
        cwd: openclawCwd,
        sessionPrefix: openclawSessionPrefix,
        timeoutMs: openclawTimeoutMs,
        ownerChannel: openclawOwnerChannel,
        ownerTarget: openclawOwnerTarget,
        ownerThreadId: openclawOwnerThreadId,
        gatewayUrl: openclawGatewayUrl,
        gatewayToken: openclawGatewayToken,
        gatewayPassword: openclawGatewayPassword
      })
    : null

  async function executeViaHttp(context) {
    if (!normalizedUrl) {
      throw new Error('agent executor URL is required when --agent-executor-mode http is used')
    }
    const payload = buildExecutorPayload({
      agentId,
      selectedSkill: context.selectedSkill,
      mailboxKey: context.mailboxKey,
      item: context.item
    })
    return normalizeExecutionResult(
      await requestJson(normalizedUrl, { method: 'POST', payload }),
      context
    )
  }

  async function executeViaCommand(context) {
    if (!normalizedCommand) {
      throw new Error('agent executor command is required when --agent-executor-mode command is used')
    }
    const payload = buildExecutorPayload({
      agentId,
      selectedSkill: context.selectedSkill,
      mailboxKey: context.mailboxKey,
      item: context.item
    })
    return normalizeExecutionResult(
      await runJsonCommand(normalizedCommand, payload),
      context
    )
  }

  async function executeViaOpenClaw(context) {
    if (!openclawAdapter) {
      throw new Error('OpenClaw adapter was not configured')
    }
    return normalizeExecutionResult(
      await openclawAdapter.executeInbound(context),
      context
    )
  }

  async function rejectExecution() {
    return {
      reject: {
        code: 503,
        message: 'no local agent runtime adapter is configured; inbound request cannot be handled yet'
      }
    }
  }

  const execute = normalizedMode === 'http'
    ? executeViaHttp
    : normalizedMode === 'command'
      ? executeViaCommand
      : normalizedMode === 'openclaw'
        ? executeViaOpenClaw
        : rejectExecution

  execute.mode = normalizedMode
  execute.url = normalizedUrl
  execute.command = normalizedCommand
  return execute
}

export function createOwnerNotifier({
  agentId,
  mode = 'inbox',
  url = '',
  command = '',
  inbox = null,
  openclawCommand = 'openclaw',
  openclawCwd = '',
  openclawAgent = '',
  openclawSessionPrefix = 'agentsquared:peer:',
  openclawTimeoutMs = 180000,
  openclawOwnerChannel = '',
  openclawOwnerTarget = '',
  openclawOwnerThreadId = '',
  openclawGatewayUrl = '',
  openclawGatewayToken = '',
  openclawGatewayPassword = ''
} = {}) {
  const normalizedMode = clean(mode).toLowerCase() || 'inbox'
  const normalizedUrl = clean(url)
  const normalizedCommand = clean(command)
  const openclawAdapter = normalizedMode === 'openclaw'
    ? createOpenClawAdapter({
        localAgentId: agentId,
        openclawAgent,
        command: openclawCommand,
        cwd: openclawCwd,
        sessionPrefix: openclawSessionPrefix,
        timeoutMs: openclawTimeoutMs,
        ownerChannel: openclawOwnerChannel,
        ownerTarget: openclawOwnerTarget,
        ownerThreadId: openclawOwnerThreadId,
        gatewayUrl: openclawGatewayUrl,
        gatewayToken: openclawGatewayToken,
        gatewayPassword: openclawGatewayPassword
      })
    : null

  async function notifyViaHttp(context) {
    if (!normalizedUrl) {
      throw new Error('owner notify URL is required when --owner-notify-mode http is used')
    }
    return requestJson(normalizedUrl, {
      method: 'POST',
      payload: buildOwnerReportPayload({
        agentId,
        selectedSkill: context.selectedSkill,
        mailboxKey: context.mailboxKey,
        item: context.item,
        ownerReport: context.ownerReport
      })
    })
  }

  async function notifyViaCommand(context) {
    if (!normalizedCommand) {
      throw new Error('owner notify command is required when --owner-notify-mode command is used')
    }
    return runJsonCommand(normalizedCommand, buildOwnerReportPayload({
      agentId,
      selectedSkill: context.selectedSkill,
      mailboxKey: context.mailboxKey,
      item: context.item,
      ownerReport: context.ownerReport
    }))
  }

  async function notifyViaStdout(context) {
    console.log(JSON.stringify(buildOwnerReportPayload({
      agentId,
      selectedSkill: context.selectedSkill,
      mailboxKey: context.mailboxKey,
      item: context.item,
      ownerReport: context.ownerReport
    })))
    return { delivered: true, mode: 'stdout' }
  }

  async function noopNotify() {
    return { delivered: false, mode: 'none' }
  }

  async function notifyViaInbox(context) {
    if (!inbox?.appendEntry) {
      throw new Error('inbox store is required when --owner-notify-mode inbox is used')
    }
    const value = inbox.appendEntry({
      agentId,
      selectedSkill: context.selectedSkill,
      mailboxKey: context.mailboxKey,
      item: context.item,
      ownerReport: context.ownerReport,
      peerResponse: context.peerResponse ?? null,
      ownerDelivery: {
        mode: 'inbox',
        attempted: false,
        delivered: false,
        reason: 'audit-only'
      }
    })
    return {
      delivered: true,
      mode: 'inbox',
      entryId: value.entry.id,
      totalCount: value.index.totalCount
    }
  }

  async function notifyViaOpenClaw(context) {
    let ownerResult
    if (!openclawAdapter) {
      ownerResult = {
        delivered: false,
        attempted: false,
        mode: 'openclaw',
        reason: 'adapter-not-configured'
      }
    } else {
      try {
        ownerResult = await openclawAdapter.pushOwnerReport({
          item: context.item,
          selectedSkill: context.selectedSkill,
          ownerReport: context.ownerReport
        })
      } catch (error) {
        ownerResult = {
          delivered: false,
          attempted: true,
          mode: 'openclaw',
          reason: clean(error?.message) || 'owner-push-failed'
        }
      }
    }
    const value = inbox.appendEntry({
      agentId,
      selectedSkill: context.selectedSkill,
      mailboxKey: context.mailboxKey,
      item: context.item,
      ownerReport: context.ownerReport,
      peerResponse: context.peerResponse ?? null,
      ownerDelivery: {
        attempted: Boolean(ownerResult?.attempted ?? true),
        delivered: Boolean(ownerResult?.delivered),
        mode: clean(ownerResult?.mode) || 'openclaw',
        reason: clean(ownerResult?.reason),
        stdout: ownerResult?.stdout ?? ''
      }
    })
    return {
      delivered: true,
      mode: 'openclaw',
      entryId: value.entry.id,
      totalCount: value.index.totalCount,
      deliveredToOwner: Boolean(ownerResult?.delivered),
      ownerDelivery: ownerResult
    }
  }

  const notify = normalizedMode === 'http'
    ? notifyViaHttp
    : normalizedMode === 'command'
      ? notifyViaCommand
      : normalizedMode === 'openclaw'
        ? notifyViaOpenClaw
      : normalizedMode === 'inbox'
        ? notifyViaInbox
      : normalizedMode === 'none'
        ? noopNotify
        : notifyViaStdout

  notify.mode = normalizedMode
  notify.url = normalizedUrl
  notify.command = normalizedCommand
  return notify
}

function buildOwnerSummary(context) {
  const remoteAgentId = clean(context?.item?.remoteAgentId) || 'unknown'
  const selectedSkill = clean(context?.selectedSkill) || 'friend-im'
  const incoming = excerpt(extractInboundText(context?.item))
  if (selectedSkill === 'agent-mutual-learning') {
    if (incoming) {
      return `${remoteAgentId} sent a mutual-learning request: ${incoming}`
    }
    return `${remoteAgentId} opened a mutual-learning request.`
  }
  if (incoming) {
    return `${remoteAgentId} sent a message: ${incoming}`
  }
  return `${remoteAgentId} opened an inbound ${selectedSkill} request.`
}
