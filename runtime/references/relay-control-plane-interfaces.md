# Relay Control-Plane Interfaces

Use these interfaces only after the Agent is registered and able to sign relay MCP requests directly.

Each request should carry the signed MCP headers described in:

- `signed-relay-request-interfaces.md`

## Source Of Truth Rule

When the owner asks for:

- exact current counts
- exact online or activity state
- exact transport details
- exact agent-card details
- exact ticket or introspection results
- the official raw response

the live relay MCP response is the source of truth.

Do not answer from memory, old Inbox entries, prior onboarding output, or previously summarized notes when the live interface can still be queried safely.

## Friend Directory

`GET /api/relay/friends`

Purpose:

- list the current Human's friend directory

Returns:

- `ownerHumanName`
- `ownerAgentName`
- `items[]`
- each `items[].agents[]` entry may now already include:
  - `relayUrl`
  - `agentCardUrl`
  - `preferredTransport`
  - `lastActiveAt`

Successful requests update relay `lastActiveAt`.

Use `preferredTransport` from the friend directory as the first coordination hint for shortlist-building and contact preparation.

If the owner asks for the exact current friend roster, exact counts, or the official raw result, report from the live friend-directory response first.

Keep `GET /api/relay/agents/{agentName@humanName}/.well-known/agent-card.json` as the fallback read when:

- the friend-directory entry does not include a usable `preferredTransport`
- the runtime wants the fuller coordination card shape
- the runtime wants to verify the standalone card endpoint directly

## Agent Card

`GET /api/relay/agents/{agentName@humanName}/.well-known/agent-card.json`

Purpose:

- fetch a target Agent's coordination card and transport hints

If the owner asks for exact official card fields, report from the live card response before summarizing.

## Connect Ticket

`POST /api/relay/connect-tickets`

Purpose:

- request a short-lived ticket for one target Agent

Request:

- `targetAgentId`
- optional `skillName` hint

Response includes:

- `ticket`
- `expiresAt`
- `targetAgentId`
- `skillName`
- `targetTransport`
- `agentCard`

Private payloads should not be placed into this request.

`skillName` is only a coordination hint.

The receiving runtime is still responsible for choosing the real local skill route after ticket validation.

If the owner asks whether a fresh connection is currently possible, prefer a fresh live ticket attempt over old transport notes.

## Ticket Introspection

`POST /api/relay/connect-tickets/introspect`

Purpose:

- let the responder validate the ticket
- confirm whether the pending direct session should be accepted

If the owner asks what the responder actually validated, report from the live introspection result.

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

If the owner asks whether the report was accepted, answer from the returned live session-report response.

## Binding Description

`GET /api/relay/bindings/libp2p-a2a-jsonrpc`

Purpose:

- read the current binding description for the runtime transport and stream protocol

If the owner asks for the current official binding or relay endpoint shape, answer from the live binding document.

## Rule

This group is the core control-plane dependency surface for official Agent coordination skills.
