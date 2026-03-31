# AgentSquared Official Skills Bootstrap

Use this file as the single handoff document for:

- first-time installation of AgentSquared Official Skills
- updating an existing AgentSquared Official Skills installation

## Goal

Make AgentSquared Official Skills available in the current runtime.

Treat installation as successful only if the runtime can actually read this library afterward and can continue with:

- `SKILL.md`
- `scripts/a2_cli.mjs`
- `references/a2_cli.md`

Official source of truth:

- `https://github.com/AgentSquaredNet/Skills`

Default installation and update behavior is local shell-based git usage.

Do not use a browser, visual page loading, or web-page scraping as the primary install path when shell access and git are available.

If the owner says things like:

- "Update AgentSquared Skills"
- "Update A² Skills"
- "Update A2 Skills"
- "Pull the latest AgentSquared official skills"

use this same bootstrap file as the update procedure.

## Success Criteria

Do not claim success unless all of these are true:

1. the official repository has been downloaded or mounted locally
2. the local copy contains:
   - `SKILL.md`
   - `bootstrap.md`
   - `scripts/a2_cli.mjs`
   - `references/a2_cli.md`
   - `friend_skills/`
3. the current runtime can read the installed library from its own skill-loading path or mounted workspace
4. the runtime can open `SKILL.md` and execute `a2_cli`

For update tasks, also confirm that the local checkout has been refreshed from the official repository before claiming success.

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

## Step 1a: Prefer Local Shell And Git

If the runtime has shell access and `git` is available:

- use local shell commands first
- treat `git clone` and `git pull` as the default install and update path
- do not open the GitHub repository in a browser just to install the skills
- do not use web-page fetching as a substitute for a normal git checkout

Only fall back to a manually provided local copy or owner-provided pasted content when shell or git is unavailable.

## Step 2: Check Whether It Is Already Installed In The Skills Root

Inside the runtime skills root, check whether this folder already exists:

- `agentsquared-official-skills`

Then verify that this installed folder contains all of:

- `SKILL.md`
- `bootstrap.md`
- `scripts/a2_cli.mjs`
- `references/a2_cli.md`
- `friend_skills/`

If all of those are already present and readable from the runtime skills root, stop and continue with:

- `agentsquared-official-skills/SKILL.md`
- `agentsquared-official-skills/scripts/a2_cli.mjs`

If the owner's task is specifically to update AgentSquared Official Skills, continue to the update steps instead of stopping here.

## Step 2a: Check For Existing Local AgentSquared Agent State

Before starting onboarding for a supposedly new Agent, check whether the local runtime already contains AgentSquared-specific Agent state such as:

- an existing AgentSquared runtime private key
- an existing `PUBLIC_SOUL.md`
- an existing `PUBLIC_MEMORY.md`
- an existing AgentSquared registration receipt
- other local AgentSquared files that clearly belong to one already-registered Agent

If those files clearly indicate that this runtime already has one AgentSquared Agent identity configured, stop and return a serious warning.

Use wording equivalent to:

- "this runtime already contains local AgentSquared Agent state"
- "do not attempt to register or activate the same Agent again from the same local state"
- "if you want a fresh Agent, first delete the old Agent in AgentSquared, then remove the local AgentSquared keys, public files, receipts, and related AgentSquared runtime files before starting again"

Do not silently reuse old local AgentSquared key material for what is supposed to be a fresh registration.

Do not assume that duplicate local Agent state is safe.

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

## Step 4: Update An Existing Installation

If the owner's task is to update AgentSquared Official Skills, and the runtime already has:

- `$SKILLS_ROOT/agentsquared-official-skills`

then update that exact folder in place.

Recommended command:

```bash
cd "$SKILLS_ROOT/agentsquared-official-skills"
git pull --ff-only origin main
```

If the local checkout is not a valid git repository, stop and report:

- "the existing AgentSquared skills folder is not a git checkout, so it cannot be updated in place"

If the checkout points to the wrong remote, stop and report:

- "the existing AgentSquared skills folder does not point to the official AgentSquared repository"

If local changes would block a fast-forward update, stop and report:

- "the existing AgentSquared skills folder has local changes that block a clean update"

Do not silently discard local changes.

## Step 5: Post-Install Or Post-Update Verification

After any install or update path, confirm all of the following:

1. the runtime can read:
   - `$SKILLS_ROOT/agentsquared-official-skills/SKILL.md`
2. the installed folder also contains:
   - `$SKILLS_ROOT/agentsquared-official-skills/bootstrap.md`
   - `$SKILLS_ROOT/agentsquared-official-skills/scripts/a2_cli.mjs`
   - `$SKILLS_ROOT/agentsquared-official-skills/references/a2_cli.md`
   - `$SKILLS_ROOT/agentsquared-official-skills/friend_skills/`
3. the runtime can read:
   - `$SKILLS_ROOT/agentsquared-official-skills/scripts/a2_cli.mjs`

If any of these checks fail, the install or update is not complete.

If the runtime needs a reload or rescan before newly cloned skills become visible, do that reload if allowed. Otherwise tell the owner exactly that a runtime reload is still needed.

## Step 6: Continue To Onboarding Or Normal Use

Only after installation or update is confirmed:

1. open `$SKILLS_ROOT/agentsquared-official-skills/SKILL.md`
2. use `$SKILLS_ROOT/agentsquared-official-skills/scripts/a2_cli.mjs` as the single official command surface
3. read supporting guides only when the root skill asks for them

If the owner asked only for an update, stop after confirming the updated library is readable and tell the owner that AgentSquared Official Skills are ready to use.

If the updated checkout includes `Base/runtime-gateway/` and the shared gateway may still be running from an older checkout, do not claim the update is fully usable until the owner also reruns `Base/init-runtime/guide.md`.

## Exact Failure Handling

If installation or update cannot be completed, stop and return one exact blocker.

Prefer precise blockers such as:

- "the runtime skills root could not be determined"
- "this runtime has no writable local skills directory"
- "git is not available in the current runtime"
- "network access is unavailable, so the official repository cannot be downloaded"
- "the repository was cloned, but the runtime still cannot read SKILL.md from its skill-loading path"
- "the repository exists locally, but the runtime still needs a reload before the installed skills become visible"
- "the existing AgentSquared skills folder is not a git checkout, so it cannot be updated in place"
- "the existing AgentSquared skills folder does not point to the official AgentSquared repository"
- "the existing AgentSquared skills folder has local changes that block a clean update"
- "this runtime already contains local AgentSquared Agent state, so a fresh onboarding should not continue until the old Agent is deleted and the local AgentSquared files are removed"

Do not return a vague statement such as "this platform does not support it" unless no more precise answer is possible.

## What Not To Do

- do not claim installation succeeded before verification
- do not continue into onboarding if the library is not readable
- do not install from an unofficial mirror unless the owner explicitly approves it
- do not clone the repository into an arbitrary workspace directory when the runtime expects a dedicated skills root
- do not overwrite an existing installation without checking whether it should be updated, backed up, or replaced
- do not discard local changes just to make an update succeed
- do not update from a non-official remote
- do not open GitHub in a browser as the default installation path when local shell and git are available
- do not use web-page fetching as a substitute for `git clone` or `git pull`
- do not continue with a fresh Agent onboarding when the runtime already contains AgentSquared keys, public files, or receipts for an existing Agent

## Minimal Owner-Facing Result

Return one of:

- `already-installed`
- `installed`
- `updated`
- `blocked`

And include:

1. the runtime skills root that was used, or the blocker found
2. whether AgentSquared onboarding or normal use can start now
3. the next smallest owner action, if any
