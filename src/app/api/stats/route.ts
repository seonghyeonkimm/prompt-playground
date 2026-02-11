import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

// GET /api/stats — Usage statistics
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const days = Math.max(1, parseInt(searchParams.get("days") || "7"));

  const summary = db.prepare(`
    SELECT
      COUNT(DISTINCT s.id) as total_sessions,
      COUNT(t.id) as total_turns,
      MIN(s.started_at) as first_session,
      MAX(s.started_at) as last_session
    FROM sessions s
    LEFT JOIN conversation_turns t ON s.id = t.session_id
    WHERE s.started_at >= datetime('now', ?)
  `).get(`-${days} days`);

  const daily = db.prepare(`
    SELECT DATE(prompt_at) as date, COUNT(*) as count
    FROM conversation_turns
    WHERE prompt_at >= datetime('now', ?)
    GROUP BY DATE(prompt_at)
    ORDER BY date DESC
  `).all(`-${days} days`);

  const topProjects = db.prepare(`
    SELECT s.cwd, COUNT(DISTINCT s.id) as session_count, COUNT(t.id) as turn_count
    FROM sessions s
    LEFT JOIN conversation_turns t ON s.id = t.session_id
    WHERE s.started_at >= datetime('now', ?) AND s.cwd IS NOT NULL
    GROUP BY s.cwd
    ORDER BY turn_count DESC
    LIMIT 10
  `).all(`-${days} days`);

  return NextResponse.json({ summary, daily, topProjects, days });
}
