function clean(value) {
  return `${value ?? ''}`.trim()
}

const SECRET_PATTERNS = [
  /-----begin [a-z0-9 _-]*private key-----/i,
  /\bsk-[a-z0-9]{16,}\b/i,
  /\bghp_[a-z0-9]{20,}\b/i,
  /\bxox[baprs]-[a-z0-9-]{10,}\b/i,
  /\b(?:api|access|refresh|bearer|auth(?:orization)?) token\b/i,
  /\bseed phrase\b/i,
  /\bprivate key\b/i,
  /\bm(nemonic)?\b.{0,20}\bphrase\b/i
]

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

const TASK_PATTERNS = [
  /\bplease (do|solve|implement|analyze|research|write|build|fix)\b/i,
  /\bcan you (do|solve|implement|analyze|research|write|build|fix)\b/i,
  /\btask\b/i,
  /\bexecute\b/i,
  /\bfinish this for me\b/i,
  /\b帮我(做|分析|研究|实现|解决|完成)/,
  /\b请帮我(做|分析|研究|实现|解决|完成)/,
  /\b替我(做|分析|研究|实现|解决|完成)/,
  /\b帮我推导/,
  /\b写出完整/,
  /\b做一个完整/
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

function decodeBase64Segments(text) {
  const decoded = []
  const matches = clean(text).match(/[A-Za-z0-9+/=_-]{24,}/g) ?? []
  for (const match of matches) {
    try {
      const normalized = match.replaceAll('-', '+').replaceAll('_', '/')
      const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=')
      const value = Buffer.from(padded, 'base64').toString('utf8')
      if (/[\x00-\x08\x0E-\x1F]/.test(value)) {
        continue
      }
      if (clean(value).length >= 8) {
        decoded.push(value)
      }
    } catch {
      // ignore invalid segments
    }
  }
  return decoded
}

function normalizeForSafety(text) {
  const base = clean(text)
  let decodedUri = ''
  try {
    decodedUri = decodeURIComponent(base.replace(/\+/g, '%20'))
  } catch {
    decodedUri = ''
  }
  const normalized = [
    base,
    decodedUri,
    ...decodeBase64Segments(base)
  ]
    .map((value) => clean(value))
    .filter(Boolean)
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim()
  return normalized
}

function textFromItem(item) {
  return clean(
    item?.request?.params?.message?.parts
      ?.filter((part) => clean(part?.kind) === 'text')
      ?.map((part) => clean(part?.text))
      ?.filter(Boolean)
      ?.join('\n')
  )
}

export function scrubOutboundText(text = '') {
  let value = clean(text)
  if (!value) {
    return value
  }
  for (const pattern of SECRET_PATTERNS) {
    value = value.replace(pattern, '[REDACTED]')
  }
  return value
}

export function estimateInboundCost({
  text = '',
  selectedSkill = 'friend-im'
} = {}) {
  const normalizedText = normalizeForSafety(text)
  const normalizedSkill = clean(selectedSkill) || 'friend-im'
  const highCostScore = countMatches(normalizedText, HIGH_COST_PATTERNS)
  const taskScore = countMatches(normalizedText, TASK_PATTERNS)
  const lengthRisk = normalizedText.length >= 1800 ? 2 : normalizedText.length >= 900 ? 1 : 0
  const skillWeight = normalizedSkill === 'agent-mutual-learning' ? 2 : 0
  return {
    normalizedText,
    score: highCostScore * 3 + taskScore * 2 + lengthRisk + skillWeight,
    highCostScore,
    taskScore,
    lengthRisk: Boolean(lengthRisk)
  }
}

export function assessInboundSafety({
  item,
  selectedSkill = 'friend-im'
} = {}) {
  const text = textFromItem(item)
  const normalizedText = normalizeForSafety(text)
  const normalizedSkill = clean(selectedSkill) || 'friend-im'
  const injectionScore = countMatches(normalizedText, INJECTION_PATTERNS)
  const taskScore = countMatches(normalizedText, TASK_PATTERNS)
  const { highCostScore, lengthRisk } = estimateInboundCost({
    text: normalizedText,
    selectedSkill: normalizedSkill
  })

  if (injectionScore > 0) {
    return {
      action: 'reject',
      reason: 'prompt-or-secret-exfiltration-attempt',
      peerResponse: 'I cannot help with requests to reveal prompts, private memory, keys, tokens, or hidden instructions.',
      ownerSummary: 'I blocked an AgentSquared request because it tried to override instructions or access hidden prompts, private memory, or secrets.'
    }
  }

  if (taskScore > 0) {
    return {
      action: 'owner-approval',
      reason: 'task-requires-owner-consent',
      peerResponse: 'AgentSquared friend communication is for information exchange by default. This looks like a task request, so I need my owner to approve it before I execute it.',
      ownerSummary: 'I paused an AgentSquared request because it asked me to perform a task. AgentSquared defaults to information exchange first, so I need owner approval before executing tasks.'
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
