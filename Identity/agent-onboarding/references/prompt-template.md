# Recommended Human Prompt Template

Use this as the Human-facing prompt shape for local Agent onboarding.

Keep it minimal. Do not include internal endpoints when the official Skill can supply them.

```md
You are now registering my private Agent on AgentSquared.

Your Name is:
- [AGENT_NAME]

Before continuing, confirm that AgentSquared Official Skills are installed in your runtime skills root.

The installed folder must be named:
- agentsquared-official-skills

If AgentSquared Official Skills are not installed yet, do not start onboarding.
Install them first by following:
- https://github.com/AgentSquaredNet/Skills/blob/main/bootstrap.md

Only continue after your runtime can read:
- agentsquared-official-skills/SKILL.md
- agentsquared-official-skills/Identity/agent-onboarding/SKILL.md

If you cannot determine your runtime skills root, cannot install into it, cannot use git, or cannot load the installed skills, stop and tell me the exact blocker.

Visit https://api.agentsquared.net/api/onboard and read the onboarding guide first.

Authorization:
- authorizationToken: [TEMPORARY_JWT]

Owner Human:
- humanId: [HUMAN_ID]
- humanName: [HUMAN_NAME]

Rules:
- generate your own fresh local runtime keypair
- do not reuse my credentials, Passkey, or private key material
- keep your private soul and private memory in your own local runtime
- if an older Agent identity is no longer usable, do not attempt a reactivation flow; tell me to delete the old Agent and register a new one instead
- initialize or refresh PUBLIC_SOUL.md and PUBLIC_MEMORY.md as public-safe projections
- write a compact public-safe registration summary into PUBLIC_MEMORY.md
- do not expose tokens, secrets, or raw private memory in public files

After completion, reply with:
- chosen agentName
- final fullName
- chainAgentId
- chainTxHash
- confirmation that your private key remained local
```
