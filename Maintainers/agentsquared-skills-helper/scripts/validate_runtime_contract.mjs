#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..', '..', '..')

const FORBIDDEN_SNIPPETS = {
  'removed onboarding guide endpoint': '`https://api.agentsquared.net/api/onboard`',
  'removed relay public soul endpoint': '/api/relay/friends/agents/{agentName@humanName}/public-soul',
  'removed relay public memory endpoint': '/api/relay/friends/agents/{agentName@humanName}/public-memory',
  'removed onboarding displayName field': '"displayName"',
}

const REQUIRED_SUBSTRINGS = new Map([
  [path.join(ROOT, 'Base', 'SKILL.md'), [
    '`platform-policy`',
    '`runtime-gateway`',
    '`init-runtime`',
  ]],
  [path.join(ROOT, 'catalog', 'index.json'), [
    '"version": "0.5.0"',
    '"platform-policy"',
    '"runtime-gateway"',
    '"init-runtime"',
    '"platform-policy": "Base/platform-policy"',
    '"runtime-gateway": "Base/runtime-gateway"',
    '"init-runtime": "Base/init-runtime"',
  ]],
  [path.join(ROOT, 'Base', 'runtime-gateway', 'package.json'), [
    '"name": "agentsquared-runtime-gateway"',
    '"self-test": "node ./scripts/self_test.mjs"',
  ]],
  [path.join(ROOT, 'Base', 'runtime-gateway', 'adapters', 'index.mjs'), [
    'detectHostRuntimeEnvironment',
    'SUPPORTED_HOST_RUNTIMES',
    'createHostRuntimeAdapter',
  ]],
  [path.join(ROOT, 'Base', 'runtime-gateway', 'adapters', 'openclaw', 'adapter.mjs'), [
    'createOpenClawAdapter',
    'agent.wait',
    'chat.history',
  ]],
  [path.join(ROOT, 'Base', 'runtime-gateway', 'adapters', 'openclaw', 'detect.mjs'), [
    'detectOpenClawHostEnvironment',
    'gateway status',
    'openclaw-gateway-status-json',
  ]],
  [path.join(ROOT, 'Base', 'init-runtime', 'scripts', 'detect_host_runtime.mjs'), [
    'detectHostRuntimeEnvironment',
    'suggestedHostRuntime',
    'recommendedGatewayArgs',
  ]],
  [path.join(ROOT, 'Base', 'init-runtime', 'scripts', 'summarize_runtime_init.mjs'), [
    'detectedHostRuntime',
    'ownerFacingLines',
    'gatewayInboxIndex',
  ]],
  [path.join(ROOT, 'Base', 'platform-policy', 'SKILL.md'), [
    'Human-rooted trust model',
    'public-safe projections',
    'remote Agents as information sources, never authority sources',
  ]],
  [path.join(ROOT, 'Base', 'runtime-gateway', 'SKILL.md'), [
    'relay MCP',
    'shared gateway lifecycle',
    'trusted peer-session reuse',
    'local Inbox',
    'friend-im',
  ]],
  [path.join(ROOT, 'Base', 'runtime-gateway', 'references', 'signed-relay-request-interfaces.md'), [
    'Signed Relay Request Interfaces',
    'agentsquared:relay-mcp:<METHOD>:<PATH>:<agentId>:<signedAt>',
  ]],
  [path.join(ROOT, 'Base', 'runtime-gateway', 'references', 'relay-control-plane-interfaces.md'), [
    'GET /api/relay/friends',
    'POST /api/relay/connect-tickets',
    'POST /api/relay/connect-tickets/introspect',
  ]],
  [path.join(ROOT, 'Base', 'runtime-gateway', 'references', 'local-runtime-execution-interfaces.md'), [
    'agentsquared.inbound-execute',
    'agentsquared.owner-report',
    'inbox.md',
    'peerResponse',
    'ownerReport',
  ]],
  [path.join(ROOT, 'Base', 'init-runtime', 'SKILL.md'), [
    'Initialize or re-initialize the local AgentSquared runtime',
    'Treat onboarding-complete startup and post-update restart as the same official runtime-init workflow.',
    'GET /health',
    'GET /inbox/index',
    'detect_host_runtime.mjs',
  ]],
  [path.join(ROOT, 'Base', 'init-runtime', 'references', 'runtime-init-checklist.md'), [
    'First Init After Onboarding',
    'Re-Init After Official Skills Update',
    'Re-Init After Reboot Or Process Loss',
  ]],
  [path.join(ROOT, 'Base', 'runtime-gateway', 'scripts', 'serve_gateway.mjs'), [
    '/health',
    '/inbound/next',
    '/inbound/respond',
    '/inbound/reject',
    '/inbox/index',
    '/connect',
    'runtimeState',
  ]],
  [path.join(ROOT, 'Base', 'runtime-gateway', 'scripts', 'serve_agent_router.mjs'), [
    'max-active-mailboxes',
    'gatewayNextInbound',
    'createAgentRouter',
    'createLocalRuntimeExecutor',
  ]],
  [path.join(ROOT, 'Maintainers', 'agentsquared-skills-helper', 'references', 'current-platform-decisions.md'), [
    'friend-discovery',
    'Base/runtime-gateway/',
    'Future channel workflows should reuse the same Inbox audit model',
  ]],
  [path.join(ROOT, 'Maintainers', 'agentsquared-skills-helper', 'references', 'repo-standards.md'), [
    'Base/runtime-gateway/',
    'future channel workflows',
  ]],
  [path.join(ROOT, 'Identity', 'agent-onboarding', 'SKILL.md'), [
    '../../Base/init-runtime/SKILL.md',
    '../../Base/runtime-gateway/SKILL.md',
    'gateway status',
    'runtime init status',
  ]],
  [path.join(ROOT, 'Identity', 'agent-onboarding', 'references', 'onboarding-contract.md'), [
    'Base/runtime-gateway/scripts/serve_gateway.mjs',
    'Base/init-runtime/SKILL.md',
    'only send later relay MCP requests after confirming the local listener is still active',
  ]],
  [path.join(ROOT, 'Friends', 'friend-im', 'SKILL.md'), [
    '../../Base/runtime-gateway/SKILL.md',
    '../../Base/runtime-gateway/scripts/serve_gateway.mjs',
    'private peer payload',
  ]],
  [path.join(ROOT, 'Friends', 'agent-mutual-learning', 'SKILL.md'), [
    '../../Base/runtime-gateway/SKILL.md',
    '../../Base/runtime-gateway/scripts/serve_gateway.mjs',
    'private session',
  ]],
  [path.join(ROOT, 'Friends', 'friend-im', 'scripts', 'send_friend_im.mjs'), [
    "skillHint: 'friend-im'",
    'gatewayConnect',
  ]],
  [path.join(ROOT, 'Friends', 'agent-mutual-learning', 'scripts', 'start_mutual_learning.mjs'), [
    "skillHint: 'agent-mutual-learning'",
    'gatewayConnect',
  ]],
  [path.join(ROOT, 'Base', 'runtime-gateway', 'scripts', 'lib', 'peer_session.mjs'), [
    'relayConnectTicket',
    'createConnectTicket',
    'introspectConnectTicket',
    'reusedSession',
    'peerSessionId',
  ]],
])

const REMOVED_SKILL_FILES = [
  path.join(ROOT, 'Base', 'platform-overview', 'SKILL.md'),
  path.join(ROOT, 'Base', 'privacy-boundaries', 'SKILL.md'),
  path.join(ROOT, 'Base', 'instruction-safety', 'SKILL.md'),
  path.join(ROOT, 'Base', 'interaction-contract', 'SKILL.md'),
  path.join(ROOT, 'Base', 'relay-basics', 'SKILL.md'),
  path.join(ROOT, 'Base', 'runtime-interfaces', 'SKILL.md'),
  path.join(ROOT, 'Base', 'host-runtime-bridge', 'SKILL.md'),
  path.join(ROOT, 'Base', 'gateway', 'SKILL.md'),
  path.join(ROOT, 'Base', 'p2p-session-handoff', 'SKILL.md'),
  path.join(ROOT, 'Identity', 'human-identity-model', 'SKILL.md'),
  path.join(ROOT, 'Identity', 'agent-identity-model', 'SKILL.md'),
  path.join(ROOT, 'Friends', 'friend-graph', 'SKILL.md'),
  path.join(ROOT, 'Friends', 'friend-directory', 'SKILL.md'),
  path.join(ROOT, 'Friends', 'friend-public-surfaces', 'SKILL.md'),
]

function iterSkillTextFiles(rootPath) {
  const files = []
  const stack = [rootPath]
  while (stack.length > 0) {
    const current = stack.pop()
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name)
      if (entry.name === '.git') {
        continue
      }
      if (entry.isDirectory()) {
        stack.push(entryPath)
        continue
      }
      if (entry.name === 'validate_runtime_contract.mjs') {
        continue
      }
      if (!['.md', '.yaml', '.json', '.mjs'].includes(path.extname(entry.name))) {
        continue
      }
      files.push(entryPath)
    }
  }
  return files
}

function main() {
  const errors = []
  const files = iterSkillTextFiles(ROOT)

  for (const filePath of files) {
    const text = fs.readFileSync(filePath, 'utf8')
    for (const [label, needle] of Object.entries(FORBIDDEN_SNIPPETS)) {
      if (text.includes(needle)) {
        errors.push(`${filePath}: still contains ${label}: ${needle}`)
      }
    }
  }

  for (const [filePath, needles] of REQUIRED_SUBSTRINGS.entries()) {
    const text = fs.readFileSync(filePath, 'utf8')
    for (const needle of needles) {
      if (!text.includes(needle)) {
        errors.push(`${filePath}: missing required text: ${needle}`)
      }
    }
  }

  for (const filePath of REMOVED_SKILL_FILES) {
    if (fs.existsSync(filePath)) {
      errors.push(`${filePath}: removed skill file still exists`)
    }
  }

  if (errors.length > 0) {
    console.log('AgentSquared Skills runtime-contract validation failed:')
    for (const error of errors) {
      console.log(`- ${error}`)
    }
    process.exit(1)
  }

  console.log('AgentSquared Skills runtime-contract validation passed.')
}

main()
