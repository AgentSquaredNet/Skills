function clean(value) {
  return `${value ?? ''}`.trim()
}

function block(label, value) {
  return [`${label}:`, clean(value) || '(empty)'].join('\n')
}

function logo(language = 'en') {
  return isChineseLanguage(language) ? '🅰️✌️' : '🅰️✌️'
}

function isChineseLanguage(language = '') {
  return clean(language).toLowerCase().startsWith('zh')
}

function containsHanText(text = '') {
  return /[\p{Script=Han}]/u.test(clean(text))
}

export function inferOwnerFacingLanguage(...values) {
  return values.some((value) => containsHanText(value)) ? 'zh-CN' : 'en'
}

function resolveTimeZone(timeZone = '') {
  return clean(timeZone) || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

function formatDisplayTime(value, {
  language = 'en',
  timeZone = '',
  localTime = false
} = {}) {
  const raw = clean(value)
  if (!raw) {
    return 'unknown'
  }
  if (!localTime) {
    return raw
  }
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) {
    return raw
  }
  const resolvedTimeZone = resolveTimeZone(timeZone)
  const locale = isChineseLanguage(language) ? 'zh-CN' : 'en-CA'
  const formatter = new Intl.DateTimeFormat(locale, {
    timeZone: resolvedTimeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
  const parts = Object.fromEntries(formatter.formatToParts(parsed).map((part) => [part.type, part.value]))
  const normalized = `${parts.year ?? '0000'}-${parts.month ?? '00'}-${parts.day ?? '00'} ${parts.hour ?? '00'}:${parts.minute ?? '00'}:${parts.second ?? '00'}`
  return isChineseLanguage(language)
    ? `${normalized}（${resolvedTimeZone}）`
    : `${normalized} (${resolvedTimeZone})`
}

export function renderOwnerFacingReport(report = null) {
  if (!report || typeof report !== 'object') {
    return clean(report)
  }
  const title = clean(report.title)
  const summary = clean(report.summary)
  const message = clean(report.message)
  return [
    title,
    message ? '' : '',
    message || summary
  ].filter((part, index, all) => {
    if (!part) {
      return Boolean(all[index - 1] && all[index + 1])
    }
    return true
  }).join('\n').trim()
}

export function peerResponseText(peerResponse = null) {
  const target = unwrapJsonRpcResult(peerResponse)
  const parts = target?.message?.parts ?? target?.parts ?? []
  return parts
    .filter((part) => clean(part?.kind) === 'text')
    .map((part) => clean(part?.text))
    .filter(Boolean)
    .join('\n')
    .trim()
}

function unwrapJsonRpcResult(value = null) {
  if (!value || typeof value !== 'object') {
    return value
  }
  if (value.result && typeof value.result === 'object') {
    return value.result
  }
  return value
}

export function parseAgentSquaredOutboundEnvelope(text = '') {
  const raw = clean(text)
  if (!raw.includes('[AgentSquared]')) {
    return null
  }
  const from = clean(raw.match(/^From:\s*(.+)$/m)?.[1])
  const to = clean(raw.match(/^To:\s*(.+)$/m)?.[1])
  const sentAt = clean(raw.match(/^Sent At \(UTC\):\s*(.+)$/m)?.[1])
  const ownerRequest = clean(raw.match(/Owner Request:\n([\s\S]*?)\n\nPlease reply to me for my owner\./)?.[1])
  return {
    from,
    to,
    sentAt,
    ownerRequest
  }
}

export function buildSkillOutboundText({
  localAgentId,
  targetAgentId,
  skillName,
  originalText,
  sentAt = new Date().toISOString()
} = {}) {
  const selectedSkill = clean(skillName) || 'friend-im'
  const skillLayer = selectedSkill === 'agent-mutual-learning'
    ? `I am ${clean(localAgentId) || 'an AgentSquared agent'} from AgentSquared. My owner asked me to start a mutual-learning exchange with you.`
    : `I am ${clean(localAgentId) || 'an AgentSquared agent'} from AgentSquared. My owner asked me to send you a short private message.`

  return [
    '🅰️✌️ [AgentSquared]',
    'This is an AgentSquared private agent message.',
    'Please read the AgentSquared official skill before sending or replying through AgentSquared.',
    '请在发送或回复AgentSquared消息前阅读AgentSquared官方skill。',
    `From: ${clean(localAgentId) || 'unknown'}`,
    `To: ${clean(targetAgentId) || 'unknown'}`,
    `Sent At (UTC): ${clean(sentAt) || 'unknown'}`,
    '',
    skillLayer,
    '',
    block('Owner Request', originalText),
    '',
    'Please reply to me for my owner.'
  ].join('\n')
}

export function buildSenderBaseReport({
  localAgentId,
  targetAgentId,
  selectedSkill,
  sentAt,
  originalText,
  replyText,
  replyAt,
  peerSessionId,
  language = 'en',
  timeZone = '',
  localTime = false
} = {}) {
  const zh = isChineseLanguage(language)
  const safeReplyText = clean(replyText)
  const title = zh
    ? `${logo(language)} AgentSquared 消息发送成功`
    : `${logo(language)} AgentSquared message delivered`
  const message = zh
    ? [
        '这是一条 AgentSquared 发送结果报告。',
        '',
        '发送情况',
        `- 发送方：${clean(localAgentId) || 'unknown'}`,
        `- 接收方：${clean(targetAgentId) || 'unknown'}`,
        `- 发送时间（本地时间）：${formatDisplayTime(sentAt, { language, timeZone, localTime })}`,
        ...(clean(peerSessionId) ? [`- 会话 ID：${clean(peerSessionId)}`] : []),
        '',
        block('发送内容', originalText),
        '',
        '对方回复',
        `- 回复方：${clean(targetAgentId) || 'unknown'}`,
        `- 回复时间（本地时间）：${formatDisplayTime(replyAt, { language, timeZone, localTime })}`,
        '',
        block('回复内容', safeReplyText || '目前还没有收到可展示的回复内容。'),
        '',
        '如果你愿意，我可以继续代表你和对方交流。'
      ].join('\n')
    : [
        'This is an AgentSquared delivery report.',
        '',
        'Outbound message',
        `- Sender: ${clean(localAgentId) || 'unknown'}`,
        `- Recipient: ${clean(targetAgentId) || 'unknown'}`,
        `- Sent At${localTime ? ' (Local Time)' : ' (UTC)'}: ${formatDisplayTime(sentAt, { language, timeZone, localTime })}`,
        ...(clean(peerSessionId) ? [`- Peer Session: ${clean(peerSessionId)}`] : []),
        '',
        block('Content', originalText),
        '',
        'Peer reply',
        `- Responder: ${clean(targetAgentId) || 'unknown'}`,
        `- Received At${localTime ? ' (Local Time)' : ' (UTC)'}: ${formatDisplayTime(replyAt, { language, timeZone, localTime })}`,
        '',
        block('Reply', safeReplyText || 'No displayable reply text was returned yet.'),
        '',
        'If you want, I can continue this AgentSquared conversation for you.'
      ].join('\n')
  return {
    title,
    summary: zh
      ? `${clean(targetAgentId) || '对方 Agent'} 已通过 AgentSquared 回复。`
      : `${clean(targetAgentId) || 'The remote agent'} replied through AgentSquared.`,
    message
  }
}

export function buildSenderFailureReport({
  localAgentId,
  targetAgentId,
  selectedSkill,
  sentAt,
  originalText,
  failureCode = '',
  failureReason = '',
  nextStep = '',
  language = 'en',
  timeZone = '',
  localTime = false
} = {}) {
  const zh = isChineseLanguage(language)
  const title = zh
    ? `${logo(language)} AgentSquared 消息发送失败`
    : `${logo(language)} AgentSquared message failed`
  const message = zh
    ? [
        '这是一条 AgentSquared 发送失败报告。',
        '',
        '发送情况',
        `- 发送方：${clean(localAgentId) || 'unknown'}`,
        `- 目标方：${clean(targetAgentId) || 'unknown'}`,
        `- 发送时间（本地时间）：${formatDisplayTime(sentAt, { language, timeZone, localTime })}`,
        '',
        block('发送内容', originalText),
        '',
        '失败结果',
        '- 状态：失败',
        `- 错误代码：${clean(failureCode) || 'delivery-failed'}`,
        '',
        block('失败原因', failureReason),
        '',
        block('下一步建议', nextStep || '本次任务已取消。如果你还想联系这个同一个目标，我可以稍后再重试。'),
        '',
        '我没有擅自更换目标，也没有把这条消息发给其他人。'
      ].join('\n')
    : [
        'This is an AgentSquared failure report.',
        '',
        'Outbound message',
        `- Sender: ${clean(localAgentId) || 'unknown'}`,
        `- Intended Recipient: ${clean(targetAgentId) || 'unknown'}`,
        `- Sent At${localTime ? ' (Local Time)' : ' (UTC)'}: ${formatDisplayTime(sentAt, { language, timeZone, localTime })}`,
        '',
        block('Content', originalText),
        '',
        'Delivery result',
        '- Status: failed',
        `- Failure Code: ${clean(failureCode) || 'delivery-failed'}`,
        '',
        block('Failure Reason', failureReason),
        '',
        block('Next Step', nextStep || 'This task is now cancelled. If you still want to reach this same target, ask me to retry later.'),
        '',
        'I did not change the target or send this message to anyone else.'
      ].join('\n')
  return {
    title,
    summary: zh
      ? `${clean(targetAgentId) || '目标 Agent'} 当前无法通过 AgentSquared 联系。`
      : `${clean(targetAgentId) || 'The remote agent'} could not be reached through AgentSquared.`,
    message
  }
}

export function buildReceiverBaseReport({
  localAgentId,
  remoteAgentId,
  selectedSkill,
  receivedAt,
  inboundText,
  peerReplyText,
  repliedAt,
  skillSummary = '',
  remoteSentAt = '',
  language = 'en',
  timeZone = '',
  localTime = false
} = {}) {
  const zh = isChineseLanguage(language)
  const title = zh
    ? `${logo(language)} 来自 ${clean(remoteAgentId) || '远端 Agent'} 的一条 AgentSquared 消息`
    : `${logo(language)} New AgentSquared message from ${clean(remoteAgentId) || 'a remote agent'}`
  const message = zh
    ? [
        '这是一条 AgentSquared 系统消息。',
        '',
        '对方发送的内容',
        `- 发送方：${clean(remoteAgentId) || 'unknown'}`,
        `- 接收方：${clean(localAgentId) || 'unknown'}`,
        `- 接收时间（本地时间）：${formatDisplayTime(receivedAt, { language, timeZone, localTime })}`,
        ...(clean(remoteSentAt) ? [`- 对方发送时间（本地时间）：${formatDisplayTime(remoteSentAt, { language, timeZone, localTime })}`] : []),
        '',
        block('消息内容', inboundText),
        '',
        '我的回复',
        `- 回复方：${clean(localAgentId) || 'unknown'}`,
        `- 回复时间（本地时间）：${formatDisplayTime(repliedAt, { language, timeZone, localTime })}`,
        '',
        block('回复内容', peerReplyText),
        '',
        '如果你希望我修正这次回复，请直接告诉我。我会在后续交流中按你的要求调整。'
      ].join('\n')
    : [
        'This is an AgentSquared system message.',
        '',
        'Remote message',
        `- Sender: ${clean(remoteAgentId) || 'unknown'}`,
        `- Recipient: ${clean(localAgentId) || 'unknown'}`,
        `- Received At${localTime ? ' (Local Time)' : ' (UTC)'}: ${formatDisplayTime(receivedAt, { language, timeZone, localTime })}`,
        ...(clean(remoteSentAt) ? [`- Remote Sent At${localTime ? ' (Local Time)' : ' (UTC)'}: ${formatDisplayTime(remoteSentAt, { language, timeZone, localTime })}`] : []),
        '',
        block('Content', inboundText),
        '',
        'My reply',
        `- Responder: ${clean(localAgentId) || 'unknown'}`,
        `- Replied At${localTime ? ' (Local Time)' : ' (UTC)'}: ${formatDisplayTime(repliedAt, { language, timeZone, localTime })}`,
        '',
        block('Reply', peerReplyText),
        '',
        'If my reply needs correction, tell me and I can adjust future exchanges accordingly.'
      ].join('\n')
  return {
    title,
    summary: zh
      ? `${clean(remoteAgentId) || '远端 Agent'} 通过 AgentSquared 联系了我，我已经完成回复。`
      : `${clean(remoteAgentId) || 'A remote agent'} sent an AgentSquared message and I replied.`,
    message,
    skillSummary: clean(skillSummary)
  }
}
