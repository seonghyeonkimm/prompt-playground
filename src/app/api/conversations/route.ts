import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { ensureInitialized } from "@/lib/init";

export const dynamic = "force-dynamic";

// SQL conditions to filter out system-generated user prompts
const HUMAN_FILTER_SQL = `
  AND ct.user_prompt NOT LIKE '<command-%'
  AND ct.user_prompt NOT LIKE '<task-notification%'
  AND ct.user_prompt NOT LIKE '<system-%'
  AND ct.user_prompt NOT LIKE '<system\_%' ESCAPE '\\'
  AND ct.user_prompt NOT LIKE '<local-command%'
  AND ct.user_prompt NOT LIKE '<user-prompt-submit-hook%'
  AND ct.user_prompt NOT LIKE '<teammate-message%'
  AND ct.user_prompt NOT LIKE '[Request interrupted%'
  AND ct.user_prompt NOT LIKE 'Base directory for this skill:%'
  AND ct.user_prompt NOT LIKE '## Context (precomputed)%'
  AND ct.user_prompt NOT LIKE 'This session is being continued%'
  AND NOT (ct.user_prompt LIKE '# %' AND length(ct.user_prompt) > 500 AND ct.user_prompt LIKE '%## %')
`;

// GET /api/conversations — All turns across sessions with pagination
export async function GET(request: NextRequest) {
  ensureInitialized();

  try {
    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "30")));
    const project = searchParams.get("project");
    const order = searchParams.get("order") === "asc" ? "ASC" : "DESC";
    const human = searchParams.get("human") === "true";
    const offset = (page - 1) * limit;

    let whereClause = "WHERE 1=1";
    const params: (string | number)[] = [];

    if (project) {
      whereClause += " AND s.project_path LIKE ?";
      params.push(`%${project}%`);
    }

    if (human) {
      whereClause += HUMAN_FILTER_SQL;
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
