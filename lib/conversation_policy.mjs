function clean(value) {
  return `${value ?? ''}`.trim()
}

export const PLATFORM_MAX_TURNS = 20

const DEFAULT_SKILL_MAX_TURNS = Object.freeze({
  'friend-im': 1,
  'agent-mutual-learning': 8
})

const VALID_DECISIONS = new Set(['continue', 'done', 'handoff'])

const VALID_STOP_REASONS = new Set([
  'goal-satisfied',
  'no-new-information',
  'receiver-budget-limit',
  'owner-approval-required',
  'unsafe-or-sensitive',
  'max-turns-reached',
  'peer-requested-stop',
  'timeout',
  'single-turn'
])

function parsePositiveInteger(value, fallback = 0) {
  const parsed = Number.parseInt(`${value ?? ''}`, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }
  return parsed
}

function extractFrontmatter(text = '') {
  const match = `${text ?? ''}`.match(/^---\n([\s\S]*?)\n---/)
  return match?.[1] ?? ''
}

function readFrontmatterValue(frontmatter = '', key = '') {
  const match = `${frontmatter}`.match(new RegExp(`^\\s*${clean(key)}\\s*:\\s*(.+)\\s*$`, 'm'))
  return clean(match?.[1] ?? '').replace(/^["']|["']$/g, '')
}

export function clampConversationMaxTurns(value, fallback = 1) {
  const boundedFallback = Math.max(1, Math.min(PLATFORM_MAX_TURNS, parsePositiveInteger(fallback, 1) || 1))
  const parsed = parsePositiveInteger(value, boundedFallback)
  return Math.max(1, Math.min(PLATFORM_MAX_TURNS, parsed || boundedFallback))
}

export function parseSkillDocumentPolicy(text = '', {
  fallbackName = ''
} = {}) {
  const frontmatter = extractFrontmatter(text)
  const name = clean(readFrontmatterValue(frontmatter, 'name')) || clean(fallbackName)
  const maxTurns = clampConversationMaxTurns(
    readFrontmatterValue(frontmatter, 'maxTurns') || readFrontmatterValue(frontmatter, 'max_turns'),
    DEFAULT_SKILL_MAX_TURNS[name] ?? 1
  )
  return {
    name,
    maxTurns
  }
}

export function resolveSkillMaxTurns(skillName = '', sharedSkill = null) {
  const normalizedSkill = clean(skillName).toLowerCase()
  const sharedSkillName = clean(sharedSkill?.name).toLowerCase()
  if (sharedSkillName && normalizedSkill && sharedSkillName === normalizedSkill) {
    return clampConversationMaxTurns(sharedSkill?.maxTurns, DEFAULT_SKILL_MAX_TURNS[normalizedSkill] ?? 1)
  }
  if (normalizedSkill in DEFAULT_SKILL_MAX_TURNS) {
    return clampConversationMaxTurns(DEFAULT_SKILL_MAX_TURNS[normalizedSkill], 1)
  }
  return 1
}

export function normalizeConversationControl(raw = {}, {
  defaultTurnIndex = 1,
  defaultDecision = 'done',
  defaultStopReason = '',
  defaultFinalize = null
} = {}) {
  const turnIndex = Math.max(1, parsePositiveInteger(raw?.turnIndex, defaultTurnIndex || 1) || 1)
  const decision = VALID_DECISIONS.has(clean(raw?.decision).toLowerCase())
    ? clean(raw?.decision).toLowerCase()
    : clean(defaultDecision).toLowerCase() || 'done'
  const stopReason = VALID_STOP_REASONS.has(clean(raw?.stopReason).toLowerCase())
    ? clean(raw?.stopReason).toLowerCase()
    : clean(defaultStopReason).toLowerCase()
  const computedFinalize = typeof defaultFinalize === 'boolean'
    ? defaultFinalize
    : decision !== 'continue'
  const finalize = typeof raw?.finalize === 'boolean'
    ? raw.finalize
    : computedFinalize
  return {
    turnIndex,
    decision,
    stopReason,
    finalize: finalize || decision !== 'continue'
  }
}

export function shouldContinueConversation(control = {}) {
  const normalized = normalizeConversationControl(control)
  return normalized.decision === 'continue' && !normalized.finalize
}

