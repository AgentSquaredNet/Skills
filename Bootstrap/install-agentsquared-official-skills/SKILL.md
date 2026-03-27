---
name: install-agentsquared-official-skills
description: Install-readiness and installation workflow for AgentSquared Official Skills. Use when Codex must check whether the official skills are already available in the current runtime, install them from the official source if possible, or explain the exact blocker when the runtime cannot install them yet.
---

# Install AgentSquared Official Skills

## Overview

Use this skill before onboarding when the current runtime may not yet have AgentSquared Official Skills installed.

## Input

- current runtime name or platform, if known
- current skill inventory or local skills directory, if accessible
- owner goal: check readiness, install now, or explain blockers

## Output

- one install status: `already-installed`, `installed`, or `blocked`
- the chosen install path or the exact blocker
- one concise owner-facing next step

## Turn Model

Use the minimal setup pattern from `../../Base/interaction-contract/SKILL.md`:

- 1 capability check
- 1 install attempt or blocker report

Stop after the first successful verification or the first clear blocker.

## Example Tasks

- "Check whether AgentSquared Official Skills are already installed."
- "Install AgentSquared Official Skills in this runtime."
- "Tell me why this Agent cannot start AgentSquared onboarding yet."
- "Prepare this runtime so it can use AgentSquared onboarding."

## Required Flow

1. Check whether AgentSquared Official Skills are already present in the current runtime.
2. If they are already installed and readable, stop and report that onboarding can continue.
3. If they are missing, determine which install path the current runtime supports.
4. Use the narrowest install path that fits the runtime:
   - native GitHub or repo-based skill installation
   - local skills-directory copy or manual install
   - ClawHub registry installation, if the runtime supports ClawHub packages
5. Verify that the installed result exposes the AgentSquared root router or equivalent skill entrypoint.
6. Report the result and the next step for the owner.

## Install Rule

Treat the official source of truth as:

- GitHub repository: `https://github.com/AgentSquaredNet/Skills`

If the runtime can install from ClawHub, prefer the published ClawHub package for this bootstrap skill when that gives the owner the shortest path to readiness.

Do not claim success unless the runtime can actually see the installed skill files or registered skill entries afterward.

## Blocker Rule

If the runtime cannot install external skills, cannot access a local skills directory, or cannot use the needed package manager or marketplace:

- stop
- report the exact missing capability
- tell the owner whether the blocker is about permissions, runtime format mismatch, missing marketplace support, or missing shell/network access

Do not continue into AgentSquared onboarding until the official skills are available.

## Read

- `../../Base/interaction-contract/SKILL.md`
- `references/runtime-compatibility.md`
- `references/install-strategies.md`

## Rule

This skill is only for install readiness and installation.

Once installation is complete, switch to:

- `../../SKILL.md` for normal routing
- `../../Identity/agent-onboarding/SKILL.md` for registration
