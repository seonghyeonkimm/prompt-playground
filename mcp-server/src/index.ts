import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import Database from "better-sqlite3";
import { z } from "zod";
import path from "path";

const DB_PATH =
  process.env.PROMPT_LOGGER_DB ||
  path.join(
    process.env.HOME || "~",
    ".claude-prompt-logger",
    "db",
    "prompt_logs.db"
  );

const server = new McpServer({
  name: "prompt-logger",
  version: "1.0.0",
});

const db = new Database(DB_PATH, { readonly: true });

// Tool 1: List sessions
server.tool(
  "list_sessions",
  "List recent Claude Code sessions with turn counts",
  {
    limit: z.number().optional().describe("Number of sessions to return (default 10)"),
    cwd_filter: z.string().optional().describe("Filter by project path (partial match)"),
    date_from: z.string().optional().describe("Start date (YYYY-MM-DD)"),
    date_to: z.string().optional().describe("End date (YYYY-MM-DD)"),
  },
  async ({ limit = 10, cwd_filter, date_from, date_to }) => {
    let query = `
      SELECT s.id, s.cwd, s.started_at, s.ended_at, s.source,
             COUNT(t.id) as turn_count
      FROM sessions s
      LEFT JOIN conversation_turns t ON s.id = t.session_id
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (cwd_filter) {
      query += ` AND s.cwd LIKE ?`;
      params.push(`%${cwd_filter}%`);
    }
    if (date_from) {
      query += ` AND s.started_at >= ?`;
      params.push(date_from);
    }
    if (date_to) {
      query += ` AND s.started_at <= ?`;
      params.push(date_to + "T23:59:59Z");
    }

    query += ` GROUP BY s.id ORDER BY s.started_at DESC LIMIT ?`;
    params.push(limit);

    const sessions = db.prepare(query).all(...params);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(sessions, null, 2),
        },
      ],
    };
  }
);

// Tool 2: Get session conversation
server.tool(
  "get_session_conversation",
  "Get all prompt-response turns for a specific session",
  {
    session_id: z.string().describe("Session ID"),
  },
  async ({ session_id }) => {
    const session = db
      .prepare("SELECT * FROM sessions WHERE id = ?")
      .get(session_id) as Record<string, unknown> | undefined;

    if (!session) {
      return {
        content: [{ type: "text" as const, text: "Session not found" }],
      };
    }

    const turns = db
      .prepare(
        `SELECT turn_number, prompt, prompt_at, response, response_at
         FROM conversation_turns WHERE session_id = ? ORDER BY turn_number ASC`
      )
      .all(session_id) as Array<{
      turn_number: number;
      prompt: string;
      prompt_at: string;
      response: string | null;
      response_at: string | null;
    }>;

    const header = `Session: ${session_id}\nProject: ${session.cwd || "unknown"}\nStarted: ${session.started_at}\n`;
    const formatted = turns
      .map(
        (t) =>
          `[Turn ${t.turn_number}] ${t.prompt_at}\nUser: ${t.prompt}\nClaude: ${t.response || "(no response recorded)"}\n`
      )
      .join("\n---\n");

    return {
      content: [
        { type: "text" as const, text: header + "\n" + formatted },
      ],
    };
  }
);

// Tool 3: Search prompt logs
server.tool(
  "search_prompt_logs",
  "Full-text search across past prompts and responses",
  {
    query: z.string().describe("Search keywords"),
    limit: z.number().optional().describe("Max results (default 10)"),
  },
  async ({ query, limit = 10 }) => {
    // Escape FTS5 special chars and add prefix matching
    const ftsQuery = query
      .replace(/['"]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .map((term) => `"${term}"*`)
      .join(" ");

    try {
      const results = db
        .prepare(
          `SELECT ct.session_id, ct.turn_number, ct.prompt, ct.response,
                  ct.prompt_at, s.cwd
           FROM conversation_fts fts
           JOIN conversation_turns ct ON fts.rowid = ct.id
           JOIN sessions s ON ct.session_id = s.id
           WHERE conversation_fts MATCH ?
           ORDER BY rank
           LIMIT ?`
        )
        .all(ftsQuery, limit);

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(results, null, 2) },
        ],
      };
    } catch {
      // Fallback to LIKE
      const results = db
        .prepare(
          `SELECT ct.session_id, ct.turn_number, ct.prompt, ct.response,
                  ct.prompt_at, s.cwd
           FROM conversation_turns ct
           JOIN sessions s ON ct.session_id = s.id
           WHERE ct.prompt LIKE ? OR ct.response LIKE ?
           ORDER BY ct.prompt_at DESC
           LIMIT ?`
        )
        .all(`%${query}%`, `%${query}%`, limit);

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(results, null, 2) },
        ],
      };
    }
  }
);

// Tool 4: Get usage stats
server.tool(
  "get_prompt_stats",
  "Get prompt usage statistics for recent days",
  {
    days: z.number().optional().describe("Number of days to look back (default 7)"),
  },
  async ({ days = 7 }) => {
    const stats = db
      .prepare(
        `SELECT
          COUNT(DISTINCT s.id) as total_sessions,
          COUNT(t.id) as total_turns,
          MIN(s.started_at) as first_session,
          MAX(s.started_at) as last_session
        FROM sessions s
        LEFT JOIN conversation_turns t ON s.id = t.session_id
        WHERE s.started_at >= datetime('now', ?)`
      )
      .get(`-${days} days`);

    const daily = db
      .prepare(
        `SELECT DATE(prompt_at) as date, COUNT(*) as count
         FROM conversation_turns
         WHERE prompt_at >= datetime('now', ?)
         GROUP BY DATE(prompt_at)
         ORDER BY date DESC`
      )
      .all(`-${days} days`);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ summary: stats, daily_breakdown: daily }, null, 2),
        },
      ],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Prompt Logger MCP server running");
}

main().catch(console.error);
