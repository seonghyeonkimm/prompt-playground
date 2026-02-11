import db from "@/lib/db";
import { ensureInitialized } from "@/lib/init";
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
  project_path: string;
  session_count: number;
  turn_count: number;
}

interface RecentSession {
  id: string;
  project_path: string | null;
  git_branch: string | null;
  started_at: string;
  last_activity_at: string | null;
  turn_count: number;
  last_prompt: string | null;
}

function getStats() {
  ensureInitialized();

  const summary = db
    .prepare(
      `SELECT COUNT(DISTINCT s.id) as total_sessions, COUNT(t.id) as total_turns,
              MIN(s.started_at) as first_session, MAX(s.started_at) as last_session
       FROM sessions s LEFT JOIN conversation_turns t ON s.id = t.session_id
       WHERE s.started_at >= datetime('now', '-7 days')`
    )
    .get() as Stats;

  const daily = db
    .prepare(
      `SELECT DATE(user_prompt_at) as date, COUNT(*) as count
       FROM conversation_turns WHERE user_prompt_at >= datetime('now', '-7 days')
       GROUP BY DATE(user_prompt_at) ORDER BY date DESC`
    )
    .all() as DailyCount[];

  const topProjects = db
    .prepare(
      `SELECT s.project_path, COUNT(DISTINCT s.id) as session_count, COUNT(t.id) as turn_count
       FROM sessions s LEFT JOIN conversation_turns t ON s.id = t.session_id
       WHERE s.started_at >= datetime('now', '-7 days') AND s.project_path IS NOT NULL
       GROUP BY s.project_path ORDER BY turn_count DESC LIMIT 5`
    )
    .all() as TopProject[];

  const recentSessions = db
    .prepare(
      `SELECT s.id, s.project_path, s.git_branch, s.started_at, s.last_activity_at, s.turn_count,
              (SELECT user_prompt FROM conversation_turns WHERE session_id = s.id ORDER BY turn_number DESC LIMIT 1) as last_prompt
       FROM sessions s ORDER BY s.last_activity_at DESC LIMIT 5`
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

function shortPath(p: string | null) {
  if (!p || p === "unknown") return "unknown";
  const parts = p.split("/");
  return parts.slice(-2).join("/");
}

export const dynamic = "force-dynamic";

export default function Dashboard() {
  const { summary, daily, topProjects, recentSessions } = getStats();

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <span className="text-xs text-green-500 flex items-center gap-1">
          <span className="w-2 h-2 bg-green-500 rounded-full inline-block animate-pulse" />
          Live (file watching)
        </span>
      </div>

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
                    <span className="text-xs text-[var(--muted-foreground)]">{d.count}</span>
                    <div
                      className="w-full bg-[var(--accent)] rounded-sm min-h-[2px]"
                      style={{ height: `${height}%` }}
                    />
                    <span className="text-[10px] text-[var(--muted-foreground)]">
                      {new Date(d.date).toLocaleDateString("en-US", { weekday: "short" })}
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
                <div key={p.project_path} className="px-4 py-3 flex justify-between">
                  <span className="font-mono text-sm truncate">
                    {shortPath(p.project_path)}
                  </span>
                  <span className="text-[var(--muted-foreground)] text-sm whitespace-nowrap ml-4">
                    {p.session_count}s, {p.turn_count}t
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
                No sessions found. Claude Code transcripts will appear automatically.
              </div>
            ) : (
              recentSessions.map((s) => (
                <Link
                  key={s.id}
                  href={`/sessions/${s.id}`}
                  className="block px-4 py-3 hover:bg-[var(--muted)] transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-[var(--muted-foreground)]">
                        {shortPath(s.project_path)}
                      </span>
                      {s.git_branch && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--muted)] text-[var(--muted-foreground)]">
                          {s.git_branch}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-[var(--muted-foreground)]">
                      {formatDate(s.last_activity_at || s.started_at)}
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
      <p className="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">{label}</p>
      <p className={`mt-1 ${isText ? "text-sm" : "text-2xl font-bold"}`}>{value}</p>
    </div>
  );
}
