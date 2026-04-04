import fs from 'node:fs'
import path from 'node:path'

import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { noise } from '@libp2p/noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { identify } from '@libp2p/identify'
import { autoNAT } from '@libp2p/autonat'
import { dcutr } from '@libp2p/dcutr'
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2'
import { generateKeyPair, privateKeyFromProtobuf, privateKeyToProtobuf } from '@libp2p/crypto/keys'
import { peerIdFromString } from '@libp2p/peer-id'
import { multiaddr } from '@multiformats/multiaddr'

export const DEFAULT_LISTEN_ADDRS = ['/ip6/::/tcp/0', '/ip4/0.0.0.0/tcp/0']
const DEFAULT_DIRECT_UPGRADE_TIMEOUT_MS = 12000
const DEFAULT_TRANSPORT_READY_TIMEOUT_MS = 20000

function unique(values = []) {
  return [...new Set(values.map((value) => `${value}`.trim()).filter(Boolean))]
}

function addrPriority(value) {
  const text = `${value}`.trim().toLowerCase()
  if (text.includes('/dns6/')) return 0
  if (text.includes('/ip6/')) return 1
  if (text.includes('/dnsaddr/')) return 2
  if (text.includes('/dns4/')) return 3
  if (text.includes('/ip4/')) return 4
  return 5
}

function prioritizeAddrs(values = []) {
  return unique(values)
    .map((value, index) => ({ value, index, priority: addrPriority(value) }))
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority
      }
      return left.index - right.index
    })
    .map((item) => item.value)
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

async function loadOrCreatePeerPrivateKey(peerKeyFile) {
  if (!peerKeyFile) {
    throw new Error('peerKeyFile is required for gateway node identity')
  }
  const cleaned = path.resolve(peerKeyFile)
  if (fs.existsSync(cleaned)) {
    return privateKeyFromProtobuf(fs.readFileSync(cleaned))
  }
  ensureParentDir(cleaned)
  const privateKey = await generateKeyPair('Ed25519')
  fs.writeFileSync(cleaned, Buffer.from(privateKeyToProtobuf(privateKey)), { mode: 0o600 })
  fs.chmodSync(cleaned, 0o600)
  return privateKey
}

export function buildRelayListenAddrs(relayMultiaddrs = []) {
  return prioritizeAddrs(relayMultiaddrs.map((value) => `${value}`.trim()).filter(Boolean).map((value) => `${value}/p2p-circuit`))
}

function parseFailedListenAddrs(error) {
  const message = `${error?.message ?? ''}`
  if (!message.includes('Some configured addresses failed to be listened on')) {
    return []
  }
  return message
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('/'))
    .map((line) => line.split(':', 1)[0].trim())
    .filter(Boolean)
}

export async function createNode({
  listenAddrs = DEFAULT_LISTEN_ADDRS,
  relayListenAddrs = [],
  peerKeyFile
} = {}) {
  const privateKey = await loadOrCreatePeerPrivateKey(peerKeyFile)
  let activeListenAddrs = unique([...listenAddrs, ...relayListenAddrs])
  let lastError = null

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await createLibp2p({
        privateKey,
        addresses: {
          listen: activeListenAddrs
        },
        transports: [
          tcp(),
          circuitRelayTransport()
        ],
        connectionEncrypters: [noise()],
        streamMuxers: [yamux()],
        services: {
          identify: identify(),
          autoNAT: autoNAT(),
          dcutr: dcutr()
        },
        start: true
      })
    } catch (error) {
      lastError = error
      const failedListenAddrs = parseFailedListenAddrs(error)
      if (failedListenAddrs.length === 0) {
        throw error
      }
      const failedSet = new Set(failedListenAddrs)
      const nextListenAddrs = activeListenAddrs.filter((value) => !failedSet.has(value))
      const removedAny = nextListenAddrs.length < activeListenAddrs.length
      if (!removedAny || nextListenAddrs.length === 0) {
        throw error
      }
      activeListenAddrs = prioritizeAddrs(nextListenAddrs)
    }
  }

  throw lastError ?? new Error('gateway node failed to start')
}

export function advertisedAddrs(node) {
  return prioritizeAddrs(node.getMultiaddrs().map((addr) => addr.toString()))
}

export function relayReservationAddrs(node) {
  return prioritizeAddrs(advertisedAddrs(node).filter((addr) => addr.includes('/p2p-circuit')))
}

export function directListenAddrs(node) {
  return prioritizeAddrs(advertisedAddrs(node).filter((addr) => !addr.includes('/p2p-circuit')))
}

export function requireListeningTransport(node, binding) {
  const peerId = node?.peerId?.toString?.() ?? ''
  const listenAddrs = directListenAddrs(node)
  const relayAddrs = relayReservationAddrs(node)
  const supportedBindings = binding?.binding ? [binding.binding] : []
  const streamProtocol = `${binding?.streamProtocol ?? ''}`.trim()
  const a2aProtocolVersion = `${binding?.a2aProtocolVersion ?? ''}`.trim()

  if (!peerId) {
    throw new Error('local gateway is not ready: peerId is unavailable')
  }
  if (listenAddrs.length === 0 && relayAddrs.length === 0) {
    throw new Error('local gateway is not ready: no direct or relay-backed addresses were published')
  }
  if (!streamProtocol) {
    throw new Error('local gateway is not ready: streamProtocol is unavailable')
  }
  if (supportedBindings.length === 0) {
    throw new Error('local gateway is not ready: supportedBindings are unavailable')
  }

  return {
    peerId,
    dialAddrs: prioritizeAddrs(relayAddrs.length > 0 ? relayAddrs : listenAddrs),
    listenAddrs,
    relayAddrs,
    supportedBindings,
    streamProtocol,
    a2aProtocolVersion
  }
}

export async function waitForPublishedTransport(node, binding, {
  requireRelayReservation = false,
  timeoutMs = DEFAULT_TRANSPORT_READY_TIMEOUT_MS
} = {}) {
  const startedAt = Date.now()
  let lastError = null

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const transport = requireListeningTransport(node, binding)
      if (requireRelayReservation && transport.relayAddrs.length === 0) {
        throw new Error('waiting for relay reservation-backed transport')
      }
      return transport
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }

  throw lastError ?? new Error('gateway transport did not become ready before timeout')
}

function isDirectConnection(connection) {
  const remoteAddr = connection?.remoteAddr?.toString?.() ?? ''
  return !remoteAddr.includes('/p2p-circuit') && connection?.limits == null
}

function newStreamOptions(connection) {
  if (connection?.limits != null) {
    return { runOnLimitedConnection: true }
  }
  const remoteAddr = connection?.remoteAddr?.toString?.() ?? ''
  if (remoteAddr.includes('/p2p-circuit')) {
    return { runOnLimitedConnection: true }
  }
  return undefined
}

export function currentPeerConnection(node, peerId) {
  if (!peerId?.trim?.()) return null
  const remotePeer = peerIdFromString(peerId)
  const connections = node.getConnections(remotePeer)
  return connections.find(isDirectConnection) ?? connections[0] ?? null
}

export function currentDirectConnection(node, peerId) {
  if (!peerId?.trim?.()) return null
  const remotePeer = peerIdFromString(peerId)
  return node.getConnections(remotePeer).find(isDirectConnection) ?? null
}

function chooseDialAddrs(transport) {
  return prioritizeAddrs(
    transport?.dialAddrs?.length
      ? transport.dialAddrs
      : transport?.relayAddrs?.length
        ? transport.relayAddrs
        : transport?.listenAddrs ?? []
  )
}

async function waitForDirectConnection(node, peerId, timeoutMs = DEFAULT_DIRECT_UPGRADE_TIMEOUT_MS) {
  const remotePeer = peerIdFromString(peerId)
  const startedAt = Date.now()
  let relayedConnection = null

  while (Date.now() - startedAt < timeoutMs) {
    const connections = node.getConnections(remotePeer)
    const directConnection = connections.find(isDirectConnection)
    if (directConnection) {
      return directConnection
    }
    relayedConnection = connections.find((connection) => connection?.remoteAddr?.toString?.().includes('/p2p-circuit'))
    await new Promise((resolve) => setTimeout(resolve, 300))
  }

  if (relayedConnection) {
    try {
      await relayedConnection.close()
    } catch {
      // best-effort cleanup only
    }
  }
  throw new Error(`direct P2P upgrade did not complete for ${peerId}`)
}

export async function dialProtocol(node, transport, {
  requireDirect = false,
  timeoutMs = DEFAULT_DIRECT_UPGRADE_TIMEOUT_MS
} = {}) {
  if (!transport?.streamProtocol) {
    throw new Error('target transport is missing streamProtocol')
  }
  if (!transport?.peerId?.trim()) {
    throw new Error('target transport is missing peerId')
  }

  const dialAddrs = chooseDialAddrs(transport)
  if (dialAddrs.length === 0) {
    throw new Error('target transport is missing dialAddrs')
  }

  let lastError = null
  for (const value of dialAddrs) {
    try {
      await node.dial(multiaddr(value))
      break
    } catch (error) {
      lastError = error
    }
  }

  if (lastError && node.getConnections(peerIdFromString(transport.peerId)).length === 0) {
    throw lastError
  }

  const connections = node.getConnections(peerIdFromString(transport.peerId))
  const connection = requireDirect
    ? await waitForDirectConnection(node, transport.peerId, timeoutMs)
    : connections.find(isDirectConnection) ?? connections[0]

  if (!connection) {
    throw new Error(`no connection was available for ${transport.peerId}`)
  }

  return connection.newStream([transport.streamProtocol], newStreamOptions(connection))
}

export async function openStreamOnExistingConnection(node, transport) {
  if (!transport?.streamProtocol) {
    throw new Error('target transport is missing streamProtocol')
  }
  if (!transport?.peerId?.trim()) {
    throw new Error('target transport is missing peerId')
  }
  const connection = currentPeerConnection(node, transport.peerId)
  if (!connection) {
    throw new Error(`no existing peer connection is available for ${transport.peerId}`)
  }
  return connection.newStream([transport.streamProtocol], newStreamOptions(connection))
}

export async function writeLine(stream, line) {
  const payload = Buffer.from(`${line}\n`, 'utf8')
  const accepted = stream.send(payload)
  if (accepted) return
  await new Promise((resolve, reject) => {
    const cleanup = () => {
      stream.removeEventListener('drain', onDrain)
      stream.removeEventListener('close', onClose)
    }
    const onDrain = () => {
      cleanup()
      resolve()
    }
    const onClose = (event) => {
      cleanup()
      reject(event?.error ?? new Error('stream closed before drain'))
    }
    stream.addEventListener('drain', onDrain, { once: true })
    stream.addEventListener('close', onClose, { once: true })
  })
}

export async function readSingleLine(stream) {
  const chunks = []
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk.subarray ? chunk.subarray(0) : chunk.slice()))
    const buffer = Buffer.concat(chunks)
    const newline = buffer.indexOf(0x0a)
    if (newline >= 0) {
      return buffer.subarray(0, newline).toString('utf8')
    }
  }
  return Buffer.concat(chunks).toString('utf8')
}

function isUnexpectedEndJson(error) {
  return error instanceof SyntaxError && /Unexpected end of JSON input/i.test(`${error.message ?? ''}`)
}

export async function readJsonMessage(stream) {
  let buffer = ''
  for await (const chunk of stream) {
    buffer += Buffer.from(chunk.subarray ? chunk.subarray(0) : chunk.slice()).toString('utf8')

    while (true) {
      const newlineIndex = buffer.indexOf('\n')
      if (newlineIndex < 0) {
        break
      }
      const candidate = buffer.slice(0, newlineIndex).trim()
      buffer = buffer.slice(newlineIndex + 1)
      if (!candidate) {
        continue
      }
      try {
        return JSON.parse(candidate)
      } catch (error) {
        if (candidate.startsWith('{') || candidate.startsWith('[')) {
          buffer = `${candidate}\n${buffer}`
          break
        }
        throw error
      }
    }
  }

  const finalText = buffer.trim()
  if (!finalText) {
    throw new Error('empty JSON message')
  }
  return JSON.parse(finalText)
}

export function pickTransport(connectTicketResponse) {
  return connectTicketResponse?.targetTransport ?? connectTicketResponse?.agentCard?.preferredTransport
}
