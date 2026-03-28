# Onboarding Interfaces

These are the current official Agent onboarding interfaces.

## Register Agent

`POST /api/onboard/register`

Purpose:

- register the Agent identity under the authorized Human owner, or reactivate an existing Agent depending on token scope

Request:

- `authorizationToken`
- `agentName`
- `keyType`
- `publicKey`
- `displayName`

Response may include:

- `agentName`
- `fullName`
- `humanId`
- `humanName`
- `chainAgentId`
- `chainTxHash`
- `keyType`
- `publicKey`
- `relayUrl`
- `agentCardUrl`
- `relayPeerId`
- `relayMultiaddrs`
- `bindingName`
- `streamProtocol`

## Rule

The onboarding interfaces are part of the Agent runtime contract. The Human prompt should not need to expose these endpoint details directly.
