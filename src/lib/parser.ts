/**
 * Parser for Claude Code JSONL transcript files.
 * Reads ~/.claude/projects/<project-hash>/<session-id>.jsonl
 */
import fs from "fs";
import path from "path";

export interface TranscriptEntry {
  type: "user" | "assistant" | "system" | "progress" | "queue-operation" | string;
  timestamp: string;
  sessionId: string;
  cwd?: string;
  version?: string;
  gitBranch?: string;
  message?: {
    role: string;
    content: string | ContentBlock[];
    model?: string;
    stop_reason?: string | null;
    usage?: { input_tokens: number; output_tokens: number };
  };
  data?: Record<string, unknown>;
  uuid?: string;
}

export interface ContentBlock {
  type: "text" | "tool_use" | "tool_result" | "image";
  text?: string;
  name?: string;
  id?: string;
  input?: Record<string, unknown>;
}

export interface ParsedSession {
  id: string;
  projectPath: string;      // cwd from entries
  projectHash: string;       // directory name in ~/.claude/projects/
  jsonlPath: string;         // full path to .jsonl file
  startedAt: string;
  lastActivityAt: string;
  version: string | null;
  gitBranch: string | null;
  turns: ParsedTurn[];
}

export interface ParsedTurn {
  turnNumber: number;
  userPrompt: string;
  userPromptAt: string;
  assistantTexts: string[];  // collected text blocks
  assistantTools: ToolUse[];
  assistantAt: string | null;
  model: string | null;
}

export interface ToolUse {
  name: string;
  id: string;
}

const CLAUDE_DIR = path.join(process.env.HOME || "~", ".claude", "projects");

/**
 * Discover all project directories and their JSONL files
 */
export function discoverSessions(): {
  projectHash: string;
  sessionId: string;
  jsonlPath: string;
  mtime: number;
}[] {
  const results: {
    projectHash: string;
    sessionId: string;
    jsonlPath: string;
    mtime: number;
  }[] = [];

  if (!fs.existsSync(CLAUDE_DIR)) return results;

  for (const projectDir of fs.readdirSync(CLAUDE_DIR)) {
    const projectPath = path.join(CLAUDE_DIR, projectDir);
    if (!fs.statSync(projectPath).isDirectory()) continue;

    for (const file of fs.readdirSync(projectPath)) {
      if (!file.endsWith(".jsonl")) continue;
      const filePath = path.join(projectPath, file);
      const sessionId = file.replace(".jsonl", "");
      const stat = fs.statSync(filePath);
      results.push({
        projectHash: projectDir,
        sessionId,
        jsonlPath: filePath,
        mtime: stat.mtimeMs,
      });
    }
  }

  return results.sort((a, b) => b.mtime - a.mtime);
}

/**
 * Parse a single JSONL transcript file into structured data.
 * Optionally skip first N bytes for incremental parsing.
 */
export function parseTranscript(
  jsonlPath: string,
  fromByte = 0
): { session: ParsedSession | null; bytesRead: number } {
  let content: string;
  try {
    const buf = fs.readFileSync(jsonlPath);
    content = buf.toString("utf-8");
  } catch {
    return { session: null, bytesRead: 0 };
  }

  const totalBytes = Buffer.byteLength(content, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());

  // Parse all entries
  const entries: TranscriptEntry[] = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // Skip malformed lines
    }
  }

  if (entries.length === 0) return { session: null, bytesRead: totalBytes };

  // Extract session metadata from first meaningful entry
  const firstEntry = entries.find((e) => e.sessionId);
  if (!firstEntry) return { session: null, bytesRead: totalBytes };

  const sessionId = firstEntry.sessionId;
  const projectHash = path.basename(path.dirname(jsonlPath));

  // Build turns: group by user→assistant sequences
  const turns: ParsedTurn[] = [];
  let currentTurn: ParsedTurn | null = null;

  for (const entry of entries) {
    if (entry.type === "user") {
      const userText = extractUserText(entry);
      if (userText) {
        // Save previous turn
        if (currentTurn) turns.push(currentTurn);
        currentTurn = {
          turnNumber: turns.length + 1,
          userPrompt: userText,
          userPromptAt: entry.timestamp,
          assistantTexts: [],
          assistantTools: [],
          assistantAt: null,
          model: null,
        };
      }
    } else if (entry.type === "assistant" && currentTurn) {
      const msg = entry.message;
      if (!msg) continue;

      if (msg.model) currentTurn.model = msg.model;
      if (!currentTurn.assistantAt) currentTurn.assistantAt = entry.timestamp;

      const content = msg.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "text" && block.text?.trim()) {
            currentTurn.assistantTexts.push(block.text);
          } else if (block.type === "tool_use" && block.name) {
            currentTurn.assistantTools.push({
              name: block.name,
              id: block.id || "",
            });
          }
        }
      }
    }
  }

  // Push the last turn
  if (currentTurn) turns.push(currentTurn);

  // Find metadata
  const cwdEntry = entries.find((e) => e.cwd);
  const versionEntry = entries.find((e) => e.version);
  const branchEntry = entries.find((e) => e.gitBranch);
  const lastEntry = entries[entries.length - 1];

  const session: ParsedSession = {
    id: sessionId,
    projectPath: cwdEntry?.cwd || "unknown",
    projectHash,
    jsonlPath,
    startedAt: firstEntry.timestamp,
    lastActivityAt: lastEntry.timestamp,
    version: versionEntry?.version || null,
    gitBranch: branchEntry?.gitBranch || null,
    turns,
  };

  return { session, bytesRead: totalBytes };
}

/**
 * Extract meaningful user text from a user entry.
 * Filters out system instructions, tool results, and other noise.
 */
function extractUserText(entry: TranscriptEntry): string | null {
  const msg = entry.message;
  if (!msg) return null;

  const content = msg.content;

  if (typeof content === "string") {
    // Skip system instructions
    if (content.startsWith("<system")) return null;
    if (content.startsWith("<local-command")) return null;
    return content.trim() || null;
  }

  if (Array.isArray(content)) {
    // Find text blocks, preferring non-system ones
    const textBlocks: string[] = [];
    for (const block of content) {
      if (typeof block === "string") {
        textBlocks.push(block);
        continue;
      }
      if (block.type === "text" && block.text) {
        const text = block.text.trim();
        // Skip system/hook/command injections
        if (text.startsWith("<system")) continue;
        if (text.startsWith("<local-command")) continue;
        if (text.startsWith("<command-name>")) continue;
        if (text.startsWith("[Request interrupted")) continue;
        if (text) textBlocks.push(text);
      }
    }
    const joined = textBlocks.join("\n").trim();
    return joined || null;
  }

  return null;
}

export { CLAUDE_DIR };
