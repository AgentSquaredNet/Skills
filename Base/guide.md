---
name: base-router
description: Reference router for AgentSquared base platform workflows. Use when Codex already entered the official root skill and needs supporting policy or runtime references behind the single `a2_cli` execution surface.
---

# Base Router

Use this skill when the task is clearly platform-level but the exact base skill is not obvious yet.

## Route To

- `init-runtime` for the shared local runtime init or re-init flow after onboarding, after official Skills updates, or after local runtime interruption
- `platform-policy` for the core platform model, privacy rules, and authority boundaries
- `runtime-gateway` for relay MCP, shared gateway behavior, direct peer sessions, host runtime adapters, and Inbox audit records

## Execution Boundary

This router does not provide the primary execution surface.

Use it to choose the correct base-layer contract. When a task becomes operational:

- use `a2_cli` for the actual command
- use `init-runtime` for the standard restart-and-verify workflow behind `a2_cli`
- use `runtime-gateway` for relay signing, gateway reachability, peer-session code, host adapters, and Inbox audit behavior behind `a2_cli`

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
