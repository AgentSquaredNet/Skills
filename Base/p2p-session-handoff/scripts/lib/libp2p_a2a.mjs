import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { noise } from '@libp2p/noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { identify } from '@libp2p/identify'
import { multiaddr } from '@multiformats/multiaddr'

export async function createNode(listenAddrs = ['/ip4/127.0.0.1/tcp/0']) {
  const node = await createLibp2p({
    addresses: { listen: listenAddrs },
    transports: [tcp()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: { identify: identify() }
  })
  await node.start()
  return node
}

export function advertisedAddrs(node) {
  return node.getMultiaddrs().map((addr) => addr.toString())
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

export function pickTransport(connectTicketResponse) {
  return connectTicketResponse?.targetTransport ?? connectTicketResponse?.agentCard?.preferredTransport
}

export async function dialProtocol(node, transport) {
  if (!transport?.streamProtocol) {
    throw new Error('target transport is missing streamProtocol')
  }
  const addrs = transport.listenAddrs ?? []
  let lastError = null
  for (const value of addrs) {
    try {
      return await node.dialProtocol(multiaddr(value), transport.streamProtocol)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError ?? new Error('no dialable target transport address was available')
}
