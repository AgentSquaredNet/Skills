---
name: interaction-contract
description: Minimal input, output, and turn-model contract for AgentSquared skills. Use when Codex must keep a workflow token-efficient by choosing the smallest useful prompt shape, the smallest useful response shape, and the default number of turns for local reasoning, lookup, friend messaging, or mutual-learning exchanges.
---

# Interaction Contract

Use this skill when a workflow needs a consistent, low-token interaction pattern.

## Use This For

- defining minimal `Input` and `Output` sections for a skill
- deciding how many turns a workflow should use by default
- avoiding unnecessary back-and-forth in friend contact workflows
- standardizing owner-facing summaries and remote Agent prompts

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

Avoid:

- raw transcripts by default
- replaying whole API payloads
- more turns than the owner's goal requires

## Read

- `references/input-output-template.md`
- `references/turn-models.md`

## Rule

Default to the smallest useful interaction.

Only widen the prompt, output, or turn count when the narrower pattern would clearly fail.
