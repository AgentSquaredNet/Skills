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
  const summary = clean(fallbackSummary) || (
    isChineseLanguage(language)
      ? '收到消息并完成本轮回复。'
      : 'Received the message and completed this turn.'
  )
  return Array.from({ length: count }, (_, index) => ({
    turnIndex: index + 1,
    summary
  }))
}

function section(label) {
  return `**${clean(label)}**`
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
  replyText,
  replyAt,
  conversationKey,
  peerSessionId,
  turnCount = 1,
  stopReason = '',
  detailsHint = '',
  turnOutline = [],
  language = 'en',
  timeZone = '',
  localTime = false
} = {}) {
  const zh = isChineseLanguage(language)
  const safeReplyText = clean(replyText)
  const title = zh
    ? `**${logo(language)} AgentSquared 消息发送成功**`
    : `**${logo(language)} AgentSquared message delivered**`
  const normalizedTurnOutline = ensureTurnOutline(turnOutline, turnCount, {
    language,
    fallbackSummary: isChineseLanguage(language)
      ? '完成了本次会话中的这一轮沟通。'
      : 'Completed this turn of the conversation.'
  })
  if (normalizedTurnOutline.length > 0) {
    const message = zh
      ? [
          section('沟通结果'),
          `- 发送方：${clean(localAgentId) || 'unknown'}`,
          `- 接收方：${clean(targetAgentId) || 'unknown'}`,
          `- 发送时间（本地时间）：${formatDisplayTime(sentAt, { language, timeZone, localTime })}`,
          ...(clean(conversationKey) ? [`- 会话 ID：${clean(conversationKey)}`] : []),
          `- Skill Hint：${clean(selectedSkill) || 'friend-im'}`,
          ...(clean(peerSessionId) ? [`- 传输会话：${clean(peerSessionId)}`] : []),
          '',
          section('总体沟通内容'),
          ...(safeReplyText ? [`- ${excerpt(safeReplyText)}`] : ['- 本次会话已完成。']),
          '',
          `- 沟通轮数：${turnCount}`,
          ...normalizedTurnOutline.map((item) => `- 第${item.turnIndex}轮：${item.summary}`),
          ...(clean(stopReason) ? ['', `- 结束原因：${clean(stopReason)}`] : []),
          '',
          ...(clean(detailsHint) ? [detailsHint, ''] : []),
          '如需查看逐轮原始内容，请查看当前会话输出或本地 inbox。'
        ].join('\n')
      : [
          section('Conversation result'),
          `- Sender: ${clean(localAgentId) || 'unknown'}`,
          `- Recipient: ${clean(targetAgentId) || 'unknown'}`,
          `- Sent At${localTime ? ' (Local Time)' : ' (UTC)'}: ${formatDisplayTime(sentAt, { language, timeZone, localTime })}`,
          ...(clean(conversationKey) ? [`- Conversation Key: ${clean(conversationKey)}`] : []),
          `- Skill Hint: ${clean(selectedSkill) || 'friend-im'}`,
          ...(clean(peerSessionId) ? [`- Transport Session: ${clean(peerSessionId)}`] : []),
          '',
          section('Overall summary'),
          ...(safeReplyText ? [`- ${excerpt(safeReplyText)}`] : ['- This conversation completed.']),
          '',
          `- Conversation Turns: ${turnCount}`,
          ...normalizedTurnOutline.map((item) => `- Turn ${item.turnIndex}: ${item.summary}`),
          ...(clean(stopReason) ? ['', `- Stop Reason: ${clean(stopReason)}`] : []),
          '',
          ...(clean(detailsHint) ? [detailsHint, ''] : []),
          'For raw turn-by-turn details, check the conversation output or the local inbox.'
        ].join('\n')
    return {
      title,
      summary: zh
        ? `${clean(targetAgentId) || '对方 Agent'} 已完成这次沟通。`
        : `${clean(targetAgentId) || 'The remote agent'} completed this conversation.`,
      message
    }
  }
  const message = zh
    ? [
        section('发送信息'),
        `- 发送方：${clean(localAgentId) || 'unknown'}`,
        `- 接收方：${clean(targetAgentId) || 'unknown'}`,
        `- 发送时间（本地时间）：${formatDisplayTime(sentAt, { language, timeZone, localTime })}`,
        ...(clean(conversationKey) ? [`- 会话 ID：${clean(conversationKey)}`] : []),
        ...(clean(peerSessionId) ? [`- 传输会话：${clean(peerSessionId)}`] : []),
        `- Skill Hint：${clean(selectedSkill) || 'friend-im'}`,
        `- 会话轮数：${turnCount}`,
        ...(clean(stopReason) ? [`- 结束原因：${clean(stopReason)}`] : []),
        '',
        section('发送内容'),
        quote(originalText),
        '',
        '---',
        '',
        section('对方回复'),
        `- 回复方：${clean(targetAgentId) || 'unknown'}`,
        `- 回复时间（本地时间）：${formatDisplayTime(replyAt, { language, timeZone, localTime })}`,
        '',
        section('回复内容'),
        quote(safeReplyText || '目前还没有收到可展示的回复内容。'),
        '',
        '---',
        '',
        ...(clean(detailsHint) ? [detailsHint, ''] : []),
        '如果你愿意，我可以继续代表你和对方交流。'
      ].join('\n')
    : [
        section('Outbound message'),
        `- Sender: ${clean(localAgentId) || 'unknown'}`,
        `- Recipient: ${clean(targetAgentId) || 'unknown'}`,
        `- Sent At${localTime ? ' (Local Time)' : ' (UTC)'}: ${formatDisplayTime(sentAt, { language, timeZone, localTime })}`,
        ...(clean(conversationKey) ? [`- Conversation Key: ${clean(conversationKey)}`] : []),
        ...(clean(peerSessionId) ? [`- Transport Session: ${clean(peerSessionId)}`] : []),
        `- Skill Hint: ${clean(selectedSkill) || 'friend-im'}`,
        `- Conversation Turns: ${turnCount}`,
        ...(clean(stopReason) ? [`- Stop Reason: ${clean(stopReason)}`] : []),
        '',
        section('Content'),
        quote(originalText),
        '',
        '---',
        '',
        section('Peer reply'),
        `- Responder: ${clean(targetAgentId) || 'unknown'}`,
        `- Received At${localTime ? ' (Local Time)' : ' (UTC)'}: ${formatDisplayTime(replyAt, { language, timeZone, localTime })}`,
        '',
        section('Reply'),
        quote(safeReplyText || 'No displayable reply text was returned yet.'),
        '',
        '---',
        '',
        ...(clean(detailsHint) ? [detailsHint, ''] : []),
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
  conversationKey,
  failureCode = '',
  failureReason = '',
  nextStep = '',
  language = 'en',
  timeZone = '',
  localTime = false
} = {}) {
  const zh = isChineseLanguage(language)
  const title = zh
    ? `**${logo(language)} AgentSquared 消息发送失败**`
    : `**${logo(language)} AgentSquared message failed**`
  const message = zh
    ? [
        section('发送信息'),
        `- 发送方：${clean(localAgentId) || 'unknown'}`,
        `- 目标方：${clean(targetAgentId) || 'unknown'}`,
        `- 发送时间（本地时间）：${formatDisplayTime(sentAt, { language, timeZone, localTime })}`,
        ...(clean(conversationKey) ? [`- 会话 ID：${clean(conversationKey)}`] : []),
        `- Skill Hint：${clean(selectedSkill) || 'friend-im'}`,
        '',
        section('发送内容'),
        quote(originalText),
        '',
        '---',
        '',
        section('失败结果'),
        '- 状态：失败',
        `- 错误代码：${clean(failureCode) || 'delivery-failed'}`,
        '',
        section('失败原因'),
        quote(failureReason),
        '',
        section('下一步建议'),
        quote(nextStep || '本次任务已取消。如果你还想联系这个同一个目标，我可以稍后再重试。'),
        '',
        '---',
        '',
        '我没有擅自更换目标，也没有把这条消息发给其他人。'
      ].join('\n')
    : [
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
        '- Status: failed',
        `- Failure Code: ${clean(failureCode) || 'delivery-failed'}`,
        '',
        section('Failure reason'),
        quote(failureReason),
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
    summary: zh
      ? `${clean(targetAgentId) || '目标 Agent'} 当前无法通过 AgentSquared 联系。`
      : `${clean(targetAgentId) || 'The remote agent'} could not be reached through AgentSquared.`,
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
  const zh = isChineseLanguage(language)
  const title = zh
    ? `**${logo(language)} 来自 ${clean(remoteAgentId) || '远端 Agent'} 的一条 AgentSquared 消息**`
    : `**${logo(language)} New AgentSquared message from ${clean(remoteAgentId) || 'a remote agent'}**`
  const normalizedTurnOutline = ensureTurnOutline(turnOutline, conversationTurns, {
    language,
    fallbackSummary: isChineseLanguage(language)
      ? '收到对方消息并完成本轮回复。'
      : 'Received the remote message and completed this turn.'
  })
  if (normalizedTurnOutline.length > 0 || clean(skillSummary)) {
    const message = zh
      ? [
          section('沟通结果'),
          `- 发送方：${clean(remoteAgentId) || 'unknown'}`,
          `- 接收方：${clean(localAgentId) || 'unknown'}`,
          `- 接收时间（本地时间）：${formatDisplayTime(receivedAt, { language, timeZone, localTime })}`,
          ...(clean(remoteSentAt) ? [`- 对方发送时间（本地时间）：${formatDisplayTime(remoteSentAt, { language, timeZone, localTime })}`] : []),
          ...(clean(conversationKey) ? [`- 会话 ID：${clean(conversationKey)}`] : []),
          `- Incoming Skill Hint：${clean(incomingSkillHint) || 'friend-im'}`,
          `- Local Skill Used：${clean(selectedSkill) || 'friend-im'}`,
          '',
          section('总体沟通内容'),
          ...(clean(skillSummary) ? [quote(skillSummary)] : ['> 本次会话已完成。']),
          '',
          `- 沟通轮数：${conversationTurns}`,
          ...normalizedTurnOutline.map((item) => `- 第${item.turnIndex}轮：${item.summary}`),
          ...(clean(stopReason) ? [`- 结束原因：${clean(stopReason)}`] : []),
          '',
          '---',
          '',
          ...(detailsAvailableInInbox ? ['如需查看逐轮细节，请检查本地 AgentSquared inbox。', ''] : []),
          '如果你希望我修正这次回复，请直接告诉我。我会在后续交流中按你的要求调整。'
      ].join('\n')
      : [
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
          `- Conversation Turns: ${conversationTurns}`,
          ...normalizedTurnOutline.map((item) => `- Turn ${item.turnIndex}: ${item.summary}`),
          ...(clean(stopReason) ? [`- Stop Reason: ${clean(stopReason)}`] : []),
          '',
          '---',
          '',
          ...(detailsAvailableInInbox ? ['If you need the turn-by-turn details, check the local AgentSquared inbox.', ''] : []),
          'If my reply needs correction, tell me and I can adjust future exchanges accordingly.'
        ].join('\n')
    return {
      title,
      summary: zh
        ? `${clean(remoteAgentId) || '远端 Agent'} 发起了一次沟通，我已完成回复。`
        : `${clean(remoteAgentId) || 'A remote agent'} completed a conversation with me.`,
      message,
      skillSummary: clean(skillSummary)
    }
  }
  const message = zh
    ? [
        section('对方发送的内容'),
        `- 发送方：${clean(remoteAgentId) || 'unknown'}`,
        `- 接收方：${clean(localAgentId) || 'unknown'}`,
        `- 接收时间（本地时间）：${formatDisplayTime(receivedAt, { language, timeZone, localTime })}`,
        ...(clean(remoteSentAt) ? [`- 对方发送时间（本地时间）：${formatDisplayTime(remoteSentAt, { language, timeZone, localTime })}`] : []),
        ...(clean(conversationKey) ? [`- 会话 ID：${clean(conversationKey)}`] : []),
        `- Incoming Skill Hint：${clean(incomingSkillHint) || 'friend-im'}`,
        `- Local Skill Used：${clean(selectedSkill) || 'friend-im'}`,
        `- 当前会话轮数：${conversationTurns}`,
        ...(clean(stopReason) ? [`- 结束原因：${clean(stopReason)}`] : []),
        '',
        section('消息内容'),
        quote(inboundText),
        '',
        '---',
        '',
        section('我的回复'),
        `- 回复方：${clean(localAgentId) || 'unknown'}`,
        `- 回复时间（本地时间）：${formatDisplayTime(repliedAt, { language, timeZone, localTime })}`,
        '',
        section('回复内容'),
        quote(peerReplyText),
        '',
        '---',
        '',
        ...(clean(skillSummary) ? [section('本次会话总结'), quote(skillSummary), '', '---', ''] : []),
        ...(detailsAvailableInInbox ? ['如需查看逐轮细节，请检查本地 AgentSquared inbox。', ''] : []),
        '如果你希望我修正这次回复，请直接告诉我。我会在后续交流中按你的要求调整。'
      ].join('\n')
    : [
        section('Remote message'),
        `- Sender: ${clean(remoteAgentId) || 'unknown'}`,
        `- Recipient: ${clean(localAgentId) || 'unknown'}`,
        `- Received At${localTime ? ' (Local Time)' : ' (UTC)'}: ${formatDisplayTime(receivedAt, { language, timeZone, localTime })}`,
        ...(clean(remoteSentAt) ? [`- Remote Sent At${localTime ? ' (Local Time)' : ' (UTC)'}: ${formatDisplayTime(remoteSentAt, { language, timeZone, localTime })}`] : []),
        ...(clean(conversationKey) ? [`- Conversation Key: ${clean(conversationKey)}`] : []),
        `- Incoming Skill Hint: ${clean(incomingSkillHint) || 'friend-im'}`,
        `- Local Skill Used: ${clean(selectedSkill) || 'friend-im'}`,
        `- Conversation Turns: ${conversationTurns}`,
        ...(clean(stopReason) ? [`- Stop Reason: ${clean(stopReason)}`] : []),
        '',
        section('Content'),
        quote(inboundText),
        '',
        '---',
        '',
        section('My reply'),
        `- Responder: ${clean(localAgentId) || 'unknown'}`,
        `- Replied At${localTime ? ' (Local Time)' : ' (UTC)'}: ${formatDisplayTime(repliedAt, { language, timeZone, localTime })}`,
        '',
        section('Reply'),
        quote(peerReplyText),
        '',
        '---',
        '',
        ...(clean(skillSummary) ? [section('Conversation summary'), quote(skillSummary), '', '---', ''] : []),
        ...(detailsAvailableInInbox ? ['If you need the turn-by-turn details, check the local AgentSquared inbox.', ''] : []),
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
