/**
 * Session Pattern Analyzer — SQL aggregation functions.
 * Extracts patterns from session data. No interpretation logic;
 * that is left to the LLM (via MCP tools) or the web dashboard.
 */
import db from "./db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnalyzerOptions {
  days?: number;
  projectFilter?: string;
  minFrequency?: number;
}

export interface ToolSequenceData {
  type: "bigram" | "trigram" | "signature" | "cross_turn";
  sequence: string;
  count: number;
  sessionCount: number;
  projects: string[];
}

export interface PromptClusterData {
  actionVerb: string;
  canonicalVerb: string;
  promptCount: number;
  sessionCount: number;
  examples: string[];
  topTools: string[];
}

export interface ProjectProfileData {
  projectPath: string;
  sessionCount: number;
  turnCount: number;
  toolDistribution: { tool: string; count: number; pct: number; enrichment: number }[];
  uniqueSequences: { sequence: string; count: number }[];
}

export interface WorkflowArcData {
  arc: string;
  phases: string[];
  sessionCount: number;
  sessionIds: string[];
  avgTurnCount: number;
}

export interface FrictionPointData {
  sessionId: string;
  turnNumber: number;
  prompt: string;
  retryPrompt: string;
  gapSeconds: number;
  project: string;
}

export interface AnalysisStats {
  sessionsAnalyzed: number;
  turnsAnalyzed: number;
  timeRangeDays: number;
}

export interface PatternAnalysis {
  toolSequences: ToolSequenceData[];
  promptClusters: PromptClusterData[];
  projectProfiles: ProjectProfileData[];
  workflowArcs: WorkflowArcData[];
  frictionPoints: FrictionPointData[];
  stats: AnalysisStats;
  analyzedAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dateParam(days: number): string {
  return `-${days} days`;
}

function buildDateFilter(
  column: string,
  days: number,
  projectFilter?: string,
): { where: string; params: unknown[] } {
  let where = `${column} >= datetime('now', ?)`;
  const params: unknown[] = [dateParam(days)];
  if (projectFilter) {
    where += ` AND s.project_path LIKE ?`;
    params.push(`%${projectFilter}%`);
  }
  return { where, params };
}

// Canonical verb mapping — maps the first word of a prompt to an intent group
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

// Turn tool list into a phase label
function toolsToPhase(tools: string[]): string {
  const set = new Set(tools.map((t) => t.toLowerCase()));
  if (set.has("edit") || set.has("write") || set.has("notebookedit")) return "edit";
  if (set.has("bash")) return "run";
  if (set.has("read") || set.has("glob") || set.has("grep")) return "explore";
  if (set.has("task")) return "delegate";
  return "other";
}

// ---------------------------------------------------------------------------
// 1. Tool Sequence Mining
// ---------------------------------------------------------------------------

export function getToolSequences(opts: AnalyzerOptions = {}): ToolSequenceData[] {
  const days = opts.days ?? 30;
  const minFreq = opts.minFrequency ?? 3;
  const results: ToolSequenceData[] = [];

  const { where: dateWhere, params: dateParams } = buildDateFilter(
    "s.started_at",
    days,
    opts.projectFilter,
  );

  // Intra-turn bigrams
  const bigrams = db
    .prepare(
      `SELECT a.value || ' → ' || b.value AS seq,
              COUNT(*) AS cnt,
              COUNT(DISTINCT ct.session_id) AS sess,
              GROUP_CONCAT(DISTINCT s.project_path) AS projects
       FROM conversation_turns ct
       JOIN sessions s ON ct.session_id = s.id,
            json_each(ct.assistant_tools) a,
            json_each(ct.assistant_tools) b
       WHERE ct.assistant_tools IS NOT NULL
         AND CAST(b.key AS INTEGER) = CAST(a.key AS INTEGER) + 1
         AND ${dateWhere}
       GROUP BY seq
       HAVING sess >= ?
       ORDER BY sess DESC, cnt DESC
       LIMIT 30`,
    )
    .all(...dateParams, minFreq) as {
    seq: string;
    cnt: number;
    sess: number;
    projects: string | null;
  }[];

  for (const r of bigrams) {
    results.push({
      type: "bigram",
      sequence: r.seq,
      count: r.cnt,
      sessionCount: r.sess,
      projects: r.projects ? [...new Set(r.projects.split(","))] : [],
    });
  }

  // Intra-turn trigrams
  const trigrams = db
    .prepare(
      `SELECT a.value || ' → ' || b.value || ' → ' || c.value AS seq,
              COUNT(*) AS cnt,
              COUNT(DISTINCT ct.session_id) AS sess,
              GROUP_CONCAT(DISTINCT s.project_path) AS projects
       FROM conversation_turns ct
       JOIN sessions s ON ct.session_id = s.id,
            json_each(ct.assistant_tools) a,
            json_each(ct.assistant_tools) b,
            json_each(ct.assistant_tools) c
       WHERE ct.assistant_tools IS NOT NULL
         AND CAST(b.key AS INTEGER) = CAST(a.key AS INTEGER) + 1
         AND CAST(c.key AS INTEGER) = CAST(a.key AS INTEGER) + 2
         AND ${dateWhere}
       GROUP BY seq
       HAVING sess >= ?
       ORDER BY sess DESC, cnt DESC
       LIMIT 20`,
    )
    .all(...dateParams, minFreq) as {
    seq: string;
    cnt: number;
    sess: number;
    projects: string | null;
  }[];

  for (const r of trigrams) {
    results.push({
      type: "trigram",
      sequence: r.seq,
      count: r.cnt,
      sessionCount: r.sess,
      projects: r.projects ? [...new Set(r.projects.split(","))] : [],
    });
  }

  // Full turn tool signatures
  const signatures = db
    .prepare(
      `SELECT ct.assistant_tools AS seq,
              COUNT(*) AS cnt,
              COUNT(DISTINCT ct.session_id) AS sess,
              GROUP_CONCAT(DISTINCT s.project_path) AS projects
       FROM conversation_turns ct
       JOIN sessions s ON ct.session_id = s.id
       WHERE ct.assistant_tools IS NOT NULL
         AND json_array_length(ct.assistant_tools) >= 2
         AND ${dateWhere}
       GROUP BY ct.assistant_tools
       HAVING sess >= ?
       ORDER BY sess DESC, cnt DESC
       LIMIT 20`,
    )
    .all(...dateParams, minFreq) as {
    seq: string;
    cnt: number;
    sess: number;
    projects: string | null;
  }[];

  for (const r of signatures) {
    try {
      const tools: string[] = JSON.parse(r.seq);
      results.push({
        type: "signature",
        sequence: tools.join(" → "),
        count: r.cnt,
        sessionCount: r.sess,
        projects: r.projects ? [...new Set(r.projects.split(","))] : [],
      });
    } catch { /* skip malformed */ }
  }

  // Cross-turn transitions (last tool of turn N → first tool of turn N+1)
  const crossTurn = db
    .prepare(
      `WITH ordered_tools AS (
         SELECT ct.session_id, ct.turn_number, je.key AS pos, je.value AS tool
         FROM conversation_turns ct, json_each(ct.assistant_tools) je
         JOIN sessions s ON ct.session_id = s.id
         WHERE ct.assistant_tools IS NOT NULL AND ${dateWhere}
       ),
       last_tools AS (
         SELECT session_id, turn_number, tool
         FROM ordered_tools
         WHERE CAST(pos AS INTEGER) = (
           SELECT MAX(CAST(o2.pos AS INTEGER)) FROM ordered_tools o2
           WHERE o2.session_id = ordered_tools.session_id
             AND o2.turn_number = ordered_tools.turn_number
         )
       ),
       first_tools AS (
         SELECT session_id, turn_number, tool
         FROM ordered_tools WHERE CAST(pos AS INTEGER) = 0
       )
       SELECT lt.tool || ' →→ ' || ft.tool AS seq,
              COUNT(*) AS cnt,
              COUNT(DISTINCT lt.session_id) AS sess
       FROM last_tools lt
       JOIN first_tools ft
         ON lt.session_id = ft.session_id
         AND ft.turn_number = lt.turn_number + 1
       GROUP BY seq
       HAVING sess >= ?
       ORDER BY sess DESC, cnt DESC
       LIMIT 15`,
    )
    .all(...dateParams, minFreq) as {
    seq: string;
    cnt: number;
    sess: number;
  }[];

  for (const r of crossTurn) {
    results.push({
      type: "cross_turn",
      sequence: r.seq,
      count: r.cnt,
      sessionCount: r.sess,
      projects: [],
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// 2. Prompt Clustering
// ---------------------------------------------------------------------------

export function getPromptClusters(opts: AnalyzerOptions = {}): PromptClusterData[] {
  const days = opts.days ?? 30;
  const minFreq = opts.minFrequency ?? 3;
  const { where: dateWhere, params: dateParams } = buildDateFilter(
    "s.started_at",
    days,
    opts.projectFilter,
  );

  // Fetch prompts with their tools (capped to prevent memory issues)
  const rows = db
    .prepare(
      `SELECT ct.user_prompt, ct.session_id, ct.assistant_tools
       FROM conversation_turns ct
       JOIN sessions s ON ct.session_id = s.id
       WHERE LENGTH(ct.user_prompt) > 10 AND LENGTH(ct.user_prompt) < 2000
         AND ${dateWhere}
       LIMIT 10000`,
    )
    .all(...dateParams) as {
    user_prompt: string;
    session_id: string;
    assistant_tools: string | null;
  }[];

  // Group by action verb
  const verbGroups = new Map<
    string,
    {
      canonical: string;
      prompts: string[];
      sessions: Set<string>;
      tools: Map<string, number>;
    }
  >();

  for (const row of rows) {
    const firstWord = row.user_prompt.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    const canonical = VERB_GROUPS[firstWord] ?? "other";
    const key = firstWord;

    let group = verbGroups.get(key);
    if (!group) {
      group = {
        canonical,
        prompts: [],
        sessions: new Set(),
        tools: new Map(),
      };
      verbGroups.set(key, group);
    }

    group.prompts.push(row.user_prompt);
    group.sessions.add(row.session_id);

    if (row.assistant_tools) {
      try {
        const tools: string[] = JSON.parse(row.assistant_tools);
        for (const t of tools) {
          group.tools.set(t, (group.tools.get(t) ?? 0) + 1);
        }
      } catch { /* skip malformed */ }
    }
  }

  // Filter and sort
  const results: PromptClusterData[] = [];
  for (const [verb, group] of verbGroups) {
    if (group.prompts.length < minFreq) continue;

    const topTools = [...group.tools.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name);

    // Pick diverse examples (first, middle, last)
    const examples: string[] = [];
    const p = group.prompts;
    if (p.length >= 1) examples.push(p[0]);
    if (p.length >= 3) examples.push(p[Math.floor(p.length / 2)]);
    if (p.length >= 2) examples.push(p[p.length - 1]);

    results.push({
      actionVerb: verb,
      canonicalVerb: group.canonical,
      promptCount: group.prompts.length,
      sessionCount: group.sessions.size,
      examples: examples.map((e) => e.slice(0, 200)),
      topTools,
    });
  }

  return results.sort((a, b) => b.promptCount - a.promptCount);
}

// ---------------------------------------------------------------------------
// 3. Project Profiles
// ---------------------------------------------------------------------------

export function getProjectProfiles(opts: AnalyzerOptions = {}): ProjectProfileData[] {
  const days = opts.days ?? 30;

  // Global tool frequency
  const globalTools = db
    .prepare(
      `SELECT je.value AS tool, COUNT(*) AS cnt
       FROM conversation_turns ct
       JOIN sessions s ON ct.session_id = s.id,
            json_each(ct.assistant_tools) je
       WHERE ct.assistant_tools IS NOT NULL
         AND s.started_at >= datetime('now', ?)
       GROUP BY je.value`,
    )
    .all(dateParam(days)) as { tool: string; cnt: number }[];

  const globalTotal = globalTools.reduce((sum, t) => sum + t.cnt, 0);
  const globalMap = new Map(globalTools.map((t) => [t.tool, t.cnt]));

  // Project-level tool frequency
  let projectFilter = "";
  const params: unknown[] = [dateParam(days)];
  if (opts.projectFilter) {
    projectFilter = "AND s.project_path LIKE ?";
    params.push(`%${opts.projectFilter}%`);
  }

  const projectTools = db
    .prepare(
      `SELECT s.project_path, je.value AS tool, COUNT(*) AS cnt,
              COUNT(DISTINCT s.id) AS sess
       FROM conversation_turns ct
       JOIN sessions s ON ct.session_id = s.id,
            json_each(ct.assistant_tools) je
       WHERE ct.assistant_tools IS NOT NULL
         AND s.started_at >= datetime('now', ?)
         AND s.project_path IS NOT NULL
         ${projectFilter}
       GROUP BY s.project_path, je.value
       ORDER BY s.project_path, cnt DESC`,
    )
    .all(...params) as {
    project_path: string;
    tool: string;
    cnt: number;
    sess: number;
  }[];

  // Project session/turn counts
  const projectStats = db
    .prepare(
      `SELECT s.project_path,
              COUNT(DISTINCT s.id) AS session_count,
              COUNT(ct.id) AS turn_count
       FROM sessions s
       LEFT JOIN conversation_turns ct ON s.id = ct.session_id
       WHERE s.started_at >= datetime('now', ?)
         AND s.project_path IS NOT NULL
         ${projectFilter}
       GROUP BY s.project_path`,
    )
    .all(...params) as {
    project_path: string;
    session_count: number;
    turn_count: number;
  }[];

  const statsMap = new Map(
    projectStats.map((s) => [s.project_path, s]),
  );

  // Group by project
  const projectMap = new Map<string, { tool: string; cnt: number }[]>();
  for (const row of projectTools) {
    let arr = projectMap.get(row.project_path);
    if (!arr) {
      arr = [];
      projectMap.set(row.project_path, arr);
    }
    arr.push({ tool: row.tool, cnt: row.cnt });
  }

  // Project-unique tool sequences
  const uniqueSeqs = db
    .prepare(
      `WITH sig_counts AS (
         SELECT s.project_path, ct.assistant_tools AS sig, COUNT(*) AS cnt
         FROM conversation_turns ct
         JOIN sessions s ON ct.session_id = s.id
         WHERE ct.assistant_tools IS NOT NULL
           AND json_array_length(ct.assistant_tools) >= 2
           AND s.started_at >= datetime('now', ?)
           AND s.project_path IS NOT NULL
           ${projectFilter}
         GROUP BY s.project_path, ct.assistant_tools
       ),
       global_sig AS (
         SELECT assistant_tools AS sig, COUNT(DISTINCT s.project_path) AS spread
         FROM conversation_turns ct
         JOIN sessions s ON ct.session_id = s.id
         WHERE ct.assistant_tools IS NOT NULL
           AND s.started_at >= datetime('now', ?)
           AND s.project_path IS NOT NULL
         GROUP BY assistant_tools
       )
       SELECT sc.project_path, sc.sig, sc.cnt
       FROM sig_counts sc
       JOIN global_sig gs ON sc.sig = gs.sig
       WHERE gs.spread = 1 AND sc.cnt >= 2
       ORDER BY sc.cnt DESC`,
    )
    .all(...params, dateParam(days)) as {
    project_path: string;
    sig: string;
    cnt: number;
  }[];

  const uniqueSeqMap = new Map<string, { sequence: string; count: number }[]>();
  for (const row of uniqueSeqs) {
    try {
      let arr = uniqueSeqMap.get(row.project_path);
      if (!arr) {
        arr = [];
        uniqueSeqMap.set(row.project_path, arr);
      }
      const tools: string[] = JSON.parse(row.sig);
      arr.push({ sequence: tools.join(" → "), count: row.cnt });
    } catch { /* skip malformed */ }
  }

  // Build results
  const results: ProjectProfileData[] = [];
  for (const [projPath, tools] of projectMap) {
    const projTotal = tools.reduce((s, t) => s + t.cnt, 0);
    const stats = statsMap.get(projPath);

    const distribution = tools.map((t) => {
      const projPct = t.cnt / projTotal;
      const globalPct = (globalMap.get(t.tool) ?? 0) / globalTotal;
      const enrichment = globalPct > 0 ? projPct / globalPct : 0;
      return {
        tool: t.tool,
        count: t.cnt,
        pct: Math.round(projPct * 1000) / 10,
        enrichment: Math.round(enrichment * 100) / 100,
      };
    });

    results.push({
      projectPath: projPath,
      sessionCount: stats?.session_count ?? 0,
      turnCount: stats?.turn_count ?? 0,
      toolDistribution: distribution,
      uniqueSequences: uniqueSeqMap.get(projPath) ?? [],
    });
  }

  return results.sort((a, b) => b.turnCount - a.turnCount);
}

// ---------------------------------------------------------------------------
// 4. Workflow Arcs
// ---------------------------------------------------------------------------

export function getWorkflowArcs(opts: AnalyzerOptions = {}): WorkflowArcData[] {
  const days = opts.days ?? 30;
  const minSessions = opts.minFrequency ?? 2;

  let projectFilter = "";
  const params: unknown[] = [dateParam(days)];
  if (opts.projectFilter) {
    projectFilter = "AND s.project_path LIKE ?";
    params.push(`%${opts.projectFilter}%`);
  }

  // Get all turns grouped by session
  const turns = db
    .prepare(
      `SELECT ct.session_id, ct.turn_number, ct.assistant_tools, s.turn_count
       FROM conversation_turns ct
       JOIN sessions s ON ct.session_id = s.id
       WHERE s.started_at >= datetime('now', ?)
         AND s.turn_count BETWEEN 3 AND 30
         ${projectFilter}
       ORDER BY ct.session_id, ct.turn_number`,
    )
    .all(...params) as {
    session_id: string;
    turn_number: number;
    assistant_tools: string | null;
    turn_count: number;
  }[];

  // Build per-session arcs
  const sessionArcs = new Map<string, { phases: string[]; turnCount: number }>();
  let currentSessionId = "";
  let currentPhases: string[] = [];

  for (const turn of turns) {
    if (turn.session_id !== currentSessionId) {
      if (currentSessionId && currentPhases.length > 0) {
        sessionArcs.set(currentSessionId, {
          phases: currentPhases,
          turnCount: currentPhases.length,
        });
      }
      currentSessionId = turn.session_id;
      currentPhases = [];
    }

    let phase = "other";
    if (turn.assistant_tools) {
      try {
        const tools: string[] = JSON.parse(turn.assistant_tools);
        phase = toolsToPhase(tools);
      } catch { /* skip */ }
    }
    currentPhases.push(phase);
  }
  // Don't forget the last session
  if (currentSessionId && currentPhases.length > 0) {
    sessionArcs.set(currentSessionId, {
      phases: currentPhases,
      turnCount: currentPhases.length,
    });
  }

  // Group identical arcs
  const arcGroups = new Map<
    string,
    { sessionIds: string[]; totalTurns: number; phases: string[] }
  >();

  for (const [sessionId, data] of sessionArcs) {
    const key = data.phases.join(" → ");
    let group = arcGroups.get(key);
    if (!group) {
      group = { sessionIds: [], totalTurns: 0, phases: data.phases };
      arcGroups.set(key, group);
    }
    group.sessionIds.push(sessionId);
    group.totalTurns += data.turnCount;
  }

  // Filter and return
  const results: WorkflowArcData[] = [];
  for (const [arc, group] of arcGroups) {
    if (group.sessionIds.length < minSessions) continue;
    results.push({
      arc,
      phases: group.phases,
      sessionCount: group.sessionIds.length,
      sessionIds: group.sessionIds.slice(0, 5),
      avgTurnCount: Math.round(group.totalTurns / group.sessionIds.length),
    });
  }

  return results.sort((a, b) => b.sessionCount - a.sessionCount);
}

// ---------------------------------------------------------------------------
// 5. Friction Points
// ---------------------------------------------------------------------------

export function getFrictionPoints(opts: AnalyzerOptions = {}): FrictionPointData[] {
  const days = opts.days ?? 30;

  let projectFilter = "";
  const params: unknown[] = [dateParam(days)];
  if (opts.projectFilter) {
    projectFilter = "AND s.project_path LIKE ?";
    params.push(`%${opts.projectFilter}%`);
  }

  const rows = db
    .prepare(
      `SELECT ct1.session_id,
              ct1.turn_number,
              ct1.user_prompt AS prompt,
              ct2.user_prompt AS retry_prompt,
              ROUND(
                (JULIANDAY(ct2.user_prompt_at) - JULIANDAY(ct1.assistant_at)) * 86400,
                1
              ) AS gap_sec,
              s.project_path
       FROM conversation_turns ct1
       JOIN conversation_turns ct2
         ON ct1.session_id = ct2.session_id
         AND ct2.turn_number = ct1.turn_number + 1
       JOIN sessions s ON ct1.session_id = s.id
       WHERE ct1.assistant_at IS NOT NULL
         AND ct2.user_prompt_at IS NOT NULL
         AND s.started_at >= datetime('now', ?)
         ${projectFilter}
         AND (JULIANDAY(ct2.user_prompt_at) - JULIANDAY(ct1.assistant_at)) * 86400 BETWEEN 0 AND 30
       ORDER BY gap_sec ASC
       LIMIT 50`,
    )
    .all(...params) as {
    session_id: string;
    turn_number: number;
    prompt: string;
    retry_prompt: string;
    gap_sec: number;
    project_path: string | null;
  }[];

  return rows.map((r) => ({
    sessionId: r.session_id,
    turnNumber: r.turn_number,
    prompt: r.prompt.slice(0, 200),
    retryPrompt: r.retry_prompt.slice(0, 200),
    gapSeconds: r.gap_sec,
    project: r.project_path ?? "unknown",
  }));
}

// ---------------------------------------------------------------------------
// Aggregate
// ---------------------------------------------------------------------------

export function getAnalysisStats(opts: AnalyzerOptions = {}): AnalysisStats {
  const days = opts.days ?? 30;

  let projectFilter = "";
  const params: unknown[] = [dateParam(days)];
  if (opts.projectFilter) {
    projectFilter = "AND s.project_path LIKE ?";
    params.push(`%${opts.projectFilter}%`);
  }

  const stats = db
    .prepare(
      `SELECT COUNT(DISTINCT s.id) AS sessions, COUNT(ct.id) AS turns
       FROM sessions s
       LEFT JOIN conversation_turns ct ON s.id = ct.session_id
       WHERE s.started_at >= datetime('now', ?)
         ${projectFilter}`,
    )
    .get(...params) as { sessions: number; turns: number } | undefined;

  return {
    sessionsAnalyzed: stats?.sessions ?? 0,
    turnsAnalyzed: stats?.turns ?? 0,
    timeRangeDays: days,
  };
}

function safeCall<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (e) {
    console.error(`[analyzer] ${fn.name || "query"} failed:`, e);
    return fallback;
  }
}

export function analyzeAll(opts: AnalyzerOptions = {}): PatternAnalysis {
  return {
    toolSequences: safeCall(() => getToolSequences(opts), []),
    promptClusters: safeCall(() => getPromptClusters(opts), []),
    projectProfiles: safeCall(() => getProjectProfiles(opts), []),
    workflowArcs: safeCall(() => getWorkflowArcs(opts), []),
    frictionPoints: safeCall(() => getFrictionPoints(opts), []),
    stats: safeCall(() => getAnalysisStats(opts), { sessionsAnalyzed: 0, turnsAnalyzed: 0, timeRangeDays: opts.days ?? 30 }),
    analyzedAt: new Date().toISOString(),
  };
}
