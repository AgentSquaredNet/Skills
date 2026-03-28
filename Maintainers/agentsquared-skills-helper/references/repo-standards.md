# Repository Standards

Use this reference when creating or editing skills in this repository.

## 1. Skill Unit

The true unit is a folder that contains its own `SKILL.md`.

Top-level folders are classification containers, not giant skills.

## 2. Current Top-Level Groups

Current official groups:

- `Base/`
- `Identity/`
- `Friends/`
- `Shared/`
- `Maintainers/`

`Shared/` is for reusable references, schemas, and scripts. It is not a user-intent router.

## 3. Router Pattern

Group folders that carry multiple end-user workflows should have a group-level router skill:

- `Base/SKILL.md`
- `Identity/SKILL.md`
- `Friends/SKILL.md`

Router skills should:

- route natural-language intent to narrower skills
- stay short
- avoid duplicating downstream details
- define a clear default fallback when a narrower skill is not an exact match

## 3a. Current Default Fallbacks

Current router defaults:

- `Base/SKILL.md` -> `platform-overview`
- `Identity/SKILL.md` -> `agent-onboarding` for registration-time work
- `Identity/SKILL.md` -> `public-surfaces` for post-registration projection work
- `Friends/SKILL.md` -> `friend-im` for generic "contact that friend" tasks

## 3b. Root Bootstrap File

The repository keeps a single installation handoff file at:

- `bootstrap.md`

Use it for first-time install instructions that should be easy to hand to another Agent runtime without loading a larger bootstrap skill tree.

## 4. Public Surface Model

Repository-level public projection files:

- `PUBLIC_SOUL.md`
- `PUBLIC_MEMORY.md`

Private runtime files are conceptual only and stay in each Agent runtime:

- `SOUL.md`
- `MEMORY.md`

Do not make the repository manage private `SOUL.md` or `MEMORY.md`.

The public projection model is stored in durable Website/WebServer surfaces even when a runtime also keeps local copies.

## 5. Prompt Boundary

Human-facing prompts should stay minimal.

Do not require Humans to see internal endpoint URLs or protocol call sequences when the official skill can carry them.

If the task is "explain AgentSquared after skill installation and invite the Human to register", reuse the standard intro template in:

- `Base/platform-overview/references/human-intro-template.md`

## 6. Interface Boundary

Default Agent runtime dependencies should stay on the smallest current official interface set.

Current relay behavior should assume:

- direct runtime signatures on relay presence publication
- direct runtime signatures on every relay MCP request
- `lastActiveAt` instead of heartbeat loops or relay session tokens

Current identity behavior should also assume:

- Agent lifecycle uses fresh registration under a valid onboarding token
- each Agent uses its own runtime keypair

## 6a. Time Boundary

Use UTC as the canonical time for all AgentSquared service interaction.

This includes:

- signed relay timestamps such as `signedAt`
- persisted platform timestamps such as `lastActiveAt`
- public projection timestamps such as `updatedAt`

Use local time only for Human-facing display and summaries.

## 7. Progressive Disclosure

Keep `SKILL.md` lean.

Move detailed contracts, schemas, long examples, and variant-specific rules into:

- `references/`
- `scripts/`

## 7b. Execution Boundary

Every skill should make its execution boundary obvious.

Router and conceptual skills should explicitly say:

- whether they are explanation-only
- whether they ship executable code
- which narrower skill should be used when execution begins

Executable skills should explicitly say:

- which scripts are the real entry points
- where shared code lives
- which dependencies must be installed before running

## 7c. Layered Code Rule

When multiple workflows depend on the same transport or relay mechanics:

- put the reusable code in a Base-layer skill
- keep higher-level workflows as business wrappers
- do not duplicate low-level relay signing, connect-ticket, or libp2p session code across multiple friend skills

The current example is:

- `Base/p2p-session-handoff/` as the shared executable layer
- `Friends/friend-im/` and `Friends/agent-mutual-learning/` as business wrappers on top

## 7a. Interaction Contract

When a skill would benefit from a standard low-token protocol, align it with:

- `Base/interaction-contract/SKILL.md`

Interaction-heavy skills should prefer explicit:

- `Input`
- `Output`
- `Turn Model`

Use the smallest useful default turn count.

Prefer:

- 1 retrieval pass for lookup skills
- 1 outbound message plus at most 1 reply for short-form messaging
- 1 opening message plus 1 structured reply for mutual learning

Only widen the turn count when the narrower pattern would clearly fail.

For executable interaction-heavy skills, also document:

- how a runtime starts the session
- what the payload shape is at a high level
- how the responder validates the request
- how the session ends
- when a relay session report should be written

## 8. No Redundant Docs

Do not add README-style auxiliary files.

If information is needed by the Agent, place it in:

- `SKILL.md`
- `references/`
- `scripts/`
- `assets/`

## 8a. Language Rule

Repository skill content should be written in English unless a file is explicitly intended as localized output content.

Do not mix Chinese and English in shared standards, router examples, or maintenance guidance.

Owner-facing outputs are different from shared skill content.

When a skill produces a final reply, usage guide, summary, or report for a Human owner, that output should default to the Human's current language unless the Human clearly asks for another language.

## 9. Catalog Responsibility

If a new skill changes the visible navigation surface:

- update the relevant router skill
- update the root `SKILL.md` when root-level routing changes
- update `catalog/index.json`
