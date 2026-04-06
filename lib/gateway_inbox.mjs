import fs from 'node:fs'
import path from 'node:path'

function clean(value) {
  return `${value ?? ''}`.trim()
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function safeSegment(value, fallback = 'unknown') {
  const cleaned = clean(value).replace(/[^a-zA-Z0-9_.-]+/g, '_')
  return cleaned || fallback
}

function nowISO() {
  return new Date().toISOString()
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function jsonRead(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      return clone(fallback)
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return clone(fallback)
  }
}

function jsonWrite(filePath, payload) {
  ensureDir(path.dirname(filePath))
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`)
}

function extractInboundText(item = null) {
  const parts = item?.request?.params?.message?.parts ?? []
  return parts
    .filter((part) => clean(part?.kind) === 'text')
    .map((part) => clean(part?.text))
    .filter(Boolean)
    .join('\n')
    .trim()
}

function extractReplyText(peerResponse = null) {
  const parts = peerResponse?.message?.parts ?? []
  return parts
    .filter((part) => clean(part?.kind) === 'text')
    .map((part) => clean(part?.text))
    .filter(Boolean)
    .join('\n')
    .trim()
}

function extractConversationKey(item = null, peerResponse = null, ownerReport = null) {
  return clean(
    peerResponse?.metadata?.conversationKey
      ?? item?.request?.params?.metadata?.conversationKey
      ?? ownerReport?.conversationKey
  )
}

function excerpt(text, maxLength = 180) {
  const compact = clean(text).replace(/\s+/g, ' ').trim()
  if (!compact) {
    return ''
  }
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 3)}...` : compact
}

export function defaultInboxDir(keyFile, agentId) {
  if (!keyFile || !agentId) {
    throw new Error('keyFile and agentId are required to derive the inbox directory')
  }
  return path.join(path.dirname(path.resolve(keyFile)), `${safeSegment(agentId)}_inbox`)
}

export function createInboxStore({
  inboxDir
} = {}) {
  const resolvedInboxDir = path.resolve(clean(inboxDir) || '.')
  const entriesDir = path.join(resolvedInboxDir, 'entries')
  const indexFile = path.join(resolvedInboxDir, 'index.json')
  const inboxMarkdownFile = path.join(resolvedInboxDir, 'inbox.md')

  function readIndex() {
    return jsonRead(indexFile, {
      updatedAt: '',
      totalCount: 0,
      lastEntryAt: '',
      lastEntryId: '',
      ownerPushAttemptedCount: 0,
      ownerPushDeliveredCount: 0,
      ownerPushFailedCount: 0,
      recent: []
    })
  }

  function summarizeEntry(entry) {
    return {
      id: entry.id,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      remoteAgentId: entry.remoteAgentId,
      conversationKey: entry.conversationKey,
      peerSessionId: entry.peerSessionId,
      selectedSkill: entry.selectedSkill,
      summary: entry.summary,
      messageExcerpt: entry.messageExcerpt,
      replyExcerpt: entry.replyExcerpt,
      ownerDelivery: entry.ownerDelivery ?? null,
      file: entry.file
    }
  }

  function renderMarkdown(index) {
    const lines = [
      '# Inbox',
      '',
      `Updated: ${clean(index.updatedAt) || 'unknown'}`,
      `Total: ${index.totalCount ?? 0}`,
      `Last Entry: ${clean(index.lastEntryAt) || 'none'}`,
      `Owner Push Attempted: ${index.ownerPushAttemptedCount ?? 0}`,
      `Owner Push Delivered: ${index.ownerPushDeliveredCount ?? 0}`,
      `Owner Push Failed: ${index.ownerPushFailedCount ?? 0}`,
      ''
    ]

    if (Array.isArray(index.recent) && index.recent.length > 0) {
      lines.push('## Recent')
      lines.push('')
      for (const item of index.recent) {
        const delivery = item.ownerDelivery?.attempted
          ? item.ownerDelivery?.delivered
            ? 'owner-delivered'
            : 'owner-push-failed'
          : 'audit-only'
        lines.push(`- [${delivery}] ${item.remoteAgentId}: ${item.summary}`)
      }
      lines.push('')
    } else {
      lines.push('## Recent')
      lines.push('')
      lines.push('- none')
      lines.push('')
    }

    fs.writeFileSync(inboxMarkdownFile, `${lines.join('\n')}\n`)
  }

  function rebuildIndex() {
    ensureDir(entriesDir)
    const files = fs.readdirSync(entriesDir)
      .filter((name) => name.endsWith('.json'))
      .sort()

    const entries = files.map((name) => {
      const entry = jsonRead(path.join(entriesDir, name), null)
      return entry && typeof entry === 'object' ? entry : null
    }).filter(Boolean)

    entries.sort((left, right) => {
      return Date.parse(right.createdAt || 0) - Date.parse(left.createdAt || 0)
    })

    const recent = entries.slice(0, 50).map(summarizeEntry)
    const ownerPushAttemptedCount = entries.filter((entry) => Boolean(entry?.ownerDelivery?.attempted)).length
    const ownerPushDeliveredCount = entries.filter((entry) => entry?.ownerDelivery?.attempted && entry?.ownerDelivery?.delivered).length
    const ownerPushFailedCount = entries.filter((entry) => entry?.ownerDelivery?.attempted && !entry?.ownerDelivery?.delivered).length

    const index = {
      updatedAt: nowISO(),
      totalCount: entries.length,
      lastEntryAt: clean(entries[0]?.createdAt),
      lastEntryId: clean(entries[0]?.id),
      ownerPushAttemptedCount,
      ownerPushDeliveredCount,
      ownerPushFailedCount,
      recent
    }
    jsonWrite(indexFile, index)
    renderMarkdown(index)
    return index
  }

  function appendEntry({
    agentId,
    selectedSkill,
    mailboxKey,
    item,
    ownerReport,
    peerResponse,
    ownerDelivery = null
  }) {
    ensureDir(entriesDir)
    const createdAt = nowISO()
    const id = clean(item?.inboundId) || safeSegment(createdAt)
    const remoteAgentId = clean(item?.remoteAgentId)
    const filename = `${createdAt.replace(/[:.]/g, '-')}_${safeSegment(remoteAgentId)}_${safeSegment(id)}.json`
    const file = path.join(entriesDir, filename)
    const inboundText = extractInboundText(item)
    const replyText = extractReplyText(peerResponse)
    const summary = clean(ownerReport?.summary) || `${remoteAgentId || 'unknown'} opened an inbound ${selectedSkill} session.`

    const entry = {
      id,
      createdAt,
      updatedAt: createdAt,
      agentId: clean(agentId),
      mailboxKey: clean(mailboxKey),
      remoteAgentId,
      conversationKey: extractConversationKey(item, peerResponse, ownerReport),
      peerSessionId: clean(item?.peerSessionId),
      selectedSkill: clean(selectedSkill),
      summary,
      messageExcerpt: excerpt(inboundText),
      replyExcerpt: excerpt(replyText),
      ownerReport: ownerReport ?? null,
      ownerDelivery: ownerDelivery ?? null,
      request: item?.request ?? null,
      peerResponse: peerResponse ?? null,
      file: path.relative(resolvedInboxDir, file)
    }

    jsonWrite(file, entry)
    const index = rebuildIndex()
    return {
      entry,
      index
    }
  }

  function snapshot() {
    const index = readIndex()
    return {
      inboxDir: resolvedInboxDir,
      entriesDir,
      inboxMarkdownFile,
      indexFile,
      totalCount: index.totalCount ?? 0,
      lastEntryAt: index.lastEntryAt ?? '',
      ownerPushAttemptedCount: index.ownerPushAttemptedCount ?? 0,
      ownerPushDeliveredCount: index.ownerPushDeliveredCount ?? 0,
      ownerPushFailedCount: index.ownerPushFailedCount ?? 0
    }
  }

  return {
    inboxDir: resolvedInboxDir,
    entriesDir,
    indexFile,
    inboxMarkdownFile,
    readIndex,
    rebuildIndex,
    appendEntry,
    snapshot
  }
}
