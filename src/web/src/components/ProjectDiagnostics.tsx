import { useEffect, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import type { ProjectStats } from '../types';
import { fmt, apiUrl, prettifyProjectName } from '../utils';
import { ActivityHeatmap } from './ActivityHeatmap';
import { LoadingSpinner } from './LoadingSpinner';

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

function BarRow({ label, value, max, color = 'bg-lens-accent/40', compact = false }: { label: string; value: number; max: number; color?: string; compact?: boolean }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className={`group ${compact ? 'mb-1 last:mb-0' : 'mb-2 last:mb-0'}`}>
      <div className={`flex justify-between items-center text-lens-text-sub group-hover:text-lens-text mb-0.5 transition-colors ${compact ? 'text-[11px]' : 'text-xs'} mb-1`}>
        <span className="truncate mr-2 max-w-[180px]">{label}</span>
        <span className="tabular-nums shrink-0">{value.toLocaleString()} <span className="text-lens-text-faint group-hover:text-lens-text-sub">({pct}%)</span></span>
      </div>
      <div className={`bg-lens-border rounded-full overflow-hidden ${compact ? 'h-1' : 'h-1.5'}`}>
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function ProjectDiagnostics({ projectId, demoMode }: { projectId: string; demoMode?: boolean }) {
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- reset to loading state before async fetch */
    setLoading(true);
    setError(null);
    fetch(apiUrl(`/api/stats?project=${encodeURIComponent(projectId)}`, demoMode ?? false))
      .then(res => res.json())
      .then(res => {
        if (ignore) return;
        if (res.error) throw new Error(res.error);
        setStats(res.data);
        setLoading(false);
      })
      .catch(err => {
        if (ignore) return;
        setError(err.message);
        setLoading(false);
      });
    return () => { ignore = true; };
  }, [projectId, demoMode]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-lens-text-dim">
        <LoadingSpinner label="Computing project stats…" />
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
  const sortedModels = Object.entries(stats.models).sort((a, b) => b[1] - a[1]);
  const maxModel = Math.max(...sortedModels.map(([, v]) => v), 1);
  const hasBothModelsTool = sortedModels.length > 0 && topTools.length > 0;

  return (
    <div className="flex-1 overflow-y-auto w-full">
      <div className="p-8 max-w-7xl mx-auto">
        <div className="flex items-center mb-2">
          <h2 className="text-2xl font-semibold flex items-center truncate">
            <FolderOpen className="mr-3 shrink-0 text-lens-accent" /> {prettifyProjectName(projectId)}
          </h2>
        </div>
        <p className="text-lens-text-dim text-sm mb-6">Project diagnostics</p>

        {/* Heatmap */}
        <div className="bg-lens-surface border border-lens-border rounded-lg p-4 mb-6">
          <ActivityHeatmap activity={stats.activity ?? {}} />
        </div>

        {/* Token breakdown — immediately below heatmap, only when data exists */}
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

        {/* Top Models + Top Tools — compact, single panel takes full width when the other has no data */}
        {(sortedModels.length > 0 || topTools.length > 0) && (
          <div className={`grid grid-cols-1 gap-4 mb-8 ${hasBothModelsTool ? 'md:grid-cols-2' : ''}`}>
            {sortedModels.length > 0 && (
              <Panel title="Top Models">
                {sortedModels.map(([model, count]) => (
                  <BarRow key={model} label={model} value={count} max={maxModel} compact />
                ))}
              </Panel>
            )}
            {topTools.length > 0 && (
              <Panel title="Top Tools">
                {topTools.map(t => (
                  <BarRow key={t.name} label={t.name} value={t.count} max={maxTool} color="bg-lens-accent/40" compact />
                ))}
              </Panel>
            )}
          </div>
        )}

        <p className="text-center text-xs text-lens-text-faint">j/k or ↑↓ to navigate sessions · Esc to go back</p>
      </div>
    </div>
  );
}
