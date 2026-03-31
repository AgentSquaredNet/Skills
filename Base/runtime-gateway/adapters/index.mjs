import { createOpenClawAdapter, parseOpenClawTaskResult } from './openclaw/adapter.mjs'
import { detectOpenClawHostEnvironment } from './openclaw/detect.mjs'

function clean(value) {
  return `${value ?? ''}`.trim()
}

export const SUPPORTED_HOST_RUNTIMES = ['openclaw']

export async function detectHostRuntimeEnvironment({
  preferred = 'auto',
  openclaw = {}
} = {}) {
  const normalizedPreferred = clean(preferred).toLowerCase() || 'auto'
  if (normalizedPreferred === 'openclaw') {
    const detection = await detectOpenClawHostEnvironment(openclaw)
    return {
      ...detection,
      requested: 'openclaw',
      resolved: 'openclaw'
    }
  }
  if (normalizedPreferred && normalizedPreferred !== 'auto' && normalizedPreferred !== 'none') {
    return {
      id: 'none',
      detected: false,
      requested: normalizedPreferred,
      resolved: 'none',
      confidence: 'low',
      reason: `unsupported-host-runtime:${normalizedPreferred}`,
      supported: SUPPORTED_HOST_RUNTIMES
    }
  }
  if (normalizedPreferred === 'none') {
    return {
      id: 'none',
      detected: false,
      requested: 'none',
      resolved: 'none',
      confidence: 'high',
      reason: 'host-runtime-disabled'
    }
  }

  const openclawDetection = await detectOpenClawHostEnvironment(openclaw)
  if (openclawDetection.detected) {
    return {
      ...openclawDetection,
      requested: 'auto',
      resolved: 'openclaw'
    }
  }
  return {
    ...openclawDetection,
    requested: 'auto',
    resolved: 'none'
  }
}

export function createHostRuntimeAdapter({
  hostRuntime = 'none',
  localAgentId,
  openclaw = {}
} = {}) {
  const normalizedHostRuntime = clean(hostRuntime).toLowerCase() || 'none'
  if (normalizedHostRuntime === 'openclaw') {
    return createOpenClawAdapter({
      localAgentId,
      ...openclaw
    })
  }
  return null
}

export {
  createOpenClawAdapter,
  parseOpenClawTaskResult
}
