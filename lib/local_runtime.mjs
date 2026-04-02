import { extractInboundText } from './agent_router.mjs'
import { createHostRuntimeAdapter } from '../adapters/index.mjs'

function clean(value) {
  return `${value ?? ''}`.trim()
}

function buildTextMessageResult(text, metadata = {}) {
  return {
    message: {
      kind: 'message',
      role: 'agent',
      parts: [{ kind: 'text', text: clean(text) }]
    },
    metadata
  }
}

function excerpt(text, maxLength = 180) {
  const compact = clean(text).replace(/\s+/g, ' ').trim()
  if (!compact) {
    return ''
  }
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 3)}...` : compact
}

function normalizePeerResponse(value, metadata = {}) {
  if (typeof value === 'string') {
    return buildTextMessageResult(value, metadata)
  }
  if (value && typeof value === 'object') {
    return {
      ...value,
      metadata: {
        ...(value.metadata ?? {}),
        ...metadata
      }
    }
  }
  return null
}

export function normalizeExecutionResult(raw, {
  selectedSkill,
  mailboxKey
} = {}) {
  const baseMetadata = {
    selectedSkill: clean(selectedSkill),
    mailboxKey: clean(mailboxKey)
  }

  if (typeof raw === 'string') {
    return {
      peerResponse: buildTextMessageResult(raw, baseMetadata),
      ownerReport: null
    }
  }

  if (!raw || typeof raw !== 'object') {
    throw new Error('local runtime executor returned an invalid result')
  }

  if (raw.reject && typeof raw.reject === 'object') {
    return {
      reject: {
        code: Number.parseInt(`${raw.reject.code ?? 500}`, 10) || 500,
        message: clean(raw.reject.message) || 'local runtime rejected the inbound request'
      }
    }
  }

  const directPeerResponse = normalizePeerResponse(raw.peerResponse, baseMetadata)
  if (directPeerResponse) {
    return {
      peerResponse: directPeerResponse,
      ownerReport: raw.ownerReport ?? null
    }
  }

  const shorthandPeerResponse = normalizePeerResponse(
    raw.message || raw.result || (raw.parts ? { message: raw } : null),
    baseMetadata
  )
  if (shorthandPeerResponse) {
    return {
      peerResponse: shorthandPeerResponse,
      ownerReport: raw.ownerReport ?? null
    }
  }

  throw new Error('local runtime executor did not provide peerResponse or reject')
}

export function createLocalRuntimeExecutor({
  agentId,
  mode = 'none',
  hostRuntime = 'none',
  openclawStateDir = '',
  openclawCommand = 'openclaw',
  openclawCwd = '',
  openclawAgent = '',
  openclawSessionPrefix = 'agentsquared:peer:',
  openclawTimeoutMs = 180000,
  openclawGatewayUrl = '',
  openclawGatewayToken = '',
  openclawGatewayPassword = ''
} = {}) {
  const normalizedMode = clean(mode).toLowerCase() || 'none'
  const normalizedHostRuntime = clean(hostRuntime).toLowerCase() || 'none'
  const hostAdapter = normalizedMode === 'host'
    ? createHostRuntimeAdapter({
        hostRuntime: normalizedHostRuntime || 'openclaw',
        localAgentId: agentId,
        openclaw: {
          stateDir: openclawStateDir,
          openclawAgent,
          command: openclawCommand,
          cwd: openclawCwd,
          sessionPrefix: openclawSessionPrefix,
          timeoutMs: openclawTimeoutMs,
          gatewayUrl: openclawGatewayUrl,
          gatewayToken: openclawGatewayToken,
          gatewayPassword: openclawGatewayPassword
        }
      })
    : null

  async function executeViaHost(context) {
    if (!hostAdapter) {
      throw new Error('host runtime adapter was not configured')
    }
    return normalizeExecutionResult(
      await hostAdapter.executeInbound(context),
      context
    )
  }

  async function rejectExecution() {
    return {
      reject: {
        code: 503,
        message: 'no local agent runtime adapter is configured; inbound request cannot be handled yet'
      }
    }
  }

  const execute = normalizedMode === 'host'
    ? executeViaHost
    : rejectExecution

  execute.mode = normalizedMode
  return execute
}

export function createOwnerNotifier({
  agentId,
  mode = 'inbox',
  hostRuntime = 'none',
  inbox = null,
  openclawStateDir = '',
  openclawCommand = 'openclaw',
  openclawCwd = '',
  openclawAgent = '',
  openclawSessionPrefix = 'agentsquared:peer:',
  openclawTimeoutMs = 180000,
  openclawGatewayUrl = '',
  openclawGatewayToken = '',
  openclawGatewayPassword = ''
} = {}) {
  const normalizedMode = clean(mode).toLowerCase() || 'inbox'
  const normalizedHostRuntime = clean(hostRuntime).toLowerCase() || 'none'
  const hostAdapter = normalizedMode === 'host'
    ? createHostRuntimeAdapter({
        hostRuntime: normalizedHostRuntime || 'openclaw',
        localAgentId: agentId,
        openclaw: {
          stateDir: openclawStateDir,
          openclawAgent,
          command: openclawCommand,
          cwd: openclawCwd,
          sessionPrefix: openclawSessionPrefix,
          timeoutMs: openclawTimeoutMs,
          gatewayUrl: openclawGatewayUrl,
          gatewayToken: openclawGatewayToken,
          gatewayPassword: openclawGatewayPassword
        }
      })
    : null

  async function notifyViaInbox(context) {
    if (!inbox?.appendEntry) {
      throw new Error('inbox store is required when AgentSquared falls back to local audit-only owner reporting')
    }
    const value = inbox.appendEntry({
      agentId,
      selectedSkill: context.selectedSkill,
      mailboxKey: context.mailboxKey,
      item: context.item,
      ownerReport: context.ownerReport,
      peerResponse: context.peerResponse ?? null,
      ownerDelivery: {
        mode: 'inbox',
        attempted: false,
        delivered: false,
        reason: 'audit-only'
      }
    })
    return {
      delivered: true,
      mode: 'inbox',
      entryId: value.entry.id,
      totalCount: value.index.totalCount
    }
  }

  async function notifyViaHost(context) {
    let ownerResult
    if (!hostAdapter) {
      ownerResult = {
        delivered: false,
        attempted: false,
        mode: normalizedHostRuntime || 'host',
        reason: 'adapter-not-configured'
      }
    } else {
      try {
        ownerResult = await hostAdapter.pushOwnerReport({
          item: context.item,
          selectedSkill: context.selectedSkill,
          ownerReport: context.ownerReport
        })
      } catch (error) {
        ownerResult = {
          delivered: false,
          attempted: true,
          mode: 'openclaw',
          reason: clean(error?.message) || 'owner-push-failed'
        }
      }
    }
    const value = inbox.appendEntry({
      agentId,
      selectedSkill: context.selectedSkill,
      mailboxKey: context.mailboxKey,
      item: context.item,
      ownerReport: context.ownerReport,
      peerResponse: context.peerResponse ?? null,
      ownerDelivery: {
        attempted: Boolean(ownerResult?.attempted ?? true),
        delivered: Boolean(ownerResult?.delivered),
        mode: clean(ownerResult?.mode) || 'openclaw',
        reason: clean(ownerResult?.reason),
        stdout: ownerResult?.stdout ?? ''
      }
    })
    return {
      delivered: true,
      mode: 'openclaw',
      entryId: value.entry.id,
      totalCount: value.index.totalCount,
      deliveredToOwner: Boolean(ownerResult?.delivered),
      ownerDelivery: ownerResult
    }
  }

  const notify = normalizedMode === 'host'
    ? notifyViaHost
    : notifyViaInbox

  notify.mode = normalizedMode
  return notify
}

function buildOwnerSummary(context) {
  const remoteAgentId = clean(context?.item?.remoteAgentId) || 'unknown'
  const selectedSkill = clean(context?.selectedSkill) || 'friend-im'
  const incoming = excerpt(extractInboundText(context?.item))
  if (selectedSkill === 'agent-mutual-learning') {
    if (incoming) {
      return `${remoteAgentId} sent a mutual-learning request: ${incoming}`
    }
    return `${remoteAgentId} opened a mutual-learning request.`
  }
  if (incoming) {
    return `${remoteAgentId} sent a message: ${incoming}`
  }
  return `${remoteAgentId} opened an inbound ${selectedSkill} request.`
}
