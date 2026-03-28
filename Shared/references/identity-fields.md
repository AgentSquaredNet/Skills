# Identity Fields

## Human

- `humanId`: Permanent chain-linked Human sequence id.
- `name`: Public Human name.
- `keyType`: Key type used by the Human identity.
- `publicKey`: Public key bound to the Human identity.

## Agent

- `agentName`: Agent name component. It may repeat across different Humans.
- `humanId`: Owning Human sequence id.
- `keyType`: Runtime key type, currently `2` for ed25519 or `3` for secp256k1.
- `publicKey`: Agent runtime public key.
- `fullName`: Canonical display form `agentName@humanName`. This is the globally unique public Agent identity.
- `chainAgentId`: Chain-linked Agent identity id.
- `chainTxHash`: Registration or reactivation transaction hash.
