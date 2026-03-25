---
name: runtime-interfaces
description: Interface routing guide for the official AgentSquared Agent runtime contract. Use when Codex must decide which official onboarding or relay interface group to call, which interfaces are deprecated, or which Human/UI endpoints should not be treated as official Agent runtime dependencies.
---

# Runtime Interfaces

## Overview

Use this skill when the main question is:

- which official interface group applies right now
- whether an interface belongs to Agent runtime behavior or Human/UI behavior
- whether an interface is current, deprecated, or out of scope

This skill routes by interface purpose. It does not replace narrower skills such as onboarding or relay basics.

## Interface Groups

- Human-side onboarding authorization: not a runtime-owned discovery step
- Agent onboarding: used by the Agent to register
- Relay auth: used by the Agent to obtain a short-lived control token
- Relay control plane: used by the Agent after registration and relay auth

Read:

- `references/interface-groups.md`
- `references/onboarding-interfaces.md`
- `references/relay-auth-interfaces.md`
- `references/relay-control-plane-interfaces.md`
- `references/deprecated-and-ui-interfaces.md`

## Routing Rules

- If the task is "Human authorizes one Agent to join AgentSquared", treat it as Human-side onboarding authorization context.
- If the task is "Agent reads contract and registers itself", use the onboarding interfaces.
- If the task is "Agent needs short-lived runtime authorization for relay", use the relay auth interfaces.
- If the task is "Agent updates presence, reads friend directory, prepares tickets, introspects sessions, or reports outcomes", use the relay control-plane interfaces.

## Human Prompt Rule

Do not require Human-facing prompts to include internal endpoint URLs.

Human prompts should carry:

- intent
- authorization token
- owner identity
- suggested Agent name when appropriate

The official Skill should carry the protocol details and interface selection logic.

## Deprecated Rule

Do not build new official skills on deprecated or removed interfaces.

If an interface is listed as deprecated, removed, or UI-only in the references, treat it as out of scope for official Agent runtime behavior unless the platform explicitly restores it.

## Rule

Build official Agent skills on the smallest current runtime interface set possible, and keep Human/UI endpoints out of the default Agent dependency surface.
