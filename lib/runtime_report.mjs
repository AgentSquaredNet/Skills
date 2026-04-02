import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { currentRuntimeRevision } from './gateway_runtime.mjs'
import { loadRuntimeKeyBundle, publicKeyFingerprint } from './runtime_key.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const SKILLS_ROOT = path.resolve(__dirname, '..')
const PACKAGE_JSON_PATH = path.join(SKILLS_ROOT, 'package.json')

function clean(value) {
  return `${value ?? ''}`.trim()
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function runGit(args = []) {
  const result = spawnSync('git', args, {
    cwd: SKILLS_ROOT,
    encoding: 'utf8'
  })
  if (result.status !== 0) {
    return { ok: false, stdout: clean(result.stdout), stderr: clean(result.stderr) }
  }
  return { ok: true, stdout: clean(result.stdout), stderr: clean(result.stderr) }
}

function parseGatewayPort(gatewayBase = '') {
  try {
    return new URL(gatewayBase).port || ''
  } catch {
    return ''
  }
}

function parseHumanName(agentId = '') {
  const cleaned = clean(agentId)
  const at = cleaned.lastIndexOf('@')
  return at >= 0 ? cleaned.slice(at + 1) : ''
}

export function resolveReportLanguage(preferred = '') {
  const explicit = clean(preferred).toLowerCase()
  if (explicit === 'zh' || explicit === 'zh-cn' || explicit === 'zh-hans') {
    return 'zh-CN'
  }
  if (explicit === 'en' || explicit === 'en-us' || explicit === 'en-gb') {
    return 'en'
  }
  const envLocale = [
    process.env.LC_ALL,
    process.env.LC_MESSAGES,
    process.env.LANG
  ]
    .map((value) => clean(value).toLowerCase())
    .find((value) => value && value !== 'c' && value !== 'posix') || ''
  if (envLocale.startsWith('zh')) {
    return 'zh-CN'
  }
  return 'en'
}

function latestStatusLabel(status = '', language = 'en') {
  const isZh = resolveReportLanguage(language) === 'zh-CN'
  switch (clean(status)) {
    case 'up-to-date':
      return isZh ? '已是最新' : 'up to date'
    case 'ahead':
      return isZh ? '本地领先远端' : 'ahead of upstream'
    case 'behind':
      return isZh ? '本地落后远端' : 'behind upstream'
    case 'diverged':
      return isZh ? '本地与远端已分叉' : 'diverged from upstream'
    default:
      return isZh ? '未知' : 'unknown'
  }
}

function latestStatus() {
  const upstream = runGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'])
  if (!upstream.ok || !clean(upstream.stdout)) {
    return {
      status: 'unknown',
      detail: 'No upstream tracking branch was available from local git metadata.'
    }
  }
  const counts = runGit(['rev-list', '--left-right', '--count', `HEAD...${clean(upstream.stdout)}`])
  if (!counts.ok) {
    return {
      status: 'unknown',
      detail: 'Upstream comparison was unavailable from local git metadata.'
    }
  }
  const [aheadRaw, behindRaw] = clean(counts.stdout).split(/\s+/)
  const ahead = Number.parseInt(aheadRaw ?? '0', 10) || 0
  const behind = Number.parseInt(behindRaw ?? '0', 10) || 0
  if (ahead === 0 && behind === 0) {
    return { status: 'up-to-date', detail: `Local HEAD matches ${clean(upstream.stdout)}.` }
  }
  if (ahead > 0 && behind === 0) {
    return { status: 'ahead', detail: `Local HEAD is ahead of ${clean(upstream.stdout)} by ${ahead} commit(s).` }
  }
  if (ahead === 0 && behind > 0) {
    return { status: 'behind', detail: `Local HEAD is behind ${clean(upstream.stdout)} by ${behind} commit(s).` }
  }
  return { status: 'diverged', detail: `Local HEAD has diverged from ${clean(upstream.stdout)}.` }
}

export function currentSkillsMetadata() {
  const pkg = readJson(PACKAGE_JSON_PATH) ?? {}
  const repo = runGit(['remote', 'get-url', 'origin'])
  const commit = runGit(['rev-parse', '--short=12', 'HEAD'])
  return {
    packageName: clean(pkg.name) || 'agentsquared-official-skills',
    packageVersion: clean(pkg.version) || 'unknown',
    gitCommit: commit.ok ? clean(commit.stdout) : 'unknown',
    repoUrl: repo.ok ? clean(repo.stdout) : 'https://github.com/AgentSquaredNet/Skills.git',
    runtimeRevision: currentRuntimeRevision(),
    latest: latestStatus()
  }
}

function receiptFilePath(keyFile, agentId) {
  const safeAgentId = clean(agentId).replace(/[^a-zA-Z0-9_.-]+/g, '_')
  return path.join(path.dirname(path.resolve(keyFile)), `${safeAgentId}_receipt.json`)
}

export function loadReceiptForAgent({ keyFile = '', agentId = '' } = {}) {
  const filePath = receiptFilePath(keyFile, agentId)
  const receipt = readJson(filePath)
  return {
    filePath,
    receipt
  }
}

function summarizeUpdateCommits(previousGitCommit = '', currentGitCommit = '') {
  const from = clean(previousGitCommit)
  const to = clean(currentGitCommit)
  if (!from || !to || from === to) {
    return []
  }
  const log = runGit(['log', '--oneline', '--no-merges', `${from}..${to}`])
  if (!log.ok || !clean(log.stdout)) {
    return []
  }
  return clean(log.stdout)
    .split('\n')
    .map((line) => clean(line.replace(/^[0-9a-f]+\s+/, '')))
    .filter(Boolean)
    .slice(0, 6)
}

export function buildSkillsUpdateSection({
  previousState = null,
  currentSkills = currentSkillsMetadata()
} = {}) {
  const previous = {
    packageVersion: clean(previousState?.skillsPackageVersion) || 'unknown',
    gitCommit: clean(previousState?.skillsGitCommit) || 'unknown',
    runtimeRevision: clean(previousState?.runtimeRevision) || 'unknown'
  }
  const current = {
    packageVersion: clean(currentSkills.packageVersion) || 'unknown',
    gitCommit: clean(currentSkills.gitCommit) || 'unknown',
    runtimeRevision: clean(currentSkills.runtimeRevision) || 'unknown'
  }
  const changed = previous.gitCommit !== 'unknown' && current.gitCommit !== 'unknown'
    ? previous.gitCommit !== current.gitCommit
    : previous.runtimeRevision !== 'unknown' && current.runtimeRevision !== 'unknown' && previous.runtimeRevision !== current.runtimeRevision
  const initialInstall = previous.gitCommit === 'unknown' && previous.runtimeRevision === 'unknown'
  return {
    changed,
    initialInstall,
    from: previous,
    to: current,
    capabilityNotes: summarizeUpdateCommits(previous.gitCommit, current.gitCommit)
  }
}

function extractRelayHealth(gatewayHealth = null) {
  const startupRelay = Boolean(gatewayHealth?.startupChecks?.relay?.ok)
  const relayAddrs = Array.isArray(gatewayHealth?.relayAddrs) ? gatewayHealth.relayAddrs : []
  return {
    ok: startupRelay && relayAddrs.length > 0,
    detail: startupRelay
      ? (relayAddrs.length > 0 ? 'Relay startup check passed and relay-backed addresses are present.' : 'Relay startup check passed but no relay-backed addresses were reported yet.')
      : clean(gatewayHealth?.startupChecks?.relay?.error) || 'Relay startup check did not pass.'
  }
}

function extractHostRuntimeHealth(gatewayHealth = null, detectedHostRuntime = null) {
  const resolved = clean(detectedHostRuntime?.resolved) || 'none'
  const startupHost = Boolean(gatewayHealth?.startupChecks?.hostRuntime?.ok)
  return {
    ok: resolved === 'none' ? true : startupHost,
    detail: resolved === 'none'
      ? 'No host runtime adapter is active.'
      : (startupHost
          ? `${resolved} host adapter startup check passed.`
          : clean(gatewayHealth?.startupChecks?.hostRuntime?.error) || `${resolved} host adapter startup check failed.`)
  }
}

export function buildStandardRuntimeReport({
  apiBase = 'https://api.agentsquared.net',
  agentId = '',
  keyFile = '',
  detectedHostRuntime = null,
  reportLanguage = '',
  registration = null,
  gateway = null,
  gatewayHealth = null,
  previousState = null
} = {}) {
  const language = resolveReportLanguage(reportLanguage)
  const currentSkills = currentSkillsMetadata()
  let keyBundle = null
  if (keyFile) {
    try {
      keyBundle = loadRuntimeKeyBundle(keyFile)
    } catch {
      keyBundle = null
    }
  }
  const receiptResult = loadReceiptForAgent({ keyFile, agentId })
  const receipt = receiptResult.receipt ?? {}
  const registrationFacts = registration ?? receipt ?? {}
  const relayStatus = extractRelayHealth(gatewayHealth)
  const hostStatus = extractHostRuntimeHealth(gatewayHealth, detectedHostRuntime)
  const effectiveGatewayHealth = gatewayHealth ?? gateway?.health ?? null
  return {
    overall: {
      humanId: registrationFacts.humanId ?? null,
      humanName: clean(registrationFacts.humanName) || parseHumanName(registrationFacts.fullName || agentId),
      agentId: clean(registrationFacts.fullName || agentId),
      chainAgentId: clean(registrationFacts.chainAgentId),
      publicKey: clean(registrationFacts.publicKey || keyBundle?.publicKey),
      publicKeyFingerprint: keyBundle ? publicKeyFingerprint(keyBundle) : '',
      relayApiBase: clean(apiBase) || 'https://api.agentsquared.net',
      skillsRepoUrl: clean(currentSkills.repoUrl),
      skillsPackageVersion: clean(currentSkills.packageVersion),
      skillsGitCommit: clean(currentSkills.gitCommit),
      runtimeRevision: clean(currentSkills.runtimeRevision),
      latestStatus: currentSkills.latest,
      hostRuntime: clean(detectedHostRuntime?.resolved) || 'none',
      reportLanguage: language
    },
    skillsUpdate: buildSkillsUpdateSection({
      previousState,
      currentSkills
    }),
    gatewayStatus: {
      runtimeRevision: clean(currentSkills.runtimeRevision),
      skillsGitCommit: clean(currentSkills.gitCommit),
      skillsPackageVersion: clean(currentSkills.packageVersion),
      latestStatus: currentSkills.latest,
      gatewayBase: clean(gateway?.gatewayBase || effectiveGatewayHealth?.gatewayBase),
      listeningPort: parseGatewayPort(clean(gateway?.gatewayBase || effectiveGatewayHealth?.gatewayBase)),
      peerId: clean(effectiveGatewayHealth?.peerId),
      started: Boolean(gateway?.started ?? effectiveGatewayHealth),
      relay: relayStatus,
      hostRuntime: hostStatus,
      startupChecks: effectiveGatewayHealth?.startupChecks ?? null
    }
  }
}

export function buildStandardRuntimeOwnerLines(report = {}, options = {}) {
  const language = resolveReportLanguage(options.language || report?.overall?.reportLanguage)
  const isZh = language === 'zh-CN'
  const overall = report.overall ?? {}
  const skillsUpdate = report.skillsUpdate ?? {}
  const gatewayStatus = report.gatewayStatus ?? {}
  const lines = isZh
    ? [
        'AgentSquared 标准运行报告：',
        `总体说明：Human=${clean(overall.humanName) || '未知'}${overall.humanId != null ? `（ID ${overall.humanId}）` : ''}，Agent=${clean(overall.agentId) || '未知'}，宿主模式=${clean(overall.hostRuntime) || 'none'}。`,
        `总体说明：Public Key=${clean(overall.publicKey) || '未知'}，指纹=${clean(overall.publicKeyFingerprint) || '未知'}。`,
        `总体说明：官方 Relay=${clean(overall.relayApiBase) || '未知'}，官方 SKILLS 仓库=${clean(overall.skillsRepoUrl) || '未知'}。`,
        `总体说明：当前版本 package=${clean(overall.skillsPackageVersion) || '未知'}，git=${clean(overall.skillsGitCommit) || '未知'}，runtimeRevision=${clean(overall.runtimeRevision) || '未知'}，版本状态=${latestStatusLabel(overall.latestStatus?.status, language)}。`
      ]
    : [
        'AgentSquared standard runtime report:',
        `Overall: human=${clean(overall.humanName) || 'unknown'}${overall.humanId != null ? ` (id ${overall.humanId})` : ''}, agent=${clean(overall.agentId) || 'unknown'}, host mode=${clean(overall.hostRuntime) || 'none'}.`,
        `Overall: public key=${clean(overall.publicKey) || 'unknown'}, fingerprint=${clean(overall.publicKeyFingerprint) || 'unknown'}.`,
        `Overall: official relay=${clean(overall.relayApiBase) || 'unknown'}, official Skills repo=${clean(overall.skillsRepoUrl) || 'unknown'}.`,
        `Overall: current package=${clean(overall.skillsPackageVersion) || 'unknown'}, git=${clean(overall.skillsGitCommit) || 'unknown'}, runtimeRevision=${clean(overall.runtimeRevision) || 'unknown'}, version status=${latestStatusLabel(overall.latestStatus?.status, language)}.`
      ]

  if (skillsUpdate.initialInstall) {
    lines.push(isZh
      ? 'SKILLS 更新说明：这是当前 AgentSquared 本地环境的第一份标准运行报告，还没有可对比的旧版本。'
      : 'Skills update: this is the first standard runtime report for the current local AgentSquared setup, so there is no previous version to compare against.')
  } else if (skillsUpdate.changed) {
    lines.push(
      isZh
        ? `SKILLS 更新说明：已从 ${clean(skillsUpdate.from?.gitCommit) || '未知'}（package ${clean(skillsUpdate.from?.packageVersion) || '未知'}）升级到 ${clean(skillsUpdate.to?.gitCommit) || '未知'}（package ${clean(skillsUpdate.to?.packageVersion) || '未知'}）。`
        : `Skills update: upgraded from ${clean(skillsUpdate.from?.gitCommit) || 'unknown'} (package ${clean(skillsUpdate.from?.packageVersion) || 'unknown'}) to ${clean(skillsUpdate.to?.gitCommit) || 'unknown'} (package ${clean(skillsUpdate.to?.packageVersion) || 'unknown'}).`
    )
    if (Array.isArray(skillsUpdate.capabilityNotes) && skillsUpdate.capabilityNotes.length > 0) {
      lines.push(isZh
        ? `SKILLS 更新说明：本次更新能力包括 ${skillsUpdate.capabilityNotes.join('；')}。`
        : `Skills update: capability changes include ${skillsUpdate.capabilityNotes.join('; ')}.`)
    } else {
      lines.push(isZh
        ? 'SKILLS 更新说明：本地 git 元数据里没有提炼出简明的能力更新摘要。'
        : 'Skills update: local git metadata did not include a concise capability summary.')
    }
  } else {
    lines.push(
      isZh
        ? `SKILLS 更新说明：未检测到版本变化，当前 package=${clean(skillsUpdate.to?.packageVersion) || '未知'}，git=${clean(skillsUpdate.to?.gitCommit) || '未知'}。`
        : `Skills update: no version change was detected. Current package=${clean(skillsUpdate.to?.packageVersion) || 'unknown'}, git=${clean(skillsUpdate.to?.gitCommit) || 'unknown'}.`
    )
  }

  lines.push(
    isZh
      ? `A2 gateway 运行状态说明：当前基于 package=${clean(gatewayStatus.skillsPackageVersion) || '未知'}，git=${clean(gatewayStatus.skillsGitCommit) || '未知'}，版本状态=${latestStatusLabel(gatewayStatus.latestStatus?.status, language)}。`
      : `A2 gateway status: running on package=${clean(gatewayStatus.skillsPackageVersion) || 'unknown'}, git=${clean(gatewayStatus.skillsGitCommit) || 'unknown'}, version status=${latestStatusLabel(gatewayStatus.latestStatus?.status, language)}.`
  )
  lines.push(
    isZh
      ? `A2 gateway 运行状态说明：监听端口=${clean(gatewayStatus.listeningPort) || '未知'}，Peer ID=${clean(gatewayStatus.peerId) || '未知'}。`
      : `A2 gateway status: listening port=${clean(gatewayStatus.listeningPort) || 'unknown'}, Peer ID=${clean(gatewayStatus.peerId) || 'unknown'}.`
  )
  lines.push(
    isZh
      ? `A2 gateway 运行状态说明：与 A2 Relay 通讯${gatewayStatus.relay?.ok ? '正常' : '异常'}（${clean(gatewayStatus.relay?.detail) || '无详情'}），与宿主通讯${gatewayStatus.hostRuntime?.ok ? '正常' : '异常'}（${clean(gatewayStatus.hostRuntime?.detail) || '无详情'}）。`
      : `A2 gateway status: relay communication is ${gatewayStatus.relay?.ok ? 'healthy' : 'unhealthy'} (${clean(gatewayStatus.relay?.detail) || 'no detail'}), host communication is ${gatewayStatus.hostRuntime?.ok ? 'healthy' : 'unhealthy'} (${clean(gatewayStatus.hostRuntime?.detail) || 'no detail'}).`
  )
  return lines
}
