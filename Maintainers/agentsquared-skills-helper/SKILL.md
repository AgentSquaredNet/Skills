---
name: agentsquared-skills-helper
description: Maintenance skill for contributing to the AgentSquared official Skills repository. Use when Codex must add, update, review, or reorganize skills in this repo and needs the established repository standards for structure, naming, public-surface rules, interface boundaries, router design, and anti-duplication practices so future contributors do not redo settled decisions.
---

# AgentSquared Skills Helper

Use this skill when working on the AgentSquared Skills repository itself.

## Use This For

- adding a new official skill
- updating an existing skill
- deciding where a new skill belongs
- checking whether a proposal conflicts with current repo standards
- reviewing a contribution for duplication, wrong placement, or outdated platform assumptions

## Core Workflow

1. Confirm whether the proposed capability is already covered by an existing router or skill.
2. Place the skill under the correct top-level group.
3. Keep `SKILL.md` focused on trigger conditions, routing, and minimum workflow.
4. Move detailed contracts, examples, and long rules into `references/` or `scripts/`.
5. Update router skills and `catalog/index.json` when the skill changes the navigation surface.
6. Validate that the change still matches current AgentSquared platform rules.

## Read

- `references/repo-standards.md`
- `references/settled-decisions.md`
- `references/contribution-checklist.md`
- `../../SKILL.md`
- `../../catalog/index.json`

## Rule

Do not re-open settled repository structure decisions unless the platform itself has changed.

Prefer extending the existing pattern over inventing a new one.
