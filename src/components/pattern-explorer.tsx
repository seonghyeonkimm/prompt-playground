"use client";

import { useState } from "react";
import type {
  PatternAnalysis,
  ToolSequenceData,
  PromptClusterData,
  ProjectProfileData,
  WorkflowArcData,
  FrictionPointData,
} from "@/lib/analyzer";

type Tab = "sequences" | "prompts" | "projects" | "workflows" | "friction";

const TABS: { key: Tab; label: string }[] = [
  { key: "sequences", label: "Tool Sequences" },
  { key: "prompts", label: "Prompt Clusters" },
  { key: "projects", label: "Project Profiles" },
  { key: "workflows", label: "Workflow Arcs" },
  { key: "friction", label: "Friction Points" },
];

export function PatternExplorer({ analysis }: { analysis: PatternAnalysis }) {
  const [tab, setTab] = useState<Tab>("sequences");

  return (
    <div className="space-y-4">
      {/* Tab Bar */}
      <div className="flex gap-1 rounded-lg bg-[var(--muted)] border border-[var(--border)] p-1 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              tab === t.key
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-[var(--card)] rounded-lg border border-[var(--border)]">
        {tab === "sequences" && (
          <ToolSequencesTab data={analysis.toolSequences} />
        )}
        {tab === "prompts" && (
          <PromptClustersTab data={analysis.promptClusters} />
        )}
        {tab === "projects" && (
          <ProjectProfilesTab data={analysis.projectProfiles} />
        )}
        {tab === "workflows" && (
          <WorkflowArcsTab data={analysis.workflowArcs} />
        )}
        {tab === "friction" && (
          <FrictionPointsTab data={analysis.frictionPoints} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Tool Sequences
// ---------------------------------------------------------------------------

function ToolSequencesTab({ data }: { data: ToolSequenceData[] }) {
  if (data.length === 0) return <EmptyState message="No tool sequence patterns found." />;

  const grouped = {
    bigram: data.filter((d) => d.type === "bigram"),
    trigram: data.filter((d) => d.type === "trigram"),
    signature: data.filter((d) => d.type === "signature"),
    cross_turn: data.filter((d) => d.type === "cross_turn"),
  };

  return (
    <div className="divide-y divide-[var(--border)]">
      {grouped.bigram.length > 0 && (
        <SequenceGroup title="Bigrams (A → B within same turn)" items={grouped.bigram} />
      )}
      {grouped.trigram.length > 0 && (
        <SequenceGroup title="Trigrams (A → B → C within same turn)" items={grouped.trigram} />
      )}
      {grouped.signature.length > 0 && (
        <SequenceGroup title="Full Turn Signatures" items={grouped.signature} />
      )}
      {grouped.cross_turn.length > 0 && (
        <SequenceGroup title="Cross-Turn Transitions" items={grouped.cross_turn} />
      )}
    </div>
  );
}

function SequenceGroup({ title, items }: { title: string; items: ToolSequenceData[] }) {
  return (
    <div className="p-4">
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1 flex-wrap min-w-0">
              {item.sequence.split(" → ").map((tool, j) => (
                <span key={j} className="flex items-center gap-1">
                  {j > 0 && <span className="text-[var(--muted-foreground)] text-xs">→</span>}
                  <ToolBadge name={tool} />
                </span>
              ))}
            </div>
            <div className="flex items-center gap-3 flex-shrink-0 text-xs text-[var(--muted-foreground)]">
              <span>{item.count}x</span>
              <span>{item.sessionCount} sessions</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Prompt Clusters
// ---------------------------------------------------------------------------

function PromptClustersTab({ data }: { data: PromptClusterData[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (data.length === 0) return <EmptyState message="No prompt clusters found." />;

  return (
    <div className="divide-y divide-[var(--border)]">
      {data.map((cluster) => (
        <div key={cluster.actionVerb} className="p-4">
          <button
            onClick={() =>
              setExpanded(expanded === cluster.actionVerb ? null : cluster.actionVerb)
            }
            className="w-full text-left"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">"{cluster.actionVerb}"</span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--muted)] text-[var(--muted-foreground)]">
                  {cluster.canonicalVerb}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-[var(--muted-foreground)]">
                <span>{cluster.promptCount} prompts</span>
                <span>{cluster.sessionCount} sessions</span>
                <span>{expanded === cluster.actionVerb ? "▲" : "▼"}</span>
              </div>
            </div>
            {cluster.topTools.length > 0 && (
              <div className="flex gap-1 mt-1.5">
                {cluster.topTools.map((tool) => (
                  <ToolBadge key={tool} name={tool} />
                ))}
              </div>
            )}
          </button>

          {expanded === cluster.actionVerb && (
            <div className="mt-3 space-y-1.5 pl-4 border-l-2 border-[var(--border)]">
              {cluster.examples.map((ex, i) => (
                <p key={i} className="text-xs text-[var(--muted-foreground)]">
                  "{ex}"
                </p>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Project Profiles
// ---------------------------------------------------------------------------

function ProjectProfilesTab({ data }: { data: ProjectProfileData[] }) {
  if (data.length === 0) return <EmptyState message="No project profiles found." />;

  return (
    <div className="divide-y divide-[var(--border)]">
      {data.map((project) => {
        const shortPath = project.projectPath.split("/").slice(-2).join("/");
        return (
          <div key={project.projectPath} className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-sm font-semibold">{shortPath}</span>
              <span className="text-xs text-[var(--muted-foreground)]">
                {project.sessionCount} sessions, {project.turnCount} turns
              </span>
            </div>

            {/* Tool Distribution Bar */}
            <div className="space-y-1.5">
              {project.toolDistribution.slice(0, 8).map((t) => (
                <div key={t.tool} className="flex items-center gap-2">
                  <span className="text-xs w-16 text-right font-mono">{t.tool}</span>
                  <div className="flex-1 h-4 bg-[var(--muted)] rounded-sm overflow-hidden">
                    <div
                      className={`h-full rounded-sm ${
                        t.enrichment > 1.5
                          ? "bg-orange-500/60"
                          : t.enrichment < 0.5
                            ? "bg-blue-500/40"
                            : "bg-[var(--accent)]/40"
                      }`}
                      style={{ width: `${Math.min(t.pct, 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-[var(--muted-foreground)] w-16">
                    {t.pct}% ({t.enrichment}x)
                  </span>
                </div>
              ))}
            </div>

            {/* Unique Sequences */}
            {project.uniqueSequences.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-[var(--muted-foreground)] mb-1">
                  Unique to this project:
                </p>
                <div className="space-y-1">
                  {project.uniqueSequences.map((seq, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="text-[var(--muted-foreground)]">{seq.count}x</span>
                      <span>{seq.sequence}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Workflow Arcs
// ---------------------------------------------------------------------------

function WorkflowArcsTab({ data }: { data: WorkflowArcData[] }) {
  if (data.length === 0) return <EmptyState message="No workflow arc patterns found." />;

  const phaseColors: Record<string, string> = {
    explore: "bg-blue-500/60",
    edit: "bg-orange-500/60",
    run: "bg-green-500/60",
    delegate: "bg-purple-500/60",
    other: "bg-gray-500/40",
  };

  return (
    <div className="divide-y divide-[var(--border)]">
      <div className="p-3 text-xs text-[var(--muted-foreground)] flex gap-3">
        {Object.entries(phaseColors).map(([phase, color]) => (
          <span key={phase} className="flex items-center gap-1">
            <span className={`w-3 h-3 rounded-sm ${color}`} />
            {phase}
          </span>
        ))}
      </div>
      {data.map((arc, i) => (
        <div key={i} className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-[var(--muted-foreground)]">
              {arc.sessionCount} sessions, avg {arc.avgTurnCount} turns
            </span>
          </div>
          <div className="flex gap-0.5">
            {arc.phases.map((phase, j) => (
              <div
                key={j}
                className={`h-6 rounded-sm flex-1 ${phaseColors[phase] ?? phaseColors.other}`}
                title={`Turn ${j + 1}: ${phase}`}
              />
            ))}
          </div>
          <p className="text-[10px] text-[var(--muted-foreground)] mt-1 font-mono">
            {arc.arc}
          </p>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Friction Points
// ---------------------------------------------------------------------------

function FrictionPointsTab({ data }: { data: FrictionPointData[] }) {
  if (data.length === 0) return <EmptyState message="No friction points detected." />;

  return (
    <div className="divide-y divide-[var(--border)]">
      {data.map((fp, i) => (
        <div key={i} className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-[var(--muted-foreground)]">
              {fp.project.split("/").slice(-2).join("/")} — Turn {fp.turnNumber}
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
              {fp.gapSeconds}s gap
            </span>
          </div>
          <div className="space-y-1.5 text-sm">
            <p className="text-[var(--muted-foreground)]">
              <span className="text-xs uppercase tracking-wide mr-2">Prompt:</span>
              {fp.prompt}
            </p>
            <p>
              <span className="text-xs uppercase tracking-wide text-[var(--muted-foreground)] mr-2">Retry:</span>
              {fp.retryPrompt}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared Components
// ---------------------------------------------------------------------------

function ToolBadge({ name }: { name: string }) {
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-600/20 text-purple-400 border border-purple-600/30">
      {name}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="p-8 text-center text-[var(--muted-foreground)] text-sm">
      {message}
    </div>
  );
}
