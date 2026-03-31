#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..', '..', '..')

const REQUIRED_SUBSTRINGS = new Map([
  [path.join(ROOT, 'SKILL.md'), [
    'one official skill',
    '`a2_cli`',
    'friend_skills/',
    '`a2_cli friend msg`',
    '`a2_cli learning start`',
  ]],
  [path.join(ROOT, 'package.json'), [
    '"name": "agentsquared-official-skills"',
    '"version": "1.0.0"',
    '"a2_cli": "./scripts/a2_cli.mjs"',
  ]],
  [path.join(ROOT, 'scripts', 'a2_cli.mjs'), [
    'runA2Cli',
  ]],
  [path.join(ROOT, 'scripts', 'lib', 'a2_cli_core.mjs'), [
    'friend msg',
    'message send',
    'learning start',
    'skill-file',
    'loadSharedSkillFile',
  ]],
  [path.join(ROOT, 'references', 'a2_cli.md'), [
    '`a2_cli`',
    'single official deterministic command surface',
    'a2_cli friend msg',
    '--skill-file friend_skills/<skill-name>/skill.md',
  ]],
  [path.join(ROOT, 'references', 'friend_skill_library.md'), [
    '`friend_skills/`',
    'lowercase `skill.md`',
    '`a2_cli friend msg`',
  ]],
  [path.join(ROOT, 'catalog', 'index.json'), [
    '"version": "1.0.0"',
    '"agentsquared-official-skills": "SKILL.md"',
  ]],
  [path.join(ROOT, 'runtime', 'guide.md'), [
    'relay MCP',
    'shared gateway lifecycle',
    'trusted peer-session reuse',
  ]],
  [path.join(ROOT, 'init', 'guide.md'), [
    'Initialize or re-initialize the local AgentSquared runtime',
    'GET /health',
    'GET /inbox/index',
  ]],
  [path.join(ROOT, 'policy', 'guide.md'), [
    'Human-rooted trust model',
    'public-safe projections',
    'relay for coordination only',
  ]],
  [path.join(ROOT, 'onboarding', 'guide.md'), [
    'registration',
    'runtime init',
  ]],
  [path.join(ROOT, 'friend_skills', 'friend-im', 'skill.md'), [
    'friend-im',
    'private peer payload',
  ]],
  [path.join(ROOT, 'friend_skills', 'agent-mutual-learning', 'skill.md'), [
    'mutual-learning',
    'private session',
  ]],
  [path.join(ROOT, 'friend_skills', 'friend-im', 'skill.md'), [
    'name: friend-im',
  ]],
  [path.join(ROOT, 'friend_skills', 'agent-mutual-learning', 'skill.md'), [
    'name: agent-mutual-learning',
  ]],
  [path.join(ROOT, 'runtime', 'scripts', 'serve_gateway.mjs'), [
    '/health',
    '/inbox/index',
    '/connect',
    'runtimeState',
  ]],
  [path.join(ROOT, 'runtime', 'adapters', 'openclaw', 'adapter.mjs'), [
    'agent.wait',
    'chat.history',
    'sharedSkillDocument',
  ]],
])

const FORBIDDEN_SKILL_PATHS = [
  path.join(ROOT, 'Base', 'SKILL.md'),
  path.join(ROOT, 'Friends', 'SKILL.md'),
  path.join(ROOT, 'Identity', 'SKILL.md'),
  path.join(ROOT, 'Maintainers', 'agentsquared-skills-helper', 'SKILL.md'),
]

const FORBIDDEN_DIRECTORIES = [
  path.join(ROOT, 'Base'),
  path.join(ROOT, 'Friends'),
  path.join(ROOT, 'Identity'),
]

function main() {
  const errors = []

  for (const [filePath, snippets] of REQUIRED_SUBSTRINGS.entries()) {
    if (!fs.existsSync(filePath)) {
      errors.push(`${filePath}: missing required file`)
      continue
    }
    const text = fs.readFileSync(filePath, 'utf8')
    for (const snippet of snippets) {
      if (!text.includes(snippet)) {
        errors.push(`${filePath}: missing required text: ${snippet}`)
      }
    }
  }

  for (const filePath of FORBIDDEN_SKILL_PATHS) {
    if (fs.existsSync(filePath)) {
      errors.push(`${filePath}: unexpected nested SKILL.md; the repository should expose only the root SKILL.md`)
    }
  }

  for (const dirPath of FORBIDDEN_DIRECTORIES) {
    if (fs.existsSync(dirPath)) {
      errors.push(`${dirPath}: unexpected legacy top-level directory; migrate content into the flat root-level structure`)
    }
  }

  const rootSkills = []
  for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (entry.isFile() && entry.name === 'SKILL.md') {
      rootSkills.push(path.join(ROOT, entry.name))
    }
  }
  if (rootSkills.length !== 1) {
    errors.push(`expected exactly one root SKILL.md, found ${rootSkills.length}`)
  }

  if (errors.length > 0) {
    console.error('AgentSquared Skills runtime-contract validation failed:')
    for (const error of errors) {
      console.error(`- ${error}`)
    }
    process.exit(1)
  }

  console.log('AgentSquared Skills runtime-contract validation passed.')
}

main()
