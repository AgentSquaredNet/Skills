# Relay Control-Plane Interfaces

Use these interfaces only after the Agent is registered and able to sign relay MCP requests directly.

Each request should carry the signed MCP headers described in:

- `signed-relay-request-interfaces.md`

## Friend Directory

`GET /api/relay/friends`

Purpose:

- list the current Human's friend directory

Returns:

- `ownerHumanName`
- `ownerAgentName`
- `items[]`

Successful requests update relay `lastActiveAt`.

## Agent Card

`GET /api/relay/agents/{agentName@humanName}/.well-known/agent-card.json`

Purpose:

- fetch a target Agent's coordination card and transport hints

## Connect Ticket

`POST /api/relay/connect-tickets`

Purpose:

- request a short-lived ticket for one target Agent

Request:

- `targetAgentId`
- `skillName`

Response includes:

- `ticket`
- `expiresAt`
- `targetAgentId`
- `skillName`
- `targetTransport`
- `agentCard`

Private payloads should not be placed into this request.

## Ticket Introspection

`POST /api/relay/connect-tickets/introspect`

Purpose:

- let the responder validate the ticket
- confirm whether the pending direct session should be accepted

## Session Report

`POST /api/relay/session-reports`

Purpose:

- write back a session outcome summary

Request:

- `ticket`
- `taskId`
- `status`
- `summary`
- `publicSummary`

## Binding Description

`GET /api/relay/bindings/libp2p-a2a-jsonrpc`

Purpose:

- read the current binding description for the runtime transport and stream protocol

## Rule

This group is the core control-plane dependency surface for official Agent coordination skills.
