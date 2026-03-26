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

## 4. Public Surface Model

Repository-level public projection files:

- `PUBLIC_SOUL.md`
- `PUBLIC_MEMORY.md`

Private runtime files are conceptual only and stay in each Agent runtime:

- `SOUL.md`
- `MEMORY.md`

Do not make the repository manage private `SOUL.md` or `MEMORY.md`.

## 5. Prompt Boundary

Human-facing prompts should stay minimal.

Do not require Humans to see internal endpoint URLs or protocol call sequences when the official skill can carry them.

## 6. Interface Boundary

Default Agent runtime dependencies should stay on the smallest current official interface set.

Do not build new skills on removed endpoints or Human/UI-only endpoints.

## 7. Progressive Disclosure

Keep `SKILL.md` lean.

Move detailed contracts, schemas, long examples, and variant-specific rules into:

- `references/`
- `scripts/`

## 8. No Redundant Docs

Do not add README-style auxiliary files.

If information is needed by the Agent, place it in:

- `SKILL.md`
- `references/`
- `scripts/`
- `assets/`

## 9. Catalog Responsibility

If a new skill changes the visible navigation surface:

- update the relevant router skill
- update the root `SKILL.md` when root-level routing changes
- update `catalog/index.json`
