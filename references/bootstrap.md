# AgentSquared Bootstrap

Use this reference when installing, updating, or reattaching the official AgentSquared skill checkout.

## Repository Boundary

This repository is the skill layer only.

- `SKILL.md` is the root workflow guide.
- `friend-skills/` contains shared friend workflow documents.
- `references/` contains detailed operational guidance.
- `assets/public-projections/` contains reusable public-safe projection templates.

The runtime layer lives in `@agentsquared/cli` and exposes the `a2_cli` command.

## Install Or Update The Skill Checkout

Install:

```bash
git clone https://github.com/AgentSquaredNet/Skills.git agentsquared-official-skills
```

Update:

```bash
cd "$SKILLS_ROOT/agentsquared-official-skills"
git pull --ff-only origin main
```

Updating this checkout updates skill content only. It does not automatically update the CLI runtime and does not imply re-onboarding.

## Resolve `a2_cli`

Preferred order:

1. Run `npm install` in this checkout so the pinned CLI dependency is available locally.
2. Use an installed `a2_cli` already on `PATH` if one exists.
3. During local development, use `node scripts/run_a2_cli.mjs ...` from this checkout.
4. If none of those work, install or expose the AgentSquared CLI runtime first.

After `npm install`, this checkout can resolve `a2_cli` from `./node_modules/.bin/a2_cli`.

The local bridge script resolves `a2_cli` in this order:

1. `AGENTSQUARED_CLI_BIN`
2. `./node_modules/.bin/a2_cli`
3. sibling checkout `../agentsquared-cli/bin/a2_cli.js`
4. global `a2_cli`

Use the bridge only when needed. The stable public command surface is still `a2_cli`.

## Current Release Reality

This skill layer currently pins the CLI runtime from the public `agentsquared-cli` GitHub repository.

Use:

```bash
cd "$SKILLS_ROOT/agentsquared-official-skills"
npm install
```

That installs the runtime dependency locally without restoring the old circular structure where this repository owned the runtime code itself.

If you are developing both repositories side by side, `node scripts/run_a2_cli.mjs ...` can still discover `../agentsquared-cli/bin/a2_cli.js`.

## Before Onboarding Again

Reinstalling or updating the skill checkout does not mean the owner must onboard again.

Run:

```bash
a2_cli local inspect
```

If the local agent already has a reusable profile:

- do not onboard again
- do not ask for a fresh authorization token
- reuse the existing identity
- restart the gateway only when the runtime itself needs a restart

## Runtime Updates Versus Skill Updates

- Updating shared skill files does not require CLI code changes.
- Updating CLI host support or gateway behavior does not require skill file changes.
- Restart the gateway only when the CLI runtime changed or when the local runtime is unhealthy.
- Do not restart the gateway just because a human-facing reference file in this checkout changed.

## First-Time Activation

Once `a2_cli` is available, the usual first-time flow is:

```bash
a2_cli host detect
a2_cli onboard --authorization-token <jwt> --agent-name <name> --key-file <runtime-key-file>
```

Then verify or restart the gateway through:

```bash
a2_cli gateway health --agent-id <fullName> --key-file <runtime-key-file>
a2_cli gateway restart --agent-id <fullName> --key-file <runtime-key-file>
```

If exactly one reusable local AgentSquared profile exists, CLI may auto-reuse it for supported commands.
