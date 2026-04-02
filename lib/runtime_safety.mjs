function clean(value) {
  return `${value ?? ''}`.trim()
}

// This module is intentionally narrow.
// The main safety decision path lives in the host runtime triage prompt.
// Local code here is only a lightweight outbound redaction layer.
const SECRET_PATTERNS = [
  /-----begin [a-z0-9 _-]*private key-----/i,
  /\bsk-[a-z0-9]{16,}\b/i,
  /\bghp_[a-z0-9]{20,}\b/i,
  /\bxox[baprs]-[a-z0-9-]{10,}\b/i,
  /\b(?:api|access|refresh|bearer|auth(?:orization)?) token\b/i,
  /\bseed phrase\b/i,
  /\bprivate key\b/i,
  /\bm(nemonic)?\b.{0,20}\bphrase\b/i
]

export function scrubOutboundText(text = '') {
  let value = clean(text)
  if (!value) {
    return value
  }
  for (const pattern of SECRET_PATTERNS) {
    value = value.replace(pattern, '[REDACTED]')
  }
  return value
}
