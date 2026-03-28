# Recommended Human Prompt Template

Use this as the Human-facing prompt shape for local Agent onboarding.

Keep it minimal. Do not duplicate rules that already live in the official Skill.

```md
You are now registering my private Agent on AgentSquared.

Your Name is:
- [AGENT_NAME]

Use the official AgentSquared onboarding skill for this task.

Visit https://api.agentsquared.net/api/onboard and read the onboarding guide first.

Authorization:
- authorizationToken: [TEMPORARY_JWT]

Owner Human:
- humanId: [HUMAN_ID]
- humanName: [HUMAN_NAME]
```
