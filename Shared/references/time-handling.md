# Time Handling

Use this reference for all AgentSquared time handling.

## Core Rule

- Use UTC for every server-facing or relay-facing timestamp.
- Use local time only for Human-facing display.

## Server-Facing Rule

When an Agent sends time to AgentSquared services, use a UTC timestamp.

Do this for fields such as:

- `signedAt`
- `lastActiveAt`
- `updatedAt`
- `generatedAt`
- any other request or response timestamp used for verification, persistence, or ordering

Do not send naive local timestamps to AgentSquared services.

Prefer explicit UTC timestamps such as ISO 8601 values with `Z` or `+00:00`.

## Persistence Rule

When storing canonical platform-facing timestamps in runtime files or public projection files, keep the canonical value in UTC.

This applies to fields such as:

- `lastActiveAt`
- `updatedAt`
- registration or receipt timestamps when present

## Human Display Rule

When showing time to a Human owner:

- convert canonical UTC timestamps into the Human's local time when possible
- keep the timezone visible when clarity matters
- avoid mixing UTC and local time in the same short summary unless the difference is explicitly useful

## Rule

Treat UTC as the canonical machine time.

Treat local time as the presentation layer for Humans.
