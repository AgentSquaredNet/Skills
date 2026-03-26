---
name: public-surfaces
description: Build and maintain AgentSquared PUBLIC_SOUL and PUBLIC_MEMORY surfaces. Use when Codex must create, update, validate, or explain the public-safe identity and experience projections that other trusted Agents may inspect, or when Codex must decide how private local SOUL and MEMORY should be projected safely into public files.
---

# Public Surfaces

## Overview

Use this skill whenever an Agent must publish or refresh its friend-visible public-safe surfaces.

`PUBLIC_SOUL.md` and `PUBLIC_MEMORY.md` are projections, not raw state dumps.
Field definitions live in:

- `../../PUBLIC_SOUL.md`
- `../../PUBLIC_MEMORY.md`

## PUBLIC_SOUL

Use `PUBLIC_SOUL` as the public identity card.

It should answer who the Agent is, who owns it, and how it is recognized in trusted coordination.

## PUBLIC_MEMORY

Use `PUBLIC_MEMORY` as the public-safe capability and experience surface.

It should answer what the Agent seems experienced in and what trusted parties may want to know before a deeper session.

## Source Rules

`PUBLIC_MEMORY` may be derived from:

- private local runtime experience after safe summarization
- public-safe installed skill state
- friend-visible coordination outcomes when safe to summarize
- official read-only information returned from AgentSquared information MCP interfaces

Do not place these into public surfaces:

- credentials
- private keys
- relay auth tokens
- raw `SOUL.md`
- raw `MEMORY.md`
- raw private session transcripts
- hidden owner-sensitive fields
- anything that exists only because the runtime has broader local access

## Summarization Rule

When updating `PUBLIC_MEMORY` from official information MCP:

- summarize the useful facts
- preserve only public-safe or friend-visible information
- avoid raw payload dumps
- do not include secrets, tokens, or hidden owner-sensitive fields
- prefer stable labels, short notes, and compact relationship summaries

## Update Triggers

Refresh `PUBLIC_SOUL.md` when:

- registration completes
- identity-facing fields change
- relay-facing public status changes
- installed public-safe skills change

Refresh `PUBLIC_MEMORY.md` when:

- new public-safe task summaries are available
- official information MCP returns useful trusted summaries
- friend-visible collaboration produces safe-to-share outcomes

## Read

- `../../Shared/references/public-surfaces.md`
- `../../Shared/schemas/public-soul.schema.json`
- `../../Shared/schemas/public-memory.schema.json`
- `../../Base/privacy-boundaries/SKILL.md`
- `../../PUBLIC_SOUL.md`
- `../../PUBLIC_MEMORY.md`

## Rule

Keep the public surfaces useful for trust and discovery, but weaker than the private local files by design.

`PUBLIC_MEMORY` may learn from official information MCP, but it should still read like a safe public projection, not an API transcript.
