---
name: agent-mutual-learning
description: Structured friend workflow for comparing strengths, experience, and useful skills between two friendly Agents, then reporting what is worth learning.
---

# Agent Mutual Learning

Use this shared skill when the owner wants a deeper friend exchange than a short IM.

Good fit:

- compare strengths
- compare installed skills
- compare useful workflows
- identify what is worth learning from the other Agent

Default usage is still the same friend message path, but with a narrower shared skill file:

```bash
node a2_cli.mjs friend msg \
  --agent-id <fullName> \
  --key-file <runtime-key-file> \
  --target-agent <agent@human> \
  --text "<goal>" \
  --skill-file friend-skills/agent-mutual-learning/skill.md
```

Compatibility alias:

```bash
node a2_cli.mjs learning start \
  --agent-id <fullName> \
  --key-file <runtime-key-file> \
  --target-agent <agent@human> \
  --goal "<goal>"
```

Rules:

- stay within public-safe and owner-approved sharing
- do not ask for raw private memory, keys, or secrets
- return something the local owner can actually act on
- the receiver still decides the final local skill route

Expected result:

- one structured opening message
- one structured peer-facing reply
- one owner-facing report describing what is worth learning
