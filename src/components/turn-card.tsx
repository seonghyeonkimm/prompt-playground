import Link from "next/link";

export interface Turn {
  id: number;
  turn_number: number;
  user_prompt: string;
  user_prompt_at: string;
  assistant_text: string | null;
  assistant_tools: string | null;
  assistant_at: string | null;
  model: string | null;
}

export interface GlobalTurn extends Turn {
  session_id: string;
  project_path: string | null;
  git_branch: string | null;
}

export type TurnFilter = "all" | "human" | "user" | "assistant";

function formatTime(dateStr: string | null) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function parseTools(toolsJson: string | null): string[] {
  if (!toolsJson) return [];
  try {
    return JSON.parse(toolsJson);
  } catch {
    return [];
  }
}

function shortPath(p: string | null) {
  if (!p || p === "unknown") return "unknown";
  const parts = p.split("/");
  return parts.slice(-2).join("/");
}

const SYSTEM_PREFIXES = [
  "<command-name>",
  "<command-message>",
  "<command-",
  "<task-notification>",
  "<system-reminder>",
  "<system_instruction>",
  "<system-",
  "<local-command",
  "<user-prompt-submit-hook>",
  "<teammate-message",
  "[Request interrupted",
  "Base directory for this skill:",
  "## Context (precomputed)",
  "This session is being continued from a previous conversation",
];

const SYSTEM_CONTENT_PATTERNS = [
  /<command-name>/,
  /<command-message>/,
  /<task-notification>/,
  /<system-reminder>/,
  /<system_instruction>/,
  /<local-command-caveat>/,
  /<teammate-message/,
  /hook success:/,
];

export function isHumanPrompt(text: string): boolean {
  const trimmed = text.trimStart();
  if (SYSTEM_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) return false;
  if (SYSTEM_CONTENT_PATTERNS.some((pattern) => pattern.test(trimmed))) return false;
  // Detect skill/command templates: starts with "# ", long content with subheadings
  if (trimmed.startsWith("# ") && trimmed.length > 500 && /\n## /.test(trimmed)) return false;
  return true;
}

export function RoleFilter({
  value,
  onChange,
}: {
  value: TurnFilter;
  onChange: (value: TurnFilter) => void;
}) {
  const options: { key: TurnFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "human", label: "Human" },
    { key: "user", label: "User" },
    { key: "assistant", label: "Claude" },
  ];

  return (
    <div className="flex gap-1 rounded-lg bg-[var(--muted)] border border-[var(--border)] p-1 w-fit">
      {options.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
            value === key
              ? "bg-[var(--accent)] text-white"
              : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function TurnCard({
  turn,
  filter,
  showSessionContext,
}: {
  turn: Turn | GlobalTurn;
  filter: TurnFilter;
  showSessionContext?: boolean;
}) {
  const tools = parseTools(turn.assistant_tools);
  const isGlobal = "session_id" in turn;

  // "human" filter: hide entire turn if prompt is system-generated
  if (filter === "human" && !isHumanPrompt(turn.user_prompt)) {
    return null;
  }

  // "assistant" filter: hide turn if no assistant content
  if (filter === "assistant" && !turn.assistant_text && tools.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {/* Session context header */}
      {showSessionContext && isGlobal && (
        <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
          <Link
            href={`/sessions/${(turn as GlobalTurn).session_id}`}
            className="text-[var(--accent)] hover:underline font-mono"
          >
            {shortPath((turn as GlobalTurn).project_path)}
          </Link>
          {(turn as GlobalTurn).git_branch && (
            <span className="px-1.5 py-0.5 rounded bg-[var(--muted)] border border-[var(--border)]">
              {(turn as GlobalTurn).git_branch}
            </span>
          )}
        </div>
      )}

      {/* User prompt */}
      {filter !== "assistant" && (
        <div className="flex gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold">
            U
          </div>
          <div className="flex-1 min-w-0">
            <div className="bg-blue-600/10 border border-blue-600/20 rounded-lg p-3">
              <pre className="whitespace-pre-wrap text-sm break-words">
                {turn.user_prompt}
              </pre>
            </div>
            <span className="text-[10px] text-[var(--muted-foreground)] mt-1 block">
              Turn {turn.turn_number} &middot; {formatTime(turn.user_prompt_at)}
            </span>
          </div>
        </div>
      )}

      {/* Claude response — hidden for "user" and "human" filters */}
      {filter !== "user" && filter !== "human" && (turn.assistant_text || tools.length > 0) && (
        <div className="flex gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-orange-600 flex items-center justify-center text-xs font-bold">
            C
          </div>
          <div className="flex-1 min-w-0">
            {tools.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {tools.map((tool, i) => (
                  <span
                    key={i}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-purple-600/20 text-purple-400 border border-purple-600/30"
                  >
                    {tool}
                  </span>
                ))}
              </div>
            )}
            {turn.assistant_text && (
              <div className="bg-[var(--muted)] border border-[var(--border)] rounded-lg p-3">
                <pre className="whitespace-pre-wrap text-sm break-words">
                  {turn.assistant_text}
                </pre>
              </div>
            )}
            <div className="flex gap-2 mt-1">
              <span className="text-[10px] text-[var(--muted-foreground)]">
                {formatTime(turn.assistant_at)}
              </span>
              {turn.model && (
                <span className="text-[10px] text-[var(--muted-foreground)]">
                  {turn.model}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
