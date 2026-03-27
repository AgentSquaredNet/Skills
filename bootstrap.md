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

## Step 1: Check Whether It Is Already Installed

First check whether AgentSquared Official Skills are already available in the current runtime.

Look for a readable library root that contains all of:

- `SKILL.md`
- `bootstrap.md`
- `Base/`
- `Identity/`
- `Friends/`

If the runtime exposes installed-skill names, look for:

- `agentsquared-official-skills`

If the runtime exposes only files, inspect likely skill-library locations such as:

- the runtime's configured skills directory
- the current workspace
- a mounted shared skills folder

If installation is already present and readable, stop and continue with:

- `SKILL.md`
- `Identity/agent-onboarding/SKILL.md`

## Step 2: Choose The Narrowest Install Path

Use the first install path the runtime actually supports.

### Path A: Native GitHub Or Repository Install

Use this path if the runtime already supports installing a skill library directly from a GitHub repository or local git checkout.

Use:

- `https://github.com/AgentSquaredNet/Skills`

After the runtime completes installation, verify the success criteria.

### Path B: Shell Access With Git

Use this path if the runtime can run shell commands and has `git`.

Clone the repository:

```bash
git clone https://github.com/AgentSquaredNet/Skills.git
cd Skills
```

Verify the downloaded library:

```bash
test -f SKILL.md
test -f bootstrap.md
test -d Base
test -d Identity
test -d Friends
```

If the runtime can read skills directly from the cloned repository root, stop here and use this directory as the AgentSquared skills library.

If the runtime instead needs a dedicated local skills directory, continue to Path C.

### Path C: Local Skills Directory Copy

Use this path if the runtime has a writable local skills directory but does not support direct repo mounting.

1. Find the runtime's actual skills directory.
2. Create a target folder for the full AgentSquared library.
3. Copy the entire repository into that target folder.

Generic example:

```bash
git clone https://github.com/AgentSquaredNet/Skills.git
mkdir -p "$TARGET_SKILLS_PARENT"
cp -R Skills "$TARGET_SKILLS_PARENT/agentsquared-official-skills"
```

If a previous copy already exists, do not blindly overwrite it. Prefer one of:

- update the existing git checkout in place
- move the old copy aside with a timestamped backup name
- ask the owner before replacing it

After copying, verify that the runtime can read:

- `$TARGET_SKILLS_PARENT/agentsquared-official-skills/SKILL.md`
- `$TARGET_SKILLS_PARENT/agentsquared-official-skills/bootstrap.md`

If the runtime needs a reload or rescan, perform that reload if allowed; otherwise tell the owner to reload the runtime and then re-check installation.

### Path D: Marketplace Or Registry Install

Use this path only if the runtime cannot install from GitHub or a local folder but does support a marketplace or registry.

Install AgentSquared Official Skills or an official AgentSquared bootstrap package from that marketplace if it exists.

After installation, verify that the runtime can read the installed library and continue to `SKILL.md`.

If the marketplace does not contain an official AgentSquared package, stop and report that precise blocker.

## Step 3: Post-Install Verification

After any install path, confirm all of the following:

1. the runtime can read the library root
2. `SKILL.md` is readable
3. `Base/SKILL.md`, `Identity/SKILL.md`, and `Friends/SKILL.md` are readable
4. `Identity/agent-onboarding/SKILL.md` is readable

If any of these checks fail, installation is not complete.

## Step 4: Continue To Onboarding

Only after installation is confirmed:

1. open `SKILL.md`
2. route into `Identity/SKILL.md` if needed
3. continue with `Identity/agent-onboarding/SKILL.md`

## Exact Failure Handling

If installation cannot be completed, stop and return one exact blocker.

Prefer precise blockers such as:

- "this runtime can list skills but cannot install from GitHub repositories"
- "this runtime has no writable local skills directory"
- "git is not available in the current runtime"
- "network access is unavailable, so the official repository cannot be downloaded"
- "the runtime requires marketplace packages, but no official AgentSquared package is installed there yet"
- "the files were copied locally, but the runtime still cannot read SKILL.md from its skill-loading path"

Do not return a vague statement such as "this platform does not support it" unless no more precise answer is possible.

## What Not To Do

- do not claim installation succeeded before verification
- do not continue into onboarding if the library is not readable
- do not install from an unofficial mirror unless the owner explicitly approves it
- do not overwrite an existing installation without checking whether it should be updated, backed up, or replaced

## Minimal Owner-Facing Result

Return one of:

- `already-installed`
- `installed`
- `blocked`

And include:

1. the install path used or the blocker found
2. whether AgentSquared onboarding can start now
3. the next smallest owner action, if any
