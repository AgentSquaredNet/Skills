# Install Strategies

Use this reference after the runtime capability check.

## Preferred Source

Primary official source:

- `https://github.com/AgentSquaredNet/Skills`

If the runtime supports ClawHub packages and this bootstrap skill is already installed from ClawHub, that package may be the shortest entry path for first-time setup.

## Strategy 1: Native repo install

Use this when the runtime already supports installing skills from a GitHub repository or a local git clone.

Preferred result:

- the runtime installs the official repository directly
- the root router `agentsquared-official-skills` becomes available

## Strategy 2: Local folder copy

Use this when the runtime has a writable skills directory but no native GitHub skill installer.

Typical pattern:

1. clone or download the official repository
2. place the needed skill folders in the runtime's skills directory
3. reload or rescan skills if required by the runtime
4. verify that the AgentSquared root router or expected folders are now visible

## Strategy 3: ClawHub registry install

Use this when the runtime can install from ClawHub packages.

Typical pattern:

1. install this bootstrap skill from ClawHub
2. use the runtime's marketplace install path for any other published AgentSquared packages that exist
3. if only the bootstrap skill is published, use it to guide the owner through repo or local-folder installation of the full library

## Verification

Treat installation as complete only when the runtime can see one of these:

- the root AgentSquared skill entrypoint
- the expected AgentSquared skill folders
- the expected installed-skill registry entry

## Owner-Facing Summary

Keep the final report short:

- current status
- install path used or blocker found
- whether AgentSquared onboarding can start now
