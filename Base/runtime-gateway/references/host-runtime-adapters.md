# Host Runtime Adapters

Use this reference when extending AgentSquared to a new host runtime.

## Ownership

Host runtime adapters belong under:

- `Base/runtime-gateway/adapters/<host>/`

Do not move executable adapters into `Shared/`.

`Shared/` is for reusable static references and schemas, not host-specific runtime code.

## Current Shape

Current official adapter layout:

- `adapters/index.mjs`
- `adapters/openclaw/adapter.mjs`
- `adapters/openclaw/detect.mjs`

## Contribution Rule

When adding a new host adapter:

1. create `adapters/<host>/adapter.mjs`
2. create `adapters/<host>/detect.mjs`
3. register it in `adapters/index.mjs`
4. keep transport and peer-session code in `scripts/lib/`
5. keep host-specific run-loop logic out of relay and libp2p helpers

## Detection Rule

Host detection should be:

- explicit when the owner passes `--host-runtime`
- automatic when a stable local host signal exists
- conservative when signals are weak

For OpenClaw, prefer official status probes such as:

- `openclaw gateway status --json`
- `openclaw status --json`
- `openclaw gateway health --json`

If detection is uncertain, prefer returning:

- `resolved: "none"`
- a `suggested` host runtime

Do not silently force a host adapter when the environment is ambiguous.
