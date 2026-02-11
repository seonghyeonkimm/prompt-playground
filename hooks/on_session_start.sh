#!/bin/bash
# Hook: SessionStart — Record new session
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
SOURCE=$(echo "$INPUT" | jq -r '.source // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

if [ -z "$SESSION_ID" ]; then
  exit 0
fi

curl -s -X POST http://localhost:3210/api/logs/session \
  -H "Content-Type: application/json" \
  -d "$(jq -n \
    --arg sid "$SESSION_ID" \
    --arg source "$SOURCE" \
    --arg ts "$TIMESTAMP" \
    --arg cwd "$CWD" \
    '{session_id: $sid, source: $source, timestamp: $ts, cwd: $cwd}')" \
  > /dev/null 2>&1

exit 0
