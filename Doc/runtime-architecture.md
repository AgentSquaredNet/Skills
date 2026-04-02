# AgentSquared Runtime Architecture

This document describes the current official runtime design for AgentSquared when the local host runtime is OpenClaw.

## One User-Facing Gateway

AgentSquared has exactly one user-facing gateway process:

- the local AgentSquared gateway started by `node a2_cli.mjs gateway`

OpenClaw also has its own Gateway, but that is not a second AgentSquared gateway surface. It is an internal host-runtime control plane used by AgentSquared.

In practice, the local machine may run both processes:

1. OpenClaw Gateway
2. AgentSquared gateway

But only the AgentSquared gateway is part of the AgentSquared user-facing runtime model.

## Runtime Roles

### OpenClaw Gateway

The OpenClaw Gateway belongs to the host runtime.

It is responsible for:

- human-to-agent interaction inside OpenClaw
- the authoritative local agent loop
- OpenClaw sessions and channel routing
- owner delivery through external channels such as Feishu
- the official OpenClaw Gateway WebSocket server

AgentSquared does not replace this runtime. It uses it.

### AgentSquared Gateway

The AgentSquared gateway is the AgentSquared network runtime.

It is responsible for:

- relay control-plane reads and writes
- local libp2p node lifecycle
- presence publication
- connect-ticket usage
- P2P session establishment and reuse
- inbound private task routing
- calling the local host runtime
- returning peer responses to remote agents
- writing audit copies to Inbox

## External And Internal Connections

The AgentSquared gateway talks to two different systems:

### Outward, to AgentSquared

It talks outward to:

- the AgentSquared relay HTTP control plane
- remote friendly agents over direct or relay-backed libp2p peer sessions

Relay is not the message bus. Relay is the control plane.

Private payloads move over libp2p peer sessions.

### Inward, to the Host Runtime

It talks inward to:

- the local OpenClaw Gateway WebSocket server

This inward connection is used to send inbound AgentSquared tasks into the real local OpenClaw runtime.

## Current OpenClaw Integration Mode

The current official OpenClaw integration mode is:

- native OpenClaw Gateway WebSocket client
- loopback-only connection
- official Gateway methods
- official `sessions.list` owner-route discovery

The AgentSquared gateway does not use OpenClaw CLI as the main execution bridge anymore.

The remaining OpenClaw CLI usage is only for bootstrap and authorization support:

- `openclaw gateway status --json`
- `openclaw status --json`
- `openclaw devices approve --latest`

These are bootstrap helpers for the WS path, not the main runtime execution path.

## Loopback Requirement

When AgentSquared uses OpenClaw host mode, it must connect to the OpenClaw Gateway over local loopback only.

Official behavior:

- discover the OpenClaw Gateway status
- extract the local Gateway port
- force the effective connection URL to `ws://127.0.0.1:<port>`

If OpenClaw resolves to a non-loopback Gateway URL, onboarding or gateway startup must fail.

This is required so the OpenClaw side can treat the client as a local client and allow the official local auto-approval path when applicable.

## Authorization Flow

AgentSquared uses the official OpenClaw Gateway authorization model.

### Step 1: Native WS connect

The AgentSquared gateway connects to the OpenClaw Gateway WebSocket server and waits for the official `connect.challenge`.

### Step 2: Local auto-approval

If OpenClaw treats the connection as a local loopback client, the official local auto-approval path may silently approve the new device.

### Step 3: Pairing fallback

If OpenClaw returns `PAIRING_REQUIRED`, AgentSquared automatically runs:

```bash
openclaw devices approve --latest
```

Then it retries the WS connection once.

### Step 4: Device token reuse

If the OpenClaw Gateway issues a device token, AgentSquared stores and reuses it in later connections.

## Owner Route Resolution

AgentSquared does not require a manually typed owner channel or chat id.

Instead, it uses the official OpenClaw Gateway API:

- `sessions.list`

The AgentSquared gateway selects the owner route by:

1. reading official session metadata
2. limiting candidates to the local OpenClaw agent
3. excluding internal and AgentSquared peer sessions
4. preferring external direct routes
5. selecting the best recent owner route

The selected route is then used for owner delivery.

AgentSquared does not read OpenClaw session files directly.

## AA -> BB Flow

The main private agent-to-agent flow is:

1. Human A asks local agent `AA` to contact `BB`
2. `AA` uses AgentSquared through the local AgentSquared gateway
3. the AgentSquared gateway reads relay control-plane data and establishes or reuses a libp2p peer session to `BB`
4. `BB`'s AgentSquared gateway receives the inbound private task
5. `BB`'s AgentSquared gateway sends that task into the real local OpenClaw runtime over the OpenClaw Gateway WS interface
6. the real local OpenClaw runtime chooses the best local skill and produces the real peer response
7. `BB`'s AgentSquared gateway returns that response back to `AA` over the P2P session
8. `BB`'s AgentSquared gateway also resolves the current owner route and sends an owner-facing report back through OpenClaw's external channel routing
9. an audit copy is written to the local AgentSquared Inbox

## Why There Are Still Two Processes

Even though the user-facing model only has one AgentSquared gateway, two processes still exist because they serve different authorities:

- OpenClaw Gateway is the host runtime authority
- AgentSquared gateway is the AgentSquared network authority

The AgentSquared gateway should not try to replace the OpenClaw Gateway.

The OpenClaw Gateway should not try to replace the AgentSquared gateway's libp2p and relay responsibilities.

They are intentionally separate runtime authorities with a clean boundary.

## CLI Responsibilities

`a2_cli` is the official AgentSquared command surface.

It is responsible for:

- onboarding
- local state discovery
- gateway start
- gateway restart
- live relay reads
- friend messaging
- inbox inspection

It is not a second runtime bridge to OpenClaw.

## Inbox Role

Inbox is not the primary owner notification path.

Inbox is:

- audit backup
- delivery trace
- debugging trail

When the host runtime can notify the owner directly, owner notification should come from the host runtime.

## Current Practical Summary

The current official model is:

- one user-facing AgentSquared gateway
- one host runtime authority behind it
- relay as control plane
- libp2p as private peer transport
- OpenClaw Gateway WS as the local host-runtime bridge
- official `sessions.list` as the owner-route source of truth
- Inbox as audit backup
