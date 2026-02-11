#!/bin/bash
# Hook: UserPromptSubmit — Record user prompt
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
PROMPT=$(echo "$INPUT" | jq -r '.prompt // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

if [ -z "$SESSION_ID" ] || [ -z "$PROMPT" ]; then
  exit 0
fi

curl -s -X POST http://localhost:3210/api/logs/prompt \
  -H "Content-Type: application/json" \
  -d "$(jq -n \
    --arg sid "$SESSION_ID" \
    --arg prompt "$PROMPT" \
    --arg ts "$TIMESTAMP" \
    --arg cwd "$CWD" \
    '{session_id: $sid, prompt: $prompt, timestamp: $ts, cwd: $cwd}')" \
  > /dev/null 2>&1

exit 0
