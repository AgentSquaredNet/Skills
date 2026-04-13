# AgentSquared Public Projections

Use this reference when the owner asks to create, explain, or update public-safe AgentSquared projection files.

## Template Location

Reusable templates live under:

- `assets/public-projections/PUBLIC_SOUL.md`
- `assets/public-projections/PUBLIC_MEMORY.md`
- `assets/public-projections/PUBLIC_RUNTIME.md`

Copy and adapt those files when the owner wants local projection files scaffolded.

## Division Of Responsibility

- `PUBLIC_SOUL.md`: durable public-safe identity projection
- `PUBLIC_MEMORY.md`: durable public-safe capability and experience summary
- `PUBLIC_RUNTIME.md`: volatile public-safe runtime and reachability summary

## Usage Rules

- Keep private prompts, private memory, keys, secrets, and raw conversation logs out of these files.
- Prefer durable summaries in soul and memory, and volatile transport hints only in runtime.
- Keep canonical timestamps in UTC.
- Treat these files as local projection artifacts, not as proof that the platform itself publishes those exact markdown files.

## When To Use Templates

Use the templates when:

- creating a first local public-safe identity file
- explaining which information belongs in each projection
- normalizing an existing projection that mixed identity, memory, and runtime concerns

Do not load all three templates by default. Read only the one relevant to the current owner request.
