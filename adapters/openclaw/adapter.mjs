import { withOpenClawGatewayClient } from './ws_client.mjs'
import { buildReceiverBaseReport, inferOwnerFacingLanguage, parseAgentSquaredOutboundEnvelope } from '../../lib/a2_message_templates.mjs'
import { normalizeConversationControl, resolveInboundConversationIdentity, resolveSkillMaxTurns } from '../../lib/conversation_policy.mjs'
import { scrubOutboundText } from '../../lib/runtime_safety.mjs'
import {
  buildOpenClawConversationSummaryPrompt,
  buildOpenClawLocalSkillInventoryPrompt,
  buildOpenClawOutboundSkillDecisionPrompt,
  buildOpenClawSafetyPrompt,
  buildOpenClawTaskPrompt,
  formatOpenClawLocalSkillInventoryForPrompt,
  latestAssistantText,
  normalizeOpenClawSafetySessionKey,
  normalizeOpenClawSessionKey,
  normalizeSessionList,
  ownerReportText,
  parseOpenClawLocalSkillInventoryResult,
  parseOpenClawSkillDecisionResult,
  parseOpenClawSafetyResult,
  parseOpenClawConversationSummaryResult,
  parseOpenClawTaskResult,
  peerResponseText,
  readOpenClawRunId,
  readOpenClawStatus,
  resolveOwnerRouteFromSessions,
  stableId
} from './helpers.mjs'

export {
  buildOpenClawConversationSummaryPrompt,
  buildOpenClawLocalSkillInventoryPrompt,
  buildOpenClawOutboundSkillDecisionPrompt,
  buildOpenClawSafetyPrompt,
  buildOpenClawTaskPrompt,
  parseOpenClawLocalSkillInventoryResult,
  parseOpenClawConversationSummaryResult,
  parseOpenClawSkillDecisionResult,
  parseOpenClawTaskResult
}

function clean(value) {
  return `${value ?? ''}`.trim()
}

function randomId(prefix = 'a2') {
  return `${clean(prefix) || 'a2'}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function nowMs() {
  return Date.now()
}

function localOwnerTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

function toNumber(value) {
  const parsed = Number.parseInt(`${value ?? ''}`, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function excerpt(text, maxLength = 140) {
  const compact = clean(text).replace(/\s+/g, ' ').trim()
  if (!compact) {
    return ''
  }
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 3)}...` : compact
}

function reframeOpenClawAgentError(error, {
  openclawAgent = '',
  localAgentId = ''
} = {}) {
  const message = clean(error?.message)
  if (!message) {
    return error
  }
  if (message.toLowerCase().includes('unknown agent id')) {
    return new Error(
      `OpenClaw rejected agent id "${clean(openclawAgent)}". AgentSquared needs a real local OpenClaw agent id here, not the AgentSquared id "${clean(localAgentId)}". Configure --openclaw-agent explicitly or make sure OpenClaw exposes a default agent (usually from agents.list[]; fallback is often "main"). Original error: ${message}`
    )
  }
  return error
}

export async function resolveOpenClawOutboundSkillHint({
  localAgentId,
  targetAgentId,
  ownerText,
  openclawAgent = '',
  command = 'openclaw',
  cwd = '',
  configPath = '',
  stateDir = '',
  timeoutMs = 60000,
  gatewayUrl = '',
  gatewayToken = '',
  gatewayPassword = '',
  availableSkills = ['friend-im', 'agent-mutual-learning']
} = {}) {
  const agentName = clean(openclawAgent)
  if (!agentName) {
    throw new Error(`openclaw agent name is required for ${clean(localAgentId) || 'the local AgentSquared agent'}`)
  }
  return withOpenClawGatewayClient({
    command,
    cwd,
    configPath,
    stateDir,
    gatewayUrl,
    gatewayToken,
    gatewayPassword,
    requestTimeoutMs: timeoutMs
  }, async (client, gatewayContext) => {
    const sessionKey = stableId('agentsquared-outbound-skill-decision', localAgentId, targetAgentId, ownerText)
    const prompt = buildOpenClawOutboundSkillDecisionPrompt({
      localAgentId,
      targetAgentId,
      ownerText,
      availableSkills
    })
    let accepted
    try {
      accepted = await client.request('agent', {
        agentId: agentName,
        sessionKey,
        message: prompt,
        idempotencyKey: stableId('agentsquared-outbound-skill-decision-run', localAgentId, targetAgentId, ownerText)
      }, timeoutMs)
    } catch (error) {
      throw reframeOpenClawAgentError(error, {
        openclawAgent: agentName,
        localAgentId
      })
    }
    const runId = readOpenClawRunId(accepted)
    if (!runId) {
      throw new Error('OpenClaw outbound skill decision did not return a runId.')
    }
    const waited = await client.request('agent.wait', {
      runId,
      timeoutMs
    }, timeoutMs + 1000)
    const status = readOpenClawStatus(waited).toLowerCase()
    if (status && status !== 'ok' && status !== 'completed' && status !== 'done') {
      throw new Error(`OpenClaw outbound skill decision returned ${status || 'an unknown status'} for run ${runId}.`)
    }
    const history = await client.request('chat.history', {
      sessionKey,
      limit: 8
    }, timeoutMs)
    const resultText = latestAssistantText(waited, { runId }) || latestAssistantText(history, { runId })
    if (!resultText) {
      throw new Error(`OpenClaw outbound skill decision did not produce a final assistant message for session ${sessionKey}.`)
    }
    const parsed = parseOpenClawSkillDecisionResult(resultText, {
      availableSkills,
      defaultSkill: 'friend-im'
    })
    return {
      ...parsed,
      openclawRunId: runId,
      openclawSessionKey: sessionKey,
      openclawGatewayUrl: gatewayContext.gatewayUrl
    }
  })
}

export async function summarizeOpenClawConversation({
  localAgentId,
  remoteAgentId,
  selectedSkill = 'friend-im',
  originalOwnerText = '',
  turnLog = [],
  localSkillInventory = '',
  openclawAgent = '',
  command = 'openclaw',
  cwd = '',
  configPath = '',
  stateDir = '',
  timeoutMs = 60000,
  gatewayUrl = '',
  gatewayToken = '',
  gatewayPassword = ''
} = {}) {
  const agentName = clean(openclawAgent)
  if (!agentName) {
    throw new Error(`openclaw agent name is required for ${clean(localAgentId) || 'the local AgentSquared agent'}`)
  }
  return withOpenClawGatewayClient({
    command,
    cwd,
    configPath,
    stateDir,
    gatewayUrl,
    gatewayToken,
    gatewayPassword,
    requestTimeoutMs: timeoutMs
  }, async (client, gatewayContext) => {
    const sessionKey = stableId(
      'agentsquared-conversation-summary',
      localAgentId,
      remoteAgentId,
      selectedSkill,
      originalOwnerText,
      JSON.stringify(turnLog ?? [])
    )
    const prompt = buildOpenClawConversationSummaryPrompt({
      localAgentId,
      remoteAgentId,
      selectedSkill,
      originalOwnerText,
      turnLog,
      localSkillInventory
    })
    let accepted
    try {
      accepted = await client.request('agent', {
        agentId: agentName,
        sessionKey,
        message: prompt,
        idempotencyKey: stableId(
          'agentsquared-conversation-summary-run',
          localAgentId,
          remoteAgentId,
          selectedSkill,
          originalOwnerText,
          JSON.stringify(turnLog ?? [])
        )
      }, timeoutMs)
    } catch (error) {
      throw reframeOpenClawAgentError(error, {
        openclawAgent: agentName,
        localAgentId
      })
    }
    const runId = readOpenClawRunId(accepted)
    if (!runId) {
      throw new Error('OpenClaw conversation summary did not return a runId.')
    }
    const waited = await client.request('agent.wait', {
      runId,
      timeoutMs
    }, timeoutMs + 1000)
    const status = readOpenClawStatus(waited).toLowerCase()
    if (status && status !== 'ok' && status !== 'completed' && status !== 'done') {
      throw new Error(`OpenClaw conversation summary returned ${status || 'an unknown status'} for run ${runId}.`)
    }
    const history = await client.request('chat.history', {
      sessionKey,
      limit: 8
    }, timeoutMs)
    const resultText = latestAssistantText(waited, { runId }) || latestAssistantText(history, { runId })
    if (!resultText) {
      throw new Error(`OpenClaw conversation summary did not produce a final assistant message for session ${sessionKey}.`)
    }
    const parsed = parseOpenClawConversationSummaryResult(resultText)
    return {
      ...parsed,
      openclawRunId: runId,
      openclawSessionKey: sessionKey,
      openclawGatewayUrl: gatewayContext.gatewayUrl
    }
  })
}

export async function inspectOpenClawLocalSkills({
  localAgentId,
  openclawAgent = '',
  command = 'openclaw',
  cwd = '',
  configPath = '',
  stateDir = '',
  timeoutMs = 60000,
  gatewayUrl = '',
  gatewayToken = '',
  gatewayPassword = '',
  purpose = 'mutual-learning'
} = {}) {
  const agentName = clean(openclawAgent)
  if (!agentName) {
    throw new Error(`openclaw agent name is required for ${clean(localAgentId) || 'the local AgentSquared agent'}`)
  }
  return withOpenClawGatewayClient({
    command,
    cwd,
    configPath,
    stateDir,
    gatewayUrl,
    gatewayToken,
    gatewayPassword,
    requestTimeoutMs: timeoutMs
  }, async (client, gatewayContext) => {
    const sessionKey = stableId('agentsquared-local-skill-inventory', localAgentId, purpose)
    const prompt = buildOpenClawLocalSkillInventoryPrompt({
      localAgentId,
      purpose
    })
    let accepted
    try {
      accepted = await client.request('agent', {
        agentId: agentName,
        sessionKey,
        message: prompt,
        idempotencyKey: stableId('agentsquared-local-skill-inventory-run', localAgentId, purpose)
      }, timeoutMs)
    } catch (error) {
      throw reframeOpenClawAgentError(error, {
        openclawAgent: agentName,
        localAgentId
      })
    }
    const runId = readOpenClawRunId(accepted)
    if (!runId) {
      throw new Error('OpenClaw local skill inventory did not return a runId.')
    }
    const waited = await client.request('agent.wait', {
      runId,
      timeoutMs
    }, timeoutMs + 1000)
    const status = readOpenClawStatus(waited).toLowerCase()
    if (status && status !== 'ok' && status !== 'completed' && status !== 'done') {
      throw new Error(`OpenClaw local skill inventory returned ${status || 'an unknown status'} for run ${runId}.`)
    }
    const history = await client.request('chat.history', {
      sessionKey,
      limit: 8
    }, timeoutMs)
    const resultText = latestAssistantText(waited, { runId }) || latestAssistantText(history, { runId })
    if (!resultText) {
      throw new Error(`OpenClaw local skill inventory did not produce a final assistant message for session ${sessionKey}.`)
    }
    const parsed = parseOpenClawLocalSkillInventoryResult(resultText)
    return {
      ...parsed,
      inventoryPromptText: formatOpenClawLocalSkillInventoryForPrompt(parsed),
      openclawRunId: runId,
      openclawSessionKey: sessionKey,
      openclawGatewayUrl: gatewayContext.gatewayUrl
    }
  })
}

export function createOpenClawAdapter({
  localAgentId,
  openclawAgent = '',
  conversationStore = null,
  command = 'openclaw',
  cwd = '',
  configPath = '',
  stateDir = '',
  sessionPrefix = 'agentsquared:',
  timeoutMs = 180000,
  gatewayUrl = '',
  gatewayToken = '',
  gatewayPassword = ''
} = {}) {
  const agentName = clean(openclawAgent)
  if (!agentName) {
    throw new Error(`openclaw agent name is required for ${clean(localAgentId) || 'the local AgentSquared agent'}`)
  }
  const peerBudget = new Map()
  const budgetWindowMs = 10 * 60 * 1000
  const maxWindowCost = 18
  async function withGateway(fn) {
    return withOpenClawGatewayClient({
      command,
      cwd,
      configPath,
      stateDir,
      gatewayUrl,
      gatewayToken,
      gatewayPassword,
      requestTimeoutMs: timeoutMs
    }, fn)
  }

  async function listSessions(client) {
    return normalizeSessionList(await client.request('sessions.list', {}, timeoutMs))
  }

  async function preflight() {
    return withGateway(async (client, gatewayContext) => {
      const health = await client.request('health', {}, Math.min(timeoutMs, 15000))
      return {
        ok: Boolean(health?.ok),
        gatewayUrl: gatewayContext.gatewayUrl,
        authMode: gatewayContext.authMode,
        health
      }
    })
  }

  async function resolveOwnerRoute(client) {
    return resolveOwnerRouteFromSessions(await listSessions(client), {
      agentName
    })
  }

  async function readRelationshipSummary(client, sessionKey) {
    if (!clean(sessionKey)) {
      return ''
    }
    try {
      const history = await client.request('chat.history', {
        sessionKey,
        limit: 12
      }, timeoutMs)
      return latestAssistantText(history)
    } catch {
      return ''
    }
  }

  async function persistRelationshipSummary(client, {
    relationSessionKey,
    remoteAgentId,
    selectedSkill,
    transcript,
    ownerSummary
  } = {}) {
    if (!clean(relationSessionKey) || !clean(ownerSummary)) {
      return null
    }
    const prompt = [
      `You are maintaining long-term AgentSquared relationship memory for local agent ${clean(localAgentId)} about remote agent ${clean(remoteAgentId)}.`,
      `Skill context: ${clean(selectedSkill) || 'friend-im'}`,
      '',
      'Store only a concise long-term summary for future conversations.',
      'Do not preserve raw turn-by-turn detail unless it matters long-term.',
      'Prefer stable facts, collaboration preferences, trust signals, and useful future follow-up notes.',
      '',
      'Latest completed live conversation summary:',
      clean(ownerSummary),
      '',
      'Transcript excerpt from the just-finished live conversation:',
      clean(transcript) || '(none)',
      '',
      'Return one short memory summary.'
    ].join('\n')
    const accepted = await client.request('agent', {
      agentId: agentName,
      sessionKey: relationSessionKey,
      message: prompt,
      idempotencyKey: stableId('agentsquared-relationship-memory', localAgentId, remoteAgentId, ownerSummary)
    }, timeoutMs)
    const runId = readOpenClawRunId(accepted)
    if (!runId) {
      return null
    }
    await client.request('agent.wait', {
      runId,
      timeoutMs
    }, timeoutMs + 1000)
    return runId
  }

  function consumePeerBudget({
    remoteAgentId = '',
    costUnits = 1
  } = {}) {
    const key = clean(remoteAgentId).toLowerCase() || 'unknown'
    const currentTime = nowMs()
    const existing = peerBudget.get(key)
    const recentEvents = (existing?.events ?? []).filter((event) => currentTime - event.at <= budgetWindowMs)
    const appliedCost = Math.max(1, toNumber(costUnits) || 1)
    const nextCost = recentEvents.reduce((sum, event) => sum + event.cost, 0) + appliedCost
    recentEvents.push({ at: currentTime, cost: appliedCost })
    peerBudget.set(key, { events: recentEvents })
    return {
      costUnits: appliedCost,
      windowCost: nextCost,
      overBudget: nextCost > maxWindowCost
    }
  }

  async function executeInbound({
    item,
    selectedSkill,
    mailboxKey
  }) {
    const remoteAgentId = clean(item?.remoteAgentId)
    const incomingSkillHint = clean(item?.suggestedSkill || item?.request?.params?.metadata?.skillHint)
    const receivedAt = new Date().toISOString()
    const inboundText = peerResponseText(item?.request?.params?.message)
    const inboundMetadata = item?.request?.params?.metadata ?? {}
    const parsedEnvelope = parseAgentSquaredOutboundEnvelope(inboundText)
    const displayInboundText = clean(inboundMetadata.originalOwnerText) || clean(parsedEnvelope?.ownerRequest) || inboundText
    const remoteSentAt = clean(inboundMetadata.sentAt) || clean(parsedEnvelope?.sentAt)
    const ownerLanguage = inferOwnerFacingLanguage(displayInboundText, inboundText)
    const ownerTimeZone = localOwnerTimeZone()
    const conversationIdentity = resolveInboundConversationIdentity(item)
    const conversationKey = clean(conversationIdentity.conversationKey)
    return withGateway(async (client, gatewayContext) => {
      const safetySessionKey = normalizeOpenClawSafetySessionKey(localAgentId, remoteAgentId || mailboxKey || 'unknown')
      const safetyPrompt = buildOpenClawSafetyPrompt({
        localAgentId,
        remoteAgentId,
        selectedSkill,
        item
      })
      let safetyAccepted
      try {
        safetyAccepted = await client.request('agent', {
          agentId: agentName,
          sessionKey: safetySessionKey,
          message: safetyPrompt,
          idempotencyKey: `agentsquared-safety-${clean(item?.inboundId) || randomId('inbound')}`
        }, timeoutMs)
      } catch (error) {
        throw reframeOpenClawAgentError(error, {
          openclawAgent: agentName,
          localAgentId
        })
      }
      const safetyRunId = readOpenClawRunId(safetyAccepted)
      if (!safetyRunId) {
        throw new Error('OpenClaw safety triage did not return a runId.')
      }
      const safetyWaited = await client.request('agent.wait', {
        runId: safetyRunId,
        timeoutMs
      }, timeoutMs + 1000)
      const safetyStatus = readOpenClawStatus(safetyWaited).toLowerCase()
      if (safetyStatus && safetyStatus !== 'ok' && safetyStatus !== 'completed' && safetyStatus !== 'done') {
        throw new Error(`OpenClaw safety triage returned ${safetyStatus || 'an unknown status'} for run ${safetyRunId}.`)
      }
      const safetyHistory = await client.request('chat.history', {
        sessionKey: safetySessionKey,
        limit: 8
      }, timeoutMs)
      const safetyText = latestAssistantText(safetyWaited, { runId: safetyRunId }) || latestAssistantText(safetyHistory, { runId: safetyRunId })
      if (!safetyText) {
        throw new Error(`OpenClaw safety triage did not produce a final assistant message for session ${safetySessionKey}.`)
      }
      const safety = parseOpenClawSafetyResult(safetyText)
      const budget = consumePeerBudget({
        remoteAgentId,
        costUnits: safety.budgetUnits
      })
      if (budget.overBudget) {
        const peerReplyText = 'I am pausing this AgentSquared request because the recent request budget from this peer is too high. My owner can decide whether to continue later.'
        const conversation = normalizeConversationControl(item?.request?.params?.metadata ?? {}, {
          defaultTurnIndex: 1,
          defaultDecision: 'handoff',
          defaultStopReason: 'receiver-budget-limit',
          defaultFinalize: true
        })
        const updatedConversation = conversationStore?.appendTurn?.({
          conversationKey,
          peerSessionId: item?.peerSessionId || '',
          requestId: clean(item?.request?.id),
          remoteAgentId,
          selectedSkill,
          turnIndex: conversation.turnIndex,
          inboundText: displayInboundText,
          replyText: peerReplyText,
          decision: 'handoff',
          stopReason: 'receiver-budget-limit',
          finalize: true,
          ownerSummary: `I paused this exchange because the recent peer budget was exceeded. Current window cost: ${budget.windowCost}.`
        }) ?? null
        const ownerReport = buildReceiverBaseReport({
          localAgentId,
          remoteAgentId,
          incomingSkillHint,
          selectedSkill,
          receivedAt,
          inboundText: displayInboundText,
          peerReplyText,
          repliedAt: new Date().toISOString(),
          skillSummary: `I paused this exchange because the recent peer budget was exceeded. Current window cost: ${budget.windowCost}.`,
          conversationTurns: updatedConversation?.turns?.length || conversation.turnIndex,
          stopReason: 'receiver-budget-limit',
          detailsAvailableInInbox: true,
          remoteSentAt,
          language: ownerLanguage,
          timeZone: ownerTimeZone,
          localTime: true
        })
        return {
          selectedSkill,
          peerResponse: {
            message: {
              kind: 'message',
              role: 'agent',
              parts: [{ kind: 'text', text: peerReplyText }]
            },
            metadata: {
              selectedSkill,
              runtimeAdapter: 'openclaw',
              conversationKey,
              safetyDecision: 'owner-approval',
              safetyReason: 'peer-budget-exceeded',
              windowCost: budget.windowCost,
              turnIndex: conversation.turnIndex,
              decision: 'handoff',
              stopReason: 'receiver-budget-limit',
              finalize: true
            }
          },
          ownerReport: {
            ...ownerReport,
            selectedSkill,
            runtimeAdapter: 'openclaw',
            conversationKey,
            safetyDecision: 'owner-approval',
            safetyReason: 'peer-budget-exceeded',
            windowCost: budget.windowCost,
            turnIndex: conversation.turnIndex,
            decision: 'handoff',
            stopReason: 'receiver-budget-limit',
            finalize: true
          }
        }
      }
      if (safety.action !== 'allow') {
        const peerReplyText = scrubOutboundText(clean(safety.peerResponse))
        const conversation = normalizeConversationControl(item?.request?.params?.metadata ?? {}, {
          defaultTurnIndex: 1,
          defaultDecision: safety.action === 'owner-approval' ? 'handoff' : 'done',
          defaultStopReason: clean(safety.reason) || 'unsafe-or-sensitive',
          defaultFinalize: true
        })
        const updatedConversation = conversationStore?.appendTurn?.({
          conversationKey,
          peerSessionId: item?.peerSessionId || '',
          requestId: clean(item?.request?.id),
          remoteAgentId,
          selectedSkill,
          turnIndex: conversation.turnIndex,
          inboundText: displayInboundText,
          replyText: peerReplyText,
          decision: conversation.decision,
          stopReason: conversation.stopReason,
          finalize: true,
          ownerSummary: clean(safety.ownerSummary)
        }) ?? null
        const ownerReport = buildReceiverBaseReport({
          localAgentId,
          remoteAgentId,
          incomingSkillHint,
          selectedSkill,
          receivedAt,
          inboundText: displayInboundText,
          peerReplyText,
          repliedAt: new Date().toISOString(),
          skillSummary: clean(safety.ownerSummary),
          conversationTurns: updatedConversation?.turns?.length || conversation.turnIndex,
          stopReason: clean(safety.reason),
          detailsAvailableInInbox: true,
          remoteSentAt,
          language: ownerLanguage,
          timeZone: ownerTimeZone,
          localTime: true
        })
        return {
          selectedSkill,
          peerResponse: {
            message: {
              kind: 'message',
              role: 'agent',
              parts: [{ kind: 'text', text: peerReplyText }]
            },
            metadata: {
              selectedSkill,
              runtimeAdapter: 'openclaw',
              conversationKey,
              safetyDecision: safety.action,
              safetyReason: clean(safety.reason),
              turnIndex: conversation.turnIndex,
              decision: conversation.decision,
              stopReason: conversation.stopReason,
              finalize: true
            }
          },
          ownerReport: {
            ...ownerReport,
            selectedSkill,
            runtimeAdapter: 'openclaw',
            conversationKey,
            safetyDecision: safety.action,
            safetyReason: clean(safety.reason),
            turnIndex: conversation.turnIndex,
            decision: conversation.decision,
            stopReason: conversation.stopReason,
            finalize: true
          }
        }
      }

      const relationSessionKey = normalizeOpenClawSessionKey(localAgentId, remoteAgentId || mailboxKey || 'unknown', sessionPrefix)
      const inboundConversation = normalizeConversationControl(item?.request?.params?.metadata ?? {}, {
        defaultTurnIndex: 1,
        defaultDecision: 'done',
        defaultStopReason: '',
        defaultFinalize: false
      })
      const metadata = item?.request?.params?.metadata ?? {}
      if (inboundConversation.turnIndex === 1) {
        conversationStore?.endConversation?.(conversationKey)
      }
      const liveConversation = conversationStore?.ensureConversation?.({
        conversationKey,
        peerSessionId: item?.peerSessionId || '',
        remoteAgentId,
        selectedSkill
      }) ?? null
      const conversationTranscript = conversationStore?.transcript?.(liveConversation?.conversationKey || conversationKey) ?? ''
      const relationshipSummary = await readRelationshipSummary(client, relationSessionKey)
      const localSkillMaxTurns = resolveSkillMaxTurns(selectedSkill, metadata?.sharedSkill ?? null)
      const defaultShouldContinue = selectedSkill === 'agent-mutual-learning'
        && !inboundConversation.finalize
        && inboundConversation.turnIndex < localSkillMaxTurns
      let localSkillInventoryPromptText = ''
      if (selectedSkill === 'agent-mutual-learning') {
        try {
          const inspectedLocalSkills = await inspectOpenClawLocalSkills({
            localAgentId,
            openclawAgent: agentName,
            command,
            cwd,
            configPath,
            stateDir,
            timeoutMs: Math.min(timeoutMs, 60000),
            gatewayUrl,
            gatewayToken,
            gatewayPassword,
            purpose: `receiver-${conversationKey || clean(item?.inboundId) || 'mutual-learning'}`
          })
          localSkillInventoryPromptText = clean(inspectedLocalSkills.inventoryPromptText)
        } catch {
          localSkillInventoryPromptText = ''
        }
      }
      const sessionKey = stableId(
        'agentsquared-work',
        localAgentId,
        remoteAgentId,
        conversationKey,
        item?.request?.params?.metadata?.turnIndex || '1',
        item?.inboundId
      )
      const prompt = buildOpenClawTaskPrompt({
        localAgentId,
        remoteAgentId,
        selectedSkill,
        item,
        conversationTranscript,
        relationshipSummary,
        localSkillInventory: localSkillInventoryPromptText
      })

      let accepted
      try {
        accepted = await client.request('agent', {
          agentId: agentName,
          sessionKey,
          message: prompt,
          idempotencyKey: `agentsquared-agent-${clean(item?.inboundId) || randomId('inbound')}`
        }, timeoutMs)
      } catch (error) {
        throw reframeOpenClawAgentError(error, {
          openclawAgent: agentName,
          localAgentId
        })
      }
      const runId = readOpenClawRunId(accepted)
      if (!runId) {
        throw new Error('OpenClaw agent call did not return a runId.')
      }

      const waited = await client.request('agent.wait', {
        runId,
        timeoutMs
      }, timeoutMs + 1000)
      const status = readOpenClawStatus(waited).toLowerCase()
      if (status && status !== 'ok' && status !== 'completed' && status !== 'done') {
        throw new Error(`OpenClaw agent.wait returned ${status || 'an unknown status'} for run ${runId}.`)
      }

      const history = await client.request('chat.history', {
        sessionKey,
        limit: 12
      }, timeoutMs)
      const resultText = latestAssistantText(waited, { runId }) || latestAssistantText(history, { runId })
      if (!resultText) {
        throw new Error(`OpenClaw chat.history did not include a final assistant message for session ${sessionKey}.`)
      }

      const parsed = parseOpenClawTaskResult(resultText, {
        defaultSkill: selectedSkill,
        remoteAgentId,
        inboundId: clean(item?.inboundId),
        defaultTurnIndex: inboundConversation.turnIndex,
        defaultDecision: defaultShouldContinue ? 'continue' : 'done',
        defaultStopReason: inboundConversation.finalize ? 'peer-requested-stop' : '',
        defaultFinalize: inboundConversation.finalize ? true : !defaultShouldContinue
      })
      const conversation = normalizeConversationControl(parsed?.peerResponse?.metadata ?? item?.request?.params?.metadata ?? {}, {
        defaultTurnIndex: 1,
        defaultDecision: 'done',
        defaultStopReason: '',
        defaultFinalize: true
      })
      const safePeerReplyText = scrubOutboundText(peerResponseText(parsed.peerResponse))
      const safeOwnerSummary = scrubOutboundText(clean(parsed.ownerReport?.summary))
      const updatedConversation = conversationStore?.appendTurn?.({
        conversationKey,
        peerSessionId: item?.peerSessionId || '',
        requestId: clean(item?.request?.id),
        remoteAgentId,
        selectedSkill: parsed.selectedSkill,
        turnIndex: conversation.turnIndex,
        inboundText: displayInboundText,
        replyText: safePeerReplyText,
        decision: conversation.decision,
        stopReason: conversation.stopReason,
        finalize: conversation.finalize,
        ownerSummary: safeOwnerSummary
      }) ?? null
      const effectiveConversationTurns = updatedConversation?.turns?.length || conversation.turnIndex
      const ownerReport = buildReceiverBaseReport({
        localAgentId,
        remoteAgentId,
        incomingSkillHint,
        selectedSkill: parsed.selectedSkill,
        conversationKey,
        receivedAt,
        inboundText: displayInboundText,
        peerReplyText: safePeerReplyText,
        repliedAt: new Date().toISOString(),
        skillSummary: safeOwnerSummary,
        conversationTurns: effectiveConversationTurns,
        stopReason: conversation.stopReason,
        turnOutline: (updatedConversation?.turns ?? []).map((turn) => {
          const inbound = excerpt(turn.inboundText)
          const reply = excerpt(turn.replyText)
          const isFinalTurn = Boolean(turn.finalize) || ['done', 'handoff'].includes(clean(turn.decision).toLowerCase())
          return {
            turnIndex: turn.turnIndex,
            summary: [
              inbound ? `remote said "${inbound}"` : 'remote sent a message',
              reply ? `I replied "${reply}"` : 'I replied',
              isFinalTurn && clean(turn.stopReason) ? `(final stop: ${clean(turn.stopReason)})` : ''
            ].filter(Boolean).join(' ')
          }
        }),
        detailsAvailableInInbox: true,
        remoteSentAt,
        language: inferOwnerFacingLanguage(displayInboundText, safePeerReplyText, safeOwnerSummary),
        timeZone: ownerTimeZone,
        localTime: true
      })
      let relationshipMemoryRunId = ''
      if (conversation.finalize) {
        await persistRelationshipSummary(client, {
          relationSessionKey,
          remoteAgentId,
          selectedSkill: parsed.selectedSkill,
          transcript: updatedConversation?.turns?.map((turn) => [
            `Turn ${turn.turnIndex}:`,
            `Remote: ${turn.inboundText || '(empty)'}`,
            `Reply: ${turn.replyText || '(empty)'}`,
            `Decision: ${turn.decision || 'done'}`,
            turn.stopReason ? `Stop Reason: ${turn.stopReason}` : ''
          ].filter(Boolean).join('\n')).join('\n\n') || conversationTranscript,
          ownerSummary: safeOwnerSummary
        }).then((runId) => {
          relationshipMemoryRunId = clean(runId)
        })
        conversationStore?.finalizeConversation?.(updatedConversation?.conversationKey || liveConversation?.conversationKey || conversationKey, safeOwnerSummary)
      }
      return {
        ...parsed,
        peerResponse: {
          ...parsed.peerResponse,
          message: {
            kind: parsed.peerResponse?.message?.kind ?? 'message',
            role: parsed.peerResponse?.message?.role ?? 'agent',
            parts: [{ kind: 'text', text: safePeerReplyText }]
          },
          metadata: {
            ...(parsed.peerResponse?.metadata ?? {}),
            incomingSkillHint,
            conversationKey,
            openclawRunId: runId,
            openclawSessionKey: sessionKey,
            openclawRelationSessionKey: relationSessionKey,
            openclawGatewayUrl: gatewayContext.gatewayUrl,
            turnIndex: conversation.turnIndex,
            decision: conversation.decision,
            stopReason: conversation.stopReason,
            finalize: conversation.finalize
          }
        },
        ownerReport: {
          ...ownerReport,
          incomingSkillHint,
          selectedSkill: parsed.selectedSkill,
          conversationKey,
          runtimeAdapter: 'openclaw',
          openclawRunId: runId,
          openclawSessionKey: sessionKey,
          openclawRelationSessionKey: relationSessionKey,
          relationshipMemoryRunId,
          openclawGatewayUrl: gatewayContext.gatewayUrl,
          turnIndex: conversation.turnIndex,
          decision: conversation.decision,
          stopReason: conversation.stopReason,
          finalize: conversation.finalize
        }
      }
    })
  }

  async function pushOwnerReport({
    item,
    selectedSkill,
    ownerReport
  }) {
    const summary = scrubOutboundText(ownerReportText(ownerReport))
    if (!summary) {
      return { delivered: false, attempted: false, mode: 'openclaw', reason: 'empty-owner-report' }
    }

    return withGateway(async (client) => {
      const ownerRoute = await resolveOwnerRoute(client)
      if (!ownerRoute?.channel || !ownerRoute?.to) {
        return { delivered: false, attempted: true, mode: 'openclaw', reason: 'owner-route-not-found' }
      }
      const idempotencyKey = stableId(
        'agentsquared-owner',
        clean(ownerReport?.openclawRunId) || clean(item?.inboundId) || clean(selectedSkill),
        clean(ownerRoute.sessionKey),
        clean(ownerRoute.channel),
        clean(ownerRoute.to),
        summary
      )
      const payload = await client.request('send', {
        to: clean(ownerRoute.to),
        channel: clean(ownerRoute.channel),
        ...(clean(ownerRoute.accountId) ? { accountId: clean(ownerRoute.accountId) } : {}),
        ...(clean(ownerRoute.threadId) ? { threadId: clean(ownerRoute.threadId) } : {}),
        ...(clean(ownerRoute.sessionKey) ? { sessionKey: clean(ownerRoute.sessionKey) } : {}),
        message: summary,
        idempotencyKey
      }, timeoutMs)
      return {
        delivered: true,
        attempted: true,
        mode: 'openclaw',
        payload,
        ownerRoute,
        idempotencyKey
      }
    })
  }

  return {
    id: 'openclaw',
    mode: 'openclaw',
    transport: 'gateway-ws',
    command: clean(command) || 'openclaw',
    agent: agentName,
    sessionPrefix: clean(sessionPrefix) || 'agentsquared:',
    gatewayUrl: clean(gatewayUrl),
    preflight,
    executeInbound,
    pushOwnerReport
  }
}
