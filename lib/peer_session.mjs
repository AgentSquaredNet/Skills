import { randomRequestId } from './cli.mjs'
import { createConnectTicket, getAgentCard, introspectConnectTicket, postOnline, reportSession } from './relay_http.mjs'
import { currentPeerConnection, dialProtocol, openStreamOnExistingConnection, readJsonMessage, waitForPublishedTransport, writeLine } from './libp2p_a2a.mjs'

const RELAY_RECOVERY_RETRY_DELAY_MS = 1500
const RESPONSE_ACK_TIMEOUT_MS = 250
const TURN_RECEIPT_TIMEOUT_MS = 20 * 1000
const TURN_RESPONSE_TIMEOUT_MS = 210 * 1000

export function buildJsonRpcEnvelope({ id, method, message, metadata = {} }) {
  return {
    jsonrpc: '2.0',
    id: id ?? randomRequestId('a2a'),
    method,
    params: {
      message,
      metadata
    }
  }
}

function buildJsonRpcAck(id) {
  return {
    jsonrpc: '2.0',
    id,
    result: {
      ack: true
    }
  }
}

function buildJsonRpcReceipt(id) {
  return {
    jsonrpc: '2.0',
    id,
    result: {
      received: true
    }
  }
}

function isJsonRpcAck(message, id = '') {
  return Boolean(
    message
    && typeof message === 'object'
    && `${message.jsonrpc ?? ''}`.trim() === '2.0'
    && `${message.id ?? ''}`.trim() === `${id ?? ''}`.trim()
    && message.result
    && typeof message.result === 'object'
    && message.result.ack === true
  )
}

function isJsonRpcReceipt(message, id = '') {
  return Boolean(
    message
    && typeof message === 'object'
    && `${message.jsonrpc ?? ''}`.trim() === '2.0'
    && `${message.id ?? ''}`.trim() === `${id ?? ''}`.trim()
    && message.result
    && typeof message.result === 'object'
    && message.result.received === true
  )
}

async function sendResponseAck(stream, requestId) {
  if (!stream || !`${requestId ?? ''}`.trim()) {
    return
  }
  try {
    await writeLine(stream, JSON.stringify(buildJsonRpcAck(requestId)))
  } catch {
    // best-effort only; the response itself was already received locally
  }
}

async function sendRequestReceipt(stream, requestId) {
  if (!stream || !`${requestId ?? ''}`.trim()) {
    return
  }
  await writeLine(stream, JSON.stringify(buildJsonRpcReceipt(requestId)))
}

async function waitForOptionalAck(stream, requestId, timeoutMs = RESPONSE_ACK_TIMEOUT_MS) {
  if (!stream || !`${requestId ?? ''}`.trim()) {
    return false
  }
  try {
    const ack = await Promise.race([
      readJsonMessage(stream),
      new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs))
    ])
    return isJsonRpcAck(ack, requestId)
  } catch {
    return false
  }
}

async function readMessageWithTimeout(readMessageFn, stream, timeoutMs, label) {
  try {
    return await Promise.race([
      readMessageFn(stream),
      new Promise((_, reject) => setTimeout(() => {
        reject(new Error(`${label} timed out after ${timeoutMs}ms`))
      }, timeoutMs))
    ])
  } catch (error) {
    throw error
  }
}

export async function currentTransport(node, binding, options = {}) {
  return waitForPublishedTransport(node, binding, options)
}

export async function publishGatewayPresence(apiBase, agentId, bundle, node, binding, activitySummary, {
  availabilityStatus = 'available',
  requireRelayReservation = false
} = {}) {
  const transport = await currentTransport(node, binding, { requireRelayReservation })
  return postOnline(apiBase, agentId, bundle, {
    availabilityStatus,
    activitySummary,
    peerId: transport.peerId,
    listenAddrs: transport.listenAddrs,
    relayAddrs: transport.relayAddrs,
    supportedBindings: transport.supportedBindings,
    a2aProtocolVersion: transport.a2aProtocolVersion,
    streamProtocol: transport.streamProtocol
  })
}

export async function openDirectPeerSession({
  apiBase,
  agentId,
  bundle,
  node,
  binding,
  targetAgentId,
  skillName,
  method,
  message,
  metadata = null,
  activitySummary,
  report,
  sessionStore = null,
  allowTrustedReuse = true,
  _deps = null
}) {
  const deps = {
    currentPeerConnectionFn: currentPeerConnection,
    exchangeOverTransportFn: exchangeOverTransport,
    currentTransportFn: currentTransport,
    createConnectTicketWithRecoveryFn: createConnectTicketWithRecovery,
    ...(_deps && typeof _deps === 'object' ? _deps : {})
  }
  const metadataPayload = metadata && typeof metadata === 'object' ? metadata : {}
  const conversationKey = `${metadataPayload.conversationKey ?? ''}`.trim()
  if (!conversationKey) {
    throw Object.assign(new Error('conversationKey is required for outbound AgentSquared conversations'), { code: 400 })
  }
  // Each AgentSquared turn always opens a fresh libp2p stream.
  // When a trusted peer session is available, we only reuse the underlying
  // peer connection and session metadata, not the previous stream itself.
  const cachedSession = sessionStore?.trustedSessionByConversation?.(conversationKey)
    ?? null
  const liveConnection = cachedSession?.remotePeerId ? deps.currentPeerConnectionFn(node, cachedSession.remotePeerId) : null

  let ticket = null
  let peerSessionId = `${cachedSession?.peerSessionId ?? ''}`.trim()
  let targetTransport = null
  let reusedPeerConnection = false
  let ambiguousTrustedDispatchError = null
  const reusableTransport = allowTrustedReuse && cachedSession
    ? mergeTargetTransport({
        primary: cachedSession.remoteTransport,
        secondary: cachedSession?.remotePeerId
          ? {
              peerId: cachedSession.remotePeerId,
              streamProtocol: binding.streamProtocol
            }
          : null,
        streamProtocol: binding.streamProtocol
      })
    : null
  const requestId = randomRequestId('a2a')
  const buildRequest = ({
    relayConnectTicket = '',
    peerSessionId: nextPeerSessionId = ''
  } = {}) => buildJsonRpcEnvelope({
    id: requestId,
    method,
    message,
    metadata: {
      ...metadataPayload,
      relayConnectTicket,
      peerSessionId: `${nextPeerSessionId ?? ''}`.trim(),
      skillHint: `${skillName ?? ''}`.trim(),
      from: agentId,
      to: targetAgentId
    }
  })

  if (reusableTransport?.peerId && reusableTransport?.streamProtocol && liveConnection) {
    try {
      sessionStore?.touchTrustedSession?.(cachedSession.peerSessionId)
      const reusedResponse = await deps.exchangeOverTransportFn({
        node,
        transport: reusableTransport,
        request: buildRequest({
          relayConnectTicket: '',
          peerSessionId
        }),
        reuseExistingConnection: true
      })
      targetTransport = reusableTransport
      reusedPeerConnection = true

      if (peerSessionId && targetTransport?.peerId) {
        sessionStore?.rememberTrustedSession?.({
          peerSessionId,
          conversationKey,
          remoteAgentId: targetAgentId,
          remotePeerId: targetTransport.peerId,
          remoteTransport: targetTransport,
          skillHint: `${skillName ?? ''}`.trim()
        })
      }

      return {
        ticket,
        peerSessionId,
        response: reusedResponse,
        sessionReport: null,
        reusedPeerConnection,
        // Backward-compatible alias for existing callers.
        reusedSession: reusedPeerConnection
      }
    } catch (error) {
      if (!error?.a2DeliveryStatusKnown && `${error?.a2DispatchStage ?? ''}` === 'post-dispatch') {
        ambiguousTrustedDispatchError = error
      } else if (!isTrustedSessionRetryable(error)) {
        throw error
      }
    }
  }

  let response
  try {
    const transport = await deps.currentTransportFn(node, binding, { requireRelayReservation: true })
    const relayAttempt = await deps.createConnectTicketWithRecoveryFn({
      apiBase,
      agentId,
      bundle,
      node,
      binding,
      targetAgentId,
      skillName,
      transport,
      cachedTransport: cachedSession?.remoteTransport ?? null
    })
    ticket = relayAttempt.ticket
    targetTransport = relayAttempt.targetTransport
    peerSessionId = peerSessionId || parseConnectTicketId(ticket.ticket) || randomRequestId('peer')

    response = await deps.exchangeOverTransportFn({
      node,
      transport: targetTransport,
      request: buildRequest({
        relayConnectTicket: ticket?.ticket ?? '',
        peerSessionId
      })
    })
  } catch (error) {
    if (ambiguousTrustedDispatchError && !ambiguousTrustedDispatchError.a2DeliveryStatusKnown) {
      const followUpDetail = `${error?.message ?? ''}`.trim()
      if (followUpDetail && !ambiguousTrustedDispatchError.message.includes(followUpDetail)) {
        ambiguousTrustedDispatchError.message = `${ambiguousTrustedDispatchError.message} Fresh relay retry also failed: ${followUpDetail}`
      }
      throw ambiguousTrustedDispatchError
    }
    throw error
  }

  if (peerSessionId && targetTransport?.peerId) {
    sessionStore?.rememberTrustedSession?.({
      peerSessionId,
      conversationKey,
      remoteAgentId: targetAgentId,
      remotePeerId: targetTransport.peerId,
      remoteTransport: targetTransport,
      skillHint: `${skillName ?? ''}`.trim()
    })
  }

  let sessionReport = null
  if (report && ticket?.ticket) {
    sessionReport = await reportSession(apiBase, agentId, bundle, {
      ticket: ticket.ticket,
      taskId: report.taskId,
      status: report.status ?? 'completed',
      summary: report.summary,
      publicSummary: report.publicSummary ?? ''
    }, await bestEffortCurrentTransport(node, binding))
  }

  return {
    ticket,
    peerSessionId,
    response,
    sessionReport,
    reusedPeerConnection,
    reusedSession: reusedPeerConnection
  }
}

export async function createConnectTicketWithRecovery({
  apiBase,
  agentId,
  bundle,
  node,
  binding,
  targetAgentId,
  skillName,
  transport,
  cachedTransport = null,
  republishPresence = null,
  retryDelayMs = RELAY_RECOVERY_RETRY_DELAY_MS
}) {
  const attempt = async () => {
    const latestAgentCard = await bestEffortAgentCard(apiBase, agentId, bundle, targetAgentId, transport)
    const ticket = await createConnectTicket(apiBase, agentId, bundle, targetAgentId, skillName, transport)
    const targetTransport = mergeTargetTransport({
      primary: latestAgentCard?.preferredTransport ?? null,
      secondary: ticket.targetTransport ?? ticket.agentCard?.preferredTransport ?? null,
      tertiary: cachedTransport,
      streamProtocol: binding.streamProtocol
    })
    return { ticket, targetTransport }
  }

  try {
    return await attempt()
  } catch (error) {
    if (!isRelayPresenceRetryable(error)) {
      throw error
    }
    if (typeof republishPresence === 'function') {
      await republishPresence(error)
    } else {
      await bestEffortRepublishPresence(apiBase, agentId, bundle, node, binding)
    }
    await sleep(retryDelayMs)
    return attempt()
  }
}

export function buildRouter(routes = {}) {
  return async ({ request, ticketView, agentId, suggestedSkill = '' }) => {
    const route = routes[`${suggestedSkill || ticketView?.skillName || 'friend-im'}`.trim()] ?? routes['friend-im']
    if (!route) {
      throw new Error(`unsupported inbound skill route: ${suggestedSkill || ticketView?.skillName || ''}`)
    }
    return route({ request, ticketView, agentId })
  }
}

export async function attachInboundRouter({
  apiBase,
  agentId,
  bundle,
  node,
  binding,
  handler,
  sessionStore
}) {
  node.handle(binding.streamProtocol, async (eventOrStream, maybeConnection) => {
    const { stream, connection } = normalizeInboundStreamContext(eventOrStream, maybeConnection)
    const remotePeerId = connection?.remotePeer?.toString?.()
      ?? stream?.stat?.connection?.remotePeer?.toString?.()
      ?? ''
    let request = null
    let peerSessionId = ''
    let receiptSent = false
    try {
      request = await readJsonMessage(stream)
      const metadata = request?.params?.metadata ?? {}
      const conversationKey = `${metadata.conversationKey ?? ''}`.trim()
      if (!conversationKey) {
        await writeLine(stream, JSON.stringify({
          jsonrpc: '2.0',
          id: request?.id ?? randomRequestId('invalid'),
          error: { code: 400, message: 'conversationKey is required for inbound AgentSquared conversations' }
        }))
        return
      }
      const relayConnectTicket = `${metadata.relayConnectTicket ?? ''}`.trim()
      const requestedPeerSessionId = `${metadata.peerSessionId ?? ''}`.trim()
      let ticketView = null
      peerSessionId = requestedPeerSessionId
      let remoteAgentId = `${metadata.from ?? ''}`.trim()
      let suggestedSkill = `${metadata.skillHint ?? ''}`.trim()

      if (relayConnectTicket) {
        ticketView = await introspectConnectTicket(
          apiBase,
          agentId,
          bundle,
          relayConnectTicket,
          await bestEffortCurrentTransport(node, binding)
        )
        peerSessionId = peerSessionId || ticketView.ticketId
        remoteAgentId = remoteAgentId || ticketView.initiatorAgentId
        suggestedSkill = suggestedSkill || `${ticketView.skillName ?? ''}`.trim()
        const remoteTransport = buildInboundRemoteTransport({
          connection,
          remotePeerId,
          binding
        })
        sessionStore?.rememberTrustedSession?.({
          peerSessionId,
          conversationKey,
          remoteAgentId,
          remotePeerId,
          remoteTransport,
          ticketView,
          skillHint: suggestedSkill
        })
      } else {
        const trustedSession = sessionStore?.trustedSessionById?.(peerSessionId)
        if (!trustedSession || trustedSession.remotePeerId !== remotePeerId) {
          await writeLine(stream, JSON.stringify({
            jsonrpc: '2.0',
            id: request?.id ?? randomRequestId('invalid'),
            error: { code: 401, message: 'relayConnectTicket or a trusted peerSessionId is required' }
          }))
          return
        }
        sessionStore?.touchTrustedSession?.(trustedSession.peerSessionId)
        if (conversationKey) {
          sessionStore?.rememberTrustedSession?.({
            peerSessionId: trustedSession.peerSessionId,
            conversationKey,
            remoteAgentId: trustedSession.remoteAgentId,
            remotePeerId: trustedSession.remotePeerId,
            remoteTransport: trustedSession.remoteTransport,
            ticketView: trustedSession.ticketView,
            skillHint: trustedSession.skillHint
          })
        }
        remoteAgentId = remoteAgentId || trustedSession.remoteAgentId
        ticketView = trustedSession.ticketView ?? null
        suggestedSkill = suggestedSkill || trustedSession.skillHint || 'friend-im'
      }

      const cachedHandledResponse = sessionStore?.handledRequestResponse?.(peerSessionId, request?.id)
      if (cachedHandledResponse) {
        await sendRequestReceipt(stream, request?.id)
        receiptSent = true
        await writeLine(stream, JSON.stringify(cachedHandledResponse))
        await waitForOptionalAck(stream, request?.id)
        return
      }

      const inbound = await sessionStore.enqueueInbound({
        request,
        ticketView,
        remotePeerId,
        remoteAgentId,
        peerSessionId,
        suggestedSkill,
        defaultSkill: 'friend-im'
      })
      await sendRequestReceipt(stream, request?.id)
      receiptSent = true
      const result = await inbound.responsePromise
      const finalResult = typeof result === 'object' && result != null
        ? {
            ...result,
            metadata: {
              ...(result.metadata ?? {}),
              peerSessionId
            }
          }
        : { value: result, metadata: { peerSessionId } }
      await writeLine(stream, JSON.stringify({
        jsonrpc: '2.0',
        id: request.id,
        result: finalResult
      }))
      sessionStore?.rememberHandledRequest?.({
        peerSessionId,
        requestId: request?.id,
        response: {
          jsonrpc: '2.0',
          id: request.id,
          result: finalResult
        }
      })
      await waitForOptionalAck(stream, request?.id)
    } catch (error) {
      const errorResponse = {
        jsonrpc: '2.0',
        id: request?.id ?? randomRequestId('error'),
        error: { code: Number.parseInt(`${error.code ?? 500}`, 10) || 500, message: error.message }
      }
      if (peerSessionId && request?.id) {
        sessionStore?.rememberHandledRequest?.({
          peerSessionId,
          requestId: request.id,
          response: errorResponse
        })
      }
      if (request?.id && !receiptSent) {
        await sendRequestReceipt(stream, request?.id)
        receiptSent = true
      }
      await writeLine(stream, JSON.stringify(errorResponse))
      await waitForOptionalAck(stream, request?.id)
    } finally {
      await stream.close()
    }
  }, { runOnLimitedConnection: true })
}

function normalizeInboundStreamContext(eventOrStream, maybeConnection) {
  if (maybeConnection) {
    return {
      stream: eventOrStream,
      connection: maybeConnection
    }
  }

  return {
    stream: eventOrStream?.stream ?? eventOrStream,
    connection: eventOrStream?.connection ?? null
  }
}

async function bestEffortRepublishPresence(apiBase, agentId, bundle, node, binding) {
  try {
    await publishGatewayPresence(apiBase, agentId, bundle, node, binding, 'Refreshing relay presence after a transient delivery failure.', {
      requireRelayReservation: true
    })
  } catch {
    // best-effort only; retry path will still surface the original relay error if recovery did not help
  }
}

async function bestEffortCurrentTransport(node, binding) {
  try {
    return await currentTransport(node, binding)
  } catch {
    return null
  }
}

export async function exchangeOverTransport({
  node,
  transport,
  request,
  reuseExistingConnection = false,
  openStreamFn = openTransportStream,
  writeLineFn = writeLine,
  readMessageFn = readJsonMessage,
  turnReceiptTimeoutMs = TURN_RECEIPT_TIMEOUT_MS,
  turnResponseTimeoutMs = TURN_RESPONSE_TIMEOUT_MS
}) {
  let lastError = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let stream = null
    let dispatchStage = 'pre-dispatch'
    let receiptConfirmed = false
    try {
      stream = await openStreamFn(node, transport, {
        reuseExistingConnection,
        allowDialFallback: attempt > 0
      })
      await writeLineFn(stream, JSON.stringify(request))
      const firstMessage = await readMessageWithTimeout(
        readMessageFn,
        stream,
        turnReceiptTimeoutMs,
        'request receipt'
      )
      let response = firstMessage
      if (isJsonRpcReceipt(firstMessage, request?.id)) {
        receiptConfirmed = true
        dispatchStage = 'post-dispatch'
        response = await readMessageWithTimeout(
          readMessageFn,
          stream,
          turnResponseTimeoutMs,
          'turn response'
        )
      } else if (isJsonRpcAck(firstMessage, request?.id)) {
        const error = new Error('unexpected response acknowledgement before request receipt')
        error.a2DeliveryStatusKnown = true
        throw error
      } else {
        receiptConfirmed = true
        dispatchStage = 'post-dispatch'
      }
      await sendResponseAck(stream, request?.id)
      if (response.error) {
        throw buildJsonRpcError(response.error)
      }
      return response
    } catch (error) {
      error.a2DispatchStage = error.a2DispatchStage || dispatchStage
      if (shouldRetryBeforeReceipt(error, attempt, receiptConfirmed)) {
        lastError = error
        continue
      }
      if (shouldRetryEmptyPostDispatch(error, attempt)) {
        lastError = error
        continue
      }
      if (lastError && `${lastError?.a2DispatchStage ?? ''}` === 'post-dispatch' && !lastError?.a2DeliveryStatusKnown) {
        if (!/delivery status is unknown/i.test(`${lastError.message ?? ''}`)) {
          lastError.message = `delivery status is unknown after the request was dispatched: ${lastError.message ?? 'response could not be confirmed'}`
        }
        throw lastError
      }
      if (dispatchStage === 'post-dispatch' && !error.a2DeliveryStatusKnown) {
        error.a2DeliveryStatusKnown = false
        if (!/delivery status is unknown/i.test(`${error.message ?? ''}`)) {
          error.message = `delivery status is unknown after the request was dispatched: ${error.message ?? 'response could not be confirmed'}`
        }
      }
      throw error
    } finally {
      await stream?.close?.()
    }
  }

  if (lastError) {
    if (!lastError.a2DeliveryStatusKnown) {
      lastError.a2DeliveryStatusKnown = false
    }
    if (!/delivery status is unknown/i.test(`${lastError.message ?? ''}`)) {
      lastError.message = `delivery status is unknown after the request was dispatched: ${lastError.message ?? 'response could not be confirmed'}`
    }
    throw lastError
  }

  throw new Error('delivery status is unknown after the request was dispatched: response could not be confirmed')
}

async function openTransportStream(node, transport, {
  reuseExistingConnection = false,
  allowDialFallback = false
} = {}) {
  if (!reuseExistingConnection) {
    return dialProtocol(node, transport, { requireDirect: false })
  }
  try {
    return await openStreamOnExistingConnection(node, transport)
  } catch (error) {
    if (!allowDialFallback) {
      throw error
    }
  }
  return dialProtocol(node, transport, { requireDirect: false })
}

function shouldRetryEmptyPostDispatch(error, attempt) {
  if (attempt > 0) {
    return false
  }
  if (`${error?.a2DispatchStage ?? ''}` !== 'post-dispatch') {
    return false
  }
  return `${error?.message ?? ''}`.trim().toLowerCase() === 'empty json message'
}

function shouldRetryBeforeReceipt(error, attempt, receiptConfirmed) {
  if (attempt > 0 || receiptConfirmed) {
    return false
  }
  if (`${error?.a2DispatchStage ?? ''}` !== 'pre-dispatch') {
    return false
  }
  const lower = `${error?.message ?? ''}`.trim().toLowerCase()
  return (
    lower === 'empty json message'
    || lower.includes('request receipt timed out after')
    || lower.includes('stream that is closed')
    || lower.includes('stream closed before drain')
    || lower.includes('stream reset')
    || lower.includes('connection reset')
    || lower.includes('connection closed')
    || lower.includes('no existing peer connection is available')
  )
}

function buildJsonRpcError(error = {}) {
  const out = new Error(`${error.message ?? 'remote peer returned an error'}`)
  out.code = Number.parseInt(`${error.code ?? 500}`, 10) || 500
  return out
}

async function bestEffortAgentCard(apiBase, agentId, bundle, targetAgentId, transport) {
  try {
    return await getAgentCard(apiBase, agentId, bundle, targetAgentId, transport)
  } catch {
    return null
  }
}

function isTrustedSessionRetryable(error) {
  const message = `${error?.message ?? ''}`.trim()
  const lower = message.toLowerCase()
  const code = Number.parseInt(`${error?.code ?? 0}`, 10) || 0
  if (code === 401 || message.includes('relayConnectTicket or a trusted peerSessionId is required')) {
    return true
  }
  if (`${error?.a2DispatchStage ?? ''}` !== 'pre-dispatch') {
    return false
  }
  return [
    'target transport is missing dialaddrs',
    'target transport is missing peerid',
    'target transport is missing streamprotocol',
    'no connection was available',
    'no existing peer connection is available',
    'direct p2p upgrade did not complete',
    'connection refused',
    'connection reset',
    'connection closed',
    'stream reset',
    'stream closed before drain',
    'stream that is closed',
    'empty json message',
    'request receipt timed out after',
    'the operation was aborted',
    'already aborted',
    'dial timeout',
    'timed out'
  ].some((pattern) => lower.includes(pattern))
}

function isRelayPresenceRetryable(error) {
  const message = `${error?.message ?? ''}`.trim().toLowerCase()
  return (
    message.startsWith('409 target agent is not currently online') ||
    message.startsWith('409 target agent presence is invalid or stale') ||
    message.startsWith('409 target agent has not published a current peer identity for direct p2p contact') ||
    message.startsWith('409 target agent has not published a current relay reservation or public direct dial address for p2p contact')
  )
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function mergeTargetTransport({
  primary = null,
  secondary = null,
  tertiary = null,
  streamProtocol = ''
} = {}) {
  const sources = [primary, secondary, tertiary].filter((value) => value && typeof value === 'object')
  const peerId = firstNonEmpty(sources.map((value) => value.peerId))
  const protocol = firstNonEmpty(sources.map((value) => value.streamProtocol).concat(streamProtocol))
  const dialAddrs = unique(
    sources.flatMap((value) => value.dialAddrs ?? [])
  )
  const listenAddrs = unique(
    sources.flatMap((value) => value.listenAddrs ?? [])
  )
  const relayAddrs = unique(
    sources.flatMap((value) => value.relayAddrs ?? [])
  )
  const supportedBindings = unique(
    sources.flatMap((value) => value.supportedBindings ?? [])
  )
  const a2aProtocolVersion = firstNonEmpty(sources.map((value) => value.a2aProtocolVersion))

  if (!peerId || !protocol) {
    return null
  }

  return {
    peerId,
    streamProtocol: protocol,
    dialAddrs,
    listenAddrs,
    relayAddrs,
    supportedBindings,
    a2aProtocolVersion
  }
}

function buildInboundRemoteTransport({
  connection,
  remotePeerId,
  binding
} = {}) {
  const remoteAddr = cleanAddr(connection?.remoteAddr?.toString?.())
  const dialAddrs = unique(remoteAddr ? [remoteAddr] : [])
  return {
    peerId: `${remotePeerId ?? ''}`.trim(),
    streamProtocol: `${binding?.streamProtocol ?? ''}`.trim(),
    dialAddrs,
    listenAddrs: dialAddrs
  }
}

function cleanAddr(value) {
  return `${value ?? ''}`.trim()
}

function firstNonEmpty(values = []) {
  for (const value of values) {
    const cleaned = `${value ?? ''}`.trim()
    if (cleaned) {
      return cleaned
    }
  }
  return ''
}

function unique(values = []) {
  return [...new Set(values.map((value) => `${value}`.trim()).filter(Boolean))]
}

function parseConnectTicketId(token) {
  const parts = `${token ?? ''}`.trim().split('.')
  if (parts.length < 2) return ''
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    return `${payload.tid ?? payload.jti ?? ''}`.trim()
  } catch {
    return ''
  }
}
