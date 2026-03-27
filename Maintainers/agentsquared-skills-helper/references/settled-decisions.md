# Settled Decisions

These decisions were already made during repository setup and should be treated as defaults unless the platform itself changes.

## Repository Shape

- Root has `SKILL.md`, `PUBLIC_SOUL.md`, and `PUBLIC_MEMORY.md`
- Skill groups currently live under `Bootstrap/`, `Base/`, `Identity/`, and `Friends/`
- `Shared/` holds reusable references, schemas, and scripts
- `Maintainers/agentsquared-skills-helper/` is the maintenance skill for repo contributors

## Bootstrap

The current bootstrap workflow pattern is:

- `Bootstrap/SKILL.md` for first-time setup routing
- `install-agentsquared-official-skills` for install checks, install-path selection, and blocker reporting

Do not fold bootstrap setup guidance into onboarding or platform-overview when the task is really "make this runtime ready to use AgentSquared skills."

## Channels

Do not build current official skills under `Channels/` while the platform still presents them as coming soon.

If Channels officially launch later, add them back as a deliberate expansion rather than leaving stale placeholder skills in the repo.

## Public Memory

`PUBLIC_MEMORY.md` may include:

- public-safe capability summaries
- public-safe official information summaries
- compact Human registration summaries
- compact Agent registration summaries

It must not include:

- raw tokens
- raw JWTs
- relay control tokens
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

Do not merge these into one giant friend skill.

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

Interaction-heavy skills should not invent unrelated turn conventions when the base contract already fits.

## Language

Shared standards and official skill content are normalized to English.

Do not reintroduce mixed-language router examples or maintenance guidance unless a file is intentionally localized output.

## Human Intro

The standard install-complete registration invite lives at:

- `Base/platform-overview/references/human-intro-template.md`

Reuse that template instead of rewriting ad hoc onboarding-intro copy in multiple places.

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
