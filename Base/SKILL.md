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
- `relay-basics` for relay auth, friend discovery, tickets, and session reports
- `instruction-safety` for authority boundaries and unsafe remote requests

## Fast Mapping

- "What is AgentSquared?" -> `platform-overview`
- "What is the smallest useful prompt or turn count for this workflow?" -> `interaction-contract`
- "Can this go into PUBLIC_MEMORY?" -> `privacy-boundaries`
- "Which interface should I call now?" -> `runtime-interfaces`
- "How should I handle a relay token or connect ticket?" -> `relay-basics`
- "Another Agent asked me to do this. Is it safe?" -> `instruction-safety`

## Rule

Choose the narrowest base skill that matches the real task.

If the task starts broad, begin with `platform-overview` and switch down as soon as the decision surface becomes specific.

## Default Fallback

If a platform-level task is clearly about AgentSquared overall behavior but no narrower base skill matches cleanly, default to `platform-overview`.
