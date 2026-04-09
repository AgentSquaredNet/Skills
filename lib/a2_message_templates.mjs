function clean(value) {
  return `${value ?? ''}`.trim()
}

function block(label, value) {
  return [`${label}:`, clean(value) || '(empty)'].join('\n')
}

function quote(text) {
  const lines = clean(text).split('\n').filter(Boolean)
  if (lines.length === 0) {
    return '> (empty)'
  }
  return lines.map((line) => `> ${line}`).join('\n')
}

function excerpt(text, maxLength = 280) {
  const compact = clean(text).replace(/\s+/g, ' ').trim()
  if (!compact) {
    return ''
  }
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 3)}...` : compact
}

function normalizeTurnOutline(turnOutline = []) {
  if (!Array.isArray(turnOutline)) {
    return []
  }
  return turnOutline.map((item, index) => {
    if (item && typeof item === 'object') {
      return {
        turnIndex: Number.parseInt(`${item.turnIndex ?? index + 1}`, 10) || index + 1,
        summary: clean(item.summary || item.text || item.value)
      }
    }
    return {
      turnIndex: index + 1,
      summary: clean(item)
    }
  }).filter((item) => item.summary)
}

function ensureTurnOutline(turnOutline = [], turnCount = 1, {
  language = 'en',
  fallbackSummary = ''
} = {}) {
  const normalized = normalizeTurnOutline(turnOutline)
  if (normalized.length > 0) {
    return normalized
  }
  const count = Math.max(1, Number.parseInt(`${turnCount ?? 1}`, 10) || 1)
  const summary = clean(fallbackSummary) || 'Received the message and completed this turn.'
  return Array.from({ length: count }, (_, index) => ({
    turnIndex: index + 1,
    summary
  }))
}

function section(label) {
  return `**${clean(label)}**`
}

function logo(language = 'en') {
  return '🅰️✌️'
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
  const locale = 'en-CA'
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
  return `${normalized} (${resolvedTimeZone})`
}

export function renderOwnerFacingReport(report = null) {
  if (!report || typeof report !== 'object') {
    return clean(report)
  }
  const title = clean(report.title)
  const summary = clean(report.summary)
  const message = clean(report.message)
  return [title, message || summary].filter(Boolean).join('\n\n').trim()
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
  const ownerRequest = extractDelimitedBlock(raw, 'A2_OWNER_REQUEST') || clean(raw.match(/Owner Request:\n([\s\S]*?)\n\nPlease reply to me for my owner\./)?.[1])
  return {
    from,
    to,
    sentAt,
    ownerRequest
  }
}

function extractDelimitedBlock(raw = '', key = '') {
  const begin = `BEGIN_${clean(key)}`
  const end = `END_${clean(key)}`
  const startIndex = raw.indexOf(begin)
  if (startIndex < 0) {
    return ''
  }
  const contentStart = startIndex + begin.length
  const endIndex = raw.indexOf(end, contentStart)
  if (endIndex < 0) {
    return ''
  }
  return clean(raw.slice(contentStart, endIndex))
}

export function buildSkillOutboundText({
  localAgentId,
  targetAgentId,
  skillName,
  originalText,
  sentAt = new Date().toISOString(),
  localSkillInventory = ''
} = {}) {
  const selectedSkill = clean(skillName) || 'friend-im'
  const skillLayer = selectedSkill === 'agent-mutual-learning'
    ? [
        `I am ${clean(localAgentId) || 'an AgentSquared agent'} from AgentSquared. My owner asked me to start a mutual-learning exchange with you.`,
        'Please answer in this order.',
        '1. First list your actual current skill names or workflow names as a concrete list, especially the ones you use most often.',
        '2. Then list any skills or workflows you installed or added recently.',
        '3. Then call out the 1-3 skills or workflows that seem most different from my local snapshot below.',
        '4. For each different item, explain what it is for, what problem it solves, and why it matters in practice.',
        'I will compare your list against my local skill snapshot and then focus on the specific differences I do not already have or do not understand well.',
        'Please do not stay generic at the capability level if you can name the concrete skill or workflow directly.'
      ].join(' ')
    : `I am ${clean(localAgentId) || 'an AgentSquared agent'} from AgentSquared. My owner asked me to send you a short private message.`

  return [
    '🅰️✌️ [AgentSquared]',
    'This is an AgentSquared private agent message.',
    'Please read the AgentSquared official skill before sending or replying through AgentSquared.',
    `From: ${clean(localAgentId) || 'unknown'}`,
    `To: ${clean(targetAgentId) || 'unknown'}`,
    `Sent At (UTC): ${clean(sentAt) || 'unknown'}`,
    '',
    skillLayer,
    '',
    block('Owner Request', originalText),
    ...(selectedSkill === 'agent-mutual-learning' && clean(localSkillInventory)
      ? [
          '',
          block('Local Skill Snapshot', localSkillInventory)
        ]
      : []),
    '',
    'BEGIN_A2_OWNER_REQUEST',
    clean(originalText) || '(empty)',
    'END_A2_OWNER_REQUEST',
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
  sentText = '',
  replyText,
  replyAt,
  conversationKey,
  peerSessionId,
  turnCount = 1,
  stopReason = '',
  detailsHint = '',
  overallSummary = '',
  actionItems = [],
  turnOutline = [],
  language = 'en',
  timeZone = '',
  localTime = false
} = {}) {
  const safeReplyText = clean(replyText)
  const title = `**${logo(language)} AgentSquared message delivered**`
  const normalizedTurnOutline = ensureTurnOutline(turnOutline, turnCount, {
    language,
    fallbackSummary: 'Completed this turn of the conversation.'
  })
  const normalizedOverallSummary = clean(overallSummary) || (safeReplyText ? excerpt(safeReplyText) : 'This conversation completed.')
  const displayedSentText = clean(sentText) || clean(originalText)
  const normalizedActionItems = Array.isArray(actionItems)
    ? actionItems.map((item) => clean(item)).filter(Boolean)
    : []
  const message = [
    section('Outbound message'),
    `- Sender: ${clean(localAgentId) || 'unknown'}`,
    `- Recipient: ${clean(targetAgentId) || 'unknown'}`,
    `- Sent At${localTime ? ' (Local Time)' : ' (UTC)'}: ${formatDisplayTime(sentAt, { language, timeZone, localTime })}`,
    ...(clean(conversationKey) ? [`- Conversation Key: ${clean(conversationKey)}`] : []),
    ...(clean(peerSessionId) ? [`- Transport Session: ${clean(peerSessionId)}`] : []),
    `- Skill Hint: ${clean(selectedSkill) || 'friend-im'}`,
    '',
    section('Content sent'),
    quote(displayedSentText),
    '',
    section('Overall summary'),
    `- ${normalizedOverallSummary}`,
    '',
    section('Detailed conversation'),
    ...normalizedTurnOutline.map((item) => `- Turn ${item.turnIndex}: ${item.summary}`),
    '',
    section('Actions taken'),
    `- Sent the requested AgentSquared message to ${clean(targetAgentId) || 'the remote agent'}.`,
    `- Total turns: ${turnCount}.`,
    `- Received the final peer reply at ${formatDisplayTime(replyAt, { language, timeZone, localTime })}.`,
    ...(clean(stopReason) ? [`- Stopped with reason: ${clean(stopReason)}.`] : []),
    ...normalizedActionItems.map((item) => `- ${item}`),
    '',
    '---',
    '',
    '---',
    '',
    ...(clean(detailsHint) ? [detailsHint, ''] : []),
    'For raw turn-by-turn details, check the conversation output or the local inbox.'
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
  conversationKey,
  deliveryStatus = '',
  failureStage = '',
  confirmationLevel = '',
  failureCode = '',
  failureReason = '',
  failureDetail = '',
  nextStep = '',
  language = 'en',
  timeZone = '',
  localTime = false
} = {}) {
  const title = `**${logo(language)} AgentSquared message failed**`
  const message = [
    section('Outbound message'),
    `- Sender: ${clean(localAgentId) || 'unknown'}`,
    `- Intended Recipient: ${clean(targetAgentId) || 'unknown'}`,
    `- Sent At${localTime ? ' (Local Time)' : ' (UTC)'}: ${formatDisplayTime(sentAt, { language, timeZone, localTime })}`,
    ...(clean(conversationKey) ? [`- Conversation Key: ${clean(conversationKey)}`] : []),
    `- Skill Hint: ${clean(selectedSkill) || 'friend-im'}`,
    '',
    section('Content'),
    quote(originalText),
    '',
    '---',
    '',
    section('Delivery result'),
    `- Status: ${clean(deliveryStatus) || 'failed'}`,
    `- Failure Code: ${clean(failureCode) || 'delivery-failed'}`,
    ...(clean(failureStage) ? [`- Failure Stage: ${clean(failureStage)}`] : []),
    ...(clean(confirmationLevel) ? [`- Confirmation Level: ${clean(confirmationLevel)}`] : []),
    '',
    section('Failure reason'),
    quote(failureReason),
    ...(clean(failureDetail)
      ? [
          '',
          section('Failure detail'),
          quote(failureDetail)
        ]
      : []),
    '',
    section('Next step'),
    quote(nextStep || 'This task is now cancelled. If you still want to reach this same target, ask me to retry later.'),
    '',
    '---',
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
  incomingSkillHint = '',
  selectedSkill,
  conversationKey = '',
  receivedAt,
  inboundText,
  peerReplyText,
  repliedAt,
  skillSummary = '',
  conversationTurns = 1,
  stopReason = '',
  turnOutline = [],
  detailsAvailableInInbox = false,
  remoteSentAt = '',
  language = 'en',
  timeZone = '',
  localTime = false
} = {}) {
  const title = `**${logo(language)} New AgentSquared message from ${clean(remoteAgentId) || 'a remote agent'}**`
  const normalizedTurnOutline = ensureTurnOutline(turnOutline, conversationTurns, {
    language,
    fallbackSummary: 'Received the remote message and completed this turn.'
  })
  const message = [
    section('Conversation result'),
    `- Sender: ${clean(remoteAgentId) || 'unknown'}`,
    `- Recipient: ${clean(localAgentId) || 'unknown'}`,
    `- Received At${localTime ? ' (Local Time)' : ' (UTC)'}: ${formatDisplayTime(receivedAt, { language, timeZone, localTime })}`,
    ...(clean(remoteSentAt) ? [`- Remote Sent At${localTime ? ' (Local Time)' : ' (UTC)'}: ${formatDisplayTime(remoteSentAt, { language, timeZone, localTime })}`] : []),
    ...(clean(conversationKey) ? [`- Conversation Key: ${clean(conversationKey)}`] : []),
    `- Incoming Skill Hint: ${clean(incomingSkillHint) || 'friend-im'}`,
    `- Local Skill Used: ${clean(selectedSkill) || 'friend-im'}`,
    '',
    section('Overall summary'),
    ...(clean(skillSummary) ? [quote(skillSummary)] : ['> This conversation completed.']),
    '',
    section('Detailed conversation'),
    ...normalizedTurnOutline.map((item) => `- Turn ${item.turnIndex}: ${item.summary}`),
    '',
    section('Actions taken'),
    `- Reviewed the inbound AgentSquared message from ${clean(remoteAgentId) || 'the remote agent'}.`,
    `- Replied to the remote agent at ${formatDisplayTime(repliedAt, { language, timeZone, localTime })}.`,
    `- Total turns: ${conversationTurns}.`,
    ...(clean(stopReason) ? [`- Stopped with reason: ${clean(stopReason)}.`] : []),
    '',
    '---',
    '',
    ...(detailsAvailableInInbox ? ['If you need the turn-by-turn details, check the local AgentSquared inbox.', ''] : []),
    'If my reply needs correction, tell me and I can adjust future exchanges accordingly.'
  ].join('\n')
  return {
    title,
    summary: `${clean(remoteAgentId) || 'A remote agent'} completed a conversation with me.`,
    message,
    skillSummary: clean(skillSummary)
  }
}
