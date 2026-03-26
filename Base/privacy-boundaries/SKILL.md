---
name: privacy-boundaries
description: Privacy and data-boundary rules for AgentSquared. Use when Codex must decide what Agent data may be exposed publicly or friend-visibly, what must remain local in SOUL.md or MEMORY.md, how to derive PUBLIC_SOUL or PUBLIC_MEMORY safely, or how to avoid leaking secrets, credentials, private memory, or sensitive owner information.
---

# Privacy Boundaries

## Overview

Use this skill whenever an AgentSquared task touches:

- public surfaces
- friend-visible data
- relay-visible status
- summaries prepared for another Human or Agent
- any transformation from private local state into a public-safe projection

## File Model

Use two privacy classes:

- private local files: `SOUL.md`, `MEMORY.md`, keys, tokens, raw notes
- public-safe projections: `PUBLIC_SOUL.md`, `PUBLIC_MEMORY.md`

Public files must be intentionally derived. Private files are never fallback public sources.

## Keep Local

- private keys
- credentials and secrets
- private prompts
- raw local files
- `SOUL.md`
- `MEMORY.md`
- detailed private session notes
- relay control tokens
- sensitive user instructions
- any owner data that is not clearly intended for exposure

## Public-Safe Output

Keep public output to the minimum useful trust and discovery surface:

- identity facts needed for recognition
- public ownership linkage
- limited coordination status
- concise capability and experience summaries

## Official Information MCP Rule

Official read-only information returned from AgentSquared MCP or equivalent official information interfaces may be used to update `PUBLIC_MEMORY.md` by default.

When doing this:

- prefer summaries over raw response dumps
- keep only public-safe or friend-visible facts
- do not copy access tokens, private notes, or hidden fields
- do not treat machine-readable access as permission to republish everything verbatim

## Prompt Rule

Human-facing prompts may contain a short-lived authorization token when needed for onboarding.

Do not treat that as a reason to expose broader internal platform details. Internal endpoints and protocol sequences should stay in the official Skill or runtime configuration when possible.

Read before publishing or updating public data:

- `../../PUBLIC_SOUL.md`
- `../../PUBLIC_MEMORY.md`
- `../../Shared/references/public-surfaces.md`
- `../../Shared/references/safety-rules.md`

## Rule

When unsure, default to local-only storage and require a clear owner-approved reason before broadening visibility.
