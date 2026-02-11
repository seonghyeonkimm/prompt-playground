import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_DIR =
  process.env.PROMPT_LOGGER_DB_DIR ||
  path.join(process.env.HOME || "~", ".claude-prompt-logger", "db");

const DB_PATH = path.join(DB_DIR, "prompt_logs.db");

fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for concurrent reads/writes
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    cwd TEXT,
    source TEXT,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    end_reason TEXT,
    transcript_path TEXT
  );

  CREATE TABLE IF NOT EXISTS conversation_turns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    turn_number INTEGER NOT NULL,
    prompt TEXT NOT NULL,
    prompt_at TEXT NOT NULL,
    response TEXT,
    response_at TEXT,
    UNIQUE(session_id, turn_number)
  );

  CREATE INDEX IF NOT EXISTS idx_turns_session ON conversation_turns(session_id);
`);

// FTS5 table (ignore error if already exists)
try {
  db.exec(`
    CREATE VIRTUAL TABLE conversation_fts USING fts5(
      prompt, response,
      content='conversation_turns',
      content_rowid='id'
    );

    CREATE TRIGGER turns_ai AFTER INSERT ON conversation_turns BEGIN
      INSERT INTO conversation_fts(rowid, prompt, response)
      VALUES (new.id, new.prompt, new.response);
    END;

    CREATE TRIGGER turns_au AFTER UPDATE ON conversation_turns BEGIN
      INSERT INTO conversation_fts(conversation_fts, rowid, prompt, response)
      VALUES ('delete', old.id, old.prompt, old.response);
      INSERT INTO conversation_fts(rowid, prompt, response)
      VALUES (new.id, new.prompt, new.response);
    END;
  `);
} catch {
  // Tables/triggers already exist
}

export default db;
export { DB_PATH };
