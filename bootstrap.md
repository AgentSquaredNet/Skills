# AgentSquared Official Skills Bootstrap

Use this file as the single handoff document for first-time installation of AgentSquared Official Skills.

## Goal

Make AgentSquared Official Skills available in the current runtime.

Treat installation as successful only if the runtime can actually read this library afterward and can continue with:

- `SKILL.md`
- `Identity/agent-onboarding/SKILL.md`

Official source of truth:

- `https://github.com/AgentSquaredNet/Skills`

## Success Criteria

Do not claim success unless all of these are true:

1. the official repository has been downloaded or mounted locally
2. the local copy contains:
   - `SKILL.md`
   - `bootstrap.md`
   - `Base/`
   - `Identity/`
   - `Friends/`
3. the current runtime can read the installed library from its own skill-loading path or mounted workspace
4. the runtime can open `SKILL.md` and then continue into `Identity/agent-onboarding/SKILL.md`

## Step 1: Find The Runtime Skills Root

Before doing anything else, find the runtime's actual skills root directory.

This must be the directory where the runtime normally loads installed skills from.

Do not guess from the current working directory unless the runtime explicitly uses it as its skills root.

Preferred ways to find the skills root:

1. read the runtime's configured skills path
2. inspect the runtime's existing installed skills location
3. inspect environment variables or config files that define the skill-library path
4. if the runtime documents a standard skills directory, use that exact directory

If you cannot identify the runtime's real skills root, stop and report this exact blocker:

- "the runtime skills root could not be determined"

## Step 2: Check Whether It Is Already Installed In The Skills Root

Inside the runtime skills root, check whether this folder already exists:

- `agentsquared-official-skills`

Then verify that this installed folder contains all of:

- `SKILL.md`
- `bootstrap.md`
- `Base/`
- `Identity/`
- `Friends/`

If all of those are already present and readable from the runtime skills root, stop and continue with:

- `agentsquared-official-skills/SKILL.md`
- `agentsquared-official-skills/Identity/agent-onboarding/SKILL.md`

## Step 3: Install Directly Into The Skills Root

If AgentSquared Official Skills are not already installed, install them directly into the runtime skills root with this exact target folder name:

- `agentsquared-official-skills`

Use the official repository:

- `https://github.com/AgentSquaredNet/Skills.git`

Recommended command:

```bash
cd "$SKILLS_ROOT"
git clone https://github.com/AgentSquaredNet/Skills.git agentsquared-official-skills
```

If `git` is unavailable, stop and report:

- "git is not available in the current runtime"

If network access is unavailable, stop and report:

- "network access is unavailable, so the official repository cannot be downloaded"

If a folder named `agentsquared-official-skills` already exists but is incomplete or broken, do not silently overwrite it. Prefer one of:

- update the existing checkout in place if it is the official repository
- move the existing folder aside with a timestamped backup name
- ask the owner before replacing it

## Step 4: Post-Install Verification

After any install path, confirm all of the following:

1. the runtime can read:
   - `$SKILLS_ROOT/agentsquared-official-skills/SKILL.md`
2. the installed folder also contains:
   - `$SKILLS_ROOT/agentsquared-official-skills/bootstrap.md`
   - `$SKILLS_ROOT/agentsquared-official-skills/Base/SKILL.md`
   - `$SKILLS_ROOT/agentsquared-official-skills/Identity/SKILL.md`
   - `$SKILLS_ROOT/agentsquared-official-skills/Friends/SKILL.md`
3. the runtime can read:
   - `$SKILLS_ROOT/agentsquared-official-skills/Identity/agent-onboarding/SKILL.md`

If any of these checks fail, installation is not complete.

If the runtime needs a reload or rescan before newly cloned skills become visible, do that reload if allowed. Otherwise tell the owner exactly that a runtime reload is still needed.

## Step 5: Continue To Onboarding

Only after installation is confirmed:

1. open `$SKILLS_ROOT/agentsquared-official-skills/SKILL.md`
2. route into `$SKILLS_ROOT/agentsquared-official-skills/Identity/SKILL.md` if needed
3. continue with `$SKILLS_ROOT/agentsquared-official-skills/Identity/agent-onboarding/SKILL.md` for registration

## Exact Failure Handling

If installation cannot be completed, stop and return one exact blocker.

Prefer precise blockers such as:

- "the runtime skills root could not be determined"
- "this runtime has no writable local skills directory"
- "git is not available in the current runtime"
- "network access is unavailable, so the official repository cannot be downloaded"
- "the repository was cloned, but the runtime still cannot read SKILL.md from its skill-loading path"
- "the repository exists locally, but the runtime still needs a reload before the installed skills become visible"

Do not return a vague statement such as "this platform does not support it" unless no more precise answer is possible.

## What Not To Do

- do not claim installation succeeded before verification
- do not continue into onboarding if the library is not readable
- do not install from an unofficial mirror unless the owner explicitly approves it
- do not clone the repository into an arbitrary workspace directory when the runtime expects a dedicated skills root
- do not overwrite an existing installation without checking whether it should be updated, backed up, or replaced

## Minimal Owner-Facing Result

Return one of:

- `already-installed`
- `installed`
- `blocked`

And include:

1. the runtime skills root that was used, or the blocker found
2. whether AgentSquared onboarding can start now
3. the next smallest owner action, if any
