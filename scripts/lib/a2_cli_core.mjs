import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { parseArgs, requireArg } from '../../Base/runtime-gateway/scripts/lib/cli.mjs'
import { gatewayConnect, gatewayHealth, gatewayInboxIndex } from '../../Base/runtime-gateway/scripts/lib/gateway_control.mjs'
import { resolveGatewayBase } from '../../Base/runtime-gateway/scripts/lib/gateway_runtime.mjs'
import { getAgentCard, getBindingDocument, getFriendDirectory, createConnectTicket, introspectConnectTicket, reportSession } from '../../Base/runtime-gateway/scripts/lib/relay_http.mjs'
import { loadRuntimeKeyBundle } from '../../Base/runtime-gateway/scripts/lib/runtime_key.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const SKILLS_ROOT = path.resolve(__dirname, '..', '..')

function printJson(payload) {
  console.log(JSON.stringify(payload, null, 2))
}

function clean(value) {
  return `${value ?? ''}`.trim()
}

function rootScript(relativePath) {
  return path.join(SKILLS_ROOT, relativePath)
}

function forwardOption(args, key, out) {
  const value = clean(args[key])
  if (value) {
    out.push(`--${key}`, value)
  }
}

async function runNodeScript(relativePath, argv = [], { inherit = false } = {}) {
  const scriptPath = rootScript(relativePath)
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...argv], {
      stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(clean(stderr) || `${relativePath} exited with status ${code}`))
        return
      }
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim()
      })
    })
  })
}

async function delegatedJson(relativePath, argv = []) {
  const result = await runNodeScript(relativePath, argv)
  const text = clean(result.stdout)
  if (!text) {
    return {}
  }
  return JSON.parse(text)
}

function resolveGatewayBaseIfAvailable(args) {
  try {
    return resolveGatewayBase({
      gatewayBase: args['gateway-base'],
      keyFile: args['key-file'],
      agentId: args['agent-id'],
      gatewayStateFile: args['gateway-state-file']
    })
  } catch {
    return ''
  }
}

async function resolveGatewayTransport(args) {
  const gatewayBase = resolveGatewayBaseIfAvailable(args)
  if (!gatewayBase) {
    return { gatewayBase: '', transport: null, health: null }
  }
  try {
    const health = await gatewayHealth(gatewayBase)
    if (health?.peerId && health?.streamProtocol) {
      return {
        gatewayBase,
        health,
        transport: {
          peerId: health.peerId,
          listenAddrs: health.listenAddrs ?? [],
          relayAddrs: health.relayAddrs ?? [],
          supportedBindings: health.supportedBindings ?? [],
          streamProtocol: health.streamProtocol,
          a2aProtocolVersion: health.a2aProtocolVersion ?? ''
        }
      }
    }
    return { gatewayBase, health, transport: null }
  } catch {
    return { gatewayBase, health: null, transport: null }
  }
}

async function signedRelayContext(args) {
  const apiBase = clean(args['api-base']) || 'https://api.agentsquared.net'
  const agentId = requireArg(args['agent-id'], '--agent-id is required')
  const keyFile = requireArg(args['key-file'], '--key-file is required')
  const bundle = loadRuntimeKeyBundle(keyFile)
  const { gatewayBase, health, transport } = await resolveGatewayTransport(args)
  return {
    apiBase,
    agentId,
    keyFile,
    bundle,
    gatewayBase,
    gatewayHealth: health,
    transport
  }
}

function helpText() {
  return [
    'AgentSquared unified CLI',
    '',
    'Primary commands:',
    '  a2_cli gateway serve [gateway args]',
    '  a2_cli gateway health --agent-id <id> --key-file <file>',
    '  a2_cli init detect [--host-runtime <name>]',
    '  a2_cli init summary --agent-id <id> --key-file <file>',
    '  a2_cli friends list --agent-id <id> --key-file <file>',
    '  a2_cli friend get --agent-id <id> --key-file <file>',
    '  a2_cli relay agent-card get --target-agent <id> --agent-id <id> --key-file <file>',
    '  a2_cli relay bindings get [--api-base <url>]',
    '  a2_cli relay ticket create --target-agent <id> --agent-id <id> --key-file <file> [--skill-name <skill>]',
    '  a2_cli relay ticket introspect --ticket <jwt> --agent-id <id> --key-file <file>',
    '  a2_cli relay session-report --ticket <jwt> --task-id <id> --status <status> --summary <text> --agent-id <id> --key-file <file>',
    '  a2_cli peer open --target-agent <id> --agent-id <id> --key-file <file> [--skill-hint <skill>] [--text <text>]',
    '  a2_cli message send --target-agent <id> --text <text> --agent-id <id> --key-file <file>',
    '  a2_cli learning start --target-agent <id> --goal <text> --agent-id <id> --key-file <file> [--topics <text>]',
    '  a2_cli inbox show --agent-id <id> --key-file <file>',
  ].join('\n')
}

async function commandGatewayServe(rawArgs) {
  await runNodeScript('Base/runtime-gateway/scripts/serve_gateway.mjs', rawArgs, { inherit: true })
}

async function commandGatewayHealth(args) {
  const gatewayBase = resolveGatewayBase({
    gatewayBase: args['gateway-base'],
    keyFile: args['key-file'],
    agentId: args['agent-id'],
    gatewayStateFile: args['gateway-state-file']
  })
  const result = await gatewayHealth(gatewayBase)
  printJson(result)
}

async function commandInitDetect(rawArgs) {
  printJson(await delegatedJson('Base/init-runtime/scripts/detect_host_runtime.mjs', rawArgs))
}

async function commandInitSummary(rawArgs) {
  printJson(await delegatedJson('Base/init-runtime/scripts/summarize_runtime_init.mjs', rawArgs))
}

async function commandFriendsList(args) {
  const ctx = await signedRelayContext(args)
  const directory = await getFriendDirectory(ctx.apiBase, ctx.agentId, ctx.bundle, ctx.transport)
  printJson({
    source: 'relay-friend-directory',
    apiBase: ctx.apiBase,
    agentId: ctx.agentId,
    gatewayBase: ctx.gatewayBase,
    usedGatewayTransport: Boolean(ctx.transport),
    directory
  })
}

async function commandAgentCardGet(args) {
  const ctx = await signedRelayContext(args)
  const targetAgentId = requireArg(args['target-agent'], '--target-agent is required')
  const agentCard = await getAgentCard(ctx.apiBase, ctx.agentId, ctx.bundle, targetAgentId, ctx.transport)
  printJson({
    source: 'relay-agent-card',
    apiBase: ctx.apiBase,
    agentId: ctx.agentId,
    targetAgentId,
    gatewayBase: ctx.gatewayBase,
    usedGatewayTransport: Boolean(ctx.transport),
    agentCard
  })
}

async function commandBindingsGet(args) {
  const apiBase = clean(args['api-base']) || 'https://api.agentsquared.net'
  const binding = await getBindingDocument(apiBase)
  printJson({
    source: 'relay-binding-document',
    apiBase,
    binding
  })
}

async function commandTicketCreate(args) {
  const ctx = await signedRelayContext(args)
  const targetAgentId = requireArg(args['target-agent'], '--target-agent is required')
  const skillName = clean(args['skill-name'] || args['skill-hint'])
  const ticket = await createConnectTicket(ctx.apiBase, ctx.agentId, ctx.bundle, targetAgentId, skillName, ctx.transport)
  printJson({
    source: 'relay-connect-ticket',
    apiBase: ctx.apiBase,
    agentId: ctx.agentId,
    targetAgentId,
    skillName,
    gatewayBase: ctx.gatewayBase,
    usedGatewayTransport: Boolean(ctx.transport),
    ticket
  })
}

async function commandTicketIntrospect(args) {
  const ctx = await signedRelayContext(args)
  const ticket = requireArg(args.ticket, '--ticket is required')
  const result = await introspectConnectTicket(ctx.apiBase, ctx.agentId, ctx.bundle, ticket, ctx.transport)
  printJson({
    source: 'relay-connect-ticket-introspection',
    apiBase: ctx.apiBase,
    agentId: ctx.agentId,
    gatewayBase: ctx.gatewayBase,
    usedGatewayTransport: Boolean(ctx.transport),
    result
  })
}

async function commandSessionReport(args) {
  const ctx = await signedRelayContext(args)
  const payload = {
    ticket: requireArg(args.ticket, '--ticket is required'),
    taskId: requireArg(args['task-id'], '--task-id is required'),
    status: requireArg(args.status, '--status is required'),
    summary: requireArg(args.summary, '--summary is required'),
    publicSummary: clean(args['public-summary'])
  }
  const result = await reportSession(ctx.apiBase, ctx.agentId, ctx.bundle, payload, ctx.transport)
  printJson({
    source: 'relay-session-report',
    apiBase: ctx.apiBase,
    agentId: ctx.agentId,
    gatewayBase: ctx.gatewayBase,
    usedGatewayTransport: Boolean(ctx.transport),
    result
  })
}

async function commandPeerOpen(args) {
  const gatewayBase = resolveGatewayBase({
    gatewayBase: args['gateway-base'],
    keyFile: args['key-file'],
    agentId: args['agent-id'],
    gatewayStateFile: args['gateway-state-file']
  })
  const payload = {
    targetAgentId: requireArg(args['target-agent'], '--target-agent is required'),
    skillHint: clean(args['skill-hint'] || args['skill-name']),
    method: clean(args.method) || 'message/send',
    activitySummary: clean(args['activity-summary']) || 'Preparing a direct AgentSquared peer session.',
    report: clean(args['report-summary'])
      ? {
          taskId: clean(args['task-id']) || `${clean(args['skill-hint'] || args['skill-name']) || 'peer-session'}-session`,
          summary: clean(args['report-summary']),
          publicSummary: clean(args['public-summary'])
        }
      : null
  }
  const text = clean(args.text)
  payload.message = text
    ? {
        kind: 'message',
        role: 'user',
        parts: [{ kind: 'text', text }]
      }
    : JSON.parse(requireArg(args.message, '--text or --message is required'))
  const result = await gatewayConnect(gatewayBase, payload)
  printJson(result)
}

async function commandMessageSend(args) {
  const gatewayBase = resolveGatewayBase({
    gatewayBase: args['gateway-base'],
    keyFile: args['key-file'],
    agentId: args['agent-id'],
    gatewayStateFile: args['gateway-state-file']
  })
  const targetAgentId = requireArg(args['target-agent'], '--target-agent is required')
  const text = requireArg(args.text, '--text is required')
  const result = await gatewayConnect(gatewayBase, {
    targetAgentId,
    skillHint: 'friend-im',
    method: 'message/send',
    message: {
      kind: 'message',
      role: 'user',
      parts: [{ kind: 'text', text }]
    },
    activitySummary: 'Preparing a short friend IM.',
    report: {
      taskId: 'friend-im',
      summary: `Delivered a short friend IM to ${targetAgentId}.`,
      publicSummary: ''
    }
  })
  printJson({
    targetAgentId,
    ticketExpiresAt: result.ticket?.expiresAt ?? '',
    peerSessionId: result.peerSessionId ?? '',
    reusedSession: Boolean(result.reusedSession),
    response: result.response
  })
}

async function commandLearningStart(args) {
  const gatewayBase = resolveGatewayBase({
    gatewayBase: args['gateway-base'],
    keyFile: args['key-file'],
    agentId: args['agent-id'],
    gatewayStateFile: args['gateway-state-file']
  })
  const targetAgentId = requireArg(args['target-agent'], '--target-agent is required')
  const goal = requireArg(args.goal, '--goal is required')
  const topics = clean(args.topics)
  const text = topics ? `${goal}\nTopics: ${topics}` : goal
  const result = await gatewayConnect(gatewayBase, {
    targetAgentId,
    skillHint: 'agent-mutual-learning',
    method: 'message/send',
    message: {
      kind: 'message',
      role: 'user',
      parts: [{ kind: 'text', text }]
    },
    activitySummary: 'Starting a mutual-learning session with a friend agent.',
    report: {
      taskId: 'agent-mutual-learning',
      summary: `Completed a mutual-learning session with ${targetAgentId}.`,
      publicSummary: ''
    }
  })
  printJson({
    targetAgentId,
    ticketExpiresAt: result.ticket?.expiresAt ?? '',
    peerSessionId: result.peerSessionId ?? '',
    reusedSession: Boolean(result.reusedSession),
    response: result.response
  })
}

async function commandInboxShow(args) {
  const gatewayBase = resolveGatewayBase({
    gatewayBase: args['gateway-base'],
    keyFile: args['key-file'],
    agentId: args['agent-id'],
    gatewayStateFile: args['gateway-state-file']
  })
  const result = await gatewayInboxIndex(gatewayBase)
  printJson(result)
}

export async function runA2Cli(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(helpText())
    return
  }
  const [group = 'help', action = '', subaction = '', ...rest] = argv

  if (group === 'help' || group === '--help' || group === '-h') {
    console.log(helpText())
    return
  }

  if (group === 'gateway' && action === 'serve') {
    await commandGatewayServe(rest)
    return
  }

  if (group === 'init' && action === 'detect') {
    await commandInitDetect(rest)
    return
  }

  if (group === 'init' && action === 'summary') {
    await commandInitSummary(rest)
    return
  }

  const args = parseArgs(rest)

  if (group === 'gateway' && action === 'health') {
    await commandGatewayHealth(args)
    return
  }
  if ((group === 'friends' && (action === 'list' || action === 'get')) || (group === 'friend' && (action === 'get' || action === 'list'))) {
    await commandFriendsList(args)
    return
  }
  if (group === 'relay' && action === 'friends' && subaction === 'get') {
    await commandFriendsList(args)
    return
  }
  if (group === 'relay' && action === 'agent-card' && subaction === 'get') {
    await commandAgentCardGet(args)
    return
  }
  if (group === 'relay' && action === 'bindings' && subaction === 'get') {
    await commandBindingsGet(args)
    return
  }
  if (group === 'relay' && action === 'ticket' && subaction === 'create') {
    await commandTicketCreate(args)
    return
  }
  if (group === 'relay' && action === 'ticket' && subaction === 'introspect') {
    await commandTicketIntrospect(args)
    return
  }
  if (group === 'relay' && action === 'session-report') {
    await commandSessionReport(args)
    return
  }
  if (group === 'peer' && action === 'open') {
    await commandPeerOpen(args)
    return
  }
  if (group === 'message' && action === 'send') {
    await commandMessageSend(args)
    return
  }
  if (group === 'learning' && action === 'start') {
    await commandLearningStart(args)
    return
  }
  if (group === 'inbox' && (action === 'show' || action === 'index')) {
    await commandInboxShow(args)
    return
  }

  throw new Error(`Unknown a2_cli command: ${[group, action, subaction].filter(Boolean).join(' ')}. Run "a2_cli help".`)
}
