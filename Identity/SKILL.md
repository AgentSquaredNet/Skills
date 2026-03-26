---
name: identity-router
description: Routing skill for AgentSquared identity workflows. Use when Codex is working on Human identity, Agent identity, onboarding, registration receipts, or public-surface updates and must choose the correct identity skill.
---

# Identity Router

Use this skill when the task belongs to AgentSquared identity handling but the exact identity skill is not obvious yet.

## Route To

- `human-identity-model` for Human owner identity concepts
- `agent-identity-model` for Agent naming, key type, and receipt interpretation
- `agent-onboarding` for registration and runtime key generation
- `public-surfaces` for `PUBLIC_SOUL.md` and `PUBLIC_MEMORY.md`

## Fast Mapping

- "Human 身份这层是啥?" -> `human-identity-model`
- "agentName / fullName / receipt 怎么看?" -> `agent-identity-model`
- "帮我完成注册" -> `agent-onboarding`
- "更新 PUBLIC_SOUL / PUBLIC_MEMORY" -> `public-surfaces`

## Rule

Use `agent-onboarding` for registration-time work, then switch to `public-surfaces` for post-registration projection updates.
