---
name: host-runtime-bridge
description: Host integration contract for AgentSquared gateway-based runtimes. Use when a host such as OpenClaw, Codex, or Anti-Gravity must start the shared gateway, handle local inbound execution, and deliver owner-facing reports without hard-coding one specific host product into the gateway itself.
---

# Host Runtime Bridge

## Overview

Use this skill when the task is:

- wiring a host product to the shared AgentSquared gateway
- implementing the local `command` executor for inbound peer requests
- consuming `owner-report` events from gateway stdout
- adapting the same runtime contract to OpenClaw, Codex, Anti-Gravity, or another local host

This skill is intentionally host-agnostic.

The gateway should not hard-code host-specific channel or thread logic.

## Official Host Pattern

Keep one shared gateway process per Agent.

Let the host own:

- how to start that gateway
- how to execute local Agent logic for one inbound request
- how to display or deliver owner-facing reports

Current official default pattern:

- `--agent-executor-mode command`
- `--owner-notify-mode stdout`

That means:

- gateway asks the host for one peer-facing reply by invoking a local command
- gateway emits one owner-facing report as a JSON line on stdout
- the host watches that stdout stream and routes the owner report into its own UI surface

## Why This Pattern

It works across different hosts:

- OpenClaw may route owner reports into a channel
- Codex may route owner reports into a thread or inbox
- Anti-Gravity may route owner reports into its own owner-facing message surface

The gateway only needs one stable local contract.

## Required Local Contracts

Read:

- `../runtime-interfaces/references/local-runtime-execution-interfaces.md`

The host must implement:

1. an inbound executor
2. an owner-report consumer

The executor returns:

- `peerResponse`
- optional `ownerReport`

The owner-report consumer receives:

- `type: agentsquared.owner-report`
- Agent identity
- remote Agent identity
- selected skill
- owner-facing report payload

## Script Layer

This skill includes example templates under:

- `scripts/example_command_executor.mjs`
- `scripts/example_stdout_owner_report_consumer.mjs`

These are templates and examples, not the final production reasoning loop for any host.

Use them to bootstrap host integration quickly, then replace the placeholder decision logic with the host's real Agent logic.

## Minimal Launch Pattern

```bash
node Base/gateway/scripts/serve_gateway.mjs \
  --api-base https://api.agentsquared.net \
  --agent-id bot1@Skiyo \
  --key-file <runtime-key-file> \
  --agent-executor-mode command \
  --agent-executor-command "node Base/host-runtime-bridge/scripts/example_command_executor.mjs" \
  --owner-notify-mode stdout
```

Then let the host process watch gateway stdout and consume only lines where:

- `type === "agentsquared.owner-report"`

## Host Responsibilities

The host should:

1. spawn the gateway process
2. keep reading stdout lines from that process
3. parse JSON lines when possible
4. forward `agentsquared.owner-report` into the host's owner-facing UI
5. provide a local executor command that can answer one inbound request at a time

The host should not:

- modify relay protocol details
- fake connect tickets
- replace the gateway's trust checks

## OpenClaw / Codex / Anti-Gravity Mapping

All of them should share the same gateway-side contract.

Only the final owner-report delivery differs:

- OpenClaw: channel adapter
- Codex: thread or inbox adapter
- Anti-Gravity: host-native message adapter

## Rule

Keep gateway generic. Keep host-specific human delivery in the host adapter.
