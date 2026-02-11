import db from "@/lib/db";
import { ensureInitialized } from "@/lib/init";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LiveSessionView } from "@/components/live-session-view";

interface Session {
  id: string;
  project_path: string | null;
  git_branch: string | null;
  started_at: string;
  last_activity_at: string | null;
  version: string | null;
  turn_count: number;
}

interface Turn {
  id: number;
  turn_number: number;
  user_prompt: string;
  user_prompt_at: string;
  assistant_text: string | null;
  assistant_tools: string | null;
  assistant_at: string | null;
  model: string | null;
}

function getSession(id: string) {
  ensureInitialized();

  const session = db
    .prepare("SELECT * FROM sessions WHERE id = ?")
    .get(id) as Session | undefined;

  if (!session) return null;

  const turns = db
    .prepare(
      `SELECT id, turn_number, user_prompt, user_prompt_at, assistant_text, assistant_tools, assistant_at, model
       FROM conversation_turns WHERE session_id = ? ORDER BY turn_number ASC`
    )
    .all(id) as Turn[];

  return { session, turns };
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function shortPath(p: string | null) {
  if (!p || p === "unknown") return "unknown";
  const parts = p.split("/");
  return parts.slice(-2).join("/");
}

export const dynamic = "force-dynamic";

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = getSession(id);

  if (!data) notFound();
  const { session, turns } = data;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/sessions" className="text-sm text-[var(--accent)] hover:underline">
          &larr; Sessions
        </Link>
        <h1 className="text-2xl font-bold mt-2">Session Detail</h1>
      </div>

      {/* Session Info */}
      <div className="bg-[var(--card)] rounded-lg border border-[var(--border)] p-4 space-y-2 text-sm">
        <div className="flex flex-wrap gap-x-8 gap-y-1">
          <div>
            <span className="text-[var(--muted-foreground)]">Project: </span>
            <span className="font-mono">{shortPath(session.project_path)}</span>
          </div>
          {session.git_branch && (
            <div>
              <span className="text-[var(--muted-foreground)]">Branch: </span>
              <span className="font-mono">{session.git_branch}</span>
            </div>
          )}
          {session.version && (
            <div>
              <span className="text-[var(--muted-foreground)]">Claude: </span>
              {session.version}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-1">
          <div>
            <span className="text-[var(--muted-foreground)]">Started: </span>
            {formatDate(session.started_at)}
          </div>
          {session.last_activity_at && (
            <div>
              <span className="text-[var(--muted-foreground)]">Last activity: </span>
              {formatDate(session.last_activity_at)}
            </div>
          )}
          <div>
            <span className="text-[var(--muted-foreground)]">Turns: </span>
            {turns.length}
          </div>
        </div>
      </div>

      {/* Live-updating conversation view */}
      <LiveSessionView sessionId={session.id} initialTurns={turns} />
    </div>
  );
}
