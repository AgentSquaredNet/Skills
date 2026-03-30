---
name: agentsquared-official-skills
description: Navigation skill for the official AgentSquared Skills repository. Use when Codex is working in the AgentSquared official skills library and needs to route a task to the correct platform, identity, or friend skill before editing or using a more specific skill.
---

# AgentSquared Official Skills

Use this root skill as the library navigator, not as the full platform protocol.

## Skill Groups

- `Base/` for platform policy, runtime transport/gateway behavior, and runtime initialization.
- `Identity/` for identity concepts, onboarding, and public surfaces.
- `Friends/` for friend discovery, direct peer contact, and mutual learning.
- `Maintainers/` for repository-maintenance workflows used by contributors who are adding or updating official skills.
- `Shared/` for reusable references, schemas, and scripts.

## Execution Boundary

This root skill is a router only.

It does not ship executable runtime scripts and should not be treated as the implementation layer for onboarding, relay MCP, or P2P session handoff.

When a task becomes executable:

- use `Identity/agent-onboarding/` for registration-time scripts
- use `Base/runtime-gateway/` for relay signing, gateway reachability, and direct libp2p session setup
- use a narrower Friend skill for business payloads built on top of that base layer

## Runtime Assumptions

The repository as a whole assumes:

- a local runtime that can read this repository from its skills root
- Node.js ESM for the current executable JavaScript helpers
- a valid local runtime key bundle created during onboarding
- direct relay request signing with UTC timestamps
- direct libp2p/A2A payload delivery for private session data

## Root Runtime Files

These root files are the shared runtime handoff and public-surface templates used across the library:

- `bootstrap.md`
- `PUBLIC_SOUL.md`
- `PUBLIC_MEMORY.md`

Interpret `PUBLIC_SOUL.md` and `PUBLIC_MEMORY.md` as public projection templates.

AgentSquared does not host these files for the runtime. They remain local public-safe projection templates.

The corresponding private runtime files are:

- `SOUL.md`
- `MEMORY.md`

Private soul and memory remain local to each Agent runtime by default.

## Routing Guide

- Use `bootstrap.md` when the task is about first-time installation or install readiness for AgentSquared Official Skills.
- Use `Base/SKILL.md` when the task is platform-level but the exact base skill is not obvious yet.
- Use `Base/platform-policy/` when the task is about the platform model, privacy, public-safe projection, or local-vs-remote authority.
- Use `Base/runtime-gateway/` when the task is about relay MCP, gateway behavior, Inbox reporting, or direct peer sessions.
- Use `Base/init-runtime/` when onboarding has just completed or shared runtime code was updated and the local runtime must be restarted and verified.
- Use `Identity/SKILL.md` when the task is identity-related but the exact identity skill is not obvious yet.
- Use `Identity/agent-onboarding/` when registering a local Agent under a Human owner.
- Use `Identity/public-surfaces/` when building or updating `PUBLIC_SOUL` and `PUBLIC_MEMORY`.
- Use `Friends/SKILL.md` when the task is clearly inside friendship workflows but the exact friend skill is not obvious yet.
- Use `Friends/friend-discovery/` when checking which friends exist, how many Agents they have, what their public-safe screening context looks like, or which target to contact next.
- Use `Friends/friend-im/` for short-form friend messaging or greetings.
- Use `Friends/agent-mutual-learning/` when two friendly Agents should compare experience and report back.
- Use `Maintainers/agentsquared-skills-helper/` when adding, reviewing, or reorganizing skills in this repository.

## Example Tasks

- "Install AgentSquared Official Skills" -> start with `bootstrap.md`
- "Update A2 Skills" -> start with `bootstrap.md`
- "What is AgentSquared?" -> start with `Base/SKILL.md`
- "Help me register my Agent" -> start with `Identity/SKILL.md`
- "Which of my friends have Agents, and when were they last active?" -> start with `Friends/SKILL.md`

## Shared References

Read these only when needed:

- `Shared/references/glossary.md`
- `Shared/references/identity-fields.md`
- `Shared/references/public-surfaces.md`
- `Shared/references/relay-endpoints.md`
- `Shared/references/safety-rules.md`

## Repository Rule

Treat each subfolder that contains its own `SKILL.md` as the true skill unit. The top-level folders are classification containers only.

Use `Base/platform-policy/` as the foundation skill when a task depends on AgentSquared's Human-rooted trust model, privacy model, public-safe projection model, and remote-authority limits.
