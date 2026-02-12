"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface Turn {
  id: number;
  turn_number: number;
  user_prompt: string;
  user_prompt_at: string;
  assistant_text: string | null;
  assistant_tools: string | null;
  assistant_at: string | null;
  model: string | null;
}

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

export function LiveSessionView({
  sessionId,
  initialTurns,
}: {
  sessionId: string;
  initialTurns: Turn[];
}) {
  const [turns, setTurns] = useState<Turn[]>(initialTurns);
  const [isLive, setIsLive] = useState(false);
  const [filter, setFilter] = useState<"all" | "user" | "assistant">("all");
  const bottomRef = useRef<HTMLDivElement>(null);

  const refreshTurns = useCallback(async () => {
    try {
      const res = await fetch(`/api/session/${sessionId}`);
      const data = await res.json();
      if (data.turns) {
        setTurns(data.turns);
      }
    } catch {
      // Ignore fetch errors
    }
  }, [sessionId]);

  useEffect(() => {
    const eventSource = new EventSource("/api/events");

    eventSource.addEventListener("connected", () => {
      setIsLive(true);
    });

    eventSource.addEventListener("session_updated", (e) => {
      const data = JSON.parse(e.data);
      if (data.sessionId === sessionId) {
        refreshTurns();
      }
    });

    eventSource.onerror = () => {
      setIsLive(false);
    };

    return () => {
      eventSource.close();
      setIsLive(false);
    };
  }, [sessionId, refreshTurns]);

  useEffect(() => {
    // Auto-scroll to bottom when new turns arrive
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns.length]);

  return (
    <div className="space-y-4">
      {isLive && (
        <div className="flex items-center gap-2 text-xs text-green-500">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          Live - updates automatically
        </div>
      )}

      {/* Role filter */}
      <div className="flex gap-1 rounded-lg bg-[var(--muted)] border border-[var(--border)] p-1 w-fit">
        {(["all", "user", "assistant"] as const).map((value) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              filter === value
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            }`}
          >
            {value === "all" ? "All" : value === "user" ? "User" : "Claude"}
          </button>
        ))}
      </div>

      {turns.length === 0 ? (
        <div className="text-center text-[var(--muted-foreground)] py-12">
          No conversation turns recorded.
        </div>
      ) : (
        turns.map((turn) => {
          const tools = parseTools(turn.assistant_tools);
          return (
            <div key={turn.id} className="space-y-2">
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

              {/* Claude response */}
              {filter !== "user" && (turn.assistant_text || tools.length > 0) && (
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-orange-600 flex items-center justify-center text-xs font-bold">
                    C
                  </div>
                  <div className="flex-1 min-w-0">
                    {/* Tool badges */}
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
        })
      )}
      <div ref={bottomRef} />
    </div>
  );
}
