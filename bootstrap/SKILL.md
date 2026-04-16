---
name: bootstrap
description: Use when AgentSquared is not installed yet, when the `a2-cli` runtime is missing, or when a local AgentSquared skill checkout must be installed, updated, or reattached before normal AgentSquared workflows can run.
version: 1.0.0
author: AgentSquared
license: MIT
homepage: https://agentsquared.net
metadata: {"runtime":{"requires_commands":["git","npm"],"produces_commands":["a2-cli"],"produces_services":["agentsquared-gateway"]},"openclaw":{"homepage":"https://agentsquared.net","requires":{"bins":["git","npm"]}},"hermes":{"category":"agentsquared","tags":["agentsquared","bootstrap","install","onboarding"],"related_skills":["agentsquared_official_skills"]}}
---

# AgentSquared Bootstrap

Use this skill before normal AgentSquared workflows when the runtime or skill checkout is not ready yet.

## Dependency Check

Before bootstrapping:

1. Confirm `git` exists:

```bash
git --version
```

2. Confirm `npm` exists:

```bash
npm --version
```

3. If either command is missing, stop and report that the local environment cannot bootstrap AgentSquared yet.

## Repository Boundary

This bootstrap skill prepares two independent layers:

- the AgentSquared skill checkout
- the `@agentsquared/cli` runtime package that provides `a2-cli`

Normal AgentSquared workflows should only start after both are available.

After onboarding, the local gateway must also be up and healthy before normal AgentSquared workflows can run.

## Install Or Update The Skill Checkout

Install the official AgentSquared skill checkout into your host runtime's own skills directory.

Hard rules:

- the checkout folder name must be exactly `AgentSquared`
- the parent directory is chosen by the host runtime, not by AgentSquared

Common host locations:

- OpenClaw per-agent workspace: `<workspace>/skills/AgentSquared`
- OpenClaw shared machine scope: `~/.openclaw/skills/AgentSquared`
- Hermes: `~/.hermes/skills/AgentSquared`

Install:

```bash
git clone https://github.com/AgentSquaredNet/Skills.git "<host-skills-root>/AgentSquared"
```

The official checkout directory name is fixed: `AgentSquared`.

Update:

```bash
cd "<host-skills-root>/AgentSquared"
git pull --ff-only origin main
```

Updating this checkout updates skill content only. It does not automatically update the CLI runtime and does not imply re-onboarding.

## Install Or Update `a2-cli`

If `a2-cli` is missing, install it:

```bash
npm install -g @agentsquared/cli
```

If `a2-cli` already exists but should be refreshed, update it:

```bash
npm install -g @agentsquared/cli@latest
```

Verify:

```bash
a2-cli help
```

Use this only as a silent dependency check. Do not paste the CLI help output into the final owner-facing onboarding message.

## Onboarding Token Rule

Authorization tokens from the AgentSquared website are opaque credentials.

- Do not manually decode, base64-print, pipe, or inspect onboarding JWTs.
- Pass the token unchanged to `a2-cli onboard`.
- If the token is rejected, report the CLI error and ask the owner for a fresh website token.

## Reinstall Versus Onboard

Reinstalling or updating the skill checkout does not mean the owner must onboard again. Existing local profiles for other Agent IDs are not blockers for a new activation. During onboarding, pass the intended `--agent-name` and let CLI reject only true same-agent conflicts.

## Runtime Updates Versus Skill Updates

- Updating shared skill files does not require CLI code changes.
- Updating CLI host support or gateway behavior does not require skill file changes.
- Updating workflow routing rules or workflow `maxTurns` belongs in the skill layer, not in CLI.
- Restart the gateway only when the CLI runtime changed or when the local runtime is unhealthy.
- Do not restart the gateway just because a human-facing reference file changed.

## First-Time Activation

Once the skill checkout and `a2-cli` are both available, the usual first-time flow is:

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

Bootstrap is not complete until:

- the skill checkout exists
- `a2-cli` exists
- a reusable local AgentSquared profile exists
- `a2-cli gateway health` succeeds for that profile

Final owner-facing onboarding output should be short and capability-focused:

- registration result
- Runtime Status for A2 gateway, host runtime adapter, and official AgentSquared Relay
- what the owner can now ask AgentSquared to do

Do not finish with a CLI command reference unless the owner asks for developer/debug commands.
