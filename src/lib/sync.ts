/**
 * Sync: Parse JSONL transcript files and upsert into SQLite.
 * Supports incremental sync (only parse new bytes).
 */
import db from "./db";
import { discoverSessions, parseTranscript, type ParsedSession } from "./parser";

const upsertSession = db.prepare(`
  INSERT INTO sessions (id, project_path, project_hash, jsonl_path, started_at, last_activity_at, version, git_branch, turn_count, last_synced_bytes)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    last_activity_at = excluded.last_activity_at,
    version = COALESCE(excluded.version, sessions.version),
    git_branch = COALESCE(excluded.git_branch, sessions.git_branch),
    turn_count = excluded.turn_count,
    last_synced_bytes = excluded.last_synced_bytes
`);

const upsertTurn = db.prepare(`
  INSERT INTO conversation_turns (session_id, turn_number, user_prompt, user_prompt_at, assistant_text, assistant_tools, assistant_at, model)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(session_id, turn_number) DO UPDATE SET
    assistant_text = excluded.assistant_text,
    assistant_tools = excluded.assistant_tools,
    assistant_at = excluded.assistant_at,
    model = COALESCE(excluded.model, conversation_turns.model)
`);

const getSessionSyncState = db.prepare(
  `SELECT last_synced_bytes FROM sessions WHERE id = ?`
);

export type SyncEvent = {
  type: "session_updated";
  sessionId: string;
  turnCount: number;
};

/**
 * Sync a single JSONL file into the database.
 * Returns sync events if there were changes.
 */
export function syncFile(jsonlPath: string): SyncEvent[] {
  const { session, bytesRead } = parseTranscript(jsonlPath);
  if (!session || session.turns.length === 0) return [];

  // Check if we need to sync
  const existing = getSessionSyncState.get(session.id) as
    | { last_synced_bytes: number }
    | undefined;

  if (existing && existing.last_synced_bytes >= bytesRead) {
    return []; // No new data
  }

  const events: SyncEvent[] = [];

  const syncTransaction = db.transaction((s: ParsedSession, bytes: number) => {
    upsertSession.run(
      s.id,
      s.projectPath,
      s.projectHash,
      s.jsonlPath,
      s.startedAt,
      s.lastActivityAt,
      s.version,
      s.gitBranch,
      s.turns.length,
      bytes
    );

    for (const turn of s.turns) {
      const assistantText = turn.assistantTexts.join("\n") || null;
      const toolsJson =
        turn.assistantTools.length > 0
          ? JSON.stringify(turn.assistantTools.map((t) => t.name))
          : null;

      upsertTurn.run(
        s.id,
        turn.turnNumber,
        turn.userPrompt,
        turn.userPromptAt,
        assistantText,
        toolsJson,
        turn.assistantAt,
        turn.model
      );
    }
  });

  syncTransaction(session, bytesRead);
  events.push({
    type: "session_updated",
    sessionId: session.id,
    turnCount: session.turns.length,
  });

  return events;
}

/**
 * Full sync: discover all sessions and sync them.
 */
export function syncAll(): SyncEvent[] {
  const sessions = discoverSessions();
  const allEvents: SyncEvent[] = [];

  for (const s of sessions) {
    const events = syncFile(s.jsonlPath);
    allEvents.push(...events);
  }

  return allEvents;
}
