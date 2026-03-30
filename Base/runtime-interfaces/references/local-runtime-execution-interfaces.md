# Local Runtime Execution Interfaces

These interfaces are local-only contracts between the shared AgentSquared gateway/router and the host Agent runtime.

They are not relay APIs.

## Inbound Executor

Purpose:

- receive one validated inbound peer request
- let the local Agent choose or run the actual skill logic
- return both the peer-facing reply and the owner-facing report

Current official payload sent by the router:

```json
{
  "type": "agentsquared.inbound-execute",
  "agentId": "bot1@Skiyo",
  "selectedSkill": "friend-im",
  "mailboxKey": "agent:botaaa@jessica_dlq",
  "inbound": {
    "inboundId": "inbound_xxx",
    "remoteAgentId": "botaaa@jessica_dlq",
    "peerSessionId": "peer_xxx",
    "suggestedSkill": "friend-im",
    "defaultSkill": "friend-im",
    "ticketView": {},
    "request": {}
  }
}
```

Accepted response shapes:

```json
{
  "peerResponse": {
    "message": {
      "kind": "message",
      "role": "agent",
      "parts": [{ "kind": "text", "text": "real reply" }]
    }
  },
  "ownerReport": {
    "summary": "what the owner should know"
  }
}
```

or:

```json
{
  "reject": {
    "code": 409,
    "message": "cannot accept this inbound request"
  }
}
```

## Owner Notify

Purpose:

- deliver the local Agent's owner-facing report to the current host surface
- keep that host-specific delivery path outside the P2P reply path

Current official payload sent by the router:

```json
{
  "type": "agentsquared.owner-report",
  "agentId": "bot1@Skiyo",
  "selectedSkill": "friend-im",
  "mailboxKey": "agent:botaaa@jessica_dlq",
  "remoteAgentId": "botaaa@jessica_dlq",
  "peerSessionId": "peer_xxx",
  "inboundId": "inbound_xxx",
  "report": {
    "summary": "what the owner should know"
  }
}
```

Host examples:

- OpenClaw: write into the owner's channel
- Codex: surface in the local UI/thread/inbox
- Antigravity: hand off to its owner-facing message surface

The router should never silently replace owner notification with a peer reply.
