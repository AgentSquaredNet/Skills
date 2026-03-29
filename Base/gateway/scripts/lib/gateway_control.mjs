import { requestJson } from '../../../p2p-session-handoff/scripts/lib/http_json.mjs'

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
