import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

// GET /api/search?q=keyword — Full-text search
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = searchParams.get("q");
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20")));

  if (!q) {
    return NextResponse.json({ error: "q parameter required" }, { status: 400 });
  }

  // Escape FTS5 special characters and add prefix matching
  const ftsQuery = q
    .replace(/['"]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term}"*`)
    .join(" ");

  try {
    const results = db.prepare(`
      SELECT ct.id, ct.session_id, ct.turn_number, ct.prompt, ct.response,
             ct.prompt_at, s.cwd,
             snippet(conversation_fts, 0, '<mark>', '</mark>', '...', 32) as prompt_snippet,
             snippet(conversation_fts, 1, '<mark>', '</mark>', '...', 32) as response_snippet
      FROM conversation_fts fts
      JOIN conversation_turns ct ON fts.rowid = ct.id
      JOIN sessions s ON ct.session_id = s.id
      WHERE conversation_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(ftsQuery, limit);

    return NextResponse.json({ results, query: q });
  } catch {
    // Fallback to LIKE search if FTS query is malformed
    const results = db.prepare(`
      SELECT ct.id, ct.session_id, ct.turn_number, ct.prompt, ct.response,
             ct.prompt_at, s.cwd
      FROM conversation_turns ct
      JOIN sessions s ON ct.session_id = s.id
      WHERE ct.prompt LIKE ? OR ct.response LIKE ?
      ORDER BY ct.prompt_at DESC
      LIMIT ?
    `).all(`%${q}%`, `%${q}%`, limit);

    return NextResponse.json({ results, query: q });
  }
}
