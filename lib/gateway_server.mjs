#!/usr/bin/env node

import http from 'node:http'
import path from 'node:path'
import { URL } from 'node:url'
import { fileURLToPath } from 'node:url'

import { parseArgs, parseList, requireArg } from './cli.mjs'
import { getBindingDocument } from './relay_http.mjs'
import { loadRuntimeKeyBundle } from './runtime_key.mjs'
import { buildRelayListenAddrs, createNode, directListenAddrs, relayReservationAddrs } from './libp2p_a2a.mjs'
import { attachInboundRouter, currentTransport, openDirectPeerSession, publishGatewayPresence } from './peer_session.mjs'
import { assertGatewayStateFresh, currentRuntimeRevision, defaultGatewayStateFile, readGatewayState, writeGatewayState } from './gateway_runtime.mjs'
import { createGatewayRuntimeState } from './gateway_sessions.mjs'
import { createAgentRouter, DEFAULT_ROUTER_DEFAULT_SKILL, DEFAULT_ROUTER_SKILLS } from './agent_router.mjs'
import { createLocalRuntimeExecutor, createOwnerNotifier } from './local_runtime.mjs'
import { createInboxStore, defaultInboxDir } from './gateway_inbox.mjs'
import { detectHostRuntimeEnvironment } from '../adapters/index.mjs'

const __filename = fileURLToPath(import.meta.url)

const DEFAULT_GATEWAY_HOST = '127.0.0.1'
const DEFAULT_GATEWAY_PORT = 0
const DEFAULT_PRESENCE_REFRESH_MS = 2 * 60 * 1000
const DEFAULT_HEALTH_CHECK_MS = 15 * 1000
const DEFAULT_TRANSPORT_CHECK_TIMEOUT_MS = 1500
const DEFAULT_RECOVERY_IDLE_WAIT_MS = 3000
const DEFAULT_FAILURES_BEFORE_RECOVER = 2
const DEFAULT_ROUTER_WAIT_MS = 30000

function nowISO() {
  return new Date().toISOString()
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function jsonResponse(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk))
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  return raw ? JSON.parse(raw) : {}
}

function defaultPeerKeyFile(keyFile, agentId) {
  const safeAgentId = agentId.replace(/[^a-zA-Z0-9_.-]+/g, '_')
  return path.join(path.dirname(path.resolve(keyFile)), `${safeAgentId}_gateway-peer.key`)
}

export async function runGateway(argv) {
  const args = parseArgs(argv)
  const apiBase = (args['api-base'] ?? 'https://api.agentsquared.net').trim()
  const agentId = requireArg(args['agent-id'], '--agent-id is required')
  const keyFile = requireArg(args['key-file'], '--key-file is required')
  const gatewayHost = (args['gateway-host'] ?? DEFAULT_GATEWAY_HOST).trim()
  const gatewayPort = Number.parseInt(args['gateway-port'] ?? `${DEFAULT_GATEWAY_PORT}`, 10)
  const presenceRefreshMs = Math.max(0, Number.parseInt(args['presence-refresh-ms'] ?? `${DEFAULT_PRESENCE_REFRESH_MS}`, 10) || DEFAULT_PRESENCE_REFRESH_MS)
  const healthCheckMs = Math.max(1000, Number.parseInt(args['health-check-ms'] ?? `${DEFAULT_HEALTH_CHECK_MS}`, 10) || DEFAULT_HEALTH_CHECK_MS)
  const transportCheckTimeoutMs = Math.max(250, Number.parseInt(args['transport-check-timeout-ms'] ?? `${DEFAULT_TRANSPORT_CHECK_TIMEOUT_MS}`, 10) || DEFAULT_TRANSPORT_CHECK_TIMEOUT_MS)
  const recoveryIdleWaitMs = Math.max(0, Number.parseInt(args['recovery-idle-wait-ms'] ?? `${DEFAULT_RECOVERY_IDLE_WAIT_MS}`, 10) || DEFAULT_RECOVERY_IDLE_WAIT_MS)
  const failuresBeforeRecover = Math.max(1, Number.parseInt(args['failures-before-recover'] ?? `${DEFAULT_FAILURES_BEFORE_RECOVER}`, 10) || DEFAULT_FAILURES_BEFORE_RECOVER)
  const routerMode = `${args['router-mode'] ?? 'integrated'}`.trim().toLowerCase() === 'external' ? 'external' : 'integrated'
  const routerWaitMs = Math.max(0, Number.parseInt(args['wait-ms'] ?? `${DEFAULT_ROUTER_WAIT_MS}`, 10) || DEFAULT_ROUTER_WAIT_MS)
  const maxActiveMailboxes = Math.max(1, Number.parseInt(args['max-active-mailboxes'] ?? '8', 10) || 8)
  const routerSkills = parseList(args['router-skills'] ?? args['allowed-skills'], DEFAULT_ROUTER_SKILLS)
  const defaultSkill = (args['default-skill'] ?? args['fallback-skill'] ?? DEFAULT_ROUTER_DEFAULT_SKILL).trim() || DEFAULT_ROUTER_DEFAULT_SKILL
  const hostRuntime = `${args['host-runtime'] ?? 'auto'}`.trim().toLowerCase() || 'auto'
  const openclawAgent = `${args['openclaw-agent'] ?? process.env.OPENCLAW_AGENT ?? ''}`.trim()
  const openclawOwnerChannel = `${args['openclaw-owner-channel'] ?? process.env.OPENCLAW_OWNER_CHANNEL ?? ''}`.trim()
  const openclawOwnerTarget = `${args['openclaw-owner-target'] ?? process.env.OPENCLAW_OWNER_TARGET ?? ''}`.trim()
  const agentExecutorUrl = `${args['agent-executor-url'] ?? ''}`.trim()
  const agentExecutorCommand = `${args['agent-executor-command'] ?? ''}`.trim()
  const ownerNotifyUrl = `${args['owner-notify-url'] ?? ''}`.trim()
  const ownerNotifyCommand = `${args['owner-notify-command'] ?? ''}`.trim()
  const openclawCommand = `${args['openclaw-command'] ?? process.env.OPENCLAW_COMMAND ?? 'openclaw'}`.trim() || 'openclaw'
  const openclawCwd = `${args['openclaw-cwd'] ?? process.env.OPENCLAW_CWD ?? ''}`.trim()
  const openclawSessionPrefix = `${args['openclaw-session-prefix'] ?? args['openclaw-peer-target-prefix'] ?? process.env.OPENCLAW_SESSION_PREFIX ?? process.env.OPENCLAW_PEER_TARGET_PREFIX ?? 'agentsquared:peer:'}`.trim() || 'agentsquared:peer:'
  const openclawTimeoutMs = Math.max(1000, Number.parseInt(args['openclaw-timeout-ms'] ?? `${process.env.OPENCLAW_TIMEOUT_MS ?? '180000'}`, 10) || 180000)
  const openclawOwnerThreadId = `${args['openclaw-owner-thread-id'] ?? process.env.OPENCLAW_OWNER_THREAD_ID ?? ''}`.trim()
  const openclawGatewayUrl = `${args['openclaw-gateway-url'] ?? process.env.OPENCLAW_GATEWAY_URL ?? ''}`.trim()
  const openclawGatewayToken = `${args['openclaw-gateway-token'] ?? process.env.OPENCLAW_GATEWAY_TOKEN ?? ''}`.trim()
  const openclawGatewayPassword = `${args['openclaw-gateway-password'] ?? process.env.OPENCLAW_GATEWAY_PASSWORD ?? ''}`.trim()
  const peerKeyFile = (args['peer-key-file'] ?? defaultPeerKeyFile(keyFile, agentId)).trim()
  const gatewayStateFile = (args['gateway-state-file'] ?? defaultGatewayStateFile(keyFile, agentId)).trim()
  const inboxDir = (args['inbox-dir'] ?? defaultInboxDir(keyFile, agentId)).trim()
  const listenAddrs = parseList(args['listen-addrs'], ['/ip4/0.0.0.0/tcp/0'])
  const bundle = loadRuntimeKeyBundle(keyFile)
  const runtimeState = createGatewayRuntimeState()
  const inboxStore = createInboxStore({ inboxDir })
  const runtimeRevision = currentRuntimeRevision()
  const detectedHostRuntime = await detectHostRuntimeEnvironment({
    preferred: hostRuntime,
    openclaw: {
      command: openclawCommand,
      cwd: openclawCwd,
      openclawAgent,
      gatewayUrl: openclawGatewayUrl,
      gatewayToken: openclawGatewayToken,
      gatewayPassword: openclawGatewayPassword
    }
  })
  const resolvedHostRuntime = detectedHostRuntime.resolved || 'none'
  const agentExecutorMode = `${args['agent-executor-mode'] ?? (resolvedHostRuntime !== 'none' ? 'host' : 'reject')}`.trim().toLowerCase() || 'reject'
  const ownerNotifyMode = `${args['owner-notify-mode'] ?? (resolvedHostRuntime !== 'none' && openclawOwnerChannel && openclawOwnerTarget ? 'host' : 'inbox')}`.trim().toLowerCase() || 'inbox'
  const localRuntimeExecutor = createLocalRuntimeExecutor({
    agentId,
    mode: agentExecutorMode,
    hostRuntime: resolvedHostRuntime,
    url: agentExecutorUrl,
    command: agentExecutorCommand,
    openclawCommand,
    openclawCwd,
    openclawAgent,
    openclawSessionPrefix,
    openclawTimeoutMs,
    openclawOwnerChannel,
    openclawOwnerTarget,
    openclawOwnerThreadId,
    openclawGatewayUrl,
    openclawGatewayToken,
    openclawGatewayPassword
  })
  const ownerNotifier = createOwnerNotifier({
    agentId,
    mode: ownerNotifyMode,
    hostRuntime: resolvedHostRuntime,
    url: ownerNotifyUrl,
    command: ownerNotifyCommand,
    inbox: inboxStore,
    openclawCommand,
    openclawCwd,
    openclawAgent,
    openclawSessionPrefix,
    openclawTimeoutMs,
    openclawOwnerChannel,
    openclawOwnerTarget,
    openclawOwnerThreadId,
    openclawGatewayUrl,
    openclawGatewayToken,
    openclawGatewayPassword
  })

  const binding = await getBindingDocument(apiBase)
  const relayListenAddrs = buildRelayListenAddrs(binding.relayMultiaddrs ?? [])
  const requireRelayReservation = relayListenAddrs.length > 0

  let gatewayBase = `http://${gatewayHost}:${gatewayPort}`
  let actualGatewayPort = gatewayPort
  let currentNode = null
  let online = null
  let recoveryPromise = null
  let stopping = false
  let activeOperations = 0
  const idleWaiters = []
  const integratedRouter = routerMode === 'integrated'
    ? createAgentRouter({
        maxActiveMailboxes,
        routerSkills,
        defaultSkill,
        executeInbound: localRuntimeExecutor,
        notifyOwner: ownerNotifier,
        onRespond(item, result) {
          runtimeState.respondInbound({
            inboundId: item.inboundId,
            result
          })
        },
        onReject(item, payload) {
          runtimeState.rejectInbound({
            inboundId: item.inboundId,
            code: payload.code,
            message: payload.message
          })
        }
      })
    : null
  const lifecycle = {
    generation: 0,
    recovering: false,
    lastRecoveryAt: '',
    lastRecoveryReason: '',
    lastHealthyAt: '',
    lastError: '',
    consecutiveFailures: 0,
    routerMode
  }

  function flushIdleWaiters() {
    if (activeOperations !== 0) {
      return
    }
    while (idleWaiters.length > 0) {
      const resolve = idleWaiters.shift()
      resolve?.(true)
    }
  }

  function beginOperation() {
    activeOperations += 1
    let done = false
    return () => {
      if (done) {
        return
      }
      done = true
      activeOperations = Math.max(0, activeOperations - 1)
      flushIdleWaiters()
    }
  }

  async function waitForIdle(timeoutMs) {
    if (activeOperations === 0) {
      return true
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const index = idleWaiters.indexOf(onIdle)
        if (index >= 0) {
          idleWaiters.splice(index, 1)
        }
        resolve(false)
      }, timeoutMs)
      const onIdle = () => {
        clearTimeout(timer)
        resolve(true)
      }
      idleWaiters.push(onIdle)
    })
  }

  function markHealthy() {
    lifecycle.lastHealthyAt = nowISO()
    lifecycle.lastError = ''
    lifecycle.consecutiveFailures = 0
  }

  function noteFailure(error) {
    lifecycle.lastError = error?.message ?? `${error ?? 'gateway failure'}`
    lifecycle.consecutiveFailures += 1
  }

  function buildLifecycleSnapshot() {
    return {
      ...lifecycle,
      activeOperations,
      hasNode: Boolean(currentNode),
      online
    }
  }

  function buildRouterSnapshot() {
    return integratedRouter
      ? integratedRouter.snapshot()
        : {
          mode: 'external',
          routerSkills,
          defaultSkill,
          executorMode: localRuntimeExecutor.mode,
          ownerNotifyMode: ownerNotifier.mode,
          hostRuntime: resolvedHostRuntime
        }
  }

  function writeStateForNode(node) {
    if (!gatewayBase || !node?.peerId?.toString?.()) {
      return
    }
    writeGatewayState(gatewayStateFile, {
      agentId,
      gatewayBase,
      gatewayHost,
      gatewayPort: actualGatewayPort,
      keyFile: path.resolve(keyFile),
      peerKeyFile: path.resolve(peerKeyFile),
      peerId: node.peerId.toString(),
      runtimeRevision,
      runtimeStartedAt: nowISO(),
      updatedAt: nowISO()
    })
  }

  async function stopNode(node) {
    if (!node) {
      return
    }
    try {
      await node.stop()
    } catch (error) {
      console.error(`gateway node stop failed: ${error.message}`)
    }
  }

  async function createAttachedNode() {
    const node = await createNode({
      listenAddrs,
      relayListenAddrs,
      peerKeyFile
    })
    await attachInboundRouter({
      apiBase,
      agentId,
      bundle,
      node,
      binding,
      sessionStore: runtimeState
    })
    return node
  }

  async function verifyTransport(node, timeoutMs = transportCheckTimeoutMs) {
    const transport = await currentTransport(node, binding, {
      requireRelayReservation,
      timeoutMs
    })
    markHealthy()
    return transport
  }

  async function publishPresence(node, activitySummary = 'Gateway listener ready for trusted direct sessions.') {
    const value = await publishGatewayPresence(
      apiBase,
      agentId,
      bundle,
      node,
      binding,
      activitySummary,
      { requireRelayReservation }
    )
    online = value
    markHealthy()
    return value
  }

  async function recoverGateway(reason) {
    if (stopping) {
      throw new Error('gateway is stopping')
    }
    if (recoveryPromise) {
      return recoveryPromise
    }

    recoveryPromise = (async () => {
      lifecycle.recovering = true
      lifecycle.lastRecoveryAt = nowISO()
      lifecycle.lastRecoveryReason = `${reason}`.trim() || 'gateway recovery'

      const previousNode = currentNode
      currentNode = null
      online = null

      await waitForIdle(recoveryIdleWaitMs)
      runtimeState.reset({
        reason: `gateway reconnect in progress: ${lifecycle.lastRecoveryReason}`
      })
      await stopNode(previousNode)

      let nextNode = null
      try {
        nextNode = await createAttachedNode()
        await publishPresence(nextNode)
        currentNode = nextNode
        lifecycle.generation += 1
        lifecycle.recovering = false
        writeStateForNode(nextNode)
        console.log(JSON.stringify({
          event: lifecycle.generation === 1 ? 'gateway-started' : 'gateway-recovered',
          agentId,
          gatewayBase,
          gatewayStateFile,
          peerId: nextNode.peerId.toString(),
          listenAddrs: directListenAddrs(nextNode),
          relayAddrs: relayReservationAddrs(nextNode),
          streamProtocol: binding.streamProtocol,
          peerKeyFile,
          routerMode,
          agentRouter: buildRouterSnapshot(),
          lifecycle: buildLifecycleSnapshot(),
          runtimeState: runtimeState.snapshot()
        }, null, 2))
        return nextNode
      } catch (error) {
        lifecycle.lastError = error.message
        if (nextNode) {
          await stopNode(nextNode)
        }
        throw error
      } finally {
        lifecycle.recovering = false
        recoveryPromise = null
      }
    })()

    return recoveryPromise
  }

  async function ensureGatewayReady(reason) {
    if (recoveryPromise) {
      await recoveryPromise
    }
    if (!currentNode) {
      await recoverGateway(reason)
    }
    if (!currentNode) {
      throw new Error('gateway transport is unavailable')
    }
    try {
      await verifyTransport(currentNode)
      return currentNode
    } catch (error) {
      noteFailure(error)
      await recoverGateway(`${reason}: ${error.message}`)
      if (!currentNode) {
        throw new Error(`gateway transport is unavailable: ${error.message}`)
      }
      await verifyTransport(currentNode)
      return currentNode
    }
  }

  async function runHealthCheck(source) {
    if (recoveryPromise || stopping) {
      return
    }
    if (!currentNode) {
      try {
        await recoverGateway(`${source}: no active gateway node`)
      } catch (error) {
        noteFailure(error)
        console.error(`${source} recovery failed: ${error.message}`)
      }
      return
    }
    try {
      await verifyTransport(currentNode)
    } catch (error) {
      noteFailure(error)
      console.error(`${source} failed: ${error.message}`)
      if (lifecycle.consecutiveFailures >= failuresBeforeRecover) {
        try {
          await recoverGateway(`${source}: ${error.message}`)
        } catch (recoveryError) {
          noteFailure(recoveryError)
          console.error(`${source} recovery failed: ${recoveryError.message}`)
        }
      }
    }
  }

  async function runIntegratedRouterLoop() {
    if (!integratedRouter) {
      return
    }
    while (!stopping) {
      const item = await runtimeState.nextInbound({ waitMs: routerWaitMs })
      if (!item?.inboundId) {
        continue
      }
      integratedRouter.enqueue(item).catch((error) => {
        try {
          runtimeState.rejectInbound({
            inboundId: item.inboundId,
            code: Number.parseInt(`${error?.code ?? 500}`, 10) || 500,
            message: error?.message ?? 'integrated agent router failed to process inbound request'
          })
        } catch (rejectError) {
          console.error(rejectError.message)
        }
        console.error(error?.message ?? 'integrated agent router failed to process inbound request')
      })
    }
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', gatewayBase)
      if (req.method === 'GET' && url.pathname === '/health') {
        const state = readGatewayState(gatewayStateFile)
        let revisionStatus
        try {
          revisionStatus = assertGatewayStateFresh(state, gatewayStateFile)
        } catch (error) {
          revisionStatus = {
            stale: true,
            expectedRevision: runtimeRevision,
            currentRevision: `${state?.runtimeRevision ?? ''}`.trim(),
            message: error.message
          }
        }
        if (recoveryPromise || !currentNode) {
          jsonResponse(res, 503, {
            agentId,
            gatewayBase,
            gatewayStateFile,
            runtimeRevision,
            revisionStatus,
            hostRuntime: detectedHostRuntime,
            routerMode,
            agentRouter: buildRouterSnapshot(),
            lifecycle: buildLifecycleSnapshot(),
            runtimeState: runtimeState.snapshot()
            ,
            inbox: inboxStore.snapshot()
          })
          return
        }
        try {
          const transport = await verifyTransport(currentNode)
          jsonResponse(res, 200, {
            agentId,
            gatewayBase,
            gatewayStateFile,
            runtimeRevision,
            revisionStatus,
            hostRuntime: detectedHostRuntime,
            peerId: transport.peerId,
            listenAddrs: transport.listenAddrs,
            relayAddrs: transport.relayAddrs,
            directListenAddrs: directListenAddrs(currentNode),
            relayReservationAddrs: relayReservationAddrs(currentNode),
            streamProtocol: transport.streamProtocol,
            supportedBindings: transport.supportedBindings,
            routerMode,
            agentRouter: buildRouterSnapshot(),
            lifecycle: buildLifecycleSnapshot(),
            runtimeState: runtimeState.snapshot(),
            inbox: inboxStore.snapshot()
          })
          return
        } catch (error) {
          noteFailure(error)
          jsonResponse(res, 503, {
            agentId,
            gatewayBase,
            gatewayStateFile,
            runtimeRevision,
            revisionStatus,
            hostRuntime: detectedHostRuntime,
            routerMode,
            error: { message: error.message },
            agentRouter: buildRouterSnapshot(),
            lifecycle: buildLifecycleSnapshot(),
            runtimeState: runtimeState.snapshot(),
            inbox: inboxStore.snapshot()
          })
          return
        }
      }

      if (req.method === 'GET' && url.pathname === '/inbox/index') {
        jsonResponse(res, 200, {
          index: inboxStore.readIndex(),
          snapshot: inboxStore.snapshot()
        })
        return
      }

      if (req.method === 'GET' && url.pathname === '/inbound/next') {
        if (integratedRouter) {
          jsonResponse(res, 409, { error: { message: 'integrated agent router is active; external inbound polling is disabled' } })
          return
        }
        const waitMs = Number.parseInt(url.searchParams.get('waitMs') ?? '30000', 10)
        const nextInbound = await runtimeState.nextInbound({ waitMs })
        jsonResponse(res, 200, { item: nextInbound })
        return
      }

      if (req.method === 'POST' && url.pathname === '/inbound/respond') {
        if (integratedRouter) {
          jsonResponse(res, 409, { error: { message: 'integrated agent router is active; external inbound responses are disabled' } })
          return
        }
        const body = await readJson(req)
        runtimeState.respondInbound({
          inboundId: requireArg(body.inboundId, 'inboundId is required'),
          result: body.result ?? {}
        })
        jsonResponse(res, 200, { ok: true })
        return
      }

      if (req.method === 'POST' && url.pathname === '/inbound/reject') {
        if (integratedRouter) {
          jsonResponse(res, 409, { error: { message: 'integrated agent router is active; external inbound rejects are disabled' } })
          return
        }
        const body = await readJson(req)
        runtimeState.rejectInbound({
          inboundId: requireArg(body.inboundId, 'inboundId is required'),
          code: Number.parseInt(body.code ?? '500', 10) || 500,
          message: `${body.message ?? 'local runtime rejected the inbound request'}`
        })
        jsonResponse(res, 200, { ok: true })
        return
      }

      if (req.method === 'POST' && url.pathname === '/connect') {
        const node = await ensureGatewayReady('connect request')
        const releaseOperation = beginOperation()
        try {
          const body = await readJson(req)
          const result = await openDirectPeerSession({
            apiBase,
            agentId,
            bundle,
            node,
            binding,
            targetAgentId: requireArg(body.targetAgentId, 'targetAgentId is required'),
            skillName: (body.skillHint ?? body.skillName ?? '').trim(),
            method: requireArg(body.method, 'method is required'),
            message: body.message,
            metadata: body.metadata ?? null,
            activitySummary: (body.activitySummary ?? '').trim() || `Preparing direct peer session${(body.skillHint ?? body.skillName ?? '').trim() ? ` for ${(body.skillHint ?? body.skillName ?? '').trim()}` : ''}.`,
            report: body.report ?? null,
            sessionStore: runtimeState
          })
          jsonResponse(res, 200, result)
          return
        } finally {
          releaseOperation()
        }
      }

      jsonResponse(res, 404, { error: { message: 'Not found' } })
    } catch (error) {
      jsonResponse(res, 500, { error: { message: error.message } })
    }
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(gatewayPort, gatewayHost, resolve)
  })
  const controlAddress = server.address()
  actualGatewayPort = typeof controlAddress === 'object' && controlAddress ? controlAddress.port : gatewayPort
  gatewayBase = `http://${gatewayHost}:${actualGatewayPort}`

  try {
    await recoverGateway('initial startup')
  } catch (error) {
    noteFailure(error)
    console.error(`gateway initial startup failed: ${error.message}`)
  }

  const integratedRouterLoop = integratedRouter
    ? runIntegratedRouterLoop().catch((error) => {
        console.error(`integrated agent router stopped: ${error.message}`)
      })
    : null

  const presenceTimer = presenceRefreshMs > 0
    ? setInterval(async () => {
        if (stopping || recoveryPromise) {
          return
        }
        if (!currentNode) {
          try {
            await recoverGateway('presence refresh found no active gateway node')
          } catch (error) {
            noteFailure(error)
            console.error(`gateway presence recovery failed: ${error.message}`)
          }
          return
        }
        try {
          await publishPresence(currentNode)
        } catch (error) {
          noteFailure(error)
          console.error(`gateway presence refresh failed: ${error.message}`)
          if (lifecycle.consecutiveFailures >= failuresBeforeRecover) {
            try {
              await recoverGateway(`presence refresh failed: ${error.message}`)
            } catch (recoveryError) {
              noteFailure(recoveryError)
              console.error(`gateway presence recovery failed: ${recoveryError.message}`)
            }
          }
        }
      }, presenceRefreshMs)
    : null

  const healthTimer = setInterval(async () => {
    await runHealthCheck('gateway transport watchdog')
  }, healthCheckMs)

  const stop = async () => {
    if (stopping) {
      return
    }
    stopping = true
    if (presenceTimer) {
      clearInterval(presenceTimer)
    }
    clearInterval(healthTimer)
    await sleep(10)
    if (recoveryPromise) {
      try {
        await recoveryPromise
      } catch {
        // best-effort shutdown only
      }
    }
    if (integratedRouter) {
      try {
        await integratedRouter.whenIdle()
      } catch {
        // best-effort shutdown only
      }
    }
    await new Promise((resolve) => server.close(resolve))
    await stopNode(currentNode)
    process.exit(0)
  }

  process.on('SIGINT', () => {
    stop().catch((error) => {
      console.error(error.message)
      process.exit(1)
    })
  })
  process.on('SIGTERM', () => {
    stop().catch((error) => {
      console.error(error.message)
      process.exit(1)
    })
  })
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runGateway(process.argv.slice(2)).catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
