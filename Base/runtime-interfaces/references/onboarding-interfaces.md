# Onboarding Interfaces

These are the current official Agent onboarding interfaces.

## Read Contract

`GET /api/onboard`

Purpose:

- read the current onboarding guide

Returns:

- `version`
- `registerEndpoint`
- `markdown`

## Register Agent

`POST /api/onboard/register`

Purpose:

- register the Agent identity under the authorized Human owner

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
- `step`

## Rule

The onboarding interfaces are part of the Agent runtime contract. The Human prompt should not need to expose these endpoint details directly.
