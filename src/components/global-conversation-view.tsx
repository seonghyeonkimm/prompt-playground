"use client";

import { useState, useCallback } from "react";
import { GlobalTurn, TurnFilter, TurnCard, RoleFilter } from "./turn-card";

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function GlobalConversationView({
  initialTurns,
  initialPagination,
  projects,
}: {
  initialTurns: GlobalTurn[];
  initialPagination: Pagination;
  projects: string[];
}) {
  const [turns, setTurns] = useState<GlobalTurn[]>(initialTurns);
  const [filter, setFilter] = useState<TurnFilter>("all");
  const [pagination, setPagination] = useState(initialPagination);
  const [project, setProject] = useState("");
  const [order, setOrder] = useState<"desc" | "asc">("desc");
  const [loading, setLoading] = useState(false);
  const limit = initialPagination.limit;

  const fetchTurns = useCallback(
    async (page: number, proj: string, ord: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(limit),
          order: ord,
        });
        if (proj) params.set("project", proj);

        const res = await fetch(`/api/conversations?${params}`);
        const data = await res.json();
        setTurns(data.turns);
        setPagination(data.pagination);
      } catch {
        // Ignore fetch errors
      } finally {
        setLoading(false);
      }
    },
    [limit]
  );

  function handleProjectChange(newProject: string) {
    setProject(newProject);
    fetchTurns(1, newProject, order);
  }

  function handleOrderChange(newOrder: "desc" | "asc") {
    setOrder(newOrder);
    fetchTurns(1, project, newOrder);
  }

  function handlePage(newPage: number) {
    fetchTurns(newPage, project, order);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="space-y-4">
      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-3">
        <RoleFilter value={filter} onChange={setFilter} />

        <select
          value={project}
          onChange={(e) => handleProjectChange(e.target.value)}
          className="bg-[var(--muted)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs"
        >
          <option value="">All projects</option>
          {projects.map((p) => {
            const parts = p.split("/");
            const short = parts.slice(-2).join("/");
            return (
              <option key={p} value={p}>
                {short}
              </option>
            );
          })}
        </select>

        <div className="flex gap-1 rounded-lg bg-[var(--muted)] border border-[var(--border)] p-1">
          {(["desc", "asc"] as const).map((v) => (
            <button
              key={v}
              onClick={() => handleOrderChange(v)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                order === v
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              {v === "desc" ? "Newest" : "Oldest"}
            </button>
          ))}
        </div>

        {loading && (
          <span className="text-xs text-[var(--muted-foreground)]">
            Loading...
          </span>
        )}
      </div>

      {/* Turns */}
      {turns.length === 0 ? (
        <div className="text-center text-[var(--muted-foreground)] py-12">
          No conversation turns found.
        </div>
      ) : (
        <div className="space-y-4">
          {turns.map((turn) => (
            <TurnCard
              key={turn.id}
              turn={turn}
              filter={filter}
              showSessionContext
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex justify-center gap-2">
          {pagination.page > 1 && (
            <button
              onClick={() => handlePage(pagination.page - 1)}
              className="px-3 py-1 rounded bg-[var(--muted)] text-sm hover:bg-[var(--border)]"
            >
              Previous
            </button>
          )}
          <span className="px-3 py-1 text-sm text-[var(--muted-foreground)]">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          {pagination.page < pagination.totalPages && (
            <button
              onClick={() => handlePage(pagination.page + 1)}
              className="px-3 py-1 rounded bg-[var(--muted)] text-sm hover:bg-[var(--border)]"
            >
              Next
            </button>
          )}
        </div>
      )}
    </div>
  );
}
