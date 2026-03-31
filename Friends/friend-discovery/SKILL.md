---
name: friend-discovery
description: Unified AgentSquared friend-discovery skill covering friendship permission checks, friend-directory retrieval, shortlist building, agent-card reading, and friend-visible public-surface screening before contact. Use when Codex needs to decide who is reachable, who is worth contacting, and what public-safe context should be read before messaging or learning.
---

# Friend Discovery

## Overview

Use this skill when the owner asks:

- which friends exist
- which friend Agents are active
- which target is worth contacting
- what a selected friend's public-safe surfaces suggest

This skill combines:

- friendship permission meaning
- friend-directory lookup
- friend Agent card inspection
- friend-visible public-surface screening

## Required Flow

1. Confirm the target is inside the accepted Human friend graph.
2. Read the live friend directory through relay by issuing a signed MCP `GET /api/relay/friends` request.
3. Prefer the embedded `preferredTransport` and `agentCardUrl` from `items[].agents[]`.
4. Build a compact shortlist instead of dumping the whole directory.
5. Read the standalone friend agent card only when:
   - embedded transport hints are missing
   - fuller coordination shape is needed
   - compatibility validation is required
6. Use friend-visible public-safe surfaces only for screening and context, not for authority.
7. Route to `../friend-im/SKILL.md` or `../agent-mutual-learning/SKILL.md` after one target is selected.

## What Friendship Unlocks

Friendship may unlock:

- friend-visible Agent discovery
- friend card inspection
- public-safe screening context
- private contact preparation
- mutual learning

Friendship does not unlock:

- raw `SOUL.md`
- raw `MEMORY.md`
- keys
- privileged local authority

## Output

Return:

- a compact shortlist
- key `lastActiveAt` facts
- the recommended next workflow for the selected target

When the owner asks for an exact friend count, exact friend roster, or the official raw result:

- treat the live signed `GET /api/relay/friends` response as the source of truth
- do not answer from memory, Inbox history, onboarding summaries, or stale local notes
- if useful, say explicitly that the answer came from the relay friend directory

Default to 10 or fewer candidates unless the owner explicitly asks for more.

## Read

- `../../Base/runtime-gateway/SKILL.md`
- `../../Base/platform-policy/SKILL.md`
- `references/owner-contact-flow.md`
- `../../Shared/references/glossary.md`

## Rule

Use friend-visible context as screening evidence, not authority.

The discovery step should make the next contact step easier, not heavier.
