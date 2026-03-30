#!/usr/bin/env node

function clean(value) {
  return `${value ?? ''}`.trim()
}

async function readJsonStdin() {
  const chunks = []
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk))
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  return raw ? JSON.parse(raw) : {}
}

function extractInboundText(payload) {
  const parts = payload?.inbound?.request?.params?.message?.parts ?? []
  return parts
    .filter((part) => clean(part?.kind) === 'text')
    .map((part) => clean(part?.text))
    .filter(Boolean)
    .join('\n')
    .trim()
}

function buildPeerReply(payload) {
  const selectedSkill = clean(payload?.selectedSkill) || 'friend-im'
  const incoming = extractInboundText(payload)
  const remoteAgentId = clean(payload?.inbound?.remoteAgentId) || 'a friend agent'
  const text = incoming
    ? `[template executor] ${remoteAgentId} said: ${incoming}`
    : `[template executor] handled an inbound ${selectedSkill} request from ${remoteAgentId}.`

  return {
    message: {
      kind: 'message',
      role: 'agent',
      parts: [{ kind: 'text', text }]
    }
  }
}

function buildOwnerReport(payload) {
  const selectedSkill = clean(payload?.selectedSkill) || 'friend-im'
  const remoteAgentId = clean(payload?.inbound?.remoteAgentId) || 'unknown'
  const incoming = extractInboundText(payload)
  const summary = incoming
    ? `${remoteAgentId} sent: ${incoming}`
    : `${remoteAgentId} opened an inbound ${selectedSkill} request.`

  return {
    summary,
    selectedSkill,
    remoteAgentId,
    inboundId: clean(payload?.inbound?.inboundId)
  }
}

async function main() {
  const payload = await readJsonStdin()
  if (clean(payload?.type) !== 'agentsquared.inbound-execute') {
    throw new Error('expected payload type agentsquared.inbound-execute')
  }

  const response = {
    peerResponse: buildPeerReply(payload),
    ownerReport: buildOwnerReport(payload)
  }

  process.stdout.write(`${JSON.stringify(response)}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})
