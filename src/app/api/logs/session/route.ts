import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

// POST /api/logs/session — Record session start
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { session_id, cwd, source, timestamp } = body;

  if (!session_id) {
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO sessions (id, cwd, source, started_at)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(session_id, cwd || null, source || null, timestamp || new Date().toISOString());

  return NextResponse.json({ ok: true });
}

// PATCH /api/logs/session — Update session (end)
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { session_id, ended_at, end_reason, transcript_path } = body;

  if (!session_id) {
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }

  const stmt = db.prepare(`
    UPDATE sessions
    SET ended_at = COALESCE(?, ended_at),
        end_reason = COALESCE(?, end_reason),
        transcript_path = COALESCE(?, transcript_path)
    WHERE id = ?
  `);
  stmt.run(
    ended_at || null,
    end_reason || null,
    transcript_path || null,
    session_id
  );

  return NextResponse.json({ ok: true });
}
