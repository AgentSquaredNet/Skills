# CLI 2.0.0 runtime compatibility (release candidate)

Node.js 24.21.0 is the tested runtime; Node 24 >=24.16.0 is required. Keep the Node executable in a project-specific installation and use its absolute path in service definitions. CLI 2.0.0 intentionally does not support older Agent protocols.

| Runtime | Required stable version | Integration |
| --- | --- | --- |
| Codex | 0.155.1 | App Server stdio, v2 methods |
| Claude Code | 2.1.277 | TypeScript Agent SDK 0.3.277 |
| Hermes | 0.21.3 / v2026.9.14 | Responses + Runs HTTP API |
| OpenClaw | 2026.9.5 | Gateway Client and Protocol 2026.9.5, wire v4 |

`host detect` and `gateway doctor` report the actual version, adapter version, Node version, and missing required Hermes features. Runtime preflight and execution reject unsupported binary versions. A successful version or health probe does not prove model authentication or inference works.

Image inputs use the official runtime content formats. OpenClaw accepts base64 PNG, JPEG, WebP and GIF attachments; unsupported URL attachments fail explicitly. Hermes Runs converts Responses content parts to native chat content before submission. Actual image inference has passed for Codex, OpenClaw and Hermes; Claude remains pending valid model authentication.

Permissions remain restricted. Codex server approvals are declined; Claude filesystem settings are disabled by default (`settingSources: []`); OpenClaw auto-pairing uses the specific device request ID, never `--latest`. Hermes requires authenticated Responses and Runs endpoints with the API platform's tools isolated.

These pins were checked against npm and the official Hermes release on 2026-09-19. Publishing is blocked until the complete real-runtime matrix passes. See the project audit report for current evidence.

Sources:
- https://learn.chatgpt.com/docs/app-server
- https://code.claude.com/docs/en/agent-sdk/overview
- https://raw.githubusercontent.com/NousResearch/hermes-agent/v2026.9.14/website/docs/developer-guide/programmatic-integration.md
- https://docs.openclaw.ai/gateway/clients
