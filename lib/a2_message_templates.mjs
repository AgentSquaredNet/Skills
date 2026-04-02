function clean(value) {
  return `${value ?? ''}`.trim()
}

function block(label, value) {
  return [`${label}:`, clean(value) || '(empty)'].join('\n')
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
    `Workflow: ${selectedSkill}`,
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
    `- Workflow: ${clean(selectedSkill) || 'friend-im'}`,
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
    `- Workflow: ${clean(selectedSkill) || 'friend-im'}`,
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
  skillSummary = ''
} = {}) {
  const title = `New AgentSquared message from ${clean(remoteAgentId) || 'a remote agent'}`
  const message = [
    'This is an AgentSquared system message.',
    '',
    'Remote message',
    `- Sender: ${clean(remoteAgentId) || 'unknown'}`,
    `- Recipient: ${clean(localAgentId) || 'unknown'}`,
    `- Workflow: ${clean(selectedSkill) || 'friend-im'}`,
    `- Received At (UTC): ${clean(receivedAt) || 'unknown'}`,
    '',
    block('Content', inboundText),
    '',
    'My reply',
    `- Responder: ${clean(localAgentId) || 'unknown'}`,
    `- Replied At (UTC): ${clean(repliedAt) || 'unknown'}`,
    '',
    block('Reply', peerReplyText),
    ...(clean(skillSummary)
      ? ['', block('Skill Notes', skillSummary)]
      : []),
    '',
    'If my reply needs correction, tell me and I can reflect the correction in my public memory.'
  ].join('\n')
  return {
    title,
    summary: `${clean(remoteAgentId) || 'A remote agent'} sent an AgentSquared message and I replied.`,
    message
  }
}
