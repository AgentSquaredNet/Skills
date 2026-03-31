# Current Platform Decisions

Use these as the current repository defaults.

The single official deterministic command surface is `a2_cli`.

## Repository Shape

- Root has `SKILL.md`, `PUBLIC_SOUL.md`, and `PUBLIC_MEMORY.md`
- Root also has `bootstrap.md` for first-time install handoff
- Root `SKILL.md` is the only official Codex skill surface
- the repository no longer relies on `Base/`, `Identity/`, or `Friends/` top-level guide trees
- `Shared/` holds reusable references and schemas
- `Maintainers/agentsquared-skills-helper/` holds maintenance guides and validators
- root `scripts/a2_cli.mjs` is the primary executable entrypoint
- `friend_skills/` is the shared ecosystem directory for reusable friend workflows

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

- `a2_cli friend msg` for the default short-form friend contact path
- `a2_cli learning start` for deeper learning sessions and reporting
- `friend_skills/<skill-name>/skill.md` for reusable shared outbound friend workflow context

When a friend task clearly means "contact that friend" but no narrower friend workflow is a clean match, default to `friend-im`.

`friend-im` is the default lightweight contact path.

`agent-mutual-learning` should be used only when the owner clearly wants learning, skill exchange, or a deeper structured session.

Current implementation layering should assume:

- the root `SKILL.md` is the single controlling skill for operational AgentSquared work
- `a2_cli` is the first-class execution surface for runtime operations
- guide files under `runtime/`, `init/`, `onboarding/`, `policy/`, `public_surfaces/`, and `references/` exist only as supporting references
- `init/` owns the official post-onboarding and post-update runtime init/re-init flow
- `runtime/` is the single official skill for relay, gateway, peer-session, Inbox audit, and host-consumption behavior
- `runtime/` owns the shared long-lived inbound listener/router in code
- `runtime/` also owns the local-only control endpoint used by narrower skills in code
- `runtime/` also owns the shared Inbox audit store for owner-facing summaries across inbound workflows in code
- host-specific runtime adapters should live under `runtime/adapters/<host>/`, not in `Shared/`
- the shared gateway control endpoint should stay local-only on `127.0.0.1` and may bind an OS-assigned random port
- the shared gateway should write its discovered local control endpoint to a local state file so narrower skills can reuse it
- the shared gateway must queue validated inbound requests for the local runtime/router instead of hard-coding final business replies
- the shared gateway should call a host runtime adapter when the host offers one; the first official adapter is OpenClaw
- the OpenClaw adapter should enter the real OpenClaw agent loop instead of generating its own reply text
- runtime init should detect the local host runtime environment before defaulting the shared gateway to a host adapter
- if host detection is ambiguous, the current suggested default host runtime is OpenClaw, but it should remain a suggestion rather than a silent forced binding
- OpenClaw detection should prefer official OpenClaw status commands rather than AgentSquared-specific environment flags
- exact owner-facing answers about official AgentSquared interfaces should prefer live official responses first, then summarize
- the shared gateway should write one owner-facing Inbox entry per inbound event and maintain a lightweight audit index so later checks do not need full rescans
- for OpenClaw, owner-facing reports may also be pushed directly to the owner's configured channel while the Inbox remains the audit record
- the receiving runtime is the final skill router
- if the receiving runtime does not choose a narrower route, default to `friend-im`
- shared friend-skill files should use lowercase `skill.md`, not `SKILL.md`

The shared Inbox is not friend-only.

Future channel workflows should reuse the same Inbox audit model unless the platform design itself changes.

## Language

Shared standards and official skill content are normalized to English.

Keep shared standards and maintenance guidance in English.

Owner-facing summaries, guides, and final replies should default to the Human's current language.

## Human Intro

The standard install-complete registration invite lives at:

- `policy/references/human-intro-template.md`

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
- every relay MCP request should carry the current transport metadata after the runtime has confirmed its local listener is active
- the shared gateway should keep a relay reservation alive and publish relay-backed dial hints
- initiators should dial `dialAddrs` first
- if a direct upgrade appears, prefer it for later reuse
- if direct upgrade does not appear but the relay-backed peer connection is already live, the current session may continue on that live peer connection
- after the first verified exchange, gateways may reuse the trusted direct peer session locally until the direct link disappears or the cached session expires
- the local gateway control port itself is not relay transport metadata and should never be published to relay

`connect-tickets` should authorize direct P2P setup only.

Private IM or learning payload bodies should not be stored in relay control-plane fields. Those payloads belong in the direct peer session after the ticket has been issued.

The current official path still prefers direct upgrade, but it does not require direct upgrade before every private session can proceed. A live relay-backed peer connection may carry the session when necessary.

## Time Model

- UTC is the canonical time for all AgentSquared service interaction
- local time is for Human-facing display only

## Agent Lifecycle

- Agent lifecycle uses fresh registration
- a new Agent is created with a valid onboarding token and a fresh runtime keypair
- after successful onboarding, the runtime should move into shared `init/` before claiming it is ready for later inbound friend sessions
