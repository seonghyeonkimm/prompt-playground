import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { ensureInitialized } from "@/lib/init";

export const dynamic = "force-dynamic";

// GET /api/sessions — List sessions with pagination
export async function GET(request: NextRequest) {
  ensureInitialized();

  const { searchParams } = request.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20")));
  const project = searchParams.get("project");
  const offset = (page - 1) * limit;

  let whereClause = "WHERE 1=1";
  const params: (string | number)[] = [];

  if (project) {
    whereClause += " AND s.project_path LIKE ?";
    params.push(`%${project}%`);
  }

  const countRow = db
    .prepare(`SELECT COUNT(*) as total FROM sessions s ${whereClause}`)
    .get(...params) as { total: number };

  params.push(limit, offset);

  const sessions = db
    .prepare(
      `
    SELECT s.*,
           (SELECT user_prompt FROM conversation_turns WHERE session_id = s.id ORDER BY turn_number DESC LIMIT 1) as last_prompt
    FROM sessions s
    ${whereClause}
    ORDER BY s.last_activity_at DESC
    LIMIT ? OFFSET ?
  `
    )
    .all(...params);

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
