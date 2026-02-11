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
    project_filter: z.string().optional().describe("Filter by project path (partial match)"),
    date_from: z.string().optional().describe("Start date (YYYY-MM-DD)"),
    date_to: z.string().optional().describe("End date (YYYY-MM-DD)"),
  },
  async ({ limit = 10, project_filter, date_from, date_to }) => {
    let query = `
      SELECT id, project_path, project_hash, started_at, last_activity_at,
             version, git_branch, turn_count
      FROM sessions
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (project_filter) {
      query += ` AND project_path LIKE ?`;
      params.push(`%${project_filter}%`);
    }
    if (date_from) {
      query += ` AND started_at >= ?`;
      params.push(date_from);
    }
    if (date_to) {
      query += ` AND started_at <= ?`;
      params.push(date_to + "T23:59:59Z");
    }

    query += ` ORDER BY last_activity_at DESC LIMIT ?`;
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
        `SELECT turn_number, user_prompt, user_prompt_at, assistant_text,
                assistant_tools, assistant_at, model
         FROM conversation_turns WHERE session_id = ? ORDER BY turn_number ASC`
      )
      .all(session_id) as Array<{
      turn_number: number;
      user_prompt: string;
      user_prompt_at: string;
      assistant_text: string | null;
      assistant_tools: string | null;
      assistant_at: string | null;
      model: string | null;
    }>;

    const header = `Session: ${session_id}\nProject: ${session.project_path || "unknown"}\nBranch: ${session.git_branch || "unknown"}\nStarted: ${session.started_at}\n`;
    const formatted = turns
      .map((t) => {
        const tools = t.assistant_tools
          ? JSON.parse(t.assistant_tools)
              .map((tool: { name: string }) => tool.name)
              .join(", ")
          : "";
        const toolLine = tools ? `\nTools used: ${tools}` : "";
        return `[Turn ${t.turn_number}] ${t.user_prompt_at}${t.model ? ` (${t.model})` : ""}\nUser: ${t.user_prompt}\nClaude: ${t.assistant_text || "(no response recorded)"}${toolLine}\n`;
      })
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
          `SELECT ct.session_id, ct.turn_number, ct.user_prompt, ct.assistant_text,
                  ct.user_prompt_at, ct.model, s.project_path
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
          `SELECT ct.session_id, ct.turn_number, ct.user_prompt, ct.assistant_text,
                  ct.user_prompt_at, ct.model, s.project_path
           FROM conversation_turns ct
           JOIN sessions s ON ct.session_id = s.id
           WHERE ct.user_prompt LIKE ? OR ct.assistant_text LIKE ?
           ORDER BY ct.user_prompt_at DESC
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
          SUM(s.turn_count) as total_turns,
          MIN(s.started_at) as first_session,
          MAX(s.last_activity_at) as last_session
        FROM sessions s
        WHERE s.started_at >= datetime('now', ?)`
      )
      .get(`-${days} days`);

    const daily = db
      .prepare(
        `SELECT DATE(user_prompt_at) as date, COUNT(*) as count
         FROM conversation_turns
         WHERE user_prompt_at >= datetime('now', ?)
         GROUP BY DATE(user_prompt_at)
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
