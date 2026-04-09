#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/didi/Project/AgentSquared/Skills"
LOCAL_AGENT_ID="${LOCAL_AGENT_ID:-bigclaw@jessica_dlq}"
LOCAL_KEY_FILE="${LOCAL_KEY_FILE:-/Users/didi/.openclaw/workspace/AgentSquared/bigclaw_jessica_dlq/identity/runtime-key.json}"
TARGET_AGENT_ID="${TARGET_AGENT_ID:-claw@Skiyo}"
PROMPT_TEXT="${PROMPT_TEXT:-say hello to claw@Skiyo, and learn his skills}"
REMOTE_HOST="${REMOTE_HOST:-root@123.57.191.136}"
REMOTE_PASSWORD="${REMOTE_PASSWORD:-}"
REMOTE_SKILLS_DIR="${REMOTE_SKILLS_DIR:-/usr/local/lib/node_modules/openclaw/skills/agentsquared-official-skills}"
REMOTE_INBOX_DIR="${REMOTE_INBOX_DIR:-/root/.openclaw/workspace/AgentSquared/claw_Skiyo/inbox/entries}"
LOCAL_INBOX_DIR="${LOCAL_INBOX_DIR:-/Users/didi/.openclaw/workspace/AgentSquared/bigclaw_jessica_dlq/inbox/entries}"

if [[ -z "${REMOTE_PASSWORD}" ]]; then
  echo "REMOTE_PASSWORD is required" >&2
  exit 1
fi

TMP_JSON="$(mktemp)"
trap 'rm -f "$TMP_JSON"' EXIT

cd "$ROOT"

echo "[1/4] sending mutual-learning message from ${LOCAL_AGENT_ID} to ${TARGET_AGENT_ID}..."
node a2_cli.mjs friend msg \
  --agent-id "$LOCAL_AGENT_ID" \
  --key-file "$LOCAL_KEY_FILE" \
  --target-agent "$TARGET_AGENT_ID" \
  --text "$PROMPT_TEXT" \
  --skill-file friend-skills/agent-mutual-learning/skill.md | tee "$TMP_JSON"

CONVERSATION_KEY="$(node -e 'const fs=require("fs"); const data=JSON.parse(fs.readFileSync(process.argv[1], "utf8")); process.stdout.write(`${data.conversationKey||""}`)' "$TMP_JSON")"
PEER_SESSION_ID="$(node -e 'const fs=require("fs"); const data=JSON.parse(fs.readFileSync(process.argv[1], "utf8")); process.stdout.write(`${data.peerSessionId||""}`)' "$TMP_JSON")"
OWNER_DELIVERED="$(node -e 'const fs=require("fs"); const data=JSON.parse(fs.readFileSync(process.argv[1], "utf8")); process.stdout.write(`${Boolean(data.ownerDelivery?.delivered)}`)' "$TMP_JSON")"

if [[ -z "$CONVERSATION_KEY" ]]; then
  echo "conversationKey missing from sender output" >&2
  exit 1
fi

echo
echo "[2/4] sender output summary"
echo "conversationKey=$CONVERSATION_KEY"
echo "peerSessionId=$PEER_SESSION_ID"
echo "ownerDelivered=$OWNER_DELIVERED"

echo
echo "[3/4] local sender inbox entries for $CONVERSATION_KEY"
python3 - <<'PY' "$LOCAL_INBOX_DIR" "$CONVERSATION_KEY"
import glob, json, os, sys
base=sys.argv[1]
key=sys.argv[2]
rows=[]
for p in sorted(glob.glob(os.path.join(base, '*.json'))):
    try:
        data=json.load(open(p))
    except Exception:
        continue
    if data.get('conversationKey') != key:
        continue
    rows.append({
        'file': os.path.basename(p),
        'createdAt': data.get('createdAt'),
        'summary': data.get('summary'),
        'ownerDelivery': data.get('ownerDelivery'),
    })
print(json.dumps(rows, ensure_ascii=False, indent=2))
PY

echo
echo "[4/4] remote receiver inbox entries for $CONVERSATION_KEY"
sshpass -p "$REMOTE_PASSWORD" ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" "python3 - <<'PY'
import glob, json, os
base='${REMOTE_INBOX_DIR}'
key='${CONVERSATION_KEY}'
rows=[]
for p in sorted(glob.glob(os.path.join(base, '*.json'))):
    try:
        data=json.load(open(p))
    except Exception:
        continue
    if data.get('conversationKey') != key:
        continue
    owner_report=data.get('ownerReport') or {}
    rows.append({
        'file': os.path.basename(p),
        'createdAt': data.get('createdAt'),
        'ownerDelivery': data.get('ownerDelivery'),
        'turnIndex': owner_report.get('turnIndex'),
        'decision': owner_report.get('decision'),
        'stopReason': owner_report.get('stopReason'),
        'finalize': owner_report.get('finalize'),
        'summary': owner_report.get('summary')
    })
print(json.dumps(rows, ensure_ascii=False, indent=2))
PY"

echo
echo "done: inspect sender/receiver entries above for conversationKey=$CONVERSATION_KEY"
