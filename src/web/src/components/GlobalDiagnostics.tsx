import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import type { DiagnosticsStats, ProviderInfo } from '../types';
import { prettifyProjectName, fmt, apiUrl } from '../utils';
import { ActivityHeatmap } from './ActivityHeatmap';
import { ProviderBadge } from './ProviderBadge';
import { LoadingSpinner } from './LoadingSpinner';

const usd = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function StatCard({ label, value, sub, footnote }: { label: string; value: string; sub?: string; footnote?: string }) {
  return (
    <div className="bg-lens-surface border border-lens-border rounded-lg p-4 flex flex-col">
      <div className="text-[10px] uppercase tracking-wider text-lens-text-dim mb-1">
        {label}{footnote && <span className="text-lens-text-faint normal-case not-italic ml-0.5">*</span>}
      </div>
      <div className="text-2xl font-semibold text-lens-text tabular-nums">{value}</div>
      {sub && <div className="text-xs text-lens-text-dim mt-auto pt-3">{sub}</div>}
      {footnote && <div className="text-[10px] text-lens-text-faint mt-auto pt-3">*{footnote}</div>}
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

function BarRow({ label, value, max, color = 'bg-lens-accent/40' }: { label: React.ReactNode; value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="mb-2 last:mb-0 group">
      <div className="flex justify-between items-center text-xs text-lens-text-sub group-hover:text-lens-text mb-1 transition-colors">
        <div className="flex items-center gap-1.5 min-w-0 mr-2">{label}</div>
        <span className="tabular-nums shrink-0">{value.toLocaleString()} <span className="text-lens-text-faint group-hover:text-lens-text-sub">({pct}%)</span></span>
      </div>
      <div className="h-1.5 bg-lens-border rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function GlobalDiagnostics({ demoMode, providers = [], provider }: { demoMode?: boolean; providers?: ProviderInfo[]; provider?: string | null }) {
  const [stats, setStats] = useState<DiagnosticsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    /* eslint-disable react-hooks/set-state-in-effect -- reset to loading state before async fetch */
    setLoading(true);
    setError(null);
    setStats(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    fetch(apiUrl('/api/stats', demoMode ?? false))
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
  }, [demoMode]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-lens-text-dim">
        <LoadingSpinner label="Computing stats…" />
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
  const hasTokens = totalTokens > 0;
  const inputEstimated = stats.tokens.inputEstimated === true;
  const outputEstimated = stats.tokens.outputEstimated === true;
  const providerLabel = (id: string) => providers.find(p => p.id === id)?.name ?? id;
  const estimationNote = (providerIds?: string[]) => {
    if (providerIds && providerIds.length > 0)
      return `~4 chars/token approximation used for ${providerIds.map(providerLabel).join(', ')}`;
    return '~4 chars/token approximation';
  };
  const stopReasons = stats.stopReasons ?? {};
  const sortedStopReasons = Object.entries(stopReasons).sort((a, b) => b[1] - a[1]);
  const maxStopReason = Math.max(...sortedStopReasons.map(([, v]) => v), 1);
  const sortedModels = Object.entries(stats.models).sort((a, b) => b[1] - a[1]);
  const isAllProviders = !provider || provider === 'all';
  const maxModel = Math.max(...sortedModels.map(([, v]) => v), 1);
  const maxToken = Math.max(stats.tokens.input, stats.tokens.output, stats.tokens.cacheRead, stats.tokens.cacheCreation, 1);
  const topProjects = stats.topProjects ?? [];
  const maxProjectMsgs = Math.max(...topProjects.map(p => p.messageCount), 1);
  const hasHooks = stats.hooks.success + stats.hooks.failure > 0;
  const topTools = stats.topTools ?? [];
  const hasTokensInProjects = topProjects.some(p => p.tokenCount > 0);
  // Per-provider cost split, surfaced only in All-Providers mode (>1 contributing provider).
  const costByProvider = Object.entries(stats.estimatedCostByProvider ?? {}).sort((a, b) => b[1] - a[1]);
  const showCostBreakdown = costByProvider.length > 1;
  const hasZeroCostProvider = costByProvider.some(([, c]) => c <= 0);

  const stopReasonOrder = ['tool_use', 'end_turn', 'max_tokens', 'stop_sequence'];
  const orderedStopReasons = [
    ...stopReasonOrder.filter(k => stopReasons[k] !== undefined).map(k => [k, stopReasons[k]] as [string, number]),
    ...sortedStopReasons.filter(([k]) => !stopReasonOrder.includes(k)),
  ];
  const hasBothModelsTool = sortedModels.length > 0 && topTools.length > 0;
  const hasBothTokenHook = hasTokens && hasHooks;

  return (
    <div className="flex-1 overflow-y-auto w-full">
      <div className="p-8 max-w-7xl mx-auto">
        <div className="flex items-center mb-2">
          <h2 className="text-2xl font-semibold flex items-center">
            <Activity className="mr-3 text-lens-accent" /> Diagnostics
          </h2>
        </div>
        <p className="text-lens-text-dim text-sm mb-6">Aggregated from all session history</p>

        {/* Heatmap */}
        <div className="bg-lens-surface border border-lens-border rounded-lg p-4 mb-6">
          <ActivityHeatmap activity={stats.activity ?? {}} />
        </div>

        {/* Summary cards — token cards only when data exists */}
        <div className={`grid gap-4 mb-6 ${hasTokens ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2 lg:grid-cols-3'}`}>
          <StatCard label="Sessions" value={stats.totals.sessions.toLocaleString()} sub={stats.totals.projects ? `across ${stats.totals.projects} project${stats.totals.projects !== 1 ? 's' : ''}` : undefined} />
          <StatCard label="Messages" value={fmt(stats.totals.messages)} sub={stats.totals.sessions > 0 ? `avg ${Math.round(stats.totals.messages / stats.totals.sessions)} per session` : undefined} />
          {hasTokens ? (
            <>
              <StatCard label="Input Tokens" value={fmt(stats.tokens.input)} footnote={inputEstimated ? estimationNote(stats.tokens.inputEstimatedProviders) : undefined} />
              <StatCard label="Output Tokens" value={fmt(stats.tokens.output)} footnote={outputEstimated ? estimationNote(stats.tokens.outputEstimatedProviders) : undefined} />
            </>
          ) : (
            <StatCard label="Tool Calls" value={fmt(stats.totals.toolCalls)} />
          )}
        </div>

        {/* Cost estimate — only when non-zero */}
        {stats.estimatedCostUsd > 0 && (
          <div className="bg-lens-surface border border-lens-border rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-lens-text-dim mb-1">Estimated Cost</div>
                <div className="text-3xl font-semibold text-lens-text tabular-nums">${usd(stats.estimatedCostUsd)}</div>
              </div>
              <div className="text-right text-xs text-lens-text-faint max-w-xs">
                Approximate, based on public model pricing for input/output tokens. Cache tokens not billed.
              </div>
            </div>
            {/* Per-provider breakdown (All Providers view) */}
            {showCostBreakdown && (
              <div className="mt-3 pt-3 border-t border-lens-border space-y-2">
                {costByProvider.map(([id, cost]) => (
                  <div key={id} className="flex items-center justify-between text-sm">
                    <ProviderBadge id={id} providers={providers} />
                    <span className="text-lens-text-body tabular-nums">${usd(cost)}{cost <= 0 && <span className="text-lens-text-faint">*</span>}</span>
                  </div>
                ))}
                {hasZeroCostProvider && (
                  <p className="text-[10px] text-lens-text-faint pt-1">* cost unknown: token pricing for this provider is not yet tracked</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Top projects */}
        {topProjects.length > 0 && (
          <div className="mb-4">
            <Panel title="Top Projects by Activity">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-lens-border">
                    <th className="text-left py-2 text-[10px] uppercase tracking-wider text-lens-text-dim font-normal">Project</th>
                    <th className="text-right py-2 text-[10px] uppercase tracking-wider text-lens-text-dim font-normal">Messages</th>
                    {hasTokensInProjects && <th className="text-right py-2 text-[10px] uppercase tracking-wider text-lens-text-dim font-normal">Tokens</th>}
                    <th className="w-1/3 py-2 pl-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {topProjects.map(proj => (
                    <tr key={proj.id} className="border-b border-lens-border/50 last:border-0">
                      <td className="py-2 text-lens-text-body max-w-[200px]">
                        <div className="flex items-center gap-2">
                          <span className="truncate">{prettifyProjectName(proj.id)}</span>
                          {proj.provider && <ProviderBadge id={proj.provider} providers={providers} />}
                        </div>
                      </td>
                      <td className="py-2 text-right text-lens-text-sub tabular-nums">{proj.messageCount.toLocaleString()}</td>
                      {hasTokensInProjects && <td className="py-2 text-right text-lens-text-sub tabular-nums">{fmt(proj.tokenCount)}</td>}
                      <td className="py-2 pl-4">
                        <div className="h-1.5 bg-lens-border rounded-full overflow-hidden">
                          <div
                            className="h-full bg-lens-accent/40 rounded-full"
                            style={{ width: `${Math.round((proj.messageCount / maxProjectMsgs) * 100)}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </div>
        )}

        {/* Top Models + Top Tools — single panel takes full width when the other has no data */}
        {(sortedModels.length > 0 || topTools.length > 0) && (
          <div className={`grid grid-cols-1 gap-4 mb-4 ${hasBothModelsTool ? 'md:grid-cols-2' : ''}`}>
            {sortedModels.length > 0 && (
              <Panel title="Top Models">
                {sortedModels.map(([model, count]) => {
                  const slash = isAllProviders ? model.indexOf('/') : -1;
                  const pid = slash !== -1 ? model.slice(0, slash) : null;
                  const name = slash !== -1 ? model.slice(slash + 1) : model;
                  return (
                    <BarRow
                      key={model}
                      label={
                        <>
                          <span className="truncate">{name}</span>
                          {pid && <ProviderBadge id={pid} providers={providers} className="opacity-50 group-hover:opacity-100 transition-opacity !text-[8px] !px-1 !py-px" />}
                        </>
                      }
                      value={count}
                      max={maxModel}
                    />
                  );
                })}
              </Panel>
            )}
            {topTools.length > 0 && (
              <Panel title="Top Tools">
                {topTools.map(({ name: key, count }) => {
                  const slash = isAllProviders ? key.indexOf('/') : -1;
                  const pid = slash !== -1 ? key.slice(0, slash) : null;
                  const name = slash !== -1 ? key.slice(slash + 1) : key;
                  return (
                    <BarRow
                      key={key}
                      label={
                        <>
                          <span className="truncate">{name}</span>
                          {pid && <ProviderBadge id={pid} providers={providers} className="opacity-50 group-hover:opacity-100 transition-opacity !text-[8px] !px-1 !py-px" />}
                        </>
                      }
                      value={count}
                      max={Math.max(...topTools.map(x => x.count), 1)}
                      color="bg-lens-accent/40"
                    />
                  );
                })}
              </Panel>
            )}
          </div>
        )}

        {/* Token Breakdown + Hook Health — single panel takes full width when the other has no data */}
        {(hasTokens || hasHooks) && (
          <div className={`grid grid-cols-1 gap-4 mb-4 ${hasBothTokenHook ? 'md:grid-cols-2' : ''}`}>
            {hasTokens && (
              <Panel title="Token Breakdown">
                <BarRow label="Input" value={stats.tokens.input} max={maxToken} color="bg-violet-500/40" />
                <BarRow label="Output" value={stats.tokens.output} max={maxToken} color="bg-emerald-500/40" />
                <BarRow label="Cache Read" value={stats.tokens.cacheRead} max={maxToken} color="bg-sky-500/40" />
                <BarRow label="Cache Created" value={stats.tokens.cacheCreation} max={maxToken} color="bg-lens-border/80" />
              </Panel>
            )}
            {hasHooks && (
              <Panel title="Hook Health">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="text-sm text-lens-text-sub">Successes</span>
                    </div>
                    <span className="text-lens-text tabular-nums font-medium">{stats.hooks.success.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-rose-500" />
                      <span className="text-sm text-lens-text-sub">Failures</span>
                    </div>
                    <span className="text-lens-text tabular-nums font-medium">{stats.hooks.failure.toLocaleString()}</span>
                  </div>
                  {stats.hooks.success + stats.hooks.failure > 0 && (
                    <div className="flex items-center justify-between border-t border-lens-border pt-3">
                      <span className="text-sm text-lens-text-sub">Success Rate</span>
                      <span className="text-lens-text font-medium">
                        {Math.round((stats.hooks.success / (stats.hooks.success + stats.hooks.failure)) * 100)}%
                      </span>
                    </div>
                  )}
                  {stats.hooks.avgDurationMs > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-lens-text-sub">Avg Duration</span>
                      <span className="text-lens-text font-medium tabular-nums">{stats.hooks.avgDurationMs}ms</span>
                    </div>
                  )}
                </div>
              </Panel>
            )}
          </div>
        )}
        {/* Stop Reasons */}
        {orderedStopReasons.length > 0 && (
          <div className="mb-4">
            <Panel title="Stop Reasons">
              {orderedStopReasons.map(([reason, count]) => (
                <BarRow key={reason} label={reason} value={count} max={maxStopReason} color="bg-lens-accent/40" />
              ))}
            </Panel>
          </div>
        )}
      </div>
    </div>
  );
}
