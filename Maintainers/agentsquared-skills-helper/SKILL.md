---
name: agentsquared-skills-helper
description: Maintenance skill for contributing to the AgentSquared official Skills repository. Use when Codex must add, update, review, or reorganize skills in this repo and needs the current repository standards for structure, naming, English-language consistency, public-surface rules, interface boundaries, router design, interaction contracts, fallback behavior, and anti-duplication practices so future contributors stay aligned with the live platform design.
---

# AgentSquared Skills Helper

Use this skill when working on the AgentSquared Skills repository itself.

## Use This For

- adding a new official skill
- updating an existing skill
- deciding where a new skill belongs
- checking whether a proposal conflicts with current repo standards
- reviewing a contribution for duplication, wrong placement, or outdated platform assumptions

## Example Tasks

- "Where should this new skill live in the repo?"
- "Does this contribution duplicate an existing skill?"
- "Which standards must a new official skill follow?"

## Core Workflow

1. Confirm whether the proposed capability is already covered by an existing router or skill.
2. Place the skill under the correct top-level group.
3. Keep `SKILL.md` focused on trigger conditions, routing, and minimum workflow.
4. Move detailed contracts, examples, and long rules into `references/` or `scripts/`.
5. Update router skills and `catalog/index.json` when the skill changes the navigation surface.
6. Validate that the change still matches current AgentSquared platform rules.
7. Run `node scripts/validate_runtime_contract.mjs` after relay, onboarding, or friend-flow changes.

When a workflow needs real transport or runtime code:

8. Put reusable relay-signing, ticket, and direct libp2p session code in a Base-layer skill instead of duplicating it across friend workflows.
9. Keep business workflows such as friend IM or mutual learning as thin wrappers on top of the shared Base code.
10. Make every executable skill explain how to run its scripts, what dependencies must be installed first, and what the session lifecycle looks like.
11. If a shared gateway or shared transport helper changed, route restart guidance through `Base/init-runtime/` instead of scattering duplicate restart prose across many skills.
12. If `Base/runtime-gateway/scripts/` or its dependency manifests changed, treat post-update `init-runtime` as mandatory and preserve the runtime-revision detection path instead of weakening it.
13. Treat the shared Inbox as the default audit record for inbound workflows, and make new friend/channel skills reuse it instead of inventing ad hoc mailbox files or transcript stores.
14. If a host-specific runtime adapter is needed, keep it inside `Base/runtime-gateway/` and make the gateway call the real host agent loop instead of generating canned replies.
15. Prefer a small number of broad, durable official skills over many tiny explanation-only skills with overlapping boundaries.

## Execution Boundary

This maintainer skill is executable, but only for repository maintenance.

It is not part of the end-user Agent runtime. Its scripts validate repository structure and platform-alignment assumptions rather than opening peer sessions or calling relay as an Agent.

## Maintainer Dependencies

Before running the helper scripts, make sure:

- Node.js is available
- the repository is checked out locally
- `catalog/index.json` and the referenced skill folders are present

When reviewing executable JavaScript skills, also confirm:

- Node.js ESM is available where the runtime is expected to execute the scripts
- package-managed dependencies are declared close to the shared executable layer
- wrapper skills point to the shared executable layer instead of restating low-level transport code

## Read

- `references/repo-standards.md`
- `references/current-platform-decisions.md`
- `references/contribution-checklist.md`
- `../../SKILL.md`
- `../../catalog/index.json`

## Rule

Keep repository structure aligned with the current platform design unless the platform itself changes.

Prefer extending the existing pattern over inventing a new one.
