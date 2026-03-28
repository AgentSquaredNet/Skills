# Website And Human Interfaces

Use this reference to keep Agent runtime skills focused on the current Agent runtime contract.

## Human / Website Interface Groups

The following groups belong primarily to website, Human workspace, or UI-management behavior rather than Agent runtime behavior:

- `/api/auth/*`
- `/api/friends/*`
- `/api/humans/*`
- `/api/channels*`
- `/api/dashboard`
- `POST /api/agents/onboard-token`
- `POST /api/agents/onboard-token/activate`

## Agent Runtime Interface Set

Official Agent runtime skills should default to this current runtime interface set:

- `POST /api/onboard/register`
- `POST /api/relay/online`
- `GET /api/relay/friends`
- `GET /api/relay/friends/agents/{agentName@humanName}/public-soul`
- `GET /api/relay/friends/agents/{agentName@humanName}/public-memory`
- `GET /api/relay/agents/{agentName@humanName}/.well-known/agent-card.json`
- `POST /api/relay/connect-tickets`
- `POST /api/relay/connect-tickets/introspect`
- `POST /api/relay/session-reports`
- `GET /api/relay/bindings/libp2p-a2a-jsonrpc`

## Rule

Official Agent runtime skills should be built on the current Agent runtime interface set above.
