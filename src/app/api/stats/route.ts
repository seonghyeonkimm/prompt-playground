import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { ensureInitialized } from "@/lib/init";

export const dynamic = "force-dynamic";

// GET /api/stats — Usage statistics
export async function GET(request: NextRequest) {
  ensureInitialized();

  const { searchParams } = request.nextUrl;
  const days = Math.max(1, parseInt(searchParams.get("days") || "7"));

  const summary = db
    .prepare(
      `
    SELECT
      COUNT(DISTINCT s.id) as total_sessions,
      COUNT(t.id) as total_turns,
      MIN(s.started_at) as first_session,
      MAX(s.started_at) as last_session
    FROM sessions s
    LEFT JOIN conversation_turns t ON s.id = t.session_id
    WHERE s.started_at >= datetime('now', ?)
  `
    )
    .get(`-${days} days`);

  const daily = db
    .prepare(
      `
    SELECT DATE(user_prompt_at) as date, COUNT(*) as count
    FROM conversation_turns
    WHERE user_prompt_at >= datetime('now', ?)
    GROUP BY DATE(user_prompt_at)
    ORDER BY date DESC
  `
    )
    .all(`-${days} days`);

  const topProjects = db
    .prepare(
      `
    SELECT s.project_path, COUNT(DISTINCT s.id) as session_count, COUNT(t.id) as turn_count
    FROM sessions s
    LEFT JOIN conversation_turns t ON s.id = t.session_id
    WHERE s.started_at >= datetime('now', ?) AND s.project_path IS NOT NULL
    GROUP BY s.project_path
    ORDER BY turn_count DESC
    LIMIT 10
  `
    )
    .all(`-${days} days`);

  return NextResponse.json({ summary, daily, topProjects, days });
}
