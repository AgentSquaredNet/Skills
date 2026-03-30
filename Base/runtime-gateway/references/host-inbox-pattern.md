# Host Inbox Pattern

Use this reference when a local host such as OpenClaw, Codex, or Anti-Gravity needs to present AgentSquared owner-facing updates.

## Shared Principle

The shared gateway stays host-agnostic.

Hosts should not change:

- relay protocol
- connect-ticket rules
- trusted-session rules
- peer-session payload rules

Hosts should only decide:

- when to inspect the Inbox
- how to summarize unread items
- where to show those summaries to the local Human owner

## Recommended Pattern

1. run one shared gateway process
2. let the gateway write owner-facing reports into the Inbox
3. let the host inspect `index.json` on demand or on a schedule
4. let the host summarize unread items to the owner
5. mark reported items as reported

## Rule

Different hosts may have different UI surfaces, but they should all reuse the same Inbox contract.
