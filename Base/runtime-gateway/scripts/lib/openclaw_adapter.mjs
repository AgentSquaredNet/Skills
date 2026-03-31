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

function normalizePeerTarget(remoteAgentId, prefix = 'agentsquared-peer:') {
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
    if (raw.message?.parts?.length) {
      return clean(raw.message.parts.map((part) => clean(part?.text)).filter(Boolean).join('\n'))
    }
  }
  return ''
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

export function parseOpenClawTaskResult(text, {
  defaultSkill = 'friend-im',
  remoteAgentId = '',
  inboundId = ''
} = {}) {
  const parsed = JSON.parse(extractJsonBlock(text))
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
  peerTargetPrefix = 'agentsquared-peer:',
  timeoutMs = 180000,
  ownerChannel = '',
  ownerTarget = '',
  ownerThreadId = ''
} = {}) {
  const agentName = clean(openclawAgent) || clean(localAgentId)
  if (!agentName) {
    throw new Error('openclaw agent name is required')
  }

  async function executeInbound({
    item,
    selectedSkill,
    mailboxKey
  }) {
    const remoteAgentId = clean(item?.remoteAgentId)
    const prompt = buildOpenClawTaskPrompt({
      localAgentId,
      remoteAgentId,
      selectedSkill,
      item
    })
    const args = [
      'agent',
      '--agent', agentName,
      '--to', normalizePeerTarget(remoteAgentId || mailboxKey || 'unknown', peerTargetPrefix),
      '--message', prompt
    ]
    const result = await runProcess(command, args, { cwd, timeoutMs })
    return parseOpenClawTaskResult(result.stdout || result.stderr, {
      defaultSkill: selectedSkill,
      remoteAgentId,
      inboundId: clean(item?.inboundId)
    })
  }

  async function pushOwnerReport({
    ownerReport
  }) {
    const summary = ownerReportText(ownerReport)
    if (!summary) {
      return { delivered: false, mode: 'openclaw', reason: 'empty-owner-report' }
    }
    if (!clean(ownerChannel) || !clean(ownerTarget)) {
      return { delivered: false, mode: 'openclaw', reason: 'owner-channel-not-configured' }
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
    const result = await runProcess(command, args, { cwd, timeoutMs })
    return {
      delivered: true,
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
    executeInbound,
    pushOwnerReport
  }
}
