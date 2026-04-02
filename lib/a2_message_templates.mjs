function clean(value) {
  return `${value ?? ''}`.trim()
}

function block(label, value) {
  return [`${label}:`, clean(value) || '(empty)'].join('\n')
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
  const parts = peerResponse?.message?.parts ?? []
  return parts
    .filter((part) => clean(part?.kind) === 'text')
    .map((part) => clean(part?.text))
    .filter(Boolean)
    .join('\n')
    .trim()
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
    '[AgentSquared]',
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
  peerSessionId
} = {}) {
  const title = `AgentSquared task to ${clean(targetAgentId) || 'the remote agent'} completed`
  const message = [
    'This is an AgentSquared system message.',
    '',
    'My outbound message',
    `- Sender: ${clean(localAgentId) || 'unknown'}`,
    `- Recipient: ${clean(targetAgentId) || 'unknown'}`,
    `- Sent At (UTC): ${clean(sentAt) || 'unknown'}`,
    ...(clean(peerSessionId) ? [`- Peer Session: ${clean(peerSessionId)}`] : []),
    '',
    block('Content', originalText),
    '',
    'Peer reply',
    `- Responder: ${clean(targetAgentId) || 'unknown'}`,
    `- Received At (UTC): ${clean(replyAt) || 'unknown'}`,
    '',
    block('Reply', replyText),
    '',
    'If you want, you can continue this AgentSquared conversation with another message.'
  ].join('\n')
  return {
    title,
    summary: `${clean(targetAgentId) || 'The remote agent'} replied through AgentSquared.`,
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
  nextStep = ''
} = {}) {
  const title = `AgentSquared task to ${clean(targetAgentId) || 'the remote agent'} did not complete`
  const message = [
    'This is an AgentSquared system message.',
    '',
    'My outbound message',
    `- Sender: ${clean(localAgentId) || 'unknown'}`,
    `- Intended Recipient: ${clean(targetAgentId) || 'unknown'}`,
    `- Sent At (UTC): ${clean(sentAt) || 'unknown'}`,
    '',
    block('Content', originalText),
    '',
    'Delivery result',
    `- Status: failed`,
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
    summary: `${clean(targetAgentId) || 'The remote agent'} could not be reached through AgentSquared.`,
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
  language = 'en',
  timeZone = '',
  localTime = false
} = {}) {
  const zh = isChineseLanguage(language)
  const title = zh
    ? `来自 ${clean(remoteAgentId) || '远端 Agent'} 的一条 AgentSquared 消息`
    : `New AgentSquared message from ${clean(remoteAgentId) || 'a remote agent'}`
  const message = zh
    ? [
        '这是一条 AgentSquared 系统消息。',
        '',
        '对方发送的内容',
        `- 发送方：${clean(remoteAgentId) || 'unknown'}`,
        `- 接收方：${clean(localAgentId) || 'unknown'}`,
        `- 接收时间（本地时间）：${formatDisplayTime(receivedAt, { language, timeZone, localTime })}`,
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
