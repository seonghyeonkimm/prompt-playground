import db from "@/lib/db";
import Link from "next/link";

interface Stats {
  total_sessions: number;
  total_turns: number;
  first_session: string | null;
  last_session: string | null;
}

interface DailyCount {
  date: string;
  count: number;
}

interface TopProject {
  cwd: string;
  session_count: number;
  turn_count: number;
}

interface RecentSession {
  id: string;
  cwd: string | null;
  started_at: string;
  turn_count: number;
  last_prompt: string | null;
}

function getStats() {
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
    WHERE s.started_at >= datetime('now', '-7 days')
  `
    )
    .get() as Stats;

  const daily = db
    .prepare(
      `
    SELECT DATE(prompt_at) as date, COUNT(*) as count
    FROM conversation_turns
    WHERE prompt_at >= datetime('now', '-7 days')
    GROUP BY DATE(prompt_at)
    ORDER BY date DESC
  `
    )
    .all() as DailyCount[];

  const topProjects = db
    .prepare(
      `
    SELECT s.cwd, COUNT(DISTINCT s.id) as session_count, COUNT(t.id) as turn_count
    FROM sessions s
    LEFT JOIN conversation_turns t ON s.id = t.session_id
    WHERE s.started_at >= datetime('now', '-7 days') AND s.cwd IS NOT NULL
    GROUP BY s.cwd
    ORDER BY turn_count DESC
    LIMIT 5
  `
    )
    .all() as TopProject[];

  const recentSessions = db
    .prepare(
      `
    SELECT s.id, s.cwd, s.started_at, COUNT(t.id) as turn_count,
           (SELECT prompt FROM conversation_turns WHERE session_id = s.id ORDER BY turn_number DESC LIMIT 1) as last_prompt
    FROM sessions s
    LEFT JOIN conversation_turns t ON s.id = t.session_id
    GROUP BY s.id
    ORDER BY s.started_at DESC
    LIMIT 5
  `
    )
    .all() as RecentSession[];

  return { summary, daily, topProjects, recentSessions };
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

export default function Dashboard() {
  const { summary, daily, topProjects, recentSessions } = getStats();

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Sessions (7d)" value={summary.total_sessions} />
        <StatCard label="Turns (7d)" value={summary.total_turns} />
        <StatCard
          label="Avg turns/session"
          value={
            summary.total_sessions > 0
              ? Math.round(summary.total_turns / summary.total_sessions)
              : 0
          }
        />
        <StatCard
          label="Last activity"
          value={formatDate(summary.last_session)}
          isText
        />
      </div>

      {/* Daily Activity */}
      {daily.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Daily Activity</h2>
          <div className="flex items-end gap-1 h-32 bg-[var(--card)] rounded-lg p-4 border border-[var(--border)]">
            {daily
              .slice()
              .reverse()
              .map((d) => {
                const maxCount = Math.max(...daily.map((x) => x.count));
                const height = maxCount > 0 ? (d.count / maxCount) * 100 : 0;
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs text-[var(--muted-foreground)]">
                      {d.count}
                    </span>
                    <div
                      className="w-full bg-[var(--accent)] rounded-sm min-h-[2px]"
                      style={{ height: `${height}%` }}
                    />
                    <span className="text-[10px] text-[var(--muted-foreground)]">
                      {new Date(d.date).toLocaleDateString("en-US", {
                        weekday: "short",
                      })}
                    </span>
                  </div>
                );
              })}
          </div>
        </section>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Top Projects */}
        {topProjects.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-3">Top Projects (7d)</h2>
            <div className="bg-[var(--card)] rounded-lg border border-[var(--border)] divide-y divide-[var(--border)]">
              {topProjects.map((p) => (
                <div key={p.cwd} className="px-4 py-3 flex justify-between">
                  <span className="font-mono text-sm truncate">
                    {shortPath(p.cwd)}
                  </span>
                  <span className="text-[var(--muted-foreground)] text-sm whitespace-nowrap ml-4">
                    {p.session_count} sessions, {p.turn_count} turns
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Recent Sessions */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Recent Sessions</h2>
          <div className="bg-[var(--card)] rounded-lg border border-[var(--border)] divide-y divide-[var(--border)]">
            {recentSessions.length === 0 ? (
              <div className="px-4 py-8 text-center text-[var(--muted-foreground)]">
                No sessions yet. Start using Claude Code with hooks enabled.
              </div>
            ) : (
              recentSessions.map((s) => (
                <Link
                  key={s.id}
                  href={`/sessions/${s.id}`}
                  className="block px-4 py-3 hover:bg-[var(--muted)] transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <span className="font-mono text-sm text-[var(--muted-foreground)]">
                      {shortPath(s.cwd)}
                    </span>
                    <span className="text-xs text-[var(--muted-foreground)]">
                      {formatDate(s.started_at)}
                    </span>
                  </div>
                  {s.last_prompt && (
                    <p className="text-sm mt-1 truncate">{s.last_prompt}</p>
                  )}
                  <span className="text-xs text-[var(--muted-foreground)]">
                    {s.turn_count} turns
                  </span>
                </Link>
              ))
            )}
          </div>
          {recentSessions.length > 0 && (
            <Link
              href="/sessions"
              className="block text-center text-sm text-[var(--accent)] mt-2 hover:underline"
            >
              View all sessions
            </Link>
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  isText,
}: {
  label: string;
  value: number | string;
  isText?: boolean;
}) {
  return (
    <div className="bg-[var(--card)] rounded-lg border border-[var(--border)] p-4">
      <p className="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">
        {label}
      </p>
      <p className={`mt-1 ${isText ? "text-sm" : "text-2xl font-bold"}`}>
        {value}
      </p>
    </div>
  );
}
