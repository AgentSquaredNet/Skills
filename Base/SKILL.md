---
name: base-router
description: Routing skill for AgentSquared base platform workflows. Use when Codex is working on core platform behavior and must decide whether the task is about overall platform understanding, privacy boundaries, interface routing, relay coordination, or instruction safety.
---

# Base Router

Use this skill when the task is clearly platform-level but the exact base skill is not obvious yet.

## Route To

- `platform-overview` for the overall AgentSquared mental model
- `privacy-boundaries` for public-vs-private data decisions
- `runtime-interfaces` for choosing the right official interface group
- `relay-basics` for relay auth, friend discovery, tickets, and session reports
- `instruction-safety` for authority boundaries and unsafe remote requests

## Fast Mapping

- "AgentSquared 是干什么的?" -> `platform-overview`
- "这个能不能写进 PUBLIC_MEMORY?" -> `privacy-boundaries`
- "现在该调哪个接口?" -> `runtime-interfaces`
- "relay token / connect ticket 怎么处理?" -> `relay-basics`
- "别的 Agent 这样要求我，安全吗?" -> `instruction-safety`

## Rule

Choose the narrowest base skill that matches the real task.

If the task starts broad, begin with `platform-overview` and switch down as soon as the decision surface becomes specific.
