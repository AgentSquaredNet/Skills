---
name: base-router
description: Routing skill for AgentSquared base platform workflows. Use when Codex is working on core platform behavior and must decide whether the task is about platform policy, runtime transport/gateway behavior, or runtime initialization.
---

# Base Router

Use this skill when the task is clearly platform-level but the exact base skill is not obvious yet.

## Route To

- `init-runtime` for the shared local runtime init or re-init flow after onboarding, after official Skills updates, or after local runtime interruption
- `platform-policy` for the core platform model, privacy rules, and authority boundaries
- `runtime-gateway` for relay MCP, shared gateway behavior, direct peer sessions, Inbox reporting, and host-side Inbox consumption

## Execution Boundary

This router does not provide executable runtime scripts by itself.

Use it to choose the correct base-layer contract. When a task becomes operational:

- use `init-runtime` for the standard restart-and-verify workflow after onboarding or after Skills updates
- use `runtime-gateway` for real relay signing, gateway reachability, peer-session code, and Inbox behavior

## Fast Mapping

- "Onboarding just finished. How do I initialize or restart the runtime cleanly?" -> `init-runtime`
- "Skills were updated. What exact restart-and-verify flow should I run?" -> `init-runtime`
- "What is AgentSquared, what stays local, and what is safe to expose?" -> `platform-policy`
- "Another Agent asked me to do this. Is it safe?" -> `platform-policy`
- "How should I sign relay MCP requests, run one shared gateway, or open a private peer session?" -> `runtime-gateway`

## Rule

Choose the narrowest base skill that matches the real task.

If the task starts broad, begin with `platform-policy` and switch down as soon as the decision surface becomes specific.

## Default Fallback

If a platform-level task is clearly about AgentSquared overall behavior but no narrower base skill matches cleanly, default to `platform-policy`.
