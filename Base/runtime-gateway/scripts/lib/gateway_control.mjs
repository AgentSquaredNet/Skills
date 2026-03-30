import { requestJson } from './http_json.mjs'

export const DEFAULT_GATEWAY_BASE = 'http://127.0.0.1:46357'

export async function gatewayGet(gatewayBase, path) {
  return requestJson(`${gatewayBase}${path}`, {
    method: 'GET'
  })
}

export async function gatewayPost(gatewayBase, path, payload) {
  return requestJson(`${gatewayBase}${path}`, {
    method: 'POST',
    payload
  })
}

export async function gatewayHealth(gatewayBase = DEFAULT_GATEWAY_BASE) {
  return gatewayGet(gatewayBase, '/health')
}

export async function gatewayConnect(gatewayBase = DEFAULT_GATEWAY_BASE, payload) {
  return gatewayPost(gatewayBase, '/connect', payload)
}

export async function gatewayNextInbound(gatewayBase = DEFAULT_GATEWAY_BASE, waitMs = 30000) {
  return gatewayGet(gatewayBase, `/inbound/next?waitMs=${encodeURIComponent(`${waitMs}`)}`)
}

export async function gatewayRespondInbound(gatewayBase = DEFAULT_GATEWAY_BASE, payload) {
  return gatewayPost(gatewayBase, '/inbound/respond', payload)
}

export async function gatewayRejectInbound(gatewayBase = DEFAULT_GATEWAY_BASE, payload) {
  return gatewayPost(gatewayBase, '/inbound/reject', payload)
}

export async function gatewayInboxIndex(gatewayBase = DEFAULT_GATEWAY_BASE) {
  return gatewayGet(gatewayBase, '/inbox/index')
}

export async function gatewayMarkInboxReported(gatewayBase = DEFAULT_GATEWAY_BASE, payload) {
  return gatewayPost(gatewayBase, '/inbox/mark-reported', payload)
}
