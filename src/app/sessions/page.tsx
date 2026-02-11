import db from "@/lib/db";
import { ensureInitialized } from "@/lib/init";
import Link from "next/link";

interface Session {
  id: string;
  project_path: string | null;
  git_branch: string | null;
  started_at: string;
  last_activity_at: string | null;
  turn_count: number;
  last_prompt: string | null;
}

function getSessions(page: number, project?: string) {
  ensureInitialized();
  const limit = 20;
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
      `SELECT s.id, s.project_path, s.git_branch, s.started_at, s.last_activity_at, s.turn_count,
              (SELECT user_prompt FROM conversation_turns WHERE session_id = s.id ORDER BY turn_number DESC LIMIT 1) as last_prompt
       FROM sessions s ${whereClause}
       ORDER BY s.last_activity_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params) as Session[];

  return { sessions, total: countRow.total, totalPages: Math.ceil(countRow.total / limit) };
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function shortPath(p: string | null) {
  if (!p || p === "unknown") return "unknown";
  const parts = p.split("/");
  return parts.slice(-2).join("/");
}

export const dynamic = "force-dynamic";

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; project?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page || "1"));
  const project = sp.project;
  const { sessions, total, totalPages } = getSessions(page, project);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Sessions</h1>
        <span className="text-sm text-[var(--muted-foreground)]">{total} total</span>
      </div>

      <form className="flex gap-2">
        <input
          type="text"
          name="project"
          placeholder="Filter by project path..."
          defaultValue={project || ""}
          className="flex-1 bg-[var(--muted)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="bg-[var(--accent)] text-white px-4 py-2 rounded-lg text-sm hover:opacity-90"
        >
          Filter
        </button>
      </form>

      <div className="bg-[var(--card)] rounded-lg border border-[var(--border)] divide-y divide-[var(--border)]">
        {sessions.length === 0 ? (
          <div className="px-4 py-12 text-center text-[var(--muted-foreground)]">
            No sessions found.
          </div>
        ) : (
          sessions.map((s) => (
            <Link
              key={s.id}
              href={`/sessions/${s.id}`}
              className="block px-4 py-4 hover:bg-[var(--muted)] transition-colors"
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm">{shortPath(s.project_path)}</span>
                  {s.git_branch && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--muted)] text-[var(--muted-foreground)]">
                      {s.git_branch}
                    </span>
                  )}
                </div>
                <span className="text-xs text-[var(--muted-foreground)] whitespace-nowrap">
                  {formatDate(s.last_activity_at || s.started_at)}
                </span>
              </div>
              {s.last_prompt && (
                <p className="text-sm mt-2 text-[var(--muted-foreground)] truncate">
                  {s.last_prompt}
                </p>
              )}
              <span className="text-xs text-[var(--muted-foreground)] mt-1 block">
                {s.turn_count} turns
              </span>
            </Link>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          {page > 1 && (
            <Link
              href={`/sessions?page=${page - 1}${project ? `&project=${project}` : ""}`}
              className="px-3 py-1 rounded bg-[var(--muted)] text-sm hover:bg-[var(--border)]"
            >
              Previous
            </Link>
          )}
          <span className="px-3 py-1 text-sm text-[var(--muted-foreground)]">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/sessions?page=${page + 1}${project ? `&project=${project}` : ""}`}
              className="px-3 py-1 rounded bg-[var(--muted)] text-sm hover:bg-[var(--border)]"
            >
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
