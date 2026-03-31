import { spawn } from 'node:child_process'

function clean(value) {
  return `${value ?? ''}`.trim()
}

function excerpt(text, maxLength = 240) {
  const compact = clean(text).replace(/\s+/g, ' ').trim()
  if (!compact) {
    return ''
  }
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 3)}...` : compact
}

function normalizeOpenClawSessionKey(remoteAgentId, prefix = 'agentsquared:peer:') {
  return `${clean(prefix)}${encodeURIComponent(clean(remoteAgentId).toLowerCase())}`
}

function ownerReportText(ownerReport) {
  if (typeof ownerReport === 'string') {
    return clean(ownerReport)
  }
  if (ownerReport && typeof ownerReport === 'object') {
    return clean(ownerReport.summary || ownerReport.text || ownerReport.message)
  }
  return ''
}

function textParts(value) {
  if (!value) {
    return []
  }
  if (typeof value === 'string') {
    return [clean(value)].filter(Boolean)
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => textParts(item))
  }
  if (typeof value === 'object') {
    if (Array.isArray(value.parts)) {
      return value.parts.flatMap((part) => textParts(part?.text ?? part?.value ?? part))
    }
    if (typeof value.text === 'string') {
      return [clean(value.text)].filter(Boolean)
    }
    if (typeof value.value === 'string') {
      return [clean(value.value)].filter(Boolean)
    }
    if (typeof value.content === 'string') {
      return [clean(value.content)].filter(Boolean)
    }
    if (Array.isArray(value.content)) {
      return value.content.flatMap((item) => textParts(item))
    }
    if (value.message) {
      return textParts(value.message)
    }
  }
  return []
}

function flattenText(value) {
  return textParts(value).filter(Boolean).join('\n').trim()
}

function extractJsonBlock(text) {
  const trimmed = clean(text)
  if (!trimmed) {
    throw new Error('OpenClaw returned an empty response.')
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) {
    return fenced[1].trim()
  }
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed
  }
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1)
  }
  throw new Error(`OpenClaw response did not contain a JSON object: ${excerpt(trimmed, 400)}`)
}

function parseJsonOutput(text, label = 'OpenClaw response') {
  try {
    return JSON.parse(extractJsonBlock(text))
  } catch (error) {
    throw new Error(`${label} was not valid JSON: ${error.message}`)
  }
}

function unwrapResult(payload) {
  if (!payload || typeof payload !== 'object') {
    return payload
  }
  if (payload.result && typeof payload.result === 'object') {
    return payload.result
  }
  if (payload.data && typeof payload.data === 'object') {
    return payload.data
  }
  return payload
}

function readOpenClawRunId(payload) {
  const value = unwrapResult(payload)
  return clean(value?.runId || value?.id || value?.run?.runId || value?.run?.id)
}

function readOpenClawStatus(payload) {
  const value = unwrapResult(payload)
  return clean(value?.status || value?.run?.status || value?.state)
}

function latestAssistantText(historyPayload, {
  runId = ''
} = {}) {
  const payload = unwrapResult(historyPayload)
  const messages = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload?.messages)
        ? payload.messages
        : Array.isArray(payload?.events)
          ? payload.events
          : []

  const assistantMessages = messages.filter((entry) => {
    const role = clean(entry?.role || entry?.message?.role || entry?.actor || entry?.kind).toLowerCase()
    return role === 'assistant' || role === 'agent' || role === 'final'
  })

  if (assistantMessages.length === 0) {
    return ''
  }

  const byRunId = runId
    ? assistantMessages.filter((entry) => {
        const entryRunId = clean(
          entry?.runId
          || entry?.run?.id
          || entry?.run?.runId
          || entry?.metadata?.runId
          || entry?.message?.metadata?.runId
        )
        return entryRunId && entryRunId === runId
      })
    : []

  const target = (byRunId.length > 0 ? byRunId : assistantMessages).at(-1)
  return flattenText(target?.message ?? target)
}

function peerResponseText(raw) {
  if (typeof raw === 'string') {
    return clean(raw)
  }
  if (raw && typeof raw === 'object') {
    if (typeof raw.peerResponse === 'string') {
      return clean(raw.peerResponse)
    }
    if (typeof raw.reply === 'string') {
      return clean(raw.reply)
    }
    return flattenText(raw.message ?? raw)
  }
  return ''
}

export function parseOpenClawTaskResult(text, {
  defaultSkill = 'friend-im',
  remoteAgentId = '',
  inboundId = ''
} = {}) {
  const parsed = parseJsonOutput(text, 'OpenClaw task result')
  const selectedSkill = clean(parsed.selectedSkill) || clean(defaultSkill) || 'friend-im'
  const peerText = clean(parsed.peerResponse) || clean(parsed.peerResponseText) || clean(parsed.reply)
  if (!peerText) {
    throw new Error(`OpenClaw task result for ${clean(inboundId) || 'inbound task'} did not include peerResponse.`)
  }
  const reportText = clean(parsed.ownerReport) || clean(parsed.ownerReportText) || `${clean(remoteAgentId) || 'A remote agent'} sent an inbound task and I replied.`
  return {
    selectedSkill,
    peerResponse: {
      message: {
        kind: 'message',
        role: 'agent',
        parts: [{ kind: 'text', text: peerText }]
      },
      metadata: {
        selectedSkill,
        runtimeAdapter: 'openclaw'
      }
    },
    ownerReport: {
      summary: reportText,
      selectedSkill,
      runtimeAdapter: 'openclaw'
    }
  }
}

function runProcess(command, args, {
  cwd = '',
  input = '',
  timeoutMs = 180000
} = {}) {
  const normalizedCommand = clean(command) || 'openclaw'
  return new Promise((resolve, reject) => {
    const child = spawn(normalizedCommand, args, {
      cwd: clean(cwd) || undefined,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, Math.max(1000, timeoutMs))

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (timedOut) {
        reject(new Error(`OpenClaw command timed out after ${timeoutMs}ms.`))
        return
      }
      if (code !== 0) {
        reject(new Error(clean(stderr) || `OpenClaw command exited with status ${code}`))
        return
      }
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim()
      })
    })

    if (input) {
      child.stdin.write(input)
    }
    child.stdin.end()
  })
}

function gatewayCallArgs(method, {
  params = null,
  gatewayUrl = '',
  gatewayToken = '',
  gatewayPassword = '',
  expectFinal = false
} = {}) {
  const args = ['gateway', 'call', clean(method), '--json']
  if (expectFinal) {
    args.push('--expect-final')
  }
  if (clean(gatewayUrl)) {
    args.push('--url', clean(gatewayUrl))
  }
  if (clean(gatewayToken)) {
    args.push('--token', clean(gatewayToken))
  }
  if (clean(gatewayPassword)) {
    args.push('--password', clean(gatewayPassword))
  }
  if (params && typeof params === 'object') {
    args.push('--params', JSON.stringify(params))
  }
  return args
}

export function buildOpenClawTaskPrompt({
  localAgentId,
  remoteAgentId,
  selectedSkill,
  item
}) {
  const inboundText = peerResponseText(item?.request?.params?.message)
  const messageMethod = clean(item?.request?.method) || 'message/send'
  const peerSessionId = clean(item?.peerSessionId)
  const requestId = clean(item?.request?.id)

  return [
    `You are the OpenClaw runtime for local AgentSquared agent ${clean(localAgentId)}.`,
    `A trusted remote Agent ${clean(remoteAgentId)} sent you a private AgentSquared task over P2P.`,
    '',
    'Handle this as a real local agent task, not as a transport acknowledgement.',
    `Suggested skill: ${clean(selectedSkill) || 'friend-im'}`,
    'You may choose a different local skill if it fits better, but if uncertain you must default to friend-im.',
    '',
    'Inbound context:',
    `- requestMethod: ${messageMethod}`,
    `- peerSessionId: ${peerSessionId || 'unknown'}`,
    `- inboundRequestId: ${requestId || 'unknown'}`,
    `- remoteAgentId: ${clean(remoteAgentId) || 'unknown'}`,
    `- messageText: ${inboundText || '(empty)'}`,
    '',
    'Your job:',
    '1. Decide the best local skill.',
    '2. Produce the real peer-facing reply that should go back to the remote agent.',
    '3. Produce one concise owner-facing report for the local human owner.',
    '4. If you need the owner to decide something, say so in ownerReport and keep peerResponse polite and safe.',
    '5. Never pretend to be human if you are an AI agent.',
    '',
    'Return exactly one JSON object and nothing else.',
    'Use this schema:',
    '{"selectedSkill":"friend-im","peerResponse":"...","ownerReport":"..."}',
    'Do not wrap the JSON in markdown fences.'
  ].join('\n')
}

export function createOpenClawAdapter({
  localAgentId,
  openclawAgent = '',
  command = 'openclaw',
  cwd = '',
  sessionPrefix = 'agentsquared:peer:',
  timeoutMs = 180000,
  ownerChannel = '',
  ownerTarget = '',
  ownerThreadId = '',
  gatewayUrl = '',
  gatewayToken = '',
  gatewayPassword = ''
} = {}) {
  const agentName = clean(openclawAgent) || clean(localAgentId)
  if (!agentName) {
    throw new Error('openclaw agent name is required')
  }

  async function gatewayCall(method, options = {}) {
    const args = gatewayCallArgs(method, {
      ...options,
      gatewayUrl,
      gatewayToken,
      gatewayPassword
    })
    const result = await runProcess(command, args, { cwd, timeoutMs: options.timeoutMs ?? timeoutMs })
    return parseJsonOutput(result.stdout || result.stderr, `OpenClaw ${method} response`)
  }

  async function fetchSessionResult({ sessionKey, runId }) {
    const history = await gatewayCall('chat.history', {
      params: {
        sessionKey,
        limit: 12
      }
    })
    const responseText = latestAssistantText(history, { runId })
    if (!responseText) {
      throw new Error(`OpenClaw chat.history did not include a final assistant message for session ${sessionKey}.`)
    }
    return responseText
  }

  async function executeInbound({
    item,
    selectedSkill,
    mailboxKey
  }) {
    const remoteAgentId = clean(item?.remoteAgentId)
    const sessionKey = normalizeOpenClawSessionKey(remoteAgentId || mailboxKey || 'unknown', sessionPrefix)
    const prompt = buildOpenClawTaskPrompt({
      localAgentId,
      remoteAgentId,
      selectedSkill,
      item
    })

    const accepted = await gatewayCall('agent', {
      params: {
        agentId: agentName,
        sessionKey,
        message: prompt
      }
    })
    const runId = readOpenClawRunId(accepted)
    if (!runId) {
      throw new Error('OpenClaw agent call did not return a runId.')
    }

    const waited = await gatewayCall('agent.wait', {
      params: {
        runId,
        timeoutMs
      },
      timeoutMs: timeoutMs + 1000
    })
    const status = readOpenClawStatus(waited).toLowerCase()
    if (status && status !== 'ok' && status !== 'completed' && status !== 'done') {
      throw new Error(`OpenClaw agent.wait returned ${status || 'an unknown status'} for run ${runId}.`)
    }

    const resultText = latestAssistantText(waited, { runId }) || await fetchSessionResult({ sessionKey, runId })
    const parsed = parseOpenClawTaskResult(resultText, {
      defaultSkill: selectedSkill,
      remoteAgentId,
      inboundId: clean(item?.inboundId)
    })
    return {
      ...parsed,
      peerResponse: {
        ...parsed.peerResponse,
        metadata: {
          ...(parsed.peerResponse?.metadata ?? {}),
          openclawRunId: runId,
          openclawSessionKey: sessionKey
        }
      },
      ownerReport: {
        ...(parsed.ownerReport ?? {}),
        openclawRunId: runId,
        openclawSessionKey: sessionKey
      }
    }
  }

  async function pushOwnerReport({
    ownerReport
  }) {
    const summary = ownerReportText(ownerReport)
    if (!summary) {
      return { delivered: false, attempted: false, mode: 'openclaw', reason: 'empty-owner-report' }
    }
    if (!clean(ownerChannel) || !clean(ownerTarget)) {
      return { delivered: false, attempted: false, mode: 'openclaw', reason: 'owner-channel-not-configured' }
    }
    const args = [
      'message',
      'send',
      '--channel', clean(ownerChannel),
      '--target', clean(ownerTarget),
      '--message', summary
    ]
    if (clean(ownerThreadId)) {
      args.push('--thread-id', clean(ownerThreadId))
    }
    if (clean(gatewayUrl)) {
      args.push('--url', clean(gatewayUrl))
    }
    if (clean(gatewayToken)) {
      args.push('--token', clean(gatewayToken))
    }
    if (clean(gatewayPassword)) {
      args.push('--password', clean(gatewayPassword))
    }
    const result = await runProcess(command, args, { cwd, timeoutMs })
    return {
      delivered: true,
      attempted: true,
      mode: 'openclaw',
      stdout: result.stdout
    }
  }

  return {
    mode: 'openclaw',
    command: clean(command) || 'openclaw',
    agent: agentName,
    ownerChannel: clean(ownerChannel),
    ownerTarget: clean(ownerTarget),
    sessionPrefix: clean(sessionPrefix) || 'agentsquared:peer:',
    gatewayUrl: clean(gatewayUrl),
    executeInbound,
    pushOwnerReport
  }
}
