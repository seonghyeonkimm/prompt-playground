"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

interface SearchResult {
  id: number;
  session_id: string;
  turn_number: number;
  user_prompt: string;
  assistant_text: string | null;
  user_prompt_at: string;
  project_path: string | null;
  prompt_snippet?: string;
  response_snippet?: string;
}

function shortPath(p: string | null) {
  if (!p || p === "unknown") return "unknown";
  const parts = p.split("/");
  return parts.slice(-2).join("/");
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function renderSnippet(snippet: string): ReactNode[] {
  const parts = snippet.split(/(<mark>|<\/mark>)/);
  const elements: ReactNode[] = [];
  let inMark = false;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === "<mark>") { inMark = true; continue; }
    if (part === "</mark>") { inMark = false; continue; }
    if (part) {
      elements.push(
        inMark ? (
          <mark key={i} className="bg-blue-500/30 text-inherit px-0.5 rounded-sm">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        )
      );
    }
  }
  return elements;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      setResults(data.results || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Search</h1>
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search prompts and responses..."
          className="flex-1 bg-[var(--muted)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[var(--accent)]"
          autoFocus
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-[var(--accent)] text-white px-6 py-3 rounded-lg text-sm hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </form>

      {searched && (
        <div className="space-y-3">
          <p className="text-sm text-[var(--muted-foreground)]">
            {results.length} result{results.length !== 1 ? "s" : ""} for &ldquo;{query}&rdquo;
          </p>
          {results.length === 0 ? (
            <div className="text-center text-[var(--muted-foreground)] py-12">No results found.</div>
          ) : (
            <div className="space-y-3">
              {results.map((r) => (
                <Link
                  key={`${r.session_id}-${r.turn_number}`}
                  href={`/sessions/${r.session_id}`}
                  className="block bg-[var(--card)] border border-[var(--border)] rounded-lg p-4 hover:bg-[var(--muted)] transition-colors"
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-mono text-xs text-[var(--muted-foreground)]">
                      {shortPath(r.project_path)} &middot; Turn {r.turn_number}
                    </span>
                    <span className="text-xs text-[var(--muted-foreground)]">
                      {formatDate(r.user_prompt_at)}
                    </span>
                  </div>
                  <p className="text-sm">
                    {r.prompt_snippet ? renderSnippet(r.prompt_snippet) : r.user_prompt.slice(0, 200)}
                  </p>
                  {(r.response_snippet || r.assistant_text) && (
                    <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                      {r.response_snippet ? renderSnippet(r.response_snippet) : r.assistant_text?.slice(0, 200)}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
