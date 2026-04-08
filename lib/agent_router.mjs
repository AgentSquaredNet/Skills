import { normalizeConversationControl, resolveInboundConversationIdentity } from './conversation_policy.mjs'

function clean(value) {
  return `${value ?? ''}`.trim()
}

function extractConversationMetadata(item = null) {
  const metadata = item?.request?.params?.metadata
  return metadata && typeof metadata === 'object' ? metadata : {}
}

function synthesizeRuntimeUnavailableExecution({
  item,
  selectedSkill,
  defaultSkill,
  mailboxKey,
  reject
} = {}) {
  const finalSkill = clean(defaultSkill) || clean(selectedSkill) || DEFAULT_ROUTER_DEFAULT_SKILL
  const remoteAgentId = clean(item?.remoteAgentId) || 'the remote agent'
  const metadata = extractConversationMetadata(item)
  const conversation = normalizeConversationControl(metadata, {
    defaultTurnIndex: 1,
    defaultDecision: 'done',
    defaultStopReason: 'receiver-runtime-unavailable',
    defaultFinalize: true
  })
  const conversationKey = clean(metadata.conversationKey)
  const peerReplyText = 'My local AI runtime is temporarily unavailable right now, so I cannot continue this AgentSquared conversation. Please try again later.'
  return {
    peerResponse: {
      message: {
        kind: 'message',
        role: 'agent',
        parts: [{ kind: 'text', text: peerReplyText }]
      },
      metadata: {
        selectedSkill: finalSkill,
        mailboxKey: clean(mailboxKey),
        conversationKey,
        turnIndex: conversation.turnIndex,
        decision: 'done',
        stopReason: 'receiver-runtime-unavailable',
        finalize: true
      }
    },
    ownerReport: {
      title: '**🅰️✌️ AgentSquared local runtime unavailable**',
      summary: `AgentSquared replied to ${remoteAgentId} with a temporary runtime-unavailable message because the local AI runtime failed.`,
      message: [
        '**Runtime status**',
        `- Remote Agent: ${remoteAgentId}`,
        `- Local Skill Used: ${finalSkill}`,
        ...(conversationKey ? [`- Conversation Key: ${conversationKey}`] : []),
        `- Conversation Turns: ${conversation.turnIndex}`,
        '- Stop Reason: receiver-runtime-unavailable',
        '',
        '**What happened**',
        '> The local AI runtime failed while handling this inbound AgentSquared message, so AgentSquared sent a polite temporary-unavailable reply instead of leaving the peer hanging.',
        '',
        '**Error detail**',
        `> ${clean(reject?.message) || 'local runtime execution failed'}`,
        '',
        'You can retry later after the local runtime is healthy again.'
      ].join('\n'),
      selectedSkill: finalSkill,
      runtimeAdapter: 'fallback',
      conversationKey,
      turnIndex: conversation.turnIndex,
      decision: 'done',
      stopReason: 'receiver-runtime-unavailable',
      finalize: true,
      error: clean(reject?.message)
    }
  }
}

export const DEFAULT_ROUTER_DEFAULT_SKILL = 'friend-im'
export const DEFAULT_ROUTER_SKILLS = ['friend-im', 'agent-mutual-learning']

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

function buildStartNoticeConversation(item) {
  const metadata = extractConversationMetadata(item)
  return normalizeConversationControl({
    conversationKey: clean(metadata.conversationKey),
    turnIndex: Number.parseInt(`${metadata.turnIndex ?? 1}`, 10) || 1,
    decision: clean(metadata.decision),
    stopReason: clean(metadata.stopReason),
    finalize: Boolean(metadata.finalize)
  }, {
    defaultTurnIndex: 1,
    defaultDecision: 'continue',
    defaultStopReason: '',
    defaultFinalize: false
  })
}

export function resolveMailboxKey(item) {
  return resolveInboundConversationIdentity(item).mailboxKey
}

export function resolveConversationLockKey(item) {
  return resolveInboundConversationIdentity(item).conversationKey
}

export function chooseInboundSkill(item, {
  routerSkills = DEFAULT_ROUTER_SKILLS,
  defaultSkill = DEFAULT_ROUTER_DEFAULT_SKILL
} = {}) {
  const knownSkills = normalizeRouterSkills(routerSkills)
  const knownSkillSet = new Set(knownSkills)
  const suggestedSkill = clean(item?.suggestedSkill)
  const requestDefaultSkill = clean(item?.defaultSkill)
  const localDefaultSkill = clean(defaultSkill) || DEFAULT_ROUTER_DEFAULT_SKILL

  const candidates = [
    suggestedSkill,
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
  conversationKeyForItem = resolveConversationLockKey,
  conversationLockMs = 5 * 60 * 1000,
  handleItem
} = {}) {
  if (typeof handleItem !== 'function') {
    throw new Error('handleItem is required')
  }

  const mailboxes = new Map()
  const idleWaiters = []
  let activeMailboxes = 0
  let activeConversation = null

  function clearConversationLock() {
    if (activeConversation?.timer) {
      clearTimeout(activeConversation.timer)
    }
    activeConversation = null
  }

  function refreshConversationLock(conversationKey) {
    const normalizedConversationKey = clean(conversationKey)
    if (!normalizedConversationKey) {
      return
    }
    const expiresAt = Date.now() + conversationLockMs
    if (!activeConversation || activeConversation.conversationKey !== normalizedConversationKey) {
      clearConversationLock()
      activeConversation = {
        conversationKey: normalizedConversationKey,
        expiresAt,
        timer: null
      }
    } else {
      activeConversation.expiresAt = expiresAt
      if (activeConversation.timer) {
        clearTimeout(activeConversation.timer)
      }
    }
    activeConversation.timer = setTimeout(() => {
      if (activeConversation?.conversationKey === normalizedConversationKey && Date.now() >= activeConversation.expiresAt) {
        clearConversationLock()
        pump()
        flushIdleWaitersIfNeeded()
      }
    }, Math.max(1, conversationLockMs))
  }

  function isConversationLockAvailable(conversationKey) {
    if (!activeConversation) {
      return true
    }
    if (Date.now() >= activeConversation.expiresAt) {
      clearConversationLock()
      return true
    }
    return clean(conversationKey) === clean(activeConversation.conversationKey)
  }

  function pendingCount() {
    let count = 0
    for (const mailbox of mailboxes.values()) {
      count += mailbox.queue.length
      if (mailbox.running) {
        count += 1
      }
    }
    if (activeConversation) {
      count += 1
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
    const mailboxConversationKey = clean(mailbox?.conversationKey)
    if (
      mailbox.running
      || mailbox.queue.length === 0
      || activeMailboxes >= maxActiveMailboxes
      || !isConversationLockAvailable(mailboxConversationKey)
    ) {
      return
    }
    refreshConversationLock(mailboxConversationKey)
    mailbox.running = true
    activeMailboxes += 1

    const loop = async () => {
      try {
        while (mailbox.queue.length > 0) {
          const entry = mailbox.queue.shift()
          try {
            const result = await handleItem(entry.item, { mailboxKey, conversationKey: mailboxConversationKey })
            entry.resolve(result)
            refreshConversationLock(mailboxConversationKey)
            const shouldReleaseConversationLock = result?.releaseConversationLock !== false
            if (shouldReleaseConversationLock && activeConversation?.conversationKey === mailboxConversationKey && mailbox.queue.length === 0) {
              clearConversationLock()
            }
          } catch (error) {
            entry.reject(error)
            if (activeConversation?.conversationKey === mailboxConversationKey && mailbox.queue.length === 0) {
              clearConversationLock()
            }
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
    let mailboxKey
    let conversationKey
    try {
      mailboxKey = mailboxKeyForItem(item)
      conversationKey = conversationKeyForItem(item)
    } catch (error) {
      return Promise.reject(error)
    }
    if (!mailboxes.has(mailboxKey)) {
      mailboxes.set(mailboxKey, { running: false, queue: [], conversationKey })
    }
    const mailbox = mailboxes.get(mailboxKey)
    mailbox.conversationKey = conversationKey
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
        activeConversationKey: activeConversation?.conversationKey ?? '',
        pendingItems: pendingCount(),
        mailboxes: [...mailboxes.entries()].map(([mailboxKey, mailbox]) => ({
          mailboxKey,
          conversationKey: mailbox.conversationKey,
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

  function shouldFallbackToDefaultSkill(reject = null) {
    const code = Number.parseInt(`${reject?.code ?? 0}`, 10) || 0
    if (code >= 500) {
      return true
    }
    return false
  }

  const scheduler = createMailboxScheduler({
    maxActiveMailboxes,
    async handleItem(item, { mailboxKey, conversationKey }) {
      const startConversation = buildStartNoticeConversation(item)
      const selectedSkill = chooseInboundSkill(item, {
        routerSkills: normalizedRouterSkills,
        defaultSkill: normalizedDefaultSkill
      })
      if (!selectedSkill) {
        await onReject(item, {
          code: 409,
          message: `no supported local skill could handle inbound request for mailbox ${mailboxKey}`
        })
        return { selectedSkill: '', rejected: true, releaseConversationLock: true }
      }

      let execution
      try {
        execution = await executeInbound({
          item,
          selectedSkill,
          mailboxKey
        })
      } catch (error) {
        execution = {
          reject: {
            code: Number.parseInt(`${error?.code ?? 500}`, 10) || 500,
            message: clean(error?.message) || 'local runtime execution failed'
          }
        }
      }

      const canFallbackToDefault = selectedSkill !== normalizedDefaultSkill
        && normalizedRouterSkills.includes(normalizedDefaultSkill)
        && execution?.reject
        && shouldFallbackToDefaultSkill(execution.reject)

      if (canFallbackToDefault) {
        try {
          execution = await executeInbound({
            item: {
              ...item,
              fallbackFromSkill: selectedSkill,
              fallbackToSkill: normalizedDefaultSkill
            },
            selectedSkill: normalizedDefaultSkill,
            mailboxKey
          })
        } catch (error) {
          execution = {
            reject: {
              code: Number.parseInt(`${error?.code ?? 500}`, 10) || 500,
              message: clean(error?.message) || 'local runtime execution failed'
            }
          }
        }
      }

      if (execution?.reject) {
        if (shouldFallbackToDefaultSkill(execution.reject)) {
          execution = synthesizeRuntimeUnavailableExecution({
            item,
            selectedSkill,
            defaultSkill: normalizedDefaultSkill,
            mailboxKey,
            reject: execution.reject
          })
        }
      }

      if (execution?.reject) {
        await onReject(item, execution.reject)
        return { selectedSkill, rejected: true, releaseConversationLock: true }
      }

      if (execution?.ownerReport != null && typeof notifyOwner === 'function') {
        const rawConversation = execution?.peerResponse?.metadata && typeof execution.peerResponse.metadata === 'object'
          ? execution.peerResponse.metadata
          : {}
        const conversation = normalizeConversationControl(rawConversation, {
          defaultTurnIndex: 1,
          defaultDecision: 'done',
          defaultStopReason: 'single-turn',
          defaultFinalize: true
        })
        await notifyOwner({
          item,
          selectedSkill,
          mailboxKey,
          ownerReport: execution.ownerReport,
          peerResponse: execution.peerResponse,
          conversation: {
            ...rawConversation,
            ...conversation
          },
          notifyOwnerNow: Boolean(conversation.finalize || conversation.decision === 'done' || conversation.decision === 'handoff')
        })
      }

      await onRespond(item, execution.peerResponse)
      const rawConversation = execution?.peerResponse?.metadata && typeof execution.peerResponse.metadata === 'object'
        ? execution.peerResponse.metadata
        : {}
      const conversation = normalizeConversationControl(rawConversation, {
        defaultTurnIndex: 1,
        defaultDecision: 'done',
        defaultStopReason: 'single-turn',
        defaultFinalize: true
      })
      return {
        selectedSkill: canFallbackToDefault ? normalizedDefaultSkill : selectedSkill,
        rejected: false,
        ownerReportDelivered: execution?.ownerReport != null && typeof notifyOwner === 'function',
        releaseConversationLock: Boolean(conversation.finalize || conversation.decision === 'done' || conversation.decision === 'handoff'),
        conversationKey: clean(rawConversation.conversationKey) || clean(conversationKey)
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
