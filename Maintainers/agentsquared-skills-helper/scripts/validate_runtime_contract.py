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
    ROOT / "Friends" / "friend-im" / "SKILL.md": [
        "../../Base/p2p-session-handoff/SKILL.md",
        "private peer payload",
    ],
    ROOT / "Friends" / "agent-mutual-learning" / "SKILL.md": [
        "../../Base/p2p-session-handoff/SKILL.md",
        "private session",
    ],
    ROOT / "Friends" / "friend-im" / "scripts" / "send_friend_im.mjs": [
        "skillName: 'friend-im'",
        "initiatePeerSession",
    ],
    ROOT / "Friends" / "agent-mutual-learning" / "scripts" / "start_mutual_learning.mjs": [
        "skillName: 'agent-mutual-learning'",
        "initiatePeerSession",
    ],
    ROOT / "Base" / "p2p-session-handoff" / "scripts" / "lib" / "peer_session.mjs": [
        "relayConnectTicket",
        "createConnectTicket",
        "introspectConnectTicket",
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
