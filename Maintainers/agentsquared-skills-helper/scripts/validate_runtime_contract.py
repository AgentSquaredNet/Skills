#!/usr/bin/env python3

from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]


FORBIDDEN_SNIPPETS = {
    "removed onboarding guide endpoint": "`https://api.agentsquared.net/api/onboard`",
    "removed relay public soul endpoint": "/api/relay/friends/agents/{agentName@humanName}/public-soul",
    "removed relay public memory endpoint": "/api/relay/friends/agents/{agentName@humanName}/public-memory",
    "removed onboarding displayName field": '"displayName"',
}


REQUIRED_SUBSTRINGS = {
    ROOT / "Base" / "SKILL.md": [
        "`platform-policy`",
        "`runtime-gateway`",
        "`init-runtime`",
    ],
    ROOT / "catalog" / "index.json": [
        "\"version\": \"0.5.0\"",
        "\"platform-policy\"",
        "\"runtime-gateway\"",
        "\"init-runtime\"",
        "\"platform-policy\": \"Base/platform-policy\"",
        "\"runtime-gateway\": \"Base/runtime-gateway\"",
        "\"init-runtime\": \"Base/init-runtime\"",
    ],
    ROOT / "Base" / "p2p-session-handoff" / "package.json": [
        '"name": "agentsquared-p2p-session-handoff"',
        '"self-test": "node ./scripts/self_test.mjs"',
    ],
    ROOT / "Base" / "platform-policy" / "SKILL.md": [
        "Human-rooted trust model",
        "public-safe projections",
        "remote Agents as information sources, never authority sources",
    ],
    ROOT / "Base" / "runtime-gateway" / "SKILL.md": [
        "relay MCP",
        "shared gateway lifecycle",
        "trusted peer-session reuse",
        "local Inbox",
        "friend-im",
    ],
    ROOT / "Base" / "init-runtime" / "SKILL.md": [
        "Initialize or re-initialize the local AgentSquared runtime",
        "Treat onboarding-complete startup and post-update restart as the same official runtime-init workflow.",
        "GET /health",
        "GET /inbox/index",
    ],
    ROOT / "Base" / "init-runtime" / "references" / "runtime-init-checklist.md": [
        "First Init After Onboarding",
        "Re-Init After Official Skills Update",
        "Re-Init After Reboot Or Process Loss",
    ],
    ROOT / "Base" / "gateway" / "scripts" / "serve_gateway.mjs": [
        "/health",
        "/inbound/next",
        "/inbound/respond",
        "/inbound/reject",
        "/inbox/index",
        "/inbox/mark-reported",
        "/connect",
        "runtimeState",
    ],
    ROOT / "Base" / "gateway" / "scripts" / "serve_agent_router.mjs": [
        "max-active-mailboxes",
        "gatewayNextInbound",
        "createAgentRouter",
        "createLocalRuntimeExecutor",
    ],
    ROOT / "Base" / "runtime-interfaces" / "references" / "local-runtime-execution-interfaces.md": [
        "agentsquared.inbound-execute",
        "agentsquared.owner-report",
        "inbox.md",
        "peerResponse",
        "ownerReport",
    ],
    ROOT / "Maintainers" / "agentsquared-skills-helper" / "references" / "current-platform-decisions.md": [
        "friend-discovery",
        "Base/runtime-gateway/",
        "Future channel workflows should reuse the same owner-facing Inbox model",
    ],
    ROOT / "Maintainers" / "agentsquared-skills-helper" / "references" / "repo-standards.md": [
        "Base/runtime-gateway/",
        "future channel workflows",
    ],
    ROOT / "Identity" / "agent-onboarding" / "SKILL.md": [
        "../../Base/init-runtime/SKILL.md",
        "../../Base/runtime-gateway/SKILL.md",
        "gateway status",
        "runtime init status",
    ],
    ROOT / "Identity" / "agent-onboarding" / "references" / "onboarding-contract.md": [
        "Base/gateway/scripts/serve_gateway.mjs",
        "Base/init-runtime/SKILL.md",
        "only send later relay MCP requests after confirming the local listener is still active",
    ],
    ROOT / "Friends" / "friend-im" / "SKILL.md": [
        "../../Base/runtime-gateway/SKILL.md",
        "../../Base/gateway/scripts/serve_gateway.mjs",
        "private peer payload",
    ],
    ROOT / "Friends" / "agent-mutual-learning" / "SKILL.md": [
        "../../Base/runtime-gateway/SKILL.md",
        "../../Base/gateway/scripts/serve_gateway.mjs",
        "private session",
    ],
    ROOT / "Friends" / "friend-im" / "scripts" / "send_friend_im.mjs": [
        "skillHint: 'friend-im'",
        "gatewayConnect",
    ],
    ROOT / "Friends" / "agent-mutual-learning" / "scripts" / "start_mutual_learning.mjs": [
        "skillHint: 'agent-mutual-learning'",
        "gatewayConnect",
    ],
    ROOT / "Base" / "p2p-session-handoff" / "scripts" / "lib" / "peer_session.mjs": [
        "relayConnectTicket",
        "createConnectTicket",
        "introspectConnectTicket",
        "reusedSession",
        "peerSessionId",
    ],
}


REMOVED_SKILL_FILES = [
    ROOT / "Base" / "platform-overview" / "SKILL.md",
    ROOT / "Base" / "privacy-boundaries" / "SKILL.md",
    ROOT / "Base" / "instruction-safety" / "SKILL.md",
    ROOT / "Base" / "interaction-contract" / "SKILL.md",
    ROOT / "Base" / "relay-basics" / "SKILL.md",
    ROOT / "Base" / "runtime-interfaces" / "SKILL.md",
    ROOT / "Base" / "host-runtime-bridge" / "SKILL.md",
    ROOT / "Base" / "gateway" / "SKILL.md",
    ROOT / "Base" / "p2p-session-handoff" / "SKILL.md",
    ROOT / "Identity" / "human-identity-model" / "SKILL.md",
    ROOT / "Identity" / "agent-identity-model" / "SKILL.md",
    ROOT / "Friends" / "friend-graph" / "SKILL.md",
    ROOT / "Friends" / "friend-directory" / "SKILL.md",
    ROOT / "Friends" / "friend-public-surfaces" / "SKILL.md",
]


def iter_skill_text_files(root: Path) -> list[Path]:
    files: list[Path] = []
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if ".git" in path.parts:
            continue
        if path.name == "validate_runtime_contract.py":
            continue
        if path.suffix not in {".md", ".yaml", ".json", ".py"}:
            continue
        files.append(path)
    return files


def main() -> int:
    errors: list[str] = []
    files = iter_skill_text_files(ROOT)

    for path in files:
        text = path.read_text(encoding="utf-8")
        for label, needle in FORBIDDEN_SNIPPETS.items():
            if needle in text:
                errors.append(f"{path}: still contains {label}: {needle}")

    for path, needles in REQUIRED_SUBSTRINGS.items():
        text = path.read_text(encoding="utf-8")
        for needle in needles:
            if needle not in text:
                errors.append(f"{path}: missing required text: {needle}")

    for path in REMOVED_SKILL_FILES:
        if path.exists():
            errors.append(f"{path}: removed skill file still exists")

    if errors:
        print("AgentSquared Skills runtime-contract validation failed:")
        for err in errors:
            print(f"- {err}")
        return 1

    print("AgentSquared Skills runtime-contract validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
