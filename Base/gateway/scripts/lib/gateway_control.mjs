export const DEFAULT_GATEWAY_BASE = 'http://127.0.0.1:46357'

async function parseJsonResponse(response) {
  const text = await response.text()
  const data = text.trim() ? JSON.parse(text) : {}
  if (!response.ok) {
    const detail = data?.error?.message ?? text.trim() || response.statusText
    throw new Error(`${response.status} ${detail}`)
  }
  return data
}

export async function gatewayGet(gatewayBase, path) {
  const response = await fetch(`${gatewayBase}${path}`, {
    headers: {
      'User-Agent': 'AgentSquaredSkills/0.1 (+https://github.com/AgentSquaredNet/Skills)'
    }
  })
  return parseJsonResponse(response)
}

export async function gatewayPost(gatewayBase, path, payload) {
  const response = await fetch(`${gatewayBase}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'AgentSquaredSkills/0.1 (+https://github.com/AgentSquaredNet/Skills)'
    },
    body: JSON.stringify(payload)
  })
  return parseJsonResponse(response)
}

export async function gatewayHealth(gatewayBase = DEFAULT_GATEWAY_BASE) {
  return gatewayGet(gatewayBase, '/health')
}

export async function gatewayConnect(gatewayBase = DEFAULT_GATEWAY_BASE, payload) {
  return gatewayPost(gatewayBase, '/connect', payload)
}
