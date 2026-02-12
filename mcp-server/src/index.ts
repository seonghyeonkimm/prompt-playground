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
          ? (JSON.parse(t.assistant_tools) as string[]).join(", ")
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

// ---------------------------------------------------------------------------
// Verb canonicalization for prompt clustering
// ---------------------------------------------------------------------------
const VERB_GROUPS: Record<string, string> = {
  fix: "fix", debug: "fix", repair: "fix", resolve: "fix", troubleshoot: "fix",
  add: "create", create: "create", implement: "create", build: "create", make: "create", generate: "create", write: "create", new: "create",
  update: "modify", change: "modify", modify: "modify", refactor: "modify", rename: "modify", move: "modify", adjust: "modify", edit: "modify",
  remove: "delete", delete: "delete", drop: "delete", clean: "delete",
  test: "test", run: "test", check: "test", verify: "test", validate: "test", lint: "test",
  show: "read", find: "read", search: "read", list: "read", look: "read", read: "read", get: "read", where: "read", what: "read",
  explain: "explain", why: "explain", how: "explain", describe: "explain", help: "explain",
  deploy: "deploy", push: "deploy", release: "deploy", publish: "deploy",
  install: "setup", setup: "setup", configure: "setup", init: "setup",
};

function toolsToPhase(tools: string[]): string {
  const set = new Set(tools.map((t) => t.toLowerCase()));
  if (set.has("edit") || set.has("write") || set.has("notebookedit")) return "edit";
  if (set.has("bash")) return "run";
  if (set.has("read") || set.has("glob") || set.has("grep")) return "explore";
  if (set.has("task")) return "delegate";
  return "other";
}

// ---------------------------------------------------------------------------
// Tool 5: Get tool sequences
// ---------------------------------------------------------------------------
server.tool(
  "get_tool_sequences",
  "Analyze frequent tool usage sequences (bigrams, trigrams, signatures) across Claude Code sessions",
  {
    days: z.number().optional().describe("Days to analyze (default 30)"),
    project_filter: z.string().optional().describe("Filter by project path"),
    min_frequency: z.number().optional().describe("Min session count to report (default 3)"),
    type: z.enum(["bigram", "trigram", "signature", "all"]).optional().describe("Sequence type (default all)"),
  },
  async ({ days = 30, project_filter, min_frequency = 3, type = "all" }) => {
    const dp = `-${days} days`;
    const lines: string[] = [`## Tool Sequences (last ${days} days)\n`];

    let projectWhere = "";
    const baseParams: unknown[] = [dp];
    if (project_filter) {
      projectWhere = "AND s.project_path LIKE ?";
      baseParams.push(`%${project_filter}%`);
    }

    if (type === "all" || type === "bigram") {
      const bigrams = db.prepare(
        `SELECT a.value || ' → ' || b.value AS seq,
                COUNT(*) AS cnt, COUNT(DISTINCT ct.session_id) AS sess
         FROM conversation_turns ct
         JOIN sessions s ON ct.session_id = s.id,
              json_each(ct.assistant_tools) a, json_each(ct.assistant_tools) b
         WHERE ct.assistant_tools IS NOT NULL
           AND CAST(b.key AS INTEGER) = CAST(a.key AS INTEGER) + 1
           AND s.started_at >= datetime('now', ?) ${projectWhere}
         GROUP BY seq HAVING sess >= ?
         ORDER BY sess DESC, cnt DESC LIMIT 20`
      ).all(...baseParams, min_frequency) as { seq: string; cnt: number; sess: number }[];

      lines.push("### Bigrams (tool A → tool B within same turn)");
      lines.push("| Sequence | Occurrences | Sessions |");
      lines.push("|----------|-------------|----------|");
      for (const r of bigrams) {
        lines.push(`| ${r.seq} | ${r.cnt} | ${r.sess} |`);
      }
      if (bigrams.length === 0) lines.push("| (none found) | - | - |");
      lines.push("");
    }

    if (type === "all" || type === "trigram") {
      const trigrams = db.prepare(
        `SELECT a.value || ' → ' || b.value || ' → ' || c.value AS seq,
                COUNT(*) AS cnt, COUNT(DISTINCT ct.session_id) AS sess
         FROM conversation_turns ct
         JOIN sessions s ON ct.session_id = s.id,
              json_each(ct.assistant_tools) a, json_each(ct.assistant_tools) b, json_each(ct.assistant_tools) c
         WHERE ct.assistant_tools IS NOT NULL
           AND CAST(b.key AS INTEGER) = CAST(a.key AS INTEGER) + 1
           AND CAST(c.key AS INTEGER) = CAST(a.key AS INTEGER) + 2
           AND s.started_at >= datetime('now', ?) ${projectWhere}
         GROUP BY seq HAVING sess >= ?
         ORDER BY sess DESC, cnt DESC LIMIT 15`
      ).all(...baseParams, min_frequency) as { seq: string; cnt: number; sess: number }[];

      lines.push("### Trigrams (tool A → B → C within same turn)");
      lines.push("| Sequence | Occurrences | Sessions |");
      lines.push("|----------|-------------|----------|");
      for (const r of trigrams) {
        lines.push(`| ${r.seq} | ${r.cnt} | ${r.sess} |`);
      }
      if (trigrams.length === 0) lines.push("| (none found) | - | - |");
      lines.push("");
    }

    if (type === "all" || type === "signature") {
      const sigs = db.prepare(
        `SELECT ct.assistant_tools AS seq, COUNT(*) AS cnt, COUNT(DISTINCT ct.session_id) AS sess
         FROM conversation_turns ct
         JOIN sessions s ON ct.session_id = s.id
         WHERE ct.assistant_tools IS NOT NULL AND json_array_length(ct.assistant_tools) >= 2
           AND s.started_at >= datetime('now', ?) ${projectWhere}
         GROUP BY ct.assistant_tools HAVING sess >= ?
         ORDER BY sess DESC, cnt DESC LIMIT 15`
      ).all(...baseParams, min_frequency) as { seq: string; cnt: number; sess: number }[];

      lines.push("### Full Turn Signatures (complete tool set per turn)");
      lines.push("| Tools | Occurrences | Sessions |");
      lines.push("|-------|-------------|----------|");
      for (const r of sigs) {
        try {
          const tools: string[] = JSON.parse(r.seq);
          lines.push(`| ${tools.join(" → ")} | ${r.cnt} | ${r.sess} |`);
        } catch { /* skip malformed */ }
      }
      if (sigs.length === 0) lines.push("| (none found) | - | - |");
      lines.push("");
    }

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  }
);

// ---------------------------------------------------------------------------
// Tool 6: Get prompt clusters
// ---------------------------------------------------------------------------
server.tool(
  "get_prompt_clusters",
  "Cluster user prompts by action verb and intent to find repeated patterns",
  {
    days: z.number().optional().describe("Days to analyze (default 30)"),
    project_filter: z.string().optional().describe("Filter by project path"),
    min_frequency: z.number().optional().describe("Min prompts per cluster (default 3)"),
  },
  async ({ days = 30, project_filter, min_frequency = 3 }) => {
    const dp = `-${days} days`;
    let projectWhere = "";
    const params: unknown[] = [dp];
    if (project_filter) {
      projectWhere = "AND s.project_path LIKE ?";
      params.push(`%${project_filter}%`);
    }

    const rows = db.prepare(
      `SELECT ct.user_prompt, ct.session_id, ct.assistant_tools
       FROM conversation_turns ct
       JOIN sessions s ON ct.session_id = s.id
       WHERE LENGTH(ct.user_prompt) > 10 AND LENGTH(ct.user_prompt) < 2000
         AND s.started_at >= datetime('now', ?) ${projectWhere}`
    ).all(...params) as { user_prompt: string; session_id: string; assistant_tools: string | null }[];

    // Group by action verb
    const verbGroups = new Map<string, {
      canonical: string;
      prompts: string[];
      sessions: Set<string>;
      tools: Map<string, number>;
    }>();

    for (const row of rows) {
      const firstWord = row.user_prompt.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
      const canonical = VERB_GROUPS[firstWord] ?? "other";
      let group = verbGroups.get(firstWord);
      if (!group) {
        group = { canonical, prompts: [], sessions: new Set(), tools: new Map() };
        verbGroups.set(firstWord, group);
      }
      group.prompts.push(row.user_prompt);
      group.sessions.add(row.session_id);
      if (row.assistant_tools) {
        try {
          const tools: string[] = JSON.parse(row.assistant_tools);
          for (const t of tools) group.tools.set(t, (group.tools.get(t) ?? 0) + 1);
        } catch { /* skip */ }
      }
    }

    const lines: string[] = [`## Prompt Clusters (last ${days} days)\n`];
    const sorted = [...verbGroups.entries()]
      .filter(([, g]) => g.prompts.length >= min_frequency)
      .sort((a, b) => b[1].prompts.length - a[1].prompts.length);

    for (const [verb, group] of sorted) {
      const topTools = [...group.tools.entries()]
        .sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([name]) => name);

      lines.push(`### "${verb}" (${group.canonical}) — ${group.prompts.length} prompts, ${group.sessions.size} sessions`);
      lines.push(`Top tools: ${topTools.join(", ") || "none"}`);
      lines.push("Examples:");
      const examples = [group.prompts[0], group.prompts[Math.floor(group.prompts.length / 2)], group.prompts[group.prompts.length - 1]];
      for (const ex of [...new Set(examples)]) {
        lines.push(`- "${ex.slice(0, 150)}"`);
      }
      lines.push("");
    }

    if (sorted.length === 0) lines.push("No prompt clusters found with the given frequency threshold.");

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  }
);

// ---------------------------------------------------------------------------
// Tool 7: Get project profiles
// ---------------------------------------------------------------------------
server.tool(
  "get_project_profiles",
  "Analyze per-project tool usage patterns and find project-specific conventions",
  {
    days: z.number().optional().describe("Days to analyze (default 30)"),
    project_path: z.string().optional().describe("Specific project path to analyze"),
  },
  async ({ days = 30, project_path }) => {
    const dp = `-${days} days`;
    let projectWhere = "";
    const params: unknown[] = [dp];
    if (project_path) {
      projectWhere = "AND s.project_path LIKE ?";
      params.push(`%${project_path}%`);
    }

    // Global tool distribution
    const globalTools = db.prepare(
      `SELECT je.value AS tool, COUNT(*) AS cnt
       FROM conversation_turns ct
       JOIN sessions s ON ct.session_id = s.id, json_each(ct.assistant_tools) je
       WHERE ct.assistant_tools IS NOT NULL AND s.started_at >= datetime('now', ?)
       GROUP BY je.value`
    ).all(dp) as { tool: string; cnt: number }[];
    const globalTotal = globalTools.reduce((s, t) => s + t.cnt, 0);
    const globalMap = new Map(globalTools.map((t) => [t.tool, t.cnt]));

    // Per-project tool distribution
    const projTools = db.prepare(
      `SELECT s.project_path, je.value AS tool, COUNT(*) AS cnt,
              COUNT(DISTINCT s.id) AS sess
       FROM conversation_turns ct
       JOIN sessions s ON ct.session_id = s.id, json_each(ct.assistant_tools) je
       WHERE ct.assistant_tools IS NOT NULL AND s.started_at >= datetime('now', ?)
         AND s.project_path IS NOT NULL ${projectWhere}
       GROUP BY s.project_path, je.value
       ORDER BY s.project_path, cnt DESC`
    ).all(...params) as { project_path: string; tool: string; cnt: number; sess: number }[];

    // Project stats
    const projStats = db.prepare(
      `SELECT s.project_path, COUNT(DISTINCT s.id) AS sessions, COUNT(ct.id) AS turns
       FROM sessions s LEFT JOIN conversation_turns ct ON s.id = ct.session_id
       WHERE s.started_at >= datetime('now', ?) AND s.project_path IS NOT NULL ${projectWhere}
       GROUP BY s.project_path ORDER BY turns DESC`
    ).all(...params) as { project_path: string; sessions: number; turns: number }[];

    const lines: string[] = [`## Project Profiles (last ${days} days)\n`];

    // Group tools by project
    const grouped = new Map<string, { tool: string; cnt: number }[]>();
    for (const r of projTools) {
      let arr = grouped.get(r.project_path);
      if (!arr) { arr = []; grouped.set(r.project_path, arr); }
      arr.push({ tool: r.tool, cnt: r.cnt });
    }

    for (const stat of projStats) {
      const shortPath = stat.project_path.split("/").slice(-2).join("/");
      lines.push(`### ${shortPath}`);
      lines.push(`Sessions: ${stat.sessions} | Turns: ${stat.turns}\n`);

      const tools = grouped.get(stat.project_path) ?? [];
      const projTotal = tools.reduce((s, t) => s + t.cnt, 0);

      lines.push("| Tool | Count | % of Project | Enrichment vs Global |");
      lines.push("|------|-------|-------------|---------------------|");
      for (const t of tools.slice(0, 10)) {
        const projPct = ((t.cnt / projTotal) * 100).toFixed(1);
        const globalPct = (globalMap.get(t.tool) ?? 0) / globalTotal;
        const enrichment = globalPct > 0 ? (t.cnt / projTotal / globalPct).toFixed(2) : "0.00";
        lines.push(`| ${t.tool} | ${t.cnt} | ${projPct}% | ${enrichment}x |`);
      }
      lines.push("");
    }

    if (projStats.length === 0) lines.push("No projects found.");

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  }
);

// ---------------------------------------------------------------------------
// Tool 8: Get workflow arcs
// ---------------------------------------------------------------------------
server.tool(
  "get_workflow_arcs",
  "Detect session-level workflow patterns by abstracting tool usage into phases (explore/edit/run/delegate)",
  {
    days: z.number().optional().describe("Days to analyze (default 30)"),
    project_filter: z.string().optional().describe("Filter by project path"),
    min_sessions: z.number().optional().describe("Min sessions with same arc (default 2)"),
  },
  async ({ days = 30, project_filter, min_sessions = 2 }) => {
    const dp = `-${days} days`;
    let projectWhere = "";
    const params: unknown[] = [dp];
    if (project_filter) {
      projectWhere = "AND s.project_path LIKE ?";
      params.push(`%${project_filter}%`);
    }

    const turns = db.prepare(
      `SELECT ct.session_id, ct.turn_number, ct.assistant_tools, s.turn_count
       FROM conversation_turns ct
       JOIN sessions s ON ct.session_id = s.id
       WHERE s.started_at >= datetime('now', ?) AND s.turn_count BETWEEN 3 AND 30 ${projectWhere}
       ORDER BY ct.session_id, ct.turn_number`
    ).all(...params) as { session_id: string; turn_number: number; assistant_tools: string | null; turn_count: number }[];

    // Build per-session arcs
    const sessionArcs = new Map<string, string[]>();
    let curSession = "";
    let curPhases: string[] = [];

    for (const t of turns) {
      if (t.session_id !== curSession) {
        if (curSession && curPhases.length > 0) sessionArcs.set(curSession, curPhases);
        curSession = t.session_id;
        curPhases = [];
      }
      let phase = "other";
      if (t.assistant_tools) {
        try { phase = toolsToPhase(JSON.parse(t.assistant_tools)); } catch { /* skip */ }
      }
      curPhases.push(phase);
    }
    if (curSession && curPhases.length > 0) sessionArcs.set(curSession, curPhases);

    // Group identical arcs
    const arcGroups = new Map<string, string[]>();
    for (const [sid, phases] of sessionArcs) {
      const key = phases.join(" → ");
      let arr = arcGroups.get(key);
      if (!arr) { arr = []; arcGroups.set(key, arr); }
      arr.push(sid);
    }

    const lines: string[] = [`## Workflow Arcs (last ${days} days)\n`];
    lines.push("Phase legend: **explore** (Read/Grep/Glob) | **edit** (Edit/Write) | **run** (Bash) | **delegate** (Task) | **other**\n");

    const sorted = [...arcGroups.entries()]
      .filter(([, sids]) => sids.length >= min_sessions)
      .sort((a, b) => b[1].length - a[1].length);

    for (const [arc, sessionIds] of sorted) {
      lines.push(`### ${arc}`);
      lines.push(`Sessions: ${sessionIds.length} | Example: ${sessionIds[0]}`);
      lines.push("");
    }

    if (sorted.length === 0) lines.push("No repeated workflow arcs found.");

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  }
);

// ---------------------------------------------------------------------------
// Tool 9: Get friction points
// ---------------------------------------------------------------------------
server.tool(
  "get_friction_points",
  "Detect rapid retry patterns (< 30s between assistant response and next user prompt) indicating friction or confusion",
  {
    days: z.number().optional().describe("Days to analyze (default 30)"),
    project_filter: z.string().optional().describe("Filter by project path"),
    max_gap_seconds: z.number().optional().describe("Max gap in seconds to count as rapid retry (default 30)"),
  },
  async ({ days = 30, project_filter, max_gap_seconds = 30 }) => {
    const dp = `-${days} days`;
    let projectWhere = "";
    const params: unknown[] = [dp];
    if (project_filter) {
      projectWhere = "AND s.project_path LIKE ?";
      params.push(`%${project_filter}%`);
    }

    const rows = db.prepare(
      `SELECT ct1.session_id, ct1.turn_number,
              ct1.user_prompt AS prompt, ct2.user_prompt AS retry_prompt,
              ROUND((JULIANDAY(ct2.user_prompt_at) - JULIANDAY(ct1.assistant_at)) * 86400, 1) AS gap_sec,
              s.project_path
       FROM conversation_turns ct1
       JOIN conversation_turns ct2 ON ct1.session_id = ct2.session_id
         AND ct2.turn_number = ct1.turn_number + 1
       JOIN sessions s ON ct1.session_id = s.id
       WHERE ct1.assistant_at IS NOT NULL AND ct2.user_prompt_at IS NOT NULL
         AND s.started_at >= datetime('now', ?) ${projectWhere}
         AND (JULIANDAY(ct2.user_prompt_at) - JULIANDAY(ct1.assistant_at)) * 86400 BETWEEN 0 AND ?
       ORDER BY gap_sec ASC LIMIT 30`
    ).all(...params, max_gap_seconds) as {
      session_id: string; turn_number: number; prompt: string;
      retry_prompt: string; gap_sec: number; project_path: string | null;
    }[];

    const lines: string[] = [`## Friction Points (last ${days} days, gap < ${max_gap_seconds}s)\n`];

    if (rows.length === 0) {
      lines.push("No rapid retry patterns found.");
    } else {
      lines.push(`Found ${rows.length} rapid retries:\n`);
      lines.push("| Session | Turn | Gap (s) | Original Prompt | Retry Prompt |");
      lines.push("|---------|------|---------|----------------|--------------|");
      for (const r of rows) {
        const shortPrompt = r.prompt.slice(0, 60).replace(/\|/g, "\\|");
        const shortRetry = r.retry_prompt.slice(0, 60).replace(/\|/g, "\\|");
        lines.push(`| ${r.session_id.slice(0, 8)}… | ${r.turn_number} | ${r.gap_sec} | ${shortPrompt} | ${shortRetry} |`);
      }
    }

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  }
);

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Prompt Logger MCP server running");
}

main().catch(console.error);
