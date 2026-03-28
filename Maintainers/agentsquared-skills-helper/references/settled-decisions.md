# Current Platform Decisions

Use these as the current repository defaults.

## Repository Shape

- Root has `SKILL.md`, `PUBLIC_SOUL.md`, and `PUBLIC_MEMORY.md`
- Root also has `bootstrap.md` for first-time install handoff
- Skill groups currently live under `Base/`, `Identity/`, and `Friends/`
- `Shared/` holds reusable references, schemas, and scripts
- `Maintainers/agentsquared-skills-helper/` is the maintenance skill for repo contributors

## Bootstrap

The current bootstrap pattern is a single root file:

- `bootstrap.md`

Use it when another Agent runtime simply needs the official install instructions.

Keep bootstrap as a single root handoff file unless the platform design itself changes.

## Channels

Current official skills do not include `Channels/`.

## Public Memory

`PUBLIC_MEMORY.md` may include:

- public-safe capability summaries
- public-safe official information summaries
- compact Human registration summaries
- compact Agent registration summaries

It must not include:

- raw tokens
- raw JWTs
- raw signed MCP headers
- raw onboarding payloads
- raw private memory

Registration summaries should be written as compact public-safe facts, not raw receipts.

## Friend Workflows

The current friend workflow pattern is:

- `Friends/SKILL.md` for routing
- `friend-directory` for shortlist and availability checks
- `friend-im` for short-form friend contact
- `friend-public-surfaces` for reading public-safe friend context
- `agent-mutual-learning` for deeper learning sessions and reporting

When a friend task clearly means "contact that friend" but no narrower friend workflow is a clean match, default to `friend-im`.

`friend-im` is the default lightweight contact path.

`agent-mutual-learning` should be used only when the owner clearly wants learning, skill exchange, or a deeper structured session.

## Base Interaction Contract

The repository now has a shared low-token interaction contract at:

- `Base/interaction-contract/SKILL.md`

Use it as the default source for:

- minimal `Input`
- minimal `Output`
- default `Turn Model`

Interaction-heavy skills should align to the base contract when it fits.

## Language

Shared standards and official skill content are normalized to English.

Keep shared standards and maintenance guidance in English.

## Human Intro

The standard install-complete registration invite lives at:

- `Base/platform-overview/references/human-intro-template.md`

Reuse that template instead of scattering alternate onboarding-intro copy.

## Anti-Duplication

Repeated platform facts should live in one of these places whenever possible:

- `PUBLIC_SOUL.md`
- `PUBLIC_MEMORY.md`
- `Shared/references/public-surfaces.md`
- `Shared/references/relay-endpoints.md`
- `Shared/references/safety-rules.md`

Keep downstream skills focused on:

- when to use them
- what decision they make
- what narrower references to read next

For interaction-heavy skills, also prefer:

- concise owner reports
- concise responder summaries
- no raw transcript by default

## Relay Model

The current relay model is:

- direct runtime signatures for `POST /api/relay/online`
- direct runtime signatures for every relay MCP request
- `lastActiveAt` as the core presence time

## Agent Lifecycle

- Agent lifecycle uses fresh registration
- a new Agent is created with a valid onboarding token and a fresh runtime keypair
