import { useEffect, useState } from 'react';
import type { ProjectStats, Provider } from '../types';
import { fmt, apiUrl } from '../utils';
import { ActivityHeatmap } from './ActivityHeatmap';

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-lens-surface border border-lens-border rounded-lg p-4">
      <div className="text-[10px] uppercase tracking-wider text-lens-text-dim mb-1">{label}</div>
      <div className="text-2xl font-semibold text-lens-text tabular-nums">{value}</div>
      {sub && <div className="text-xs text-lens-text-dim mt-1">{sub}</div>}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-lens-surface border border-lens-border rounded-lg p-4">
      <div className="text-[10px] uppercase tracking-wider text-lens-text-dim mb-3">{title}</div>
      {children}
    </div>
  );
}

function BarRow({ label, value, max, color = 'bg-lens-accent/40' }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="mb-2 last:mb-0">
      <div className="flex justify-between text-xs text-lens-text-sub mb-1">
        <span className="truncate mr-2 max-w-[180px]">{label}</span>
        <span className="tabular-nums shrink-0">{value.toLocaleString()}</span>
      </div>
      <div className="h-1.5 bg-lens-border rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function ProjectDiagnostics({ projectId, demoMode, provider = 'claude' }: { projectId: string; demoMode?: boolean; provider?: Provider }) {
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(apiUrl(`/api/stats?project=${encodeURIComponent(projectId)}`, demoMode ?? false, provider))
      .then(res => res.json())
      .then(res => {
        if (res.error) throw new Error(res.error);
        setStats(res.data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-lens-text-dim">
        <p>Computing project stats…</p>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="flex-1 flex items-center justify-center text-rose-400 text-sm">
        <p>{error ?? 'No data'}</p>
      </div>
    );
  }

  const totalTokens = stats.tokens.input + stats.tokens.output;
  const hasTokenData = totalTokens > 0;
  const topTools = stats.topTools ?? [];
  const maxTool = Math.max(...topTools.map(t => t.count), 1);
  const maxModel = Math.max(...Object.values(stats.models), 1);

  return (
    <div className="flex-1 overflow-y-auto w-full">
      <div className="p-8 max-w-7xl mx-auto">
        {provider === 'ghcopilot' && (
          <div className="mb-6 flex items-center gap-2 px-3 py-2.5 rounded-lg bg-sky-500/10 border border-sky-500/20">
            <span className="text-sky-400 text-xs font-medium">GitHub Copilot</span>
            <span className="text-lens-text-dim text-xs">— token counts and cost are not tracked in Copilot transcripts</span>
          </div>
        )}

        {/* Summary cards */}
        <div className={`grid gap-4 mb-6 ${hasTokenData ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2 lg:grid-cols-3'}`}>
          <StatCard label="Sessions" value={stats.totals.sessions.toLocaleString()} />
          <StatCard label="Messages" value={fmt(stats.totals.messages)} />
          <StatCard label="Tool Calls" value={fmt(stats.totals.toolCalls)} />
          {hasTokenData && (
            <StatCard
              label="Est. Cost"
              value={`$${stats.estimatedCostUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              sub={`${fmt(totalTokens)} tokens total`}
            />
          )}
        </div>

        {/* Token breakdown — only when data is available */}
        {hasTokenData && (
          <div className="bg-lens-surface border border-lens-border rounded-lg p-4 mb-6">
            <div className="text-[10px] uppercase tracking-wider text-lens-text-dim mb-2">Tokens</div>
            <div className="flex items-center gap-6 text-sm flex-wrap">
              <span><span className="text-lens-text tabular-nums font-medium">{fmt(stats.tokens.input)}</span> <span className="text-lens-text-dim">input</span></span>
              <span><span className="text-lens-text tabular-nums font-medium">{fmt(stats.tokens.output)}</span> <span className="text-lens-text-dim">output</span></span>
              {stats.tokens.cacheRead > 0 && (
                <span><span className="text-sky-400 tabular-nums font-medium">{fmt(stats.tokens.cacheRead)}</span> <span className="text-lens-text-dim">cached</span></span>
              )}
              {stats.tokens.cacheHitRate > 0 && (
                <span className="text-lens-text-faint">{stats.tokens.cacheHitRate}% cache hit rate</span>
              )}
            </div>
          </div>
        )}

        {/* Activity heatmap */}
        <div className="bg-lens-surface border border-lens-border rounded-lg p-4 mb-6">
          <ActivityHeatmap activity={stats.activity ?? {}} />
        </div>

        {/* Top tools + Models */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {topTools.length > 0 && (
            <Panel title="Top Tools">
              {topTools.map(t => (
                <BarRow key={t.name} label={t.name} value={t.count} max={maxTool} color="bg-lens-accent/40" />
              ))}
            </Panel>
          )}
          {Object.keys(stats.models).length > 0 && (
            <Panel title="Models Used">
              {Object.entries(stats.models)
                .sort((a, b) => b[1] - a[1])
                .map(([model, count]) => (
                  <BarRow key={model} label={model} value={count} max={maxModel} color="bg-sky-500/40" />
                ))
              }
            </Panel>
          )}
        </div>

        <p className="text-center text-xs text-lens-text-faint">j/k or ↑↓ to navigate sessions · Esc to go back</p>
      </div>
    </div>
  );
}
