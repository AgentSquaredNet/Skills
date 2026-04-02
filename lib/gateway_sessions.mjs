import { randomRequestId, utcNow } from './cli.mjs'

const DEFAULT_WAIT_MS = 30000
const DEFAULT_INBOUND_TIMEOUT_MS = 5 * 60 * 1000
const DEFAULT_PEER_SESSION_TTL_MS = 30 * 60 * 1000
const DEFAULT_HANDLED_REQUEST_TTL_MS = 6 * 60 * 60 * 1000
const DEFAULT_MAX_HANDLED_REQUESTS = 512

function nowISO() {
  return utcNow()
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

export function createGatewayRuntimeState({
  inboundTimeoutMs = DEFAULT_INBOUND_TIMEOUT_MS,
  peerSessionTTLms = DEFAULT_PEER_SESSION_TTL_MS,
  handledRequestTTLms = DEFAULT_HANDLED_REQUEST_TTL_MS,
  maxHandledRequests = DEFAULT_MAX_HANDLED_REQUESTS
} = {}) {
  const inboundQueue = []
  const nextWaiters = []
  const pendingInbound = new Map()
  const trustedSessions = new Map()
  const trustedByAgent = new Map()
  const handledRequests = new Map()

  function pruneExpiredInboundQueue() {
    const now = Date.now()
    for (let index = inboundQueue.length - 1; index >= 0; index -= 1) {
      const item = inboundQueue[index]
      if (!item || Date.parse(item.expiresAt) > now) {
        continue
      }
      inboundQueue.splice(index, 1)
    }
  }

  function releaseNextWaiter() {
    pruneExpiredInboundQueue()
    while (nextWaiters.length > 0) {
      const waiter = nextWaiters.shift()
      if (!waiter || Date.now() > waiter.expiresAt) {
        waiter?.resolve?.(null)
        continue
      }
      const next = inboundQueue.shift() ?? null
      waiter.resolve(next ? clone(next) : null)
      return
    }
  }

  function pruneExpiredTrustedSessions() {
    const now = Date.now()
    for (const [sessionId, session] of trustedSessions.entries()) {
      if (Date.parse(session.expiresAt) <= now) {
        trustedSessions.delete(sessionId)
        if (trustedByAgent.get(session.remoteAgentId) === sessionId) {
          trustedByAgent.delete(session.remoteAgentId)
        }
      }
    }
  }

  function handledRequestKey(peerSessionId, requestId) {
    return `${`${peerSessionId ?? ''}`.trim()}::${`${requestId ?? ''}`.trim()}`
  }

  function pruneExpiredHandledRequests() {
    const now = Date.now()
    for (const [key, entry] of handledRequests.entries()) {
      if (Date.parse(entry.expiresAt) > now) {
        continue
      }
      handledRequests.delete(key)
    }
  }

  function pruneExpiredInbound() {
    const now = Date.now()
    pruneExpiredInboundQueue()
    pruneExpiredHandledRequests()
    for (const [inboundId, inbound] of pendingInbound.entries()) {
      if (Date.parse(inbound.expiresAt) > now) {
        continue
      }
      inbound.reject(new Error('gateway inbound request timed out before the local runtime responded'))
      pendingInbound.delete(inboundId)
    }
  }

  function rememberHandledRequest({
    peerSessionId,
    requestId,
    response
  }) {
    const normalizedSessionId = `${peerSessionId ?? ''}`.trim()
    const normalizedRequestId = `${requestId ?? ''}`.trim()
    if (!normalizedSessionId || !normalizedRequestId) {
      throw new Error('peerSessionId and requestId are required to remember a handled AgentSquared request')
    }
    pruneExpiredHandledRequests()
    const now = Date.now()
    const entry = {
      peerSessionId: normalizedSessionId,
      requestId: normalizedRequestId,
      response: clone(response),
      createdAt: nowISO(),
      expiresAt: new Date(now + handledRequestTTLms).toISOString()
    }
    handledRequests.set(handledRequestKey(normalizedSessionId, normalizedRequestId), entry)
    while (handledRequests.size > Math.max(32, Number.parseInt(`${maxHandledRequests ?? DEFAULT_MAX_HANDLED_REQUESTS}`, 10) || DEFAULT_MAX_HANDLED_REQUESTS)) {
      const oldestKey = handledRequests.keys().next().value
      if (!oldestKey) {
        break
      }
      handledRequests.delete(oldestKey)
    }
    return clone(entry)
  }

  function handledRequestResponse(peerSessionId, requestId) {
    pruneExpiredHandledRequests()
    const entry = handledRequests.get(handledRequestKey(peerSessionId, requestId))
    return entry ? clone(entry.response) : null
  }

  function rememberTrustedSession({
    peerSessionId,
    remoteAgentId,
    remotePeerId,
    remoteTransport = null,
    ticketView = null,
    skillHint = ''
  }) {
    if (!peerSessionId?.trim() || !remoteAgentId?.trim() || !remotePeerId?.trim()) {
      throw new Error('peerSessionId, remoteAgentId, and remotePeerId are required to remember a trusted peer session')
    }
    pruneExpiredTrustedSessions()
    const now = Date.now()
    const session = {
      peerSessionId: peerSessionId.trim(),
      remoteAgentId: remoteAgentId.trim(),
      remotePeerId: remotePeerId.trim(),
      remoteTransport: remoteTransport ? clone(remoteTransport) : null,
      ticketView: ticketView ? clone(ticketView) : null,
      skillHint: `${skillHint}`.trim(),
      createdAt: nowISO(),
      lastUsedAt: nowISO(),
      expiresAt: new Date(now + peerSessionTTLms).toISOString()
    }
    trustedSessions.set(session.peerSessionId, session)
    trustedByAgent.set(session.remoteAgentId, session.peerSessionId)
    return clone(session)
  }

  function touchTrustedSession(peerSessionId) {
    pruneExpiredTrustedSessions()
    const session = trustedSessions.get(`${peerSessionId}`.trim())
    if (!session) return null
    session.lastUsedAt = nowISO()
    session.expiresAt = new Date(Date.now() + peerSessionTTLms).toISOString()
    return clone(session)
  }

  function trustedSessionByAgent(remoteAgentId) {
    pruneExpiredTrustedSessions()
    const sessionId = trustedByAgent.get(`${remoteAgentId}`.trim())
    if (!sessionId) return null
    const session = trustedSessions.get(sessionId)
    if (!session) {
      trustedByAgent.delete(`${remoteAgentId}`.trim())
      return null
    }
    return clone(session)
  }

  function trustedSessionById(peerSessionId) {
    pruneExpiredTrustedSessions()
    const session = trustedSessions.get(`${peerSessionId}`.trim())
    return session ? clone(session) : null
  }

  async function enqueueInbound({
    request,
    ticketView = null,
    remotePeerId,
    remoteAgentId,
    peerSessionId,
    suggestedSkill = '',
    defaultSkill = 'friend-im'
  }) {
    pruneExpiredInbound()
    const inboundId = randomRequestId('inbound')
    const payload = {
      inboundId,
      receivedAt: nowISO(),
      expiresAt: new Date(Date.now() + inboundTimeoutMs).toISOString(),
      remotePeerId: `${remotePeerId}`.trim(),
      remoteAgentId: `${remoteAgentId}`.trim(),
      peerSessionId: `${peerSessionId}`.trim(),
      suggestedSkill: `${suggestedSkill}`.trim(),
      defaultSkill: `${defaultSkill}`.trim() || 'friend-im',
      ticketView: ticketView ? clone(ticketView) : null,
      request: clone(request)
    }
    const responsePromise = new Promise((resolve, reject) => {
      pendingInbound.set(inboundId, {
        resolve,
        reject,
        expiresAt: payload.expiresAt
      })
    })
    inboundQueue.push(payload)
    releaseNextWaiter()
    return {
      inboundId,
      payload,
      responsePromise
    }
  }

  async function nextInbound({ waitMs = DEFAULT_WAIT_MS } = {}) {
    pruneExpiredInbound()
    if (inboundQueue.length > 0) {
      return clone(inboundQueue.shift())
    }
    const boundedWait = Math.max(0, Number.parseInt(`${waitMs}`, 10) || DEFAULT_WAIT_MS)
    return new Promise((resolve) => {
      const waiter = {
        expiresAt: Date.now() + boundedWait,
        resolve: (value) => {
          clearTimeout(timer)
          resolve(value)
        }
      }
      const expiresAt = Date.now() + boundedWait
      const timer = setTimeout(() => {
        const index = nextWaiters.indexOf(waiter)
        if (index >= 0) {
          nextWaiters.splice(index, 1)
        }
        resolve(null)
      }, boundedWait)
      waiter.expiresAt = expiresAt
      nextWaiters.push(waiter)
    })
  }

  function respondInbound({ inboundId, result }) {
    pruneExpiredInbound()
    const pending = pendingInbound.get(`${inboundId}`.trim())
    if (!pending) {
      throw new Error(`unknown inboundId: ${inboundId}`)
    }
    pendingInbound.delete(`${inboundId}`.trim())
    pending.resolve(clone(result))
  }

  function rejectInbound({ inboundId, code = 500, message = 'local runtime rejected the inbound request' }) {
    pruneExpiredInbound()
    const pending = pendingInbound.get(`${inboundId}`.trim())
    if (!pending) {
      throw new Error(`unknown inboundId: ${inboundId}`)
    }
    pendingInbound.delete(`${inboundId}`.trim())
    pending.reject(Object.assign(new Error(`${message}`), { code }))
  }

  function reset({
    reason = 'gateway runtime state was reset',
    preserveTrustedSessions = false
  } = {}) {
    const error = Object.assign(new Error(`${reason}`), { code: 503 })
    inboundQueue.splice(0, inboundQueue.length)
    while (nextWaiters.length > 0) {
      const waiter = nextWaiters.shift()
      waiter?.resolve?.(null)
    }
    for (const [inboundId, pending] of pendingInbound.entries()) {
      pending.reject(error)
      pendingInbound.delete(inboundId)
    }
    if (!preserveTrustedSessions) {
      trustedSessions.clear()
      trustedByAgent.clear()
      handledRequests.clear()
      return
    }
    pruneExpiredTrustedSessions()
    pruneExpiredHandledRequests()
  }

  return {
    rememberTrustedSession,
    touchTrustedSession,
    trustedSessionByAgent,
    trustedSessionById,
    rememberHandledRequest,
    handledRequestResponse,
    enqueueInbound,
    nextInbound,
    respondInbound,
    rejectInbound,
    reset,
    snapshot() {
      pruneExpiredTrustedSessions()
      pruneExpiredInbound()
      return {
        queuedInbound: inboundQueue.length,
        pendingInbound: pendingInbound.size,
        trustedSessions: [...trustedSessions.values()].map((session) => clone(session)),
        handledRequests: handledRequests.size
      }
    }
  }
}
