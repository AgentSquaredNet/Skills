#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { execA2Cli, resolveA2CliInvocation, SKILLS_ROOT } from './cli_runtime.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function clean(value) {
  return `${value ?? ''}`.trim()
}

function readText(relativePath) {
  return fs.readFileSync(path.join(SKILLS_ROOT, relativePath), 'utf8')
}

function hasPath(relativePath) {
  return fs.existsSync(path.join(SKILLS_ROOT, relativePath))
}

function parseFrontmatter(relativePath) {
  const content = readText(relativePath)
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  assert.ok(match, `${relativePath} must include YAML frontmatter`)
  const body = match[1]
  const keys = body
    .split('\n')
    .map((line) => line.match(/^([A-Za-z0-9_-]+):/))
    .filter(Boolean)
    .map((matchPart) => matchPart[1])
  return {
    content,
    body,
    keys
  }
}

function assertOnlyNameAndDescription(relativePath) {
  const frontmatter = parseFrontmatter(relativePath)
  assert.deepEqual(frontmatter.keys, ['name', 'description'], `${relativePath} frontmatter must contain only name and description`)
  return frontmatter
}

async function main() {
  const requiredPaths = [
    'SKILL.md',
    'package.json',
    'package-lock.json',
    'agents/openai.yaml',
    'references/bootstrap.md',
    'references/cli-usage.md',
    'references/public-projections.md',
    'friend-skills/friend-im/SKILL.md',
    'friend-skills/agent-mutual-learning/SKILL.md',
    'assets/public-projections/PUBLIC_SOUL.md',
    'assets/public-projections/PUBLIC_MEMORY.md',
    'assets/public-projections/PUBLIC_RUNTIME.md',
    'scripts/cli_runtime.mjs',
    'scripts/run_a2_cli.mjs'
  ]
  for (const relativePath of requiredPaths) {
    assert.ok(hasPath(relativePath), `Missing required path: ${relativePath}`)
  }

  const forbiddenPaths = [
    'a2_cli.mjs',
    'bootstrap.md',
    'README.md',
    'self_test.mjs',
    'lib',
    'adapters',
    'demo'
  ]
  for (const relativePath of forbiddenPaths) {
    assert.ok(!hasPath(relativePath), `Legacy path should not exist anymore: ${relativePath}`)
  }

  assertOnlyNameAndDescription('SKILL.md')
  assertOnlyNameAndDescription('friend-skills/friend-im/SKILL.md')
  assertOnlyNameAndDescription('friend-skills/agent-mutual-learning/SKILL.md')
  assert.deepEqual(fs.readdirSync(path.join(SKILLS_ROOT, 'friend-skills', 'friend-im')).sort(), ['SKILL.md'])
  assert.deepEqual(fs.readdirSync(path.join(SKILLS_ROOT, 'friend-skills', 'agent-mutual-learning')).sort(), ['SKILL.md'])

  const rootSkill = readText('SKILL.md')
  assert.match(rootSkill, /Use `a2_cli` as the only operational command surface\./)
  assert.doesNotMatch(rootSkill, /node a2_cli\.mjs/)
  assert.doesNotMatch(rootSkill, /a2_cli\s+learning start/)
  assert.doesNotMatch(rootSkill, /a2_cli\s+relay /i)
  assert.doesNotMatch(rootSkill, /adapters\//)

  const cliReference = readText('references/cli-usage.md')
  assert.match(cliReference, /a2_cli friend msg/)
  assert.match(cliReference, /friend-skills\/friend-im\/SKILL\.md/)
  assert.match(cliReference, /friend-skills\/agent-mutual-learning\/SKILL\.md/)
  assert.doesNotMatch(cliReference, /a2_cli\s+learning start/)

  const openaiYaml = readText('agents/openai.yaml')
  assert.match(openaiYaml, /^interface:\n/m)
  assert.match(openaiYaml, /display_name: "AgentSquared"/)
  assert.match(openaiYaml, /short_description: "Operate AgentSquared through shared skills"/)
  assert.match(openaiYaml, /default_prompt: "Use \$agentsquared-official-skills/)

  const packageJson = JSON.parse(readText('package.json'))
  assert.equal(packageJson.dependencies['@agentsquared/cli'], 'git+https://github.com/AgentSquaredNet/agentsquared-cli.git#b046307')

  const invocation = resolveA2CliInvocation()
  assert.ok(clean(invocation.command), 'a2_cli invocation must resolve')

  const helpResult = await execA2Cli(['help'])
  assert.equal(helpResult.code, 0, helpResult.stderr || 'a2_cli help failed')
  assert.match(helpResult.stdout, /AgentSquared CLI/)
  assert.match(helpResult.stdout, /a2_cli host detect/)
  assert.match(helpResult.stdout, /a2_cli friend list/)
  assert.match(helpResult.stdout, /a2_cli inbox show/)

  console.log('AgentSquared skill self-test passed')
}

main().catch((error) => {
  console.error(clean(error?.stack) || clean(error?.message) || 'AgentSquared skill self-test failed')
  process.exit(1)
})
