function clean(value) {
  return `${value ?? ''}`.trim()
}

export const DEFAULT_ROUTER_DEFAULT_SKILL = 'friend-im'
export const DEFAULT_ROUTER_SKILLS = ['friend-im', 'agent-mutual-learning']

const MUTUAL_LEARNING_PATTERNS = [
  /mutual[- ]learning/i,
  /\bcompare\b/i,
  /\bworkflow(?:s)?\b/i,
  /\bskills?\b/i,
  /\blearn(?:ing)?\b/i,
  /\btopics?\s*:/i
]

export function normalizeRouterSkills(skills = DEFAULT_ROUTER_SKILLS) {
  const seen = new Set()
  const out = []
  for (const value of skills) {
    const skill = clean(value)
    if (!skill || seen.has(skill)) {
      continue
    }
    seen.add(skill)
    out.push(skill)
  }
  return out.length > 0 ? out : [...DEFAULT_ROUTER_SKILLS]
}

export function extractInboundText(item) {
  const parts = item?.request?.params?.message?.parts ?? []
  const texts = parts
    .filter((part) => clean(part?.kind) === 'text')
    .map((part) => clean(part?.text))
    .filter(Boolean)
  return texts.join('\n').trim()
}

export function inferSkillFromText(text = '') {
  const normalizedText = clean(text)
  if (!normalizedText) {
    return ''
  }
  let score = 0
  for (const pattern of MUTUAL_LEARNING_PATTERNS) {
    if (pattern.test(normalizedText)) {
      score += 1
    }
  }
  if (score >= 2) {
    return 'agent-mutual-learning'
  }
  return 'friend-im'
}

export function resolveMailboxKey(item) {
  const remoteAgentId = clean(item?.remoteAgentId)
  if (remoteAgentId) {
    return `agent:${remoteAgentId.toLowerCase()}`
  }
  const peerSessionId = clean(item?.peerSessionId)
  if (peerSessionId) {
    return `session:${peerSessionId}`
  }
  const inboundId = clean(item?.inboundId)
  if (inboundId) {
    return `inbound:${inboundId}`
  }
  return 'inbound:unknown'
}

export function inferSkillFromContent(item) {
  return inferSkillFromText(extractInboundText(item))
}

export function chooseInboundSkill(item, {
  routerSkills = DEFAULT_ROUTER_SKILLS,
  defaultSkill = DEFAULT_ROUTER_DEFAULT_SKILL
} = {}) {
  const knownSkills = normalizeRouterSkills(routerSkills)
  const knownSkillSet = new Set(knownSkills)
  const contentSkill = clean(inferSkillFromContent(item))
  const suggestedSkill = clean(item?.suggestedSkill)
  const requestDefaultSkill = clean(item?.defaultSkill)
  const localDefaultSkill = clean(defaultSkill) || DEFAULT_ROUTER_DEFAULT_SKILL

  const candidates = [
    suggestedSkill,
    contentSkill,
    requestDefaultSkill,
    localDefaultSkill,
    DEFAULT_ROUTER_DEFAULT_SKILL
  ]

  for (const candidate of candidates) {
    if (candidate && knownSkillSet.has(candidate)) {
      return candidate
    }
  }
  return ''
}

export function createMailboxScheduler({
  maxActiveMailboxes = 8,
  mailboxKeyForItem = resolveMailboxKey,
  handleItem
} = {}) {
  if (typeof handleItem !== 'function') {
    throw new Error('handleItem is required')
  }

  const mailboxes = new Map()
  const idleWaiters = []
  let activeMailboxes = 0

  function pendingCount() {
    let count = 0
    for (const mailbox of mailboxes.values()) {
      count += mailbox.queue.length
      if (mailbox.running) {
        count += 1
      }
    }
    return count
  }

  function flushIdleWaitersIfNeeded() {
    if (activeMailboxes !== 0 || pendingCount() !== 0) {
      return
    }
    while (idleWaiters.length > 0) {
      const resolve = idleWaiters.shift()
      resolve?.()
    }
  }

  function runMailbox(mailboxKey, mailbox) {
    if (mailbox.running || mailbox.queue.length === 0 || activeMailboxes >= maxActiveMailboxes) {
      return
    }
    mailbox.running = true
    activeMailboxes += 1

    const loop = async () => {
      try {
        while (mailbox.queue.length > 0) {
          const entry = mailbox.queue.shift()
          try {
            const result = await handleItem(entry.item, { mailboxKey })
            entry.resolve(result)
          } catch (error) {
            entry.reject(error)
          }
        }
      } finally {
        mailbox.running = false
        activeMailboxes = Math.max(0, activeMailboxes - 1)
        if (mailbox.queue.length === 0) {
          mailboxes.delete(mailboxKey)
        }
        pump()
        flushIdleWaitersIfNeeded()
      }
    }

    loop().catch(() => {})
  }

  function pump() {
    for (const [mailboxKey, mailbox] of mailboxes.entries()) {
      if (activeMailboxes >= maxActiveMailboxes) {
        return
      }
      runMailbox(mailboxKey, mailbox)
    }
  }

  function enqueue(item) {
    const mailboxKey = mailboxKeyForItem(item)
    if (!mailboxes.has(mailboxKey)) {
      mailboxes.set(mailboxKey, { running: false, queue: [] })
    }
    const mailbox = mailboxes.get(mailboxKey)
    return new Promise((resolve, reject) => {
      mailbox.queue.push({ item, resolve, reject })
      pump()
    })
  }

  function whenIdle() {
    if (activeMailboxes === 0 && pendingCount() === 0) {
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      idleWaiters.push(resolve)
    })
  }

  return {
    enqueue,
    whenIdle,
    snapshot() {
      return {
        activeMailboxes,
        pendingItems: pendingCount(),
        mailboxes: [...mailboxes.entries()].map(([mailboxKey, mailbox]) => ({
          mailboxKey,
          running: mailbox.running,
          queued: mailbox.queue.length
        }))
      }
    }
  }
}

export function createAgentRouter({
  maxActiveMailboxes = 8,
  routerSkills = DEFAULT_ROUTER_SKILLS,
  defaultSkill = DEFAULT_ROUTER_DEFAULT_SKILL,
  executeInbound,
  notifyOwner = null,
  onRespond,
  onReject
} = {}) {
  if (typeof executeInbound !== 'function') {
    throw new Error('executeInbound is required')
  }
  if (typeof onRespond !== 'function') {
    throw new Error('onRespond is required')
  }
  if (typeof onReject !== 'function') {
    throw new Error('onReject is required')
  }

  const normalizedRouterSkills = normalizeRouterSkills(routerSkills)
  const normalizedDefaultSkill = clean(defaultSkill) || DEFAULT_ROUTER_DEFAULT_SKILL

  const scheduler = createMailboxScheduler({
    maxActiveMailboxes,
    async handleItem(item, { mailboxKey }) {
      const selectedSkill = chooseInboundSkill(item, {
        routerSkills: normalizedRouterSkills,
        defaultSkill: normalizedDefaultSkill
      })
      if (!selectedSkill) {
        await onReject(item, {
          code: 409,
          message: `no supported local skill could handle inbound request for mailbox ${mailboxKey}`
        })
        return { selectedSkill: '', rejected: true }
      }

      const execution = await executeInbound({
        item,
        selectedSkill,
        mailboxKey
      })

      if (execution?.reject) {
        await onReject(item, execution.reject)
        return { selectedSkill, rejected: true }
      }

      if (execution?.ownerReport != null && typeof notifyOwner === 'function') {
        const conversation = execution?.peerResponse?.metadata && typeof execution.peerResponse.metadata === 'object'
          ? execution.peerResponse.metadata
          : {}
        await notifyOwner({
          item,
          selectedSkill,
          mailboxKey,
          ownerReport: execution.ownerReport,
          peerResponse: execution.peerResponse,
          conversation,
          notifyOwnerNow: Boolean(conversation.finalize || conversation.decision === 'done' || conversation.decision === 'handoff')
        })
      }

      await onRespond(item, execution.peerResponse)
      return {
        selectedSkill,
        rejected: false,
        ownerReportDelivered: execution?.ownerReport != null && typeof notifyOwner === 'function'
      }
    }
  })

  return {
    routerSkills: normalizedRouterSkills,
    defaultSkill: normalizedDefaultSkill,
    enqueue(item) {
      return scheduler.enqueue(item)
    },
    whenIdle() {
      return scheduler.whenIdle()
    },
    snapshot() {
      return {
        routerSkills: normalizedRouterSkills,
        defaultSkill: normalizedDefaultSkill,
        executorMode: `${executeInbound?.mode ?? 'custom'}`.trim() || 'custom',
        ownerNotifyMode: `${notifyOwner?.mode ?? 'custom'}`.trim() || 'custom',
        scheduler: scheduler.snapshot()
      }
    }
  }
}
