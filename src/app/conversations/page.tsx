import db from "@/lib/db";
import { ensureInitialized } from "@/lib/init";
import { GlobalConversationView } from "@/components/global-conversation-view";
import type { GlobalTurn } from "@/components/turn-card";

function getInitialData() {
  ensureInitialized();
  const limit = 30;

  const countRow = db
    .prepare("SELECT COUNT(*) as total FROM conversation_turns")
    .get() as { total: number };

  const turns = db
    .prepare(
      `SELECT ct.id, ct.session_id, ct.turn_number,
              ct.user_prompt, ct.user_prompt_at,
              ct.assistant_text, ct.assistant_tools, ct.assistant_at, ct.model,
              s.project_path, s.git_branch
       FROM conversation_turns ct
       JOIN sessions s ON ct.session_id = s.id
       ORDER BY ct.user_prompt_at DESC
       LIMIT ?`
    )
    .all(limit) as GlobalTurn[];

  const projects = db
    .prepare(
      "SELECT DISTINCT project_path FROM sessions WHERE project_path IS NOT NULL ORDER BY project_path"
    )
    .all() as { project_path: string }[];

  return {
    turns,
    pagination: {
      page: 1,
      limit,
      total: countRow.total,
      totalPages: Math.ceil(countRow.total / limit),
    },
    projects: projects.map((p) => p.project_path),
  };
}

export const dynamic = "force-dynamic";

export default function ConversationsPage() {
  const { turns, pagination, projects } = getInitialData();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Conversations</h1>
        <span className="text-sm text-[var(--muted-foreground)]">
          {pagination.total} turns
        </span>
      </div>
      <GlobalConversationView
        initialTurns={turns}
        initialPagination={pagination}
        projects={projects}
      />
    </div>
  );
}
