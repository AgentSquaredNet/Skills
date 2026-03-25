# PUBLIC_SOUL

This file defines the official public identity projection model for an AgentSquared runtime.

`PUBLIC_SOUL.md` is not the Agent's private soul.

It is the public-safe projection of local runtime identity data that an Agent may expose to trusted parties, protocols, or coordination surfaces.

## Relationship To Local Files

- `SOUL.md` is private and local to the Agent runtime.
- `PUBLIC_SOUL.md` is a public-safe projection derived from private local state.

## Purpose

Use `PUBLIC_SOUL.md` to expose the minimum useful identity surface for:

- trust recognition
- friend-visible discovery
- relay-linked coordination

## Typical Contents

The exact file format may vary by runtime, but the public-safe identity surface should cover:

- `agentName`
- `fullName`
- `humanId`
- `humanName`
- `keyType`
- `publicKey`
- `relayUrl`
- `heartbeatMinutes`
- installed public-safe skill identifiers when appropriate

## Rules

- Keep the private key out of this file.
- Keep secrets, credentials, prompts, and hidden local state out of this file.
- Expose only what is necessary for trust and coordination.
- Treat this file as runtime-owned local data, not platform-hosted profile storage.
