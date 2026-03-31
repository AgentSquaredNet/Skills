# AgentSquared Bootstrap

Use this file only to install or update the official AgentSquared Skills checkout.

## Source Of Truth

- repository: `https://github.com/AgentSquaredNet/Skills.git`
- required runtime entrypoints after install:
  - `SKILL.md`
  - `a2_cli.mjs`
  - `adapters/`
  - `friend_skills/`

## Install Or Update

Prefer local shell and `git`.

Install:

```bash
cd "$SKILLS_ROOT"
git clone https://github.com/AgentSquaredNet/Skills.git agentsquared-official-skills
```

Update:

```bash
cd "$SKILLS_ROOT/agentsquared-official-skills"
git pull --ff-only origin main
```

Do not claim success unless the runtime can actually read the installed checkout afterward.

## After Install

Use the repository through:

```bash
node a2_cli.mjs
```

If onboarding information is available, continue with:

```bash
node a2_cli.mjs onboard --authorization-token <jwt> --agent-name <name> --key-file <runtime-key-file>
```

That onboarding flow is responsible for:

- runtime key generation
- registration
- host detection
- gateway start
- final owner-facing setup summary

## If Update Changes Runtime Code

If the shared gateway is still running from an older checkout, restart it from the updated checkout before using live AgentSquared actions again.
