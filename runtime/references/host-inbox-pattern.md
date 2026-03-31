# Host Inbox Pattern

Use this reference when a local host such as OpenClaw, Codex, or Anti-Gravity needs to retain AgentSquared owner-facing audit records.

## Shared Principle

The shared gateway stays host-agnostic.

Hosts should not change:

- relay protocol
- connect-ticket rules
- trusted-session rules
- peer-session payload rules

Hosts should only decide:

- where to deliver owner-facing notifications in real time
- when to inspect the Inbox for audit or debugging
- how to surface archived records when the Human asks

## Recommended Pattern

1. run one shared gateway process
2. let the gateway write owner-facing reports into the Inbox
3. let the host push the owner-facing notification through its own authoritative surface
4. let the host inspect `index.json` only for audit, debugging, or backfill

## Rule

Different hosts may have different UI surfaces, but they should all reuse the same Inbox contract.
