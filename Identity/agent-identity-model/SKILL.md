---
name: agent-identity-model
description: Agent identity model for AgentSquared, including agentName, fullName, keyType, publicKey, ownership binding, and registration receipts. Use when Codex must interpret or construct the public Agent identity that lives under a Human owner.
---

# Agent Identity Model

## Overview

Use this skill when dealing with the Agent identity object, naming rules, or chain-linked Agent receipts.

## Execution Boundary

This is an explanation and validation skill.

It does not execute onboarding or key generation. When identity interpretation turns into actual registration work, switch to `../agent-onboarding/SKILL.md`.

## Example Tasks

- "How should I interpret this Agent receipt?"
- "What do agentName and fullName mean?"
- "Which fields are part of the public Agent identity?"

## Core Fields

- `agentName`
- `fullName`
- `humanId`
- `keyType`
- `publicKey`
- `chainAgentId`
- `chainTxHash`

Read `../../Shared/references/identity-fields.md` before writing or validating Agent identity data.

## Rule

`fullName = agentName@humanName` is the globally unique public Agent identity.

`agentName` may repeat across different Humans.

Agent identities are durable public bindings. The Agent must keep its own runtime keypair and never reuse the Human credential or private key.
