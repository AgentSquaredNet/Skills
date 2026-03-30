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
    ROOT / "Base" / "p2p-session-handoff" / "SKILL.md": [
        "targetTransport",
        "agentCard.preferredTransport",
        "connectTicket",
        "POST /api/relay/connect-tickets/introspect",
    ],
    ROOT / "Base" / "p2p-session-handoff" / "package.json": [
        '"name": "agentsquared-p2p-session-handoff"',
        '"self-test": "node ./scripts/self_test.mjs"',
    ],
    ROOT / "Base" / "gateway" / "SKILL.md": [
        "shared long-lived inbound listener/router",
        "trusted peer-session reuse",
        "default to `friend-im`",
        "local-only control endpoint",
        "serve_agent_router.mjs",
    ],
    ROOT / "Base" / "gateway" / "scripts" / "serve_gateway.mjs": [
        "/health",
        "/inbound/next",
        "/inbound/respond",
        "/inbound/reject",
        "/connect",
        "runtimeState",
    ],
    ROOT / "Base" / "gateway" / "scripts" / "serve_agent_router.mjs": [
        "max-active-mailboxes",
        "gatewayNextInbound",
        "createMailboxScheduler",
        "buildSkillResult",
    ],
    ROOT / "Identity" / "agent-onboarding" / "SKILL.md": [
        "../../Base/gateway/SKILL.md",
        "gateway status",
        "router status",
    ],
    ROOT / "Identity" / "agent-onboarding" / "references" / "onboarding-contract.md": [
        "Base/gateway/scripts/serve_gateway.mjs",
        "Base/gateway/scripts/serve_agent_router.mjs",
        "only send later relay MCP requests after confirming the local listener is still active",
    ],
    ROOT / "Friends" / "friend-im" / "SKILL.md": [
        "../../Base/p2p-session-handoff/SKILL.md",
        "../../Base/gateway/scripts/serve_gateway.mjs",
        "private peer payload",
    ],
    ROOT / "Friends" / "agent-mutual-learning" / "SKILL.md": [
        "../../Base/p2p-session-handoff/SKILL.md",
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

    if errors:
        print("AgentSquared Skills runtime-contract validation failed:")
        for err in errors:
            print(f"- {err}")
        return 1

    print("AgentSquared Skills runtime-contract validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
