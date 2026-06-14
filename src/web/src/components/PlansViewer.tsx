import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ClipboardList, ArrowLeft, Search } from 'lucide-react';
import type { Plan, PlanDetail, ProviderInfo } from '../types';
import { formatRelative, apiUrl } from '../utils';
import { ProviderBadge } from './ProviderBadge';
import { ProviderFilterBar } from './ProviderFilterBar';
import { LoadingSpinner } from './LoadingSpinner';
import { SourcePath } from './SourcePath';

type PlanSort = 'recent' | 'az';

export function PlansViewer({ demoMode, providers = [], provider, showSourcePaths = true }: { demoMode?: boolean; providers?: ProviderInfo[]; provider?: string | null; showSourcePaths?: boolean }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<PlanSort>('recent');
  const [providerFilter, setProviderFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<Plan | null>(null);
  const [detail, setDetail] = useState<PlanDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const selectedFilenameRef = useRef<string | null>(null);

  useEffect(() => {
    let ignore = false;
    fetch(apiUrl('/api/plans', !!demoMode))
      .then(res => res.json())
      .then(res => {
        if (ignore) return;
        if (res.error) throw new Error(res.error);
        setPlans(res.data || []);
        setLoading(false);
      })
      .catch(err => {
        if (ignore) return;
        setError(err.message);
        setLoading(false);
      });
    return () => { ignore = true; };
  }, [demoMode]);

  function openPlan(plan: Plan) {
    setSelected(plan);
    setDetail(null);
    selectedFilenameRef.current = plan.filename;
    setDetailLoading(true);
    const filename = plan.filename;
    fetch(apiUrl(`/api/plans?file=${encodeURIComponent(plan.filename)}${plan.providers?.[0] ? `&from=${encodeURIComponent(plan.providers[0])}` : ''}`, !!demoMode))
      .then(res => res.json())
      .then(res => {
        if (selectedFilenameRef.current !== filename) return;
        setDetail((res.data as PlanDetail[])?.[0] ?? null);
        setDetailLoading(false);
      })
      .catch(() => {
        if (selectedFilenameRef.current !== filename) return;
        setDetailLoading(false);
      });
  }

  function closePlan() {
    setSelected(null);
    setDetail(null);
    setDetailLoading(false);
    selectedFilenameRef.current = null;
  }

  if (selected) {
    return (
      <div className="flex-1 overflow-y-auto w-full">
        <div className="p-8 max-w-7xl mx-auto">
          <button onClick={closePlan} className="flex items-center text-lens-text-sub hover:text-lens-text text-sm mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Plans
          </button>

          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h1 className="text-2xl font-semibold text-lens-text">{selected.title}</h1>
            {selected.providers?.map(p => <ProviderBadge key={p} id={p} providers={providers} />)}
          </div>
          <div className="font-mono text-[11px] text-lens-text-faint mb-1">
            {selected.filename} · {formatRelative(selected.mtime)}
          </div>
          {showSourcePaths && selected.sourcePath && (
            <div className="flex items-center gap-2 text-[10px] text-lens-text-faint mb-5">
              <span className="shrink-0">Source:</span>
              <SourcePath path={selected.sourcePath} />
            </div>
          )}

          {detailLoading && <div className="py-4 text-lens-text-dim text-sm"><LoadingSpinner label="Loading…" size="sm" /></div>}

          {!detailLoading && detail?.body && (
            <div className="prose max-w-none prose-pre:bg-lens-deep prose-pre:border prose-pre:border-lens-border prose-code:text-lens-accent text-lens-text-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{detail.body}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-lens-text-dim"><LoadingSpinner label="Loading plans…" /></div>;
  }

  if (error) {
    return <div className="flex-1 flex items-center justify-center text-rose-400 text-sm"><p>{error}</p></div>;
  }

  if (plans.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-lens-text-dim">
        <div className="text-center">
          <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>No plans found</p>
        </div>
      </div>
    );
  }

  const isAllMode = !provider || provider === 'all';
  const presentProviderIds = isAllMode
    ? [...new Set(plans.flatMap(p => p.providers ?? []))].sort()
    : [];

  const providerFiltered = providerFilter
    ? plans.filter(p => p.providers?.includes(providerFilter))
    : plans;

  const q = search.toLowerCase().trim();
  const filtered = q
    ? providerFiltered.filter(p =>
        p.title.toLowerCase().includes(q) ||
        p.filename.toLowerCase().includes(q) ||
        (p.snippet?.toLowerCase().includes(q))
      )
    : providerFiltered;

  const sorted = [...filtered].sort((a, b) =>
    sort === 'az' ? a.title.localeCompare(b.title) : b.mtime - a.mtime
  );

  return (
    <div className="flex-1 overflow-y-auto w-full">
      <div className="p-8 max-w-7xl mx-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-2xl font-semibold flex items-center">
              <ClipboardList className="mr-3 text-lens-accent" /> Plans
            </h2>
            <p className="text-lens-text-dim text-sm mt-1">
              {q || providerFilter ? `${filtered.length} of ${plans.length} plans` : `${plans.length} plans`}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-1">
              {(['recent', 'az'] as const).map(s => (
                <button key={s} onClick={() => setSort(s)} className={`px-2 py-1 text-xs rounded transition-colors ${sort === s ? 'bg-lens-border text-lens-accent' : 'text-lens-text-faint hover:text-lens-text-body'}`}>
                  {s === 'recent' ? 'Recent' : 'A–Z'}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-lens-text-dim pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search plans…"
                className="bg-lens-surface border border-lens-border focus:border-lens-border-hi rounded-md pl-8 pr-3 py-1.5 text-sm text-lens-text-body placeholder:text-lens-text-faint outline-none transition-colors w-52"
              />
            </div>
          </div>
        </div>
        {isAllMode && (
          <ProviderFilterBar providers={providers} presentIds={presentProviderIds} filter={providerFilter} onChange={setProviderFilter} />
        )}
        {filtered.length === 0 ? (
          <p className="text-lens-text-dim text-sm">No plans match &ldquo;{search}&rdquo;</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sorted.map(plan => (
              <button
                key={plan.filename}
                onClick={() => openPlan(plan)}
                className="bg-lens-surface border border-lens-border hover:border-lens-border-hi rounded-lg p-4 text-left transition-colors flex flex-col"
              >
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className="font-medium text-lens-text">{plan.title}</span>
                  {plan.providers?.map(p => <ProviderBadge key={p} id={p} providers={providers} />)}
                </div>
                <div className="font-mono text-[10px] text-lens-text-faint mb-2">{plan.filename}</div>
                {plan.snippet ? (
                  <p className="text-lens-text-dim text-xs flex-1 line-clamp-2">{plan.snippet}</p>
                ) : (
                  <p className="text-lens-text-faint text-xs flex-1 italic">No preview</p>
                )}
                <div className="mt-2 text-xs text-lens-text-faint text-right">
                  {formatRelative(plan.mtime)}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
