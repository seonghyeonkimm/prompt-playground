import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_DIR =
  process.env.PROMPT_LOGGER_DB_DIR ||
  path.join(process.env.HOME || "~", ".claude-prompt-logger", "db");

const DB_PATH = path.join(DB_DIR, "prompt_logs.db");

fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Schema for file-watch based approach
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    project_path TEXT,
    project_hash TEXT,
    jsonl_path TEXT,
    started_at TEXT NOT NULL,
    last_activity_at TEXT,
    version TEXT,
    git_branch TEXT,
    turn_count INTEGER DEFAULT 0,
    last_synced_bytes INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS conversation_turns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    turn_number INTEGER NOT NULL,
    user_prompt TEXT NOT NULL,
    user_prompt_at TEXT NOT NULL,
    assistant_text TEXT,
    assistant_tools TEXT,
    assistant_at TEXT,
    model TEXT,
    UNIQUE(session_id, turn_number)
  );

  CREATE INDEX IF NOT EXISTS idx_turns_session ON conversation_turns(session_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_path);
  CREATE INDEX IF NOT EXISTS idx_sessions_activity ON sessions(last_activity_at);
  CREATE INDEX IF NOT EXISTS idx_turns_prompt_at ON conversation_turns(user_prompt_at);
`);

// FTS5 for full-text search
try {
  db.exec(`
    CREATE VIRTUAL TABLE conversation_fts USING fts5(
      user_prompt, assistant_text,
      content='conversation_turns',
      content_rowid='id'
    );

    CREATE TRIGGER turns_ai AFTER INSERT ON conversation_turns BEGIN
      INSERT INTO conversation_fts(rowid, user_prompt, assistant_text)
      VALUES (new.id, new.user_prompt, new.assistant_text);
    END;

    CREATE TRIGGER turns_au AFTER UPDATE ON conversation_turns BEGIN
      INSERT INTO conversation_fts(conversation_fts, rowid, user_prompt, assistant_text)
      VALUES ('delete', old.id, old.user_prompt, old.assistant_text);
      INSERT INTO conversation_fts(rowid, user_prompt, assistant_text)
      VALUES (new.id, new.user_prompt, new.assistant_text);
    END;
  `);
} catch {
  // Already exists
}

export default db;
export { DB_PATH };
