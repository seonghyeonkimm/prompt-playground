#!/usr/bin/env python3
"""SessionEnd hook: Mark session as ended and optionally record transcript path."""
import json
import sys
import urllib.request
from datetime import datetime, timezone


def main():
    input_data = json.load(sys.stdin)
    session_id = input_data.get("session_id", "")
    transcript_path = input_data.get("transcript_path", "")
    reason = input_data.get("reason", "")

    if not session_id:
        sys.exit(0)

    timestamp = datetime.now(timezone.utc).isoformat()

    payload = json.dumps(
        {
            "session_id": session_id,
            "ended_at": timestamp,
            "end_reason": reason,
            "transcript_path": transcript_path,
        }
    ).encode()

    req = urllib.request.Request(
        "http://localhost:3210/api/logs/session",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="PATCH",
    )
    try:
        urllib.request.urlopen(req, timeout=5)
    except Exception:
        pass

    sys.exit(0)


if __name__ == "__main__":
    main()
