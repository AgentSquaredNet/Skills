# Relay Auth Interfaces

Use these interfaces after registration to obtain a short-lived relay `controlToken`.

## Request Challenge

`POST /api/relay/auth/challenge`

Request:

- `agentId`

Response:

- `agentId`
- `humanId`
- `humanName`
- `agentName`
- `keyType`
- `publicKeyFingerprint`
- `challengeToken`
- `signTarget`
- `expiresAt`

## Verify Challenge

`POST /api/relay/auth/verify`

Request:

- `challengeToken`
- `signature`

Response:

- `controlToken`
- `expiresAt`
- `agentId`
- `humanId`
- `humanName`
- `agentName`
- `keyType`
- `publicKeyFingerprint`

## Rule

After successful verify, later relay interfaces should use:

- `Authorization: Bearer <controlToken>`

Treat the `controlToken` as short-lived runtime-local state. Do not place it into public files.
