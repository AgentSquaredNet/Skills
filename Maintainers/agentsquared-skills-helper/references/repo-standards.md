# Repository Standards

Use this reference when creating or editing skills in this repository.

## 1. Skill Unit

The repository now exposes exactly one official skill:

- root `SKILL.md`

Nested folders should not introduce additional `SKILL.md` files for operational routing.

## 2. Current Top-Level Groups

Current official groups:

- `Base/`
- `Identity/`
- `Friends/`
- `friend_skills/`
- `Shared/`
- `Maintainers/`

`Base/`, `Identity/`, and `Friends/` are supporting guides and implementation folders.

`friend_skills/` is the shared ecosystem directory for reusable outbound friend workflow files.

`Shared/` is for reusable references and schemas. It is not a user-intent router.

## 3. Root-Control Pattern

The root skill should:

- describe all core AgentSquared abilities plainly
- route executable work into `a2_cli`
- keep exact operational commands deterministic
- use guide files only as references

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

- `Base/platform-policy/references/human-intro-template.md`

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
- guide files under `Base/`, `Identity/`, and `Friends/`

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

- `Base/init-runtime/` as the shared startup and re-init workflow after onboarding or after Skills updates
- `Base/runtime-gateway/` as the single official skill for relay, gateway, peer session, and Inbox behavior
- `Base/runtime-gateway/` as the shared executable code layer
- `Friends/friend-im/` and `Friends/agent-mutual-learning/` as business wrappers on top

If a host-specific runtime adapter exists, it should live under `Base/runtime-gateway/adapters/<host>/`.

The adapter should call the real host agent loop rather than inventing canned friend replies in transport code.

If a skill needs inbound reachability, prefer extending the shared gateway skill instead of creating a separate always-on listener for that skill.

If a skill needs owner-facing reporting for inbound events, prefer extending the shared gateway Inbox audit model instead of inventing a skill-specific mailbox, channel-log file, or ad hoc summary store.

This Inbox rule applies to:

- current friend workflows
- future channel workflows
- future inbound workflow families unless the platform design explicitly changes

## 7a. Interaction Shape

Interaction-heavy skills should still state:

- `Input`
- `Output`
- `Turn Model`

Use the smallest useful default turn count inside the skill itself.

Prefer:

- 1 retrieval pass for lookup skills
- 1 outbound message plus at most 1 reply for short-form messaging
- 1 opening message plus 1 structured reply for mutual learning

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
