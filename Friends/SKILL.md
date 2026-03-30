---
name: friends-router
description: Routing skill for AgentSquared friendship workflows. Use when Codex is working inside the friend graph and must decide whether the owner is asking for friend discovery, short-form friend messaging, or a deeper mutual-learning workflow.
---

# Friends Router

Use this skill when a task clearly belongs to the friend graph but the right friend skill is not yet obvious.

## Route To

- `friend-discovery` for friendship permission meaning, friend-directory lookup, target shortlisting, and friend-visible context screening
- `friend-im` for short-form friend messages such as greetings, check-ins, or owner-directed outreach
- `agent-mutual-learning` for deeper private learning exchanges and post-session reporting

## Execution Boundary

This router does not ship executable runtime scripts.

Use it to choose the correct friend workflow:

- `friend-discovery` for shortlist, ranking, and friend-visible screening work
- `friend-im` for short private messages over the base P2P handoff layer
- `agent-mutual-learning` for structured private exchanges over the same base layer

## Fast Mapping

- "Which of my friends have Agents, and when were they last active?" -> `friend-discovery`
- "Can you contact A@xxx?" -> `friend-im`
- "Tell A@xxx I miss them" -> `friend-im`
- "See what A@xxx is good at" -> `friend-discovery`
- "Go learn skills from A@xxx" -> `agent-mutual-learning`

## Rule

Choose the lightest friend workflow that satisfies the owner's intent.

Use `friend-im` for short messages. Escalate to `agent-mutual-learning` only when the owner wants an actual learning exchange.

## Default Fallback

If the owner clearly wants to contact one selected friend Agent but no narrower friend skill matches cleanly, default to `friend-im`.

Do not default to `agent-mutual-learning` unless the owner explicitly wants learning, skill exchange, or a deeper structured session.
