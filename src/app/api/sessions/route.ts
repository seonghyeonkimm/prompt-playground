import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

// GET /api/sessions — List sessions with pagination
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20")));
  const cwd = searchParams.get("cwd");
  const offset = (page - 1) * limit;

  let whereClause = "WHERE 1=1";
  const params: (string | number)[] = [];

  if (cwd) {
    whereClause += " AND s.cwd LIKE ?";
    params.push(`%${cwd}%`);
  }

  const countRow = db.prepare(`
    SELECT COUNT(DISTINCT s.id) as total
    FROM sessions s
    ${whereClause}
  `).get(...params) as { total: number };

  params.push(limit, offset);

  const sessions = db.prepare(`
    SELECT s.id, s.cwd, s.source, s.started_at, s.ended_at, s.end_reason,
           COUNT(t.id) as turn_count,
           (SELECT prompt FROM conversation_turns WHERE session_id = s.id ORDER BY turn_number DESC LIMIT 1) as last_prompt
    FROM sessions s
    LEFT JOIN conversation_turns t ON s.id = t.session_id
    ${whereClause}
    GROUP BY s.id
    ORDER BY s.started_at DESC
    LIMIT ? OFFSET ?
  `).all(...params);

  return NextResponse.json({
    sessions,
    pagination: {
      page,
      limit,
      total: countRow.total,
      totalPages: Math.ceil(countRow.total / limit),
    },
  });
}
