#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const SKILLS_ROOT = path.resolve(path.dirname(__filename), '..')

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

function commandOnPath(command = '') {
  const normalized = clean(command)
  if (!normalized) {
    return ''
  }
  const segments = clean(process.env.PATH).split(path.delimiter).filter(Boolean)
  for (const segment of segments) {
    const candidate = path.join(segment, normalized)
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }
  return ''
}

function resolveA2CliCommand() {
  const localBin = path.join(SKILLS_ROOT, 'node_modules', '.bin', 'a2_cli')
  if (fs.existsSync(localBin)) {
    return localBin
  }
  const globalBin = commandOnPath('a2_cli')
  if (globalBin) {
    return globalBin
  }
  throw new Error('Unable to resolve a2_cli for skill validation')
}

function execA2Cli(argv = []) {
  return new Promise((resolve, reject) => {
    const command = resolveA2CliCommand()
    const child = spawn(command, argv, {
      cwd: SKILLS_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env
      }
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', reject)
    child.on('close', (code, signal) => {
      resolve({
        code: typeof code === 'number' ? code : 1,
        signal: clean(signal),
        stdout,
        stderr,
        command
      })
    })
  })
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
    'friends/friend-im/SKILL.md',
    'friends/agent-mutual-learning/SKILL.md',
    'assets/public-projections/PUBLIC_SOUL.md',
    'assets/public-projections/PUBLIC_MEMORY.md',
    'assets/public-projections/PUBLIC_RUNTIME.md'
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
    'demo',
    'scripts/cli_runtime.mjs',
    'scripts/run_a2_cli.mjs',
    'friend-skills'
  ]
  for (const relativePath of forbiddenPaths) {
    assert.ok(!hasPath(relativePath), `Legacy path should not exist anymore: ${relativePath}`)
  }

  assertOnlyNameAndDescription('SKILL.md')
  assertOnlyNameAndDescription('friends/friend-im/SKILL.md')
  assertOnlyNameAndDescription('friends/agent-mutual-learning/SKILL.md')
  assert.deepEqual(fs.readdirSync(path.join(SKILLS_ROOT, 'friends', 'friend-im')).sort(), ['SKILL.md'])
  assert.deepEqual(fs.readdirSync(path.join(SKILLS_ROOT, 'friends', 'agent-mutual-learning')).sort(), ['SKILL.md'])

  const rootSkill = readText('SKILL.md')
  assert.match(rootSkill, /Use `a2_cli` as the only operational command surface\./)
  assert.doesNotMatch(rootSkill, /node a2_cli\.mjs/)
  assert.doesNotMatch(rootSkill, /a2_cli\s+learning start/)
  assert.doesNotMatch(rootSkill, /a2_cli\s+relay /i)
  assert.doesNotMatch(rootSkill, /adapters\//)
  assert.match(rootSkill, /friends\//)

  const cliReference = readText('references/cli-usage.md')
  assert.match(cliReference, /a2_cli friend msg/)
  assert.match(cliReference, /friends\/friend-im\/SKILL\.md/)
  assert.match(cliReference, /friends\/agent-mutual-learning\/SKILL\.md/)
  assert.doesNotMatch(cliReference, /a2_cli\s+learning start/)
  assert.doesNotMatch(cliReference, /scripts\/run_a2_cli/)

  const openaiYaml = readText('agents/openai.yaml')
  assert.match(openaiYaml, /^interface:\n/m)
  assert.match(openaiYaml, /display_name: "AgentSquared"/)
  assert.match(openaiYaml, /short_description: "Operate AgentSquared through shared skills"/)
  assert.match(openaiYaml, /default_prompt: "Use \$agentsquared-official-skills/)

  const packageJson = JSON.parse(readText('package.json'))
  assert.equal(packageJson.dependencies['@agentsquared/cli'], 'git+https://github.com/AgentSquaredNet/agentsquared-cli.git#b046307')

  const command = resolveA2CliCommand()
  assert.ok(clean(command), 'a2_cli must resolve')

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
