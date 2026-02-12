import { ensureInitialized } from "@/lib/init";
import { analyzeAll, type PatternAnalysis } from "@/lib/analyzer";
import { PatternExplorer } from "@/components/pattern-explorer";

function getAnalysis(): PatternAnalysis {
  ensureInitialized();
  return analyzeAll({ days: 30, minFrequency: 3 });
}

export const dynamic = "force-dynamic";

export default function PatternsPage() {
  const analysis = getAnalysis();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Patterns</h1>
        <span className="text-xs text-[var(--muted-foreground)]">
          {analysis.stats.sessionsAnalyzed} sessions, {analysis.stats.turnsAnalyzed} turns (last {analysis.stats.timeRangeDays}d)
        </span>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SummaryCard
          label="Tool Sequences"
          value={analysis.toolSequences.length}
        />
        <SummaryCard
          label="Prompt Clusters"
          value={analysis.promptClusters.length}
        />
        <SummaryCard
          label="Projects"
          value={analysis.projectProfiles.length}
        />
        <SummaryCard
          label="Workflow Arcs"
          value={analysis.workflowArcs.length}
        />
        <SummaryCard
          label="Friction Points"
          value={analysis.frictionPoints.length}
        />
      </div>

      {/* Interactive Explorer */}
      <PatternExplorer analysis={analysis} />
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-[var(--card)] rounded-lg border border-[var(--border)] p-3">
      <p className="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">
        {label}
      </p>
      <p className="text-xl font-bold mt-0.5">{value}</p>
    </div>
  );
}
