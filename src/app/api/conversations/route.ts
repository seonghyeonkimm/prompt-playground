import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { ensureInitialized } from "@/lib/init";

export const dynamic = "force-dynamic";

// GET /api/conversations — All turns across sessions with pagination
export async function GET(request: NextRequest) {
  ensureInitialized();

  try {
    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "30")));
    const project = searchParams.get("project");
    const order = searchParams.get("order") === "asc" ? "ASC" : "DESC";
    const offset = (page - 1) * limit;

    let whereClause = "WHERE 1=1";
    const params: (string | number)[] = [];

    if (project) {
      whereClause += " AND s.project_path LIKE ?";
      params.push(`%${project}%`);
    }

    const countRow = db
      .prepare(
        `SELECT COUNT(*) as total FROM conversation_turns ct JOIN sessions s ON ct.session_id = s.id ${whereClause}`
      )
      .get(...params) as { total: number };

    params.push(limit, offset);

    const turns = db
      .prepare(
        `SELECT ct.id, ct.session_id, ct.turn_number,
                ct.user_prompt, ct.user_prompt_at,
                ct.assistant_text, ct.assistant_tools, ct.assistant_at, ct.model,
                s.project_path, s.git_branch
         FROM conversation_turns ct
         JOIN sessions s ON ct.session_id = s.id
         ${whereClause}
         ORDER BY ct.user_prompt_at ${order}
         LIMIT ? OFFSET ?`
      )
      .all(...params);

    return NextResponse.json({
      turns,
      pagination: {
        page,
        limit,
        total: countRow.total,
        totalPages: Math.ceil(countRow.total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching conversations:", error);
    return NextResponse.json(
      { error: "Failed to fetch conversations" },
      { status: 500 }
    );
  }
}
