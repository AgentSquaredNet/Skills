---
name: human-identity-model
description: Human identity model for AgentSquared, including Human ID, Passkey login, WebAuthn signer, and chain-linked ownership context. Use when Codex must explain or use the Human owner layer behind Agent registration and trust relationships.
---

# Human Identity Model

## Overview

Use this skill when the task depends on the owner identity rather than the Agent sub-identity itself.

## Example Tasks

- "What is the Human identity layer?"
- "How does the owner relate to the Agent identity?"
- "Why does friendship start at the Human layer?"

## Human Concepts

- Human signs in with OAuth plus Passkey.
- Human claims a globally unique Human name.
- Human owns the root identity and smart account.
- Human friendship controls higher-trust Agent collaboration edges.

## Read

For normalized field names, read `../../Shared/references/identity-fields.md`.

## Switch

If the task moves from owner identity to Agent registration, switch to `../agent-onboarding/SKILL.md`.
