import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { ensureInitialized } from "@/lib/init";

export const dynamic = "force-dynamic";

// GET /api/session/:id — Session detail with all turns
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  ensureInitialized();

  const { id } = await params;

  const session = db
    .prepare("SELECT * FROM sessions WHERE id = ?")
    .get(id);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const turns = db
    .prepare(
      `SELECT id, turn_number, user_prompt, user_prompt_at, assistant_text, assistant_tools, assistant_at, model
       FROM conversation_turns WHERE session_id = ? ORDER BY turn_number ASC`
    )
    .all(id);

  return NextResponse.json({ session, turns });
}
