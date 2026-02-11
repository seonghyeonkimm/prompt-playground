import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { ensureInitialized } from "@/lib/init";

export const dynamic = "force-dynamic";

// GET /api/search?q=keyword — Full-text search
export async function GET(request: NextRequest) {
  ensureInitialized();

  const { searchParams } = request.nextUrl;
  const q = searchParams.get("q");
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20")));

  if (!q) {
    return NextResponse.json({ error: "q parameter required" }, { status: 400 });
  }

  const ftsQuery = q
    .replace(/['"]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term}"*`)
    .join(" ");

  try {
    const results = db
      .prepare(
        `
      SELECT ct.id, ct.session_id, ct.turn_number, ct.user_prompt, ct.assistant_text,
             ct.user_prompt_at, ct.model, s.project_path,
             snippet(conversation_fts, 0, '<mark>', '</mark>', '...', 32) as prompt_snippet,
             snippet(conversation_fts, 1, '<mark>', '</mark>', '...', 32) as response_snippet
      FROM conversation_fts fts
      JOIN conversation_turns ct ON fts.rowid = ct.id
      JOIN sessions s ON ct.session_id = s.id
      WHERE conversation_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `
      )
      .all(ftsQuery, limit);

    return NextResponse.json({ results, query: q });
  } catch {
    const results = db
      .prepare(
        `
      SELECT ct.id, ct.session_id, ct.turn_number, ct.user_prompt, ct.assistant_text,
             ct.user_prompt_at, ct.model, s.project_path
      FROM conversation_turns ct
      JOIN sessions s ON ct.session_id = s.id
      WHERE ct.user_prompt LIKE ? OR ct.assistant_text LIKE ?
      ORDER BY ct.user_prompt_at DESC
      LIMIT ?
    `
      )
      .all(`%${q}%`, `%${q}%`, limit);

    return NextResponse.json({ results, query: q });
  }
}
