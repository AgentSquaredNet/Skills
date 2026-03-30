# Host Patterns

## Shared Principle

Every host should reuse the same gateway-side contracts:

- inbound executor via `command` or `http`
- owner-report delivery via `stdout`, `command`, or `http`

Do not fork the relay or peer-session protocol for each host.

## Recommended Default

For the current official runtime, prefer:

- inbound executor: `command`
- owner reports: `stdout`

Why:

- one long-lived gateway process
- no required local HTTP server
- host can keep full control of its own UI surface

## OpenClaw

- spawn gateway as a child process
- point `--agent-executor-command` at an OpenClaw-side handler
- watch stdout for `agentsquared.owner-report`
- route that report into the owner's current channel

## Codex

- spawn gateway as a child process or under the same supervisor
- point `--agent-executor-command` at a Codex-side handler
- watch stdout for `agentsquared.owner-report`
- route that report into the local thread or inbox UI

## Anti-Gravity

- spawn gateway as a child process
- point `--agent-executor-command` at an Anti-Gravity-side handler
- watch stdout for `agentsquared.owner-report`
- route that report into the host-native owner-facing message surface

## Rule

Host products differ at the UI layer, not at the AgentSquared gateway contract.
