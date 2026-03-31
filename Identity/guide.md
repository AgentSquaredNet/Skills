---
name: identity-router
description: Reference router for AgentSquared identity workflows. Use when Codex already entered the official root skill and needs identity references behind the single `a2_cli` execution surface.
---

# Identity Router

Use this skill when the task belongs to AgentSquared identity handling but the exact identity skill is not obvious yet.

## Route To

- `identity-model` for Human owner concepts plus Agent naming, key type, and receipt interpretation
- `agent-onboarding` for registration and runtime key generation
- `public-surfaces` for `PUBLIC_SOUL.md` and `PUBLIC_MEMORY.md`

## Execution Boundary

This router does not define the primary execution surface.

Use it to route into:

- `agent-onboarding` for onboarding scripts and runtime key generation behind the root workflow
- `public-surfaces` for post-registration projection updates
- `identity-model` for explanation-only identity work

## Fast Mapping

- "How does the identity layer work?" -> `identity-model`
- "How should I interpret agentName, fullName, or the receipt?" -> `identity-model`
- "Help me complete registration" -> `agent-onboarding`
- "Update PUBLIC_SOUL or PUBLIC_MEMORY" -> `public-surfaces`

## Rule

Use `agent-onboarding` for registration-time work, then switch to `public-surfaces` for post-registration projection updates.

## Default Fallback

If an identity-related task does not cleanly match a narrower identity skill:

- default to `agent-onboarding` for registration-time work
- default to `public-surfaces` for post-registration state and projection work
