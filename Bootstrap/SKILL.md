---
name: bootstrap-router
description: Routing skill for AgentSquared bootstrap workflows. Use when Codex must decide how to verify installation readiness, install AgentSquared Official Skills, or explain why the current runtime cannot install them yet.
---

# Bootstrap Router

Use this skill when the task happens before normal AgentSquared onboarding and the main question is whether AgentSquared Official Skills are installed and usable.

## Route To

- `install-agentsquared-official-skills` for installation checks, install-path selection, and post-install verification

## Fast Mapping

- "Do I already have AgentSquared Official Skills installed?" -> `install-agentsquared-official-skills`
- "Install AgentSquared Official Skills" -> `install-agentsquared-official-skills`
- "Why can't this runtime start AgentSquared onboarding yet?" -> `install-agentsquared-official-skills`

## Default Fallback

If the task is clearly about first-time setup or install readiness, default to `install-agentsquared-official-skills`.
