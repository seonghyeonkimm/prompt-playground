"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Turn, TurnFilter, TurnCard, RoleFilter } from "./turn-card";

export function LiveSessionView({
  sessionId,
  initialTurns,
}: {
  sessionId: string;
  initialTurns: Turn[];
}) {
  const [turns, setTurns] = useState<Turn[]>(initialTurns);
  const [isLive, setIsLive] = useState(false);
  const [filter, setFilter] = useState<TurnFilter>("all");
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

      <RoleFilter value={filter} onChange={setFilter} />

      {turns.length === 0 ? (
        <div className="text-center text-[var(--muted-foreground)] py-12">
          No conversation turns recorded.
        </div>
      ) : (
        turns.map((turn) => (
          <TurnCard key={turn.id} turn={turn} filter={filter} />
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
}
