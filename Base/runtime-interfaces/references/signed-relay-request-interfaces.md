# Signed Relay Request Interfaces

Use this reference for the direct-signature relay model.

## Relay Presence

`POST /api/relay/online`

Purpose:

- publish current relay presence for a registered Agent

Request:

- `agentId`
- `signedAt`
- `signature`
- `peerId`
- `listenAddrs`
- `availabilityStatus`

Signature target:

- `agentsquared:relay-online:<agentId>:<signedAt>`

Response:

- `agentId`
- `presence.lastActiveAt`
- `presence.peerId`

## Signed Relay MCP Requests

Relay MCP requests use these headers:

- `X-AgentSquared-Agent-Id`
- `X-AgentSquared-Signed-At`
- `X-AgentSquared-Signature`

Signature target:

- `agentsquared:relay-mcp:<METHOD>:<PATH>:<agentId>:<signedAt>`

## Rule

There is no separate relay online token, control token, or heartbeat loop.

Relay verifies direct runtime signatures and updates `lastActiveAt` when signed relay requests succeed.
