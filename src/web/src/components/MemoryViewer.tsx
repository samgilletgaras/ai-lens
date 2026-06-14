import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Brain, ArrowLeft, Search, ChevronRight } from 'lucide-react';
import type { MemoryEntry, MemoryEntryDetail, ProviderInfo } from '../types';
import { apiUrl, prettifyProjectName } from '../utils';
import { ProviderBadge } from './ProviderBadge';
import { ProviderFilterBar } from './ProviderFilterBar';
import { LoadingSpinner } from './LoadingSpinner';
import { SourcePath } from './SourcePath';

type MemoryType = 'user' | 'feedback' | 'project' | 'reference';
const NO_TYPE_FILTER = '__none__';

const TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  user:      { bg: 'bg-purple-900/40',  text: 'text-purple-300',  border: 'border-purple-800/50' },
  feedback:  { bg: 'bg-lens-accent/10',  text: 'text-lens-accent', border: 'border-lens-accent/20' },
  project:   { bg: 'bg-sky-900/40',     text: 'text-sky-400',     border: 'border-sky-800/50' },
  reference: { bg: 'bg-emerald-900/30', text: 'text-emerald-400', border: 'border-emerald-800/50' },
};

function TypeBadge({ type }: { type: string | null }) {
  if (!type) return null;
  const c = TYPE_COLORS[type] ?? { bg: 'bg-lens-border', text: 'text-lens-text-sub', border: 'border-lens-border' };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded ${c.bg} ${c.text} border ${c.border} capitalize`}>
      {type}
    </span>
  );
}

const ALL_TYPES: MemoryType[] = ['user', 'feedback', 'project', 'reference'];

function ProjectGroups({ entries, onOpen, providers }: { entries: MemoryEntry[]; onOpen: (e: MemoryEntry) => void; providers: ProviderInfo[] }) {
  const byProject = entries.reduce<Record<string, MemoryEntry[]>>((acc, e) => {
    (acc[e.project] ??= []).push(e);
    return acc;
  }, {});
  const projects = Object.keys(byProject);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  function toggle(p: string) {
    setOpen(prev => ({ ...prev, [p]: !prev[p] }));
  }

  return (
    <>
      {projects.map(project => {
        const items = byProject[project];
        const isOpen = open[project] ?? false;
        return (
          <div key={project} className="mb-4">
            <button
              onClick={() => toggle(project)}
              className="flex items-center gap-2 w-full group mb-0 py-1"
            >
              <ChevronRight className={`w-3.5 h-3.5 text-lens-text-faint transition-transform shrink-0 ${isOpen ? 'rotate-90' : ''}`} />
              <span className="text-sm font-medium text-lens-text-sub group-hover:text-lens-text transition-colors">{prettifyProjectName(project)}</span>
              {items[0]?.providers?.map(p => <ProviderBadge key={p} id={p} providers={providers} />)}
              <span className="text-[10px] text-lens-text-faint">{items.length}</span>
              <div className="flex-1 h-px bg-lens-border/60" />
            </button>
            {isOpen && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
                {items.map(entry => (
                  <button
                    key={`${entry.project}/${entry.filename}`}
                    onClick={() => onOpen(entry)}
                    className="bg-lens-surface border border-lens-border hover:border-lens-border-hi rounded-lg p-4 text-left transition-colors flex flex-col"
                  >
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-medium text-lens-text">{entry.name}</span>
                      <TypeBadge type={entry.type} />
                    </div>
                    {entry.description ? (
                      <p className="text-lens-text-dim text-xs flex-1 line-clamp-3">{entry.description}</p>
                    ) : entry.snippet ? (
                      <p className="text-lens-text-faint text-xs flex-1 line-clamp-3 italic">{entry.snippet}</p>
                    ) : (
                      <p className="text-lens-text-faint text-xs flex-1 italic">No description</p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

type MemorySort = 'az';

export function MemoryViewer({ demoMode, providers = [], provider, showSourcePaths = true }: { demoMode?: boolean; providers?: ProviderInfo[]; provider?: string | null; showSourcePaths?: boolean }) {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<MemorySort>('az');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [providerFilter, setProviderFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<MemoryEntry | null>(null);
  const [detail, setDetail] = useState<MemoryEntryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const selectedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    let ignore = false;
    fetch(apiUrl('/api/memory', !!demoMode))
      .then(res => res.json())
      .then(res => {
        if (ignore) return;
        if (res.error) throw new Error(res.error);
        setEntries(res.data || []);
        setLoading(false);
      })
      .catch(err => {
        if (ignore) return;
        setError(err.message);
        setLoading(false);
      });
    return () => { ignore = true; };
  }, [demoMode]);

  function openEntry(entry: MemoryEntry) {
    setSelected(entry);
    setDetail(null);
    const key = `${entry.project}/${entry.filename}`;
    selectedKeyRef.current = key;
    setDetailLoading(true);
    fetch(apiUrl(`/api/memory?project=${encodeURIComponent(entry.project)}&file=${encodeURIComponent(entry.filename)}`, !!demoMode))
      .then(res => res.json())
      .then(res => {
        if (selectedKeyRef.current !== key) return;
        setDetail(Array.isArray(res.data) ? (res.data[0] as MemoryEntryDetail ?? null) : (res.data as MemoryEntryDetail ?? null));
        setDetailLoading(false);
      })
      .catch(() => {
        if (selectedKeyRef.current !== key) return;
        setDetailLoading(false);
      });
  }

  function closeEntry() {
    setSelected(null);
    setDetail(null);
    setDetailLoading(false);
    selectedKeyRef.current = null;
  }

  if (selected) {
    const meta = detail?.frontmatter ?? {};
    const metaRows = Object.entries(meta).filter(([k, v]) => k !== 'name' && v != null && v !== '');
    return (
      <div className="flex-1 overflow-y-auto w-full">
        <div className="p-8 max-w-7xl mx-auto">
          <button onClick={closeEntry} className="flex items-center text-lens-text-sub hover:text-lens-text text-sm mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Memory
          </button>

          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h1 className="text-2xl font-semibold text-lens-text">{selected.name}</h1>
            <TypeBadge type={selected.type} />
            {selected.providers?.map(p => <ProviderBadge key={p} id={p} providers={providers} />)}
          </div>
          <div className="font-mono text-[11px] text-lens-text-faint mb-1">
            {prettifyProjectName(selected.project)} · {selected.filename}
          </div>
          {showSourcePaths && selected.sourcePath && (
            <div className="flex items-center gap-2 text-[10px] text-lens-text-faint mb-5">
              <span className="shrink-0">Source:</span>
              <SourcePath path={selected.sourcePath} />
            </div>
          )}

          {detailLoading && <div className="py-4 text-lens-text-dim text-sm"><LoadingSpinner label="Loading…" size="sm" /></div>}

          {!detailLoading && (
            <div className="bg-lens-surface border border-lens-border rounded-lg p-4 mb-6 space-y-2">
              {metaRows.length > 0 ? metaRows.map(([key, val]) => (
                <div key={key} className="flex gap-4 text-sm">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-lens-text-dim min-w-[90px] pt-0.5 shrink-0 capitalize">{key}</span>
                  <span className="text-lens-text-body break-all">{String(val)}</span>
                </div>
              )) : (
                <p className="text-lens-text-faint text-xs italic">No metadata</p>
              )}
            </div>
          )}

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
    return <div className="flex-1 flex items-center justify-center text-lens-text-dim"><LoadingSpinner label="Loading memory…" /></div>;
  }

  if (error) {
    return <div className="flex-1 flex items-center justify-center text-rose-400 text-sm"><p>{error}</p></div>;
  }

  if (entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-lens-text-dim">
        <div className="text-center">
          <Brain className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>No memory files found</p>
          <p className="text-xs mt-1 text-lens-text-faint">No saved memory entries for this provider yet</p>
        </div>
      </div>
    );
  }

  const isAllMode = !provider || provider === 'all';
  const presentProviderIds = isAllMode
    ? [...new Set(entries.flatMap(e => e.providers ?? []))].sort()
    : [];

  const q = search.toLowerCase().trim();
  const providerFiltered = providerFilter ? entries.filter(e => e.providers?.includes(providerFilter)) : entries;

  const typeCounts = ALL_TYPES.reduce<Record<string, number>>((acc, t) => {
    acc[t] = providerFiltered.filter(e => e.type === t).length;
    return acc;
  }, {});
  const untypedCount = providerFiltered.filter(e => !e.type || !ALL_TYPES.includes(e.type as MemoryType)).length;

  const filtered = providerFiltered.filter(e => {
    if (typeFilter === NO_TYPE_FILTER && e.type && ALL_TYPES.includes(e.type as MemoryType)) return false;
    if (typeFilter && typeFilter !== NO_TYPE_FILTER && e.type !== typeFilter) return false;
    if (!q) return true;
    return (
      e.name.toLowerCase().includes(q) ||
      (e.description?.toLowerCase().includes(q)) ||
      (e.snippet?.toLowerCase().includes(q)) ||
      prettifyProjectName(e.project).toLowerCase().includes(q)
    );
  });

  const sortedEntries = sort === 'az'
    ? [...filtered].sort((a, b) => a.project.localeCompare(b.project) || a.name.localeCompare(b.name))
    : filtered;

  return (
    <div className="flex-1 overflow-y-auto w-full">
      <div className="p-8 max-w-7xl mx-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-2xl font-semibold flex items-center">
              <Brain className="mr-3 text-lens-accent" /> Memory
            </h2>
            <p className="text-lens-text-dim text-sm mt-1">
              {q || typeFilter || providerFilter ? `${filtered.length} of ${entries.length} entries` : `${entries.length} memory entries`}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-1">
              <button onClick={() => setSort('az')} className={`px-2 py-1 text-xs rounded transition-colors ${sort === 'az' ? 'bg-lens-border text-lens-accent' : 'text-lens-text-faint hover:text-lens-text-body'}`}>
                A–Z
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-lens-text-dim pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search memory…"
                className="bg-lens-surface border border-lens-border focus:border-lens-border-hi rounded-md pl-8 pr-3 py-1.5 text-sm text-lens-text-body placeholder:text-lens-text-faint outline-none transition-colors w-52"
              />
            </div>
          </div>
        </div>

        {isAllMode && (
          <ProviderFilterBar providers={providers} presentIds={presentProviderIds} filter={providerFilter} onChange={setProviderFilter} />
        )}

        {ALL_TYPES.some(t => typeCounts[t] > 0) && (
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <button
              onClick={() => setTypeFilter(null)}
              className={`px-2.5 py-1 rounded-full text-xs transition-colors ${typeFilter === null ? 'bg-lens-accent text-lens-deep font-medium' : 'bg-lens-border text-lens-text-sub hover:text-lens-text'}`}
            >
              All ({entries.length})
            </button>
            {ALL_TYPES.filter(t => typeCounts[t] > 0).map(t => {
              const c = TYPE_COLORS[t];
              const active = typeFilter === t;
              return (
                <button
                  key={t}
                  onClick={() => setTypeFilter(active ? null : t)}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors capitalize ${active ? `${c.bg} ${c.text} ${c.border} font-medium` : 'bg-lens-border border-transparent text-lens-text-sub hover:text-lens-text'}`}
                >
                  {t} ({typeCounts[t]})
                </button>
              );
            })}
            {untypedCount > 0 && (
              <button
                onClick={() => setTypeFilter(typeFilter === NO_TYPE_FILTER ? null : NO_TYPE_FILTER)}
                className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${typeFilter === NO_TYPE_FILTER ? 'bg-lens-border text-lens-text font-medium border-lens-border-hi' : 'bg-lens-border border-transparent text-lens-text-sub hover:text-lens-text'}`}
              >
                No type ({untypedCount})
              </button>
            )}
          </div>
        )}

        {filtered.length === 0 ? (
          <p className="text-lens-text-dim text-sm">No entries match your search.</p>
        ) : (
          <ProjectGroups entries={sortedEntries} onOpen={openEntry} providers={providers} />
        )}
      </div>
    </div>
  );
}
