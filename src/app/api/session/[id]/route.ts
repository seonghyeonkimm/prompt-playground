import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

// GET /api/session/:id — Session detail with all turns
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const session = db.prepare(`
    SELECT * FROM sessions WHERE id = ?
  `).get(id);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const turns = db.prepare(`
    SELECT id, turn_number, prompt, prompt_at, response, response_at
    FROM conversation_turns
    WHERE session_id = ?
    ORDER BY turn_number ASC
  `).all(id);

  return NextResponse.json({ session, turns });
}
