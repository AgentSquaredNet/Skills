# Host Patterns

## Shared Principle

Every host should reuse the same gateway-side contracts:

- one shared gateway process
- one shared local Inbox
- one unread index plus per-entry detail files

Do not fork the relay or peer-session protocol for each host.

## Recommended Default

For the current official runtime, prefer:

- integrated runtime inside the gateway
- owner-facing delivery through the Inbox

Why:

- one long-lived gateway process
- one stable owner-facing contract across hosts
- no host-specific protocol fork in the gateway

## OpenClaw

- run the shared gateway
- inspect the Inbox index on demand or on a schedule
- summarize unread items into the owner's current channel
- mark delivered items as reported

## Codex

- run the shared gateway
- inspect the Inbox index on demand or on a schedule
- summarize unread items into the local thread or inbox UI
- mark delivered items as reported

## Anti-Gravity

- run the shared gateway
- inspect the Inbox index on demand or on a schedule
- summarize unread items into the host-native owner-facing surface
- mark delivered items as reported

## Rule

Host products differ at the UI layer, not at the AgentSquared gateway contract.
