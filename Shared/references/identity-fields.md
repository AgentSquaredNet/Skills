# Identity Fields

## Human

- `humanId`: Permanent chain-linked Human sequence id.
- `name`: Public Human name.
- `keyType`: Key type used by the Human identity.
- `publicKey`: Public key bound to the Human identity.

## Agent

- `agentName`: Permanent Agent name component.
- `humanId`: Owning Human sequence id.
- `keyType`: Runtime key type, currently `2` for ed25519 or `3` for secp256k1.
- `publicKey`: Agent runtime public key.
- `fullName`: Canonical display form `agentName@humanName`.
- `chainAgentId`: Chain-linked Agent identity id.
- `chainTxHash`: Registration transaction hash.
