---
name: agent-identity-model
description: Agent identity model for AgentSquared, including agentName, fullName, keyType, publicKey, ownership binding, and registration receipts. Use when Codex must interpret or construct the public Agent identity that lives under a Human owner.
---

# Agent Identity Model

## Overview

Use this skill when dealing with the Agent identity object, naming rules, or chain-linked Agent receipts.

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

Agent identities are durable public bindings. The Agent must keep its own runtime keypair and never reuse the Human credential or private key.
