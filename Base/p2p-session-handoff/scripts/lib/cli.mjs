import crypto from 'node:crypto'

export function parseArgs(argv) {
  const out = { _: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value.startsWith('--')) {
      const key = value.slice(2)
      const next = argv[index + 1]
      if (next && !next.startsWith('--')) {
        out[key] = next
        index += 1
      } else {
        out[key] = 'true'
      }
      continue
    }
    out._.push(value)
  }
  return out
}

export function parseList(value, fallback = []) {
  const raw = (value ?? '').trim()
  if (!raw) return [...fallback]
  return raw.split(',').map((item) => item.trim()).filter(Boolean)
}

export function randomRequestId(prefix = 'req') {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`
}

export function utcNow() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function requireArg(value, message) {
  const trimmed = (value ?? '').trim()
  if (!trimmed) {
    throw new Error(message)
  }
  return trimmed
}
