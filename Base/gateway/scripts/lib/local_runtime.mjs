import { spawn } from 'node:child_process'

import { requestJson } from '../../../p2p-session-handoff/scripts/lib/http_json.mjs'
import { buildSkillResult } from './agent_router.mjs'

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
  command = ''
} = {}) {
  const normalizedMode = clean(mode).toLowerCase() || 'reject'
  const normalizedUrl = clean(url)
  const normalizedCommand = clean(command)

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

  async function executeDemo(context) {
    return normalizeExecutionResult({
      peerResponse: buildSkillResult(context.selectedSkill, context.item),
      ownerReport: {
        summary: `demo executor handled inbound ${clean(context.item?.inboundId) || 'message'}`,
        selectedSkill: context.selectedSkill
      }
    }, context)
  }

  async function rejectExecution() {
    return {
      reject: {
        code: 503,
        message: 'no local agent executor is configured; inbound request cannot be handled yet'
      }
    }
  }

  const execute = normalizedMode === 'http'
    ? executeViaHttp
    : normalizedMode === 'command'
      ? executeViaCommand
      : normalizedMode === 'demo'
        ? executeDemo
        : rejectExecution

  execute.mode = normalizedMode
  execute.url = normalizedUrl
  execute.command = normalizedCommand
  return execute
}

export function createOwnerNotifier({
  agentId,
  mode = 'stdout',
  url = '',
  command = ''
} = {}) {
  const normalizedMode = clean(mode).toLowerCase() || 'stdout'
  const normalizedUrl = clean(url)
  const normalizedCommand = clean(command)

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

  const notify = normalizedMode === 'http'
    ? notifyViaHttp
    : normalizedMode === 'command'
      ? notifyViaCommand
      : normalizedMode === 'none'
        ? noopNotify
        : notifyViaStdout

  notify.mode = normalizedMode
  notify.url = normalizedUrl
  notify.command = normalizedCommand
  return notify
}
