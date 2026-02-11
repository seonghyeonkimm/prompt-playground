import db from "@/lib/db";
import Link from "next/link";
import { notFound } from "next/navigation";

interface Session {
  id: string;
  cwd: string | null;
  source: string | null;
  started_at: string;
  ended_at: string | null;
  end_reason: string | null;
  transcript_path: string | null;
}

interface Turn {
  id: number;
  turn_number: number;
  prompt: string;
  prompt_at: string;
  response: string | null;
  response_at: string | null;
}

function getSession(id: string) {
  const session = db
    .prepare("SELECT * FROM sessions WHERE id = ?")
    .get(id) as Session | undefined;

  if (!session) return null;

  const turns = db
    .prepare(
      `SELECT id, turn_number, prompt, prompt_at, response, response_at
       FROM conversation_turns WHERE session_id = ? ORDER BY turn_number ASC`
    )
    .all(id) as Turn[];

  return { session, turns };
}

function formatTime(dateStr: string | null) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/sessions"
            className="text-sm text-[var(--accent)] hover:underline"
          >
            &larr; Sessions
          </Link>
          <h1 className="text-2xl font-bold mt-2">Session Detail</h1>
        </div>
      </div>

      {/* Session Info */}
      <div className="bg-[var(--card)] rounded-lg border border-[var(--border)] p-4 space-y-2 text-sm">
        <div className="flex gap-8">
          <div>
            <span className="text-[var(--muted-foreground)]">ID: </span>
            <span className="font-mono">{session.id.slice(0, 12)}...</span>
          </div>
          <div>
            <span className="text-[var(--muted-foreground)]">Project: </span>
            <span className="font-mono">{session.cwd || "unknown"}</span>
          </div>
        </div>
        <div className="flex gap-8">
          <div>
            <span className="text-[var(--muted-foreground)]">Started: </span>
            {formatDate(session.started_at)}
          </div>
          {session.ended_at && (
            <div>
              <span className="text-[var(--muted-foreground)]">Ended: </span>
              {formatDate(session.ended_at)}
            </div>
          )}
          {session.end_reason && (
            <div>
              <span className="text-[var(--muted-foreground)]">Reason: </span>
              {session.end_reason}
            </div>
          )}
        </div>
        <div>
          <span className="text-[var(--muted-foreground)]">Turns: </span>
          {turns.length}
        </div>
      </div>

      {/* Conversation Timeline */}
      <div className="space-y-4">
        {turns.length === 0 ? (
          <div className="text-center text-[var(--muted-foreground)] py-12">
            No conversation turns recorded.
          </div>
        ) : (
          turns.map((turn) => (
            <div key={turn.id} className="space-y-2">
              {/* User prompt */}
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold">
                  U
                </div>
                <div className="flex-1 min-w-0">
                  <div className="bg-blue-600/10 border border-blue-600/20 rounded-lg p-3">
                    <pre className="whitespace-pre-wrap text-sm break-words">
                      {turn.prompt}
                    </pre>
                  </div>
                  <span className="text-[10px] text-[var(--muted-foreground)] mt-1 block">
                    Turn {turn.turn_number} &middot; {formatTime(turn.prompt_at)}
                  </span>
                </div>
              </div>

              {/* Claude response */}
              {turn.response && (
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-orange-600 flex items-center justify-center text-xs font-bold">
                    C
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="bg-[var(--muted)] border border-[var(--border)] rounded-lg p-3">
                      <pre className="whitespace-pre-wrap text-sm break-words">
                        {turn.response}
                      </pre>
                    </div>
                    <span className="text-[10px] text-[var(--muted-foreground)] mt-1 block">
                      {formatTime(turn.response_at)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
