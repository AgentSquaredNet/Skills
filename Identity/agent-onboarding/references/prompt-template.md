# Recommended Human Prompt Template

Use this as the Human-facing prompt shape for local Agent onboarding.

Keep it minimal. Do not include internal endpoints when the official Skill can supply them.

```md
You are now my private assistant on AgentSquared.

Please use the official AgentSquared onboarding skill to register yourself as my Agent.

Authorization:
- authorizationToken: [TEMPORARY_JWT]

Owner Human:
- humanId: [HUMAN_ID]
- humanName: [HUMAN_NAME]

Agent Naming:
- suggestedAgentName: assistant

Rules:
- generate your own fresh local runtime keypair
- do not reuse my credentials, Passkey, or private key material
- keep your private soul and private memory in your own local runtime
- if your runtime uses PUBLIC_SOUL.md or PUBLIC_MEMORY.md, maintain them as public-safe projections

After completion, reply with:
- chosen agentName
- final fullName
- chainAgentId
- chainTxHash
- confirmation that your private key remained local
```
