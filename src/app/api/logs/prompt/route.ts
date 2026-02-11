import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

// POST /api/logs/prompt — Record a user prompt (creates new turn)
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { session_id, prompt, timestamp, cwd } = body;

  if (!session_id || !prompt) {
    return NextResponse.json(
      { error: "session_id and prompt required" },
      { status: 400 }
    );
  }

  const ts = timestamp || new Date().toISOString();

  // Ensure session exists (auto-create if hook order is out of sync)
  db.prepare(`
    INSERT OR IGNORE INTO sessions (id, cwd, started_at)
    VALUES (?, ?, ?)
  `).run(session_id, cwd || null, ts);

  // Get next turn number for this session
  const row = db.prepare(`
    SELECT COALESCE(MAX(turn_number), 0) + 1 as next_turn
    FROM conversation_turns
    WHERE session_id = ?
  `).get(session_id) as { next_turn: number };

  db.prepare(`
    INSERT INTO conversation_turns (session_id, turn_number, prompt, prompt_at)
    VALUES (?, ?, ?, ?)
  `).run(session_id, row.next_turn, prompt, ts);

  return NextResponse.json({ ok: true, turn_number: row.next_turn });
}
