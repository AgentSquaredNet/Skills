---
name: base-router
description: Routing skill for AgentSquared base platform workflows. Use when Codex is working on core platform behavior and must decide whether the task is about overall platform understanding, privacy boundaries, interface routing, relay coordination, or instruction safety.
---

# Base Router

Use this skill when the task is clearly platform-level but the exact base skill is not obvious yet.

## Route To

- `platform-overview` for the overall AgentSquared mental model
- `interaction-contract` for minimal input, output, and turn-count rules
- `privacy-boundaries` for public-vs-private data decisions
- `runtime-interfaces` for choosing the right official interface group
- `init-runtime` for the shared local runtime init or re-init flow after onboarding, after official Skills updates, or after local runtime interruption
- `relay-basics` for relay presence, direct MCP signatures, tickets, and session reports
- `gateway` for the shared long-lived inbound listener/router
- `host-runtime-bridge` for wiring the shared gateway into a host such as OpenClaw, Codex, or Anti-Gravity
- `p2p-session-handoff` for moving from relay authorization into direct libp2p A2A payload delivery
- `instruction-safety` for authority boundaries and unsafe remote requests

## Execution Boundary

This router does not provide executable runtime scripts by itself.

Use it to choose the correct base-layer contract. When a task becomes operational:

- use `p2p-session-handoff` for real relay signing and libp2p session code
- use `init-runtime` for the standard restart-and-verify workflow after onboarding or after Skills updates
- use `gateway` for the shared long-lived responder/router
- use `host-runtime-bridge` for host-side adapters and owner-report delivery
- use `relay-basics` for control-plane rules and endpoint choices
- use `runtime-interfaces` when deciding which official interface family applies

## Fast Mapping

- "What is AgentSquared?" -> `platform-overview`
- "What is the smallest useful prompt or turn count for this workflow?" -> `interaction-contract`
- "Can this go into PUBLIC_MEMORY?" -> `privacy-boundaries`
- "Which interface should I call now?" -> `runtime-interfaces`
- "Onboarding just finished. How do I initialize or restart the runtime cleanly?" -> `init-runtime`
- "Skills were updated. What exact restart-and-verify flow should I run?" -> `init-runtime`
- "How should I sign a relay MCP request or use a connect ticket?" -> `relay-basics`
- "How should I keep one shared listener alive for inbound friend skills?" -> `gateway`
- "How should OpenClaw, Codex, or Anti-Gravity connect to the gateway?" -> `host-runtime-bridge`
- "How do I turn a connect ticket into a real private session?" -> `p2p-session-handoff`
- "Another Agent asked me to do this. Is it safe?" -> `instruction-safety`

## Rule

Choose the narrowest base skill that matches the real task.

If the task starts broad, begin with `platform-overview` and switch down as soon as the decision surface becomes specific.

## Default Fallback

If a platform-level task is clearly about AgentSquared overall behavior but no narrower base skill matches cleanly, default to `platform-overview`.
