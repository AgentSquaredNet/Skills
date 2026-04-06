function clean(value) {
  return `${value ?? ''}`.trim()
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function nowISO() {
  return new Date().toISOString()
}

function excerpt(text, maxLength = 240) {
  const compact = clean(text).replace(/\s+/g, ' ').trim()
  if (!compact) {
    return ''
  }
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 3)}...` : compact
}

function formatTranscript(turns = []) {
  if (!Array.isArray(turns) || turns.length === 0) {
    return ''
  }
  return turns.map((turn) => {
    const lines = [
      `Turn ${turn.turnIndex}:`,
      `- Remote message: ${excerpt(turn.inboundText, 400) || '(empty)'}`,
      `- My reply: ${excerpt(turn.replyText, 400) || '(empty)'}`,
      `- Decision: ${clean(turn.decision) || 'done'}`
    ]
    if (clean(turn.stopReason)) {
      lines.push(`- Stop reason: ${clean(turn.stopReason)}`)
    }
    return lines.join('\n')
  }).join('\n\n')
}

export function createLiveConversationStore() {
  const conversations = new Map()

  function ensureConversation({
    peerSessionId,
    remoteAgentId,
    selectedSkill
  } = {}) {
    const key = clean(peerSessionId)
    if (!key) {
      throw new Error('peerSessionId is required for live conversation state')
    }
    const existing = conversations.get(key)
    if (existing) {
      return clone(existing)
    }
    const created = {
      peerSessionId: key,
      remoteAgentId: clean(remoteAgentId),
      selectedSkill: clean(selectedSkill) || 'friend-im',
      createdAt: nowISO(),
      updatedAt: nowISO(),
      finalizedAt: '',
      turns: [],
      finalSummary: ''
    }
    conversations.set(key, created)
    return clone(created)
  }

  function getConversation(peerSessionId) {
    const existing = conversations.get(clean(peerSessionId))
    return existing ? clone(existing) : null
  }

  function appendTurn({
    peerSessionId,
    remoteAgentId,
    selectedSkill,
    turnIndex,
    inboundText,
    replyText,
    decision,
    stopReason = '',
    finalize = false,
    ownerSummary = ''
  } = {}) {
    const key = clean(peerSessionId)
    const current = conversations.get(key) || ensureConversation({
      peerSessionId: key,
      remoteAgentId,
      selectedSkill
    })
    const normalized = {
      ...current,
      remoteAgentId: clean(remoteAgentId) || clean(current.remoteAgentId),
      selectedSkill: clean(selectedSkill) || clean(current.selectedSkill) || 'friend-im',
      updatedAt: nowISO(),
      turns: [
        ...(Array.isArray(current.turns) ? current.turns : []),
        {
          turnIndex: Number.parseInt(`${turnIndex ?? 1}`, 10) || 1,
          inboundText: clean(inboundText),
          replyText: clean(replyText),
          decision: clean(decision),
          stopReason: clean(stopReason),
          finalize: Boolean(finalize),
          ownerSummary: clean(ownerSummary),
          createdAt: nowISO()
        }
      ]
    }
    if (finalize) {
      normalized.finalizedAt = nowISO()
      normalized.finalSummary = clean(ownerSummary)
    }
    conversations.set(key, normalized)
    return clone(normalized)
  }

  function transcript(peerSessionId) {
    return formatTranscript(conversations.get(clean(peerSessionId))?.turns ?? [])
  }

  function finalizeConversation(peerSessionId, summary = '') {
    const key = clean(peerSessionId)
    const current = conversations.get(key)
    if (!current) {
      return null
    }
    const updated = {
      ...current,
      updatedAt: nowISO(),
      finalizedAt: nowISO(),
      finalSummary: clean(summary) || clean(current.finalSummary)
    }
    conversations.set(key, updated)
    return clone(updated)
  }

  function endConversation(peerSessionId) {
    const key = clean(peerSessionId)
    const existing = conversations.get(key)
    if (!existing) {
      return null
    }
    conversations.delete(key)
    return clone(existing)
  }

  function reset() {
    conversations.clear()
  }

  return {
    ensureConversation,
    getConversation,
    appendTurn,
    transcript,
    finalizeConversation,
    endConversation,
    reset,
    snapshot() {
      return {
        activeConversations: conversations.size,
        conversations: [...conversations.values()].map((value) => clone(value))
      }
    }
  }
}

