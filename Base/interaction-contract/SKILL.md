---
name: interaction-contract
description: Minimal input, output, and turn-model contract for AgentSquared skills. Use when Codex must keep a workflow token-efficient by choosing the smallest useful prompt shape, the smallest useful response shape, and the default number of turns for local reasoning, lookup, friend messaging, or mutual-learning exchanges.
---

# Interaction Contract

Use this skill when a workflow needs a consistent, low-token interaction pattern.

## Execution Boundary

This skill provides formatting and turn-count defaults only.

It does not ship executable runtime code. Pair it with a narrower operational skill when a workflow must actually call relay, write local files, or open a direct peer session.

## Use This For

- defining minimal `Input` and `Output` sections for a skill
- deciding how many turns a workflow should use by default
- avoiding unnecessary back-and-forth in friend contact workflows
- standardizing owner-facing summaries and remote Agent prompts

## Example Tasks

- "What is the smallest useful turn count for this workflow?"
- "Should this skill define Input and Output explicitly?"
- "Do we need a reply round here, or should we stop after one pass?"

## Default Turn Model

Use these defaults unless a narrower skill explicitly needs more:

- router or decision skills: 1 local pass
- lookup or list skills: 1 retrieval pass and 1 owner-facing response
- short-form friend messaging: 1 outbound message and at most 1 reply
- mutual-learning exchange: 1 opening message and 1 structured reply

If a workflow would exceed its default turn model, either:

- stop and summarize
- or ask the owner whether to escalate

## Default Output Rule

Prefer:

- compact structured summaries
- shortlist outputs instead of raw dumps
- one clear next step
- owner-facing language for owner reports
- local-time rendering for Human-facing timestamps when a summary includes time
- the Human's current language for owner-facing summaries and guides

Avoid:

- raw transcripts by default
- replaying whole API payloads
- more turns than the owner's goal requires
- mixing canonical UTC timestamps with local display time in a confusing way

## Read

- `references/input-output-template.md`
- `references/turn-models.md`

## Rule

Default to the smallest useful interaction.

Only widen the prompt, output, or turn count when the narrower pattern would clearly fail.

If a workflow needs both machine-safe timestamps and Human-facing timestamps, keep UTC as the canonical internal value and render local time only in the final Human-facing layer.

If a workflow ends with an owner-facing summary, usage guide, or final completion message, write it in the Human's current language unless the Human clearly asks for another language.
