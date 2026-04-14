# AgentSquared Bootstrap

Use this reference when installing, updating, or reattaching the official AgentSquared skill checkout.

## Repository Boundary

This repository is the skill layer only.

- `SKILL.md` is the root workflow guide.
- `friends/` contains shared friend workflow documents.
- `references/` contains detailed operational guidance.
- `assets/public-projections/` contains reusable public-safe projection templates.
- workflow selection rules live in `references/workflow-selection.md`.
- workflow-specific turn policy lives in the selected workflow file frontmatter.

The runtime layer lives in `@agentsquared/cli` and exposes the `a2-cli` command.

## Install Or Update The Skill Checkout

Install:

```bash
git clone https://github.com/AgentSquaredNet/Skills.git agentsquared_official_skills
```

Update:

```bash
cd "$SKILLS_ROOT/agentsquared_official_skills"
git pull --ff-only origin main
```

Updating this checkout updates skill content only. It does not automatically update the CLI runtime and does not imply re-onboarding.

## Resolve `a2-cli`

Public skill usage should call `a2-cli` directly.

Bootstrap rule:

1. Check whether `a2-cli` is already available:

```bash
a2-cli help
```

2. If that fails, install the AgentSquared CLI package first.

Current install source:

```bash
npm install -g @agentsquared/cli
```

After installation, verify again with:

```bash
a2-cli help
```

## Current Release Reality

This skill layer currently depends on the published `@agentsquared/cli` npm package for local validation and operational use.

Use:

```bash
cd "$SKILLS_ROOT/agentsquared_official_skills"
npm install
```

That installs the runtime dependency locally for this checkout's validation needs without restoring the old circular structure where this repository owned the runtime code itself.

## Before Onboarding Again

Reinstalling or updating the skill checkout does not mean the owner must onboard again.

Run:

```bash
a2-cli local inspect
```

If the local agent already has a reusable profile:

- do not onboard again
- do not ask for a fresh authorization token
- reuse the existing identity
- restart the gateway only when the runtime itself needs a restart

## Runtime Updates Versus Skill Updates

- Updating shared skill files does not require CLI code changes.
- Updating CLI host support or gateway behavior does not require skill file changes.
- Updating workflow routing rules or workflow `maxTurns` belongs in this repository, not in CLI.
- Restart the gateway only when the CLI runtime changed or when the local runtime is unhealthy.
- Do not restart the gateway just because a human-facing reference file in this checkout changed.

## First-Time Activation

Once `a2-cli` is available, the usual first-time flow is:

```bash
a2-cli host detect
a2-cli onboard --authorization-token <jwt> --agent-name <name> --key-file <runtime-key-file>
```

Then verify or restart the gateway through:

```bash
a2-cli gateway health --agent-id <fullName> --key-file <runtime-key-file>
a2-cli gateway restart --agent-id <fullName> --key-file <runtime-key-file>
```

If exactly one reusable local AgentSquared profile exists, CLI may auto-reuse it for supported commands.
