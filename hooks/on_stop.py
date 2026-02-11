#!/usr/bin/env python3
"""Stop hook: Extract last assistant response from transcript JSONL and record it."""
import json
import sys
import urllib.request
from datetime import datetime, timezone


def get_last_assistant_response(transcript_path: str) -> str | None:
    """Extract the last assistant message text from a JSONL transcript file."""
    last_response = None
    try:
        with open(transcript_path, "r") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue

                if entry.get("role") == "assistant":
                    texts = []
                    for block in entry.get("content", []):
                        if isinstance(block, dict) and block.get("type") == "text":
                            texts.append(block["text"])
                        elif isinstance(block, str):
                            texts.append(block)
                    if texts:
                        last_response = "\n".join(texts)
    except (FileNotFoundError, PermissionError):
        pass
    return last_response


def main():
    input_data = json.load(sys.stdin)
    session_id = input_data.get("session_id", "")
    transcript_path = input_data.get("transcript_path", "")

    if not session_id or not transcript_path:
        sys.exit(0)

    timestamp = datetime.now(timezone.utc).isoformat()
    response_text = get_last_assistant_response(transcript_path)

    if not response_text:
        sys.exit(0)

    # Truncate very long responses to avoid large payloads
    max_len = 50000
    if len(response_text) > max_len:
        response_text = response_text[:max_len] + "\n...(truncated)"

    payload = json.dumps(
        {
            "session_id": session_id,
            "response": response_text,
            "timestamp": timestamp,
        }
    ).encode()

    req = urllib.request.Request(
        "http://localhost:3210/api/logs/response",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=5)
    except Exception:
        pass

    sys.exit(0)


if __name__ == "__main__":
    main()
