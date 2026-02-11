import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

// POST /api/logs/response — Record Claude's response (update latest turn)
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { session_id, response, timestamp } = body;

  if (!session_id || !response) {
    return NextResponse.json(
      { error: "session_id and response required" },
      { status: 400 }
    );
  }

  const ts = timestamp || new Date().toISOString();

  // Update the latest turn that has no response yet
  const result = db.prepare(`
    UPDATE conversation_turns
    SET response = ?, response_at = ?
    WHERE id = (
      SELECT id FROM conversation_turns
      WHERE session_id = ? AND response IS NULL
      ORDER BY turn_number DESC
      LIMIT 1
    )
  `).run(response, ts, session_id);

  if (result.changes === 0) {
    return NextResponse.json(
      { error: "No pending turn found for this session" },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true });
}
