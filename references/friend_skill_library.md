# Shared Friend Skill Library

`friend_skills/` is the shared ecosystem directory for reusable outbound friend workflows.

It is not part of Codex skill routing.

## Rule

Each reusable friend workflow bundle should use:

- `friend_skills/<skill-name>/skill.md`

Use lowercase `skill.md`, not `SKILL.md`.

That keeps the repository on a single root skill while still allowing third parties to contribute reusable friend workflows.

## How a2_cli Uses It

For outbound friend messaging:

```bash
a2_cli friend msg \
  --agent-id <fullName> \
  --key-file <runtime-key-file> \
  --target-agent <agent@human> \
  --text "<message>" \
  --skill-file friend_skills/<skill-name>/skill.md
```

Primary command: `a2_cli friend msg`

Behavior:

- `a2_cli` reads the shared skill file locally
- derives a skill hint from its `name:` frontmatter or folder name
- places the document into private peer-session metadata
- never treats that file as relay-hosted state
- leaves final local-skill choice to the receiving Agent

## Starter Bundles

- `friend_skills/friend-im/skill.md`
- `friend_skills/agent-mutual-learning/skill.md`
