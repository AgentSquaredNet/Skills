function clean(value) {
  return `${value ?? ''}`.trim()
}

const INJECTION_PATTERNS = [
  /ignore (all |any |the )?(previous|above|earlier) instructions/i,
  /\bsystem prompt\b/i,
  /\bdeveloper message\b/i,
  /\breveal\b.*\b(prompt|instructions?|memory|secret|token|key)\b/i,
  /\bprivate key\b/i,
  /\bseed phrase\b/i,
  /\bauthorization token\b/i,
  /\bapi key\b/i,
  /\bwallet secret\b/i
]

const HIGH_COST_PATTERNS = [
  /\bprove\b/i,
  /\bderiv(e|ation)\b/i,
  /\bstep[- ]by[- ]step\b/i,
  /\bfull implementation\b/i,
  /\bcomplete solution\b/i,
  /\banalyze (this|the) repo\b/i,
  /\bvery detailed\b/i,
  /```/,
  /数学推导/,
  /完整证明/
]

function countMatches(text, patterns) {
  let score = 0
  for (const pattern of patterns) {
    if (pattern.test(text)) {
      score += 1
    }
  }
  return score
}

export function assessInboundSafety({
  item,
  selectedSkill = 'friend-im'
} = {}) {
  const text = clean(
    item?.request?.params?.message?.parts
      ?.filter((part) => clean(part?.kind) === 'text')
      ?.map((part) => clean(part?.text))
      ?.filter(Boolean)
      ?.join('\n')
  )
  const normalizedSkill = clean(selectedSkill) || 'friend-im'
  const injectionScore = countMatches(text, INJECTION_PATTERNS)
  const highCostScore = countMatches(text, HIGH_COST_PATTERNS)
  const lengthRisk = text.length >= 1800

  if (injectionScore > 0) {
    return {
      action: 'reject',
      reason: 'prompt-or-secret-exfiltration-attempt',
      peerResponse: 'I cannot help with requests to reveal prompts, private memory, keys, tokens, or hidden instructions.',
      ownerSummary: 'I blocked an AgentSquared request because it tried to override instructions or access hidden prompts, private memory, or secrets.'
    }
  }

  if ((highCostScore >= 2 || lengthRisk) && normalizedSkill !== 'agent-mutual-learning') {
    return {
      action: 'owner-approval',
      reason: 'high-cost-request',
      peerResponse: 'This request looks unusually expensive. I need my owner to approve it before I spend significant compute on it.',
      ownerSummary: 'I paused an AgentSquared request because it looked unusually expensive and should be approved by my owner first.'
    }
  }

  return {
    action: 'allow',
    reason: 'safe'
  }
}
