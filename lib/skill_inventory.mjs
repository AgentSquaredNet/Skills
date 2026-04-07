import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function clean(value) {
  return `${value ?? ''}`.trim()
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const SKILLS_ROOT = path.resolve(__dirname, '..')

function resolveHomePath(value) {
  const raw = clean(value)
  if (!raw) {
    return ''
  }
  if (raw.startsWith('~/')) {
    return path.join(process.env.HOME || '', raw.slice(2))
  }
  return raw
}

function parseSkillMetadata(filePath) {
  const text = fs.readFileSync(filePath, 'utf8')
  const match = text.match(/^---\n([\s\S]*?)\n---/m)
  const frontmatter = clean(match?.[1])
  const name = clean(frontmatter.match(/^name:\s*(.+)$/m)?.[1]) || path.basename(path.dirname(filePath))
  const description = clean(frontmatter.match(/^description:\s*(.+)$/m)?.[1])
  return {
    name,
    description
  }
}

function pushSkill(results, filePath, source) {
  try {
    const stats = fs.statSync(filePath)
    const metadata = parseSkillMetadata(filePath)
    if (!clean(metadata.name)) {
      return
    }
    results.push({
      name: metadata.name,
      description: metadata.description,
      path: filePath,
      source,
      modifiedAtMs: stats.mtimeMs || 0
    })
  } catch {
    // Ignore malformed or unreadable skill files.
  }
}

function scanSkillDirectories(rootPath, source, results) {
  if (!rootPath || !fs.existsSync(rootPath)) {
    return
  }
  for (const entry of fs.readdirSync(rootPath, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue
    }
    const directory = path.join(rootPath, entry.name)
    const candidates = [
      path.join(directory, 'SKILL.md'),
      path.join(directory, 'skill.md')
    ]
    const filePath = candidates.find((candidate) => fs.existsSync(candidate))
    if (filePath) {
      pushSkill(results, filePath, source)
    }
  }
}

export function discoverLocalSkillInventory() {
  const results = []
  scanSkillDirectories(path.join(SKILLS_ROOT, 'friend-skills'), 'agentsquared-friend-skill', results)
  scanSkillDirectories(resolveHomePath('~/.openclaw/extensions'), 'openclaw-extension', results)
  scanSkillDirectories('/opt/homebrew/lib/node_modules/openclaw/skills', 'openclaw-builtin', results)
  scanSkillDirectories('/usr/local/lib/node_modules/openclaw/skills', 'openclaw-builtin', results)
  scanSkillDirectories('/usr/lib/node_modules/openclaw/skills', 'openclaw-builtin', results)

  const deduped = new Map()
  for (const item of results) {
    const key = `${clean(item.name).toLowerCase()}::${clean(item.path)}`
    if (!deduped.has(key)) {
      deduped.set(key, item)
    }
  }
  return Array.from(deduped.values()).sort((left, right) => right.modifiedAtMs - left.modifiedAtMs)
}

export function summarizeLocalSkillInventory({
  inventory = [],
  recentLimit = 8,
  totalLimit = 20
} = {}) {
  const items = Array.isArray(inventory) ? inventory : []
  if (items.length === 0) {
    return 'No verified local installed skills were discovered from the local filesystem scan.'
  }
  const recentItems = items.slice(0, recentLimit)
  const visibleItems = items.slice(0, totalLimit)
  return [
    `Verified local skill inventory from filesystem scan (${items.length} total discovered):`,
    `Most recent visible skills: ${recentItems.map((item) => item.name).join(', ') || '(none)'}`,
    ...visibleItems.map((item) => {
      const details = [
        item.name,
        item.source ? `[${item.source}]` : '',
        item.description ? `- ${item.description}` : '',
        item.path ? `(${item.path})` : ''
      ].filter(Boolean).join(' ')
      return `- ${details}`
    })
  ].join('\n')
}
