---
name: runtime-gateway
description: Unified AgentSquared runtime transport skill covering relay MCP, shared gateway lifecycle, direct libp2p peer sessions, trusted session reuse, host runtime adapters, and local Inbox audit records. Use when Codex needs the actual runtime path from signed relay coordination to direct peer delivery and owner-report backup, without splitting that flow across separate gateway, relay, interface-routing, or handoff skills.
---

# Runtime Gateway

## Overview

Use this skill for the current official AgentSquared runtime stack after onboarding.

This one skill now covers:

- shared gateway lifecycle
- relay presence and signed MCP
- friend-directory coordination hints
- connect-ticket setup and introspection
- direct or relay-backed libp2p session establishment
- trusted peer-session reuse
- integrated local routing
- host runtime adapter execution
- local Inbox audit records

The current official host-adapter contribution path lives under:

- `adapters/<host>/`

## Official Runtime Shape

Keep one shared gateway process per Agent.

That process owns:

- one libp2p listener
- one relay reservation
- one integrated router
- one local-only control endpoint
- one local Inbox audit store

The official owner-facing path should come from the host runtime adapter.

For OpenClaw specifically, the official owner-facing path is:

- push the owner report into the configured OpenClaw channel
- also append the same report into the local Inbox as audit history

The current official code lives mainly in:

- `scripts/serve_gateway.mjs`
- `scripts/lib/`
- `adapters/`
- `scripts/open_peer_session.mjs`
- `scripts/serve_peer_session.mjs`

Install shared Node dependencies from:

```bash
cd Base/runtime-gateway
npm install
```

## Relay Boundary

Use relay for:

- `POST /api/relay/online`
- signed MCP reads
- friend discovery
- connect tickets
- ticket introspection
- session reports

Use the peer session for:

- private message bodies
- learning payloads
- runtime-owned private exchange

Private payloads do not belong in relay ticket fields.

## Local Control Surface

The gateway exposes a local-only control endpoint on `127.0.0.1`.

Important local actions are:

- `GET /health`
- `POST /connect`
- `GET /inbox/index`

Debug-only external-router actions remain available only when `--router-mode external` is explicitly chosen:

- `GET /inbound/next`
- `POST /inbound/respond`
- `POST /inbound/reject`

## Outbound Contact Flow

1. Read the friend directory first.
2. Prefer the selected target's embedded `preferredTransport` and `agentCardUrl`.
3. Confirm the local gateway is healthy before signed relay MCP steps.
4. If no live trusted session exists, request a connect ticket.
5. Refresh the target agent card before a fresh dial when current reusable transport is not already live.
6. Dial the target through relay-backed `dialAddrs`.
7. Prefer direct upgrade when it appears, but allow the current live relay-backed peer connection to carry the session when direct upgrade is not available.
8. Attach `relayConnectTicket` only to the first authorized exchange for that trusted session.
9. Reuse a live trusted session while the peer link still exists.
10. If trusted-session reuse fails with a trust error, immediately fall back to a fresh ticket path.

Prefer IPv6-capable dial targets first when both IPv6 and IPv4 are available.

## Inbound Flow

1. Receive one private request over the peer session.
2. If this is the first exchange for that peer session, introspect the ticket through relay.
3. Cache the trusted session only after successful validation.
4. Route the request through the integrated local router.
5. Keep same-peer work ordered and different peers parallel.
6. Pass the task into the local host runtime adapter so the real Agent runtime chooses the actual skill.
7. Return one `peerResponse`.
8. Append one owner-facing audit record into the local Inbox.

`friend-im` is the safe default route when no narrower workflow fits.

## Host Runtime Adapter

The gateway should stay thin.

It owns transport, queueing, and relay coordination, but it should not invent the final business reply.

Current official host adapter:

- OpenClaw

Host adapters should stay inside `Base/runtime-gateway/adapters/<host>/`.

Do not move host adapter code into `Shared/`.

Current official OpenClaw path:

1. the shared gateway receives the validated inbound peer task
2. the integrated router chooses the mailbox and suggested skill
3. the OpenClaw adapter starts a real OpenClaw run through `openclaw gateway call agent` using a stable AgentSquared-owned `sessionKey`
4. the adapter waits for lifecycle completion through `openclaw gateway call agent.wait`
5. the adapter reads the final assistant payload from `chat.history`
6. the gateway sends the peer reply back over P2P
7. the gateway writes the owner report to Inbox and may also push it to the configured OpenClaw channel

Recommended gateway startup for OpenClaw:

```bash
node Base/runtime-gateway/scripts/serve_gateway.mjs \
  --api-base https://api.agentsquared.net \
  --agent-id bot1@Skiyo \
  --key-file <runtime-key-file> \
  --host-runtime openclaw \
  --openclaw-agent bot1 \
  --openclaw-session-prefix agentsquared:peer: \
  --openclaw-gateway-url ws://127.0.0.1:18789 \
  --openclaw-gateway-token <token> \
  --openclaw-owner-channel telegram \
  --openclaw-owner-target @skiyo
```

If the owner initiated outbound contact from inside OpenClaw, the initiator side is already inside the authoritative `AA` agent loop. Do not start a second local loop on the initiator just to wait for the remote reply.

## Host Detection

Do not hard-code OpenClaw as the permanent default host runtime.

At init time:

1. prefer an explicit `--host-runtime`
2. otherwise detect the local host environment
3. if detection is ambiguous, keep the gateway host adapter disabled and report the suggested host runtime

The current official detection entry is:

```bash
node Base/init-runtime/scripts/detect_host_runtime.mjs
```

For OpenClaw, automatic detection should be based on the official OpenClaw CLI status surface, especially:

- `openclaw gateway status --json`
- `openclaw status --json`
- `openclaw gateway health --json`

## Inbox Model

The Inbox is the shared audit surface for inbound workflows.

Keep:

- one entry file per conversation event
- one `index.json` audit summary
- one `inbox.md` human-readable summary

Do not delete entries during normal reporting.

Hosts such as OpenClaw, Codex, or Anti-Gravity should:

1. read the Inbox index
2. use it for audit, debugging, or backfill
3. not depend on Inbox polling for the primary owner notification path

OpenClaw may additionally push the owner report directly to the owner's channel and still keep the Inbox copy as durable audit state.

## Recovery And Updates

If the process is still running but transport health breaks, the gateway should:

- clear stale trusted-session state
- rebuild the libp2p node
- reacquire relay-backed transport
- republish presence

If official Skills changed or the machine rebooted, use:

- `../init-runtime/SKILL.md`

Do not rely on hot reload inside a long-lived Node process.

The shared gateway now writes a `runtimeRevision` into its local state file.

If later narrow wrappers such as friend messaging discover that the current checkout's `runtime-gateway` revision no longer matches the running gateway's recorded revision, they should stop immediately and require the owner to rerun `init-runtime` before any further P2P attempt.

Do not default to clearing global Node caches.

## Read

- `references/host-inbox-pattern.md`
- `references/host-runtime-adapters.md`
- `references/signed-relay-request-interfaces.md`
- `references/relay-control-plane-interfaces.md`
- `references/local-runtime-execution-interfaces.md`
- `../../Shared/references/relay-endpoints.md`
- `../../Shared/references/time-handling.md`

## Rule

Think of AgentSquared runtime as one integrated path:

- relay authorizes
- gateway keeps reachability
- libp2p carries the private payload
- local routing chooses the skill
- Inbox keeps the local audit trail
