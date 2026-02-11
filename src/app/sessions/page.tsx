import db from "@/lib/db";
import Link from "next/link";

interface Session {
  id: string;
  cwd: string | null;
  source: string | null;
  started_at: string;
  ended_at: string | null;
  turn_count: number;
  last_prompt: string | null;
}

function getSessions(page: number, cwd?: string) {
  const limit = 20;
  const offset = (page - 1) * limit;

  let whereClause = "WHERE 1=1";
  const params: (string | number)[] = [];

  if (cwd) {
    whereClause += " AND s.cwd LIKE ?";
    params.push(`%${cwd}%`);
  }

  const countRow = db
    .prepare(
      `SELECT COUNT(DISTINCT s.id) as total FROM sessions s ${whereClause}`
    )
    .get(...params) as { total: number };

  params.push(limit, offset);
  const sessions = db
    .prepare(
      `
    SELECT s.id, s.cwd, s.source, s.started_at, s.ended_at,
           COUNT(t.id) as turn_count,
           (SELECT prompt FROM conversation_turns WHERE session_id = s.id ORDER BY turn_number DESC LIMIT 1) as last_prompt
    FROM sessions s
    LEFT JOIN conversation_turns t ON s.id = t.session_id
    ${whereClause}
    GROUP BY s.id
    ORDER BY s.started_at DESC
    LIMIT ? OFFSET ?
  `
    )
    .all(...params) as Session[];

  return {
    sessions,
    total: countRow.total,
    totalPages: Math.ceil(countRow.total / limit),
  };
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortPath(cwd: string | null) {
  if (!cwd) return "unknown";
  const parts = cwd.split("/");
  return parts.slice(-2).join("/");
}

export const dynamic = "force-dynamic";

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; cwd?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page || "1"));
  const cwd = sp.cwd;
  const { sessions, total, totalPages } = getSessions(page, cwd);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Sessions</h1>
        <span className="text-sm text-[var(--muted-foreground)]">
          {total} total
        </span>
      </div>

      {/* Filter */}
      <form className="flex gap-2">
        <input
          type="text"
          name="cwd"
          placeholder="Filter by project path..."
          defaultValue={cwd || ""}
          className="flex-1 bg-[var(--muted)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="bg-[var(--accent)] text-white px-4 py-2 rounded-lg text-sm hover:opacity-90"
        >
          Filter
        </button>
      </form>

      {/* Session List */}
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
                <div>
                  <span className="font-mono text-sm">
                    {shortPath(s.cwd)}
                  </span>
                  {s.source && (
                    <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-[var(--muted)] text-[var(--muted-foreground)]">
                      {s.source}
                    </span>
                  )}
                </div>
                <span className="text-xs text-[var(--muted-foreground)] whitespace-nowrap">
                  {formatDate(s.started_at)}
                </span>
              </div>
              {s.last_prompt && (
                <p className="text-sm mt-2 text-[var(--muted-foreground)] truncate">
                  {s.last_prompt}
                </p>
              )}
              <div className="flex gap-4 mt-2 text-xs text-[var(--muted-foreground)]">
                <span>{s.turn_count} turns</span>
                {s.ended_at && <span>ended {formatDate(s.ended_at)}</span>}
              </div>
            </Link>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          {page > 1 && (
            <Link
              href={`/sessions?page=${page - 1}${cwd ? `&cwd=${cwd}` : ""}`}
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
              href={`/sessions?page=${page + 1}${cwd ? `&cwd=${cwd}` : ""}`}
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
