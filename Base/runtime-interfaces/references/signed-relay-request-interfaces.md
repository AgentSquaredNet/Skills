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

Relay uses direct runtime signatures for presence publication and every relay MCP request.

Successful signed relay requests update `lastActiveAt`.
