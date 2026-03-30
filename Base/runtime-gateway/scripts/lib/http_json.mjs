import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export const DEFAULT_USER_AGENT = 'curl/8.1.2'
const STATUS_MARKER = '__AGENTSQUARED_HTTP_STATUS__:'

function parseBody(text) {
  const trimmed = text.trim()
  return trimmed ? JSON.parse(trimmed) : {}
}

function buildStatusError(status, text, statusText = '') {
  let data = {}
  try {
    data = parseBody(text)
  } catch {
    data = {}
  }
  const detail = data?.error?.message ?? (text.trim() || statusText || 'Request failed')
  return new Error(`${status} ${detail}`)
}

function isStatusError(error) {
  return typeof error?.message === 'string' && /^[1-5][0-9][0-9]\s/.test(error.message)
}

async function fetchJson(url, { method = 'GET', headers = {}, body } = {}) {
  const response = await fetch(url, {
    method,
    headers,
    body
  })
  const text = await response.text()
  if (!response.ok) {
    throw buildStatusError(response.status, text, response.statusText)
  }
  return parseBody(text)
}

async function curlJson(url, { method = 'GET', headers = {}, body } = {}) {
  const args = [
    '--silent',
    '--show-error',
    '--location',
    '--connect-timeout', '10',
    '--max-time', '60',
    '--request', method,
  ]
  for (const [name, value] of Object.entries(headers)) {
    args.push('--header', `${name}: ${value}`)
  }
  if (body !== undefined) {
    args.push('--data-binary', body)
  }
  args.push('--write-out', `\n${STATUS_MARKER}%{http_code}`, url)
  const { stdout } = await execFileAsync('curl', args, { maxBuffer: 1024 * 1024 * 4 })
  const markerIndex = stdout.lastIndexOf(`\n${STATUS_MARKER}`)
  if (markerIndex < 0) {
    throw new Error('curl response did not include an HTTP status marker')
  }
  const text = stdout.slice(0, markerIndex)
  const status = Number.parseInt(stdout.slice(markerIndex + 1 + STATUS_MARKER.length).trim(), 10)
  if (!Number.isInteger(status)) {
    throw new Error('curl response did not include a valid HTTP status code')
  }
  if (status < 200 || status >= 300) {
    throw buildStatusError(status, text)
  }
  return parseBody(text)
}

export async function requestJson(url, { method = 'GET', headers = {}, payload } = {}) {
  const normalizedHeaders = {
    Accept: 'application/json',
    'User-Agent': DEFAULT_USER_AGENT,
    ...headers
  }
  let body
  if (payload !== undefined) {
    body = JSON.stringify(payload)
    if (!normalizedHeaders['Content-Type']) {
      normalizedHeaders['Content-Type'] = 'application/json'
    }
  }

  try {
    return await fetchJson(url, { method, headers: normalizedHeaders, body })
  } catch (error) {
    if (isStatusError(error)) {
      throw error
    }
    return curlJson(url, { method, headers: normalizedHeaders, body })
  }
}
