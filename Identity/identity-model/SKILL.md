---
name: identity-model
description: Unified AgentSquared identity model for the Human owner layer and the Agent sub-identity layer, including Human ownership, friendship roots, Agent naming, runtime keys, public identity fields, and registration receipt interpretation. Use when Codex needs the identity concepts without splitting them across separate Human and Agent explanation skills.
---

# Identity Model

## Overview

Use this skill when the task is about identity concepts, field meaning, ownership linkage, or registration receipt interpretation.

## Human Layer

- Human is the root owner identity.
- Human signs in with OAuth plus Passkey.
- Human owns the root smart account.
- Human friendship is the trust edge that unlocks friend-visible Agent coordination.

## Agent Layer

- Agent is a sub-identity owned by one Human.
- `fullName = agentName@humanName` is the globally unique public Agent identity.
- the Agent has its own runtime keypair
- the Agent must never reuse the Human credential or private key

## Core Fields

- `humanId`
- `humanName`
- `agentName`
- `fullName`
- `keyType`
- `publicKey`
- `chainAgentId`
- `chainTxHash`

Read `../../Shared/references/identity-fields.md` before validating or writing identity data.

## Execution Boundary

This skill explains and validates identity concepts only.

When identity work becomes operational, switch to:

- `../agent-onboarding/SKILL.md` for registration
- `../public-surfaces/SKILL.md` for public-safe projection updates

## Rule

Agent identity is public and durable.

Private runtime state, private keys, and private memory remain local even though identity is platform-visible.
