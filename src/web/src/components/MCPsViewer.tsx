import { useEffect, useState } from 'react';
import { Plug, ArrowLeft, Search, CheckCircle } from 'lucide-react';
import type { MCPServer, MCPServerDetail, ProviderInfo } from '../types';
import { apiUrl } from '../utils';
import { ProviderBadge } from './ProviderBadge';
import { ProviderFilterBar } from './ProviderFilterBar';
import { LoadingSpinner } from './LoadingSpinner';

function TypeBadge({ type }: { type: 'plugin' | 'cloud' }) {
  return type === 'cloud'
    ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-900/50 text-sky-400 border border-sky-800/50">Cloud</span>
    : <span className="text-[10px] px-1.5 py-0.5 rounded bg-lens-accent/15 text-lens-accent border border-lens-accent/20">Plugin</span>;
}

function formatDate(ts: number | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString();
}

type MCPSort = 'recent' | 'usage' | 'az';

export function MCPsViewer({ demoMode, providers = [], provider, showSourcePaths = true }: { demoMode?: boolean; providers?: ProviderInfo[]; provider?: string | null; showSourcePaths?: boolean }) {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<MCPSort>('recent');
  const [providerFilter, setProviderFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<MCPServer | null>(null);
  const [detail, setDetail] = useState<MCPServerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    fetch(apiUrl('/api/mcps', demoMode ?? false))
      .then(res => res.json())
      .then(res => {
        if (res.error) throw new Error(res.error);
        setServers(res.data || []);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [demoMode]);

  function openServer(server: MCPServer) {
    setSelected(server);
    setDetail(null);
    setDetailLoading(true);
    fetch(apiUrl(`/api/mcps?server=${encodeURIComponent(server.id)}${server.providers?.[0] ? `&from=${encodeURIComponent(server.providers[0])}` : ''}`, demoMode ?? false))
      .then(res => res.json())
      .then(res => {
        setDetail(res.data ?? null);
        setDetailLoading(false);
      })
      .catch(() => setDetailLoading(false));
  }

  function closeServer() {
    setSelected(null);
    setDetail(null);
    setDetailLoading(false);
  }

  if (selected !== null) {
    return (
      <div className="flex-1 overflow-y-auto w-full">
        <div className="p-8 max-w-7xl mx-auto">
          <button
            onClick={closeServer}
            className="flex items-center text-lens-text-sub hover:text-lens-text text-sm mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to MCPs
          </button>

          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h1 className="text-2xl font-semibold text-lens-text">{selected.name}</h1>
            <TypeBadge type={selected.type} />
            {selected.providers?.map(p => <ProviderBadge key={p} id={p} providers={providers} />)}
            {selected.auth?.authenticated && (
              <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                <CheckCircle className="w-3 h-3" /> Authenticated
              </span>
            )}
          </div>
          <div className="font-mono text-[11px] text-lens-text-faint mb-6">{selected.id}</div>

          {detailLoading && <div className="py-4 text-lens-text-dim text-sm"><LoadingSpinner label="Loading..." size="sm" /></div>}

          {!detailLoading && (
            <>
              <div className="bg-lens-surface border border-lens-border rounded-lg p-4 mb-6">
                <div className="text-[10px] uppercase tracking-wider text-lens-text-dim mb-3">Configuration</div>
                {selected.config?.command ? (
                  <div className="font-mono text-sm text-lens-text-body">
                    {[selected.config.command, ...(selected.config.args ?? [])].join(' ')}
                  </div>
                ) : selected.config?.url ? (
                  <div className="font-mono text-sm text-lens-text-body">{selected.config.url}</div>
                ) : (
                  <div className="text-lens-text-dim text-sm">Hosted by claude.ai</div>
                )}
                <div className="mt-3 flex gap-4 text-xs text-lens-text-dim flex-wrap">
                  <span>{selected.totalCalls.toLocaleString()} total calls</span>
                  <span>{selected.toolCount} tools used</span>
                  {selected.lastUsed && <span>Last used {formatDate(selected.lastUsed)}</span>}
                  {showSourcePaths && selected.source && <span className="font-mono text-lens-text-faint truncate" title={selected.source}>{selected.source}</span>}
                </div>
              </div>

              {detail?.tools && detail.tools.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-lens-text-dim mb-3">Tools</div>
                  <div className="bg-lens-surface border border-lens-border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-lens-border">
                          <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider text-lens-text-dim font-normal">Tool</th>
                          <th className="text-right px-4 py-2 text-[10px] uppercase tracking-wider text-lens-text-dim font-normal">Calls</th>
                          <th className="text-right px-4 py-2 text-[10px] uppercase tracking-wider text-lens-text-dim font-normal">Last Used</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.tools.map(tool => (
                          <tr key={tool.name} className="border-b border-lens-border/50 last:border-0 hover:bg-lens-border/20 transition-colors">
                            <td className="px-4 py-2 font-mono text-xs text-lens-text-body">{tool.name}</td>
                            <td className="px-4 py-2 text-right text-lens-text-sub tabular-nums">{tool.count.toLocaleString()}</td>
                            <td className="px-4 py-2 text-right text-lens-text-dim text-xs">{formatDate(tool.lastUsed)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-lens-text-dim">
        <LoadingSpinner label="Loading MCPs..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-rose-400 text-sm">
        <p>{error}</p>
      </div>
    );
  }

  if (servers.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-lens-text-dim">
        <p>No MCP servers found</p>
      </div>
    );
  }

  const isAllMode = !provider || provider === 'all';
  const presentProviderIds = isAllMode
    ? [...new Set(servers.flatMap(s => s.providers ?? []))].sort()
    : [];

  const providerFiltered = providerFilter
    ? servers.filter(s => s.providers?.includes(providerFilter))
    : servers;

  const q = search.toLowerCase().trim();
  const filtered = q
    ? providerFiltered.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q)
      )
    : providerFiltered;

  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'recent') return (b.lastUsed ?? 0) - (a.lastUsed ?? 0);
    if (sort === 'usage') return b.totalCalls - a.totalCalls || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="flex-1 overflow-y-auto w-full">
      <div className="p-8 max-w-7xl mx-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-2xl font-semibold flex items-center">
              <Plug className="mr-3 text-lens-accent" /> MCP Servers
            </h2>
            <p className="text-lens-text-dim text-sm mt-1">
              {q || providerFilter ? `${filtered.length} of ${servers.length} servers` : `${servers.length} servers discovered`}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-1">
              {(['recent', 'usage', 'az'] as const).map(s => (
                <button key={s} onClick={() => setSort(s)} className={`px-2 py-1 text-xs rounded transition-colors ${sort === s ? 'bg-lens-border text-lens-accent' : 'text-lens-text-faint hover:text-lens-text-body'}`}>
                  {s === 'recent' ? 'Recent' : s === 'usage' ? 'Usage' : 'A–Z'}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-lens-text-dim pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search MCPs..."
                className="bg-lens-surface border border-lens-border focus:border-lens-border-hi rounded-md pl-8 pr-3 py-1.5 text-sm text-lens-text-body placeholder:text-lens-text-faint outline-none transition-colors w-52"
              />
            </div>
          </div>
        </div>
        {isAllMode && (
          <ProviderFilterBar providers={providers} presentIds={presentProviderIds} filter={providerFilter} onChange={setProviderFilter} />
        )}
        {filtered.length === 0 ? (
          <p className="text-lens-text-dim text-sm">No servers match &ldquo;{search}&rdquo;</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sorted.map(server => (
              <button
                key={server.id}
                onClick={() => openServer(server)}
                className="bg-lens-surface border border-lens-border hover:border-lens-border-hi rounded-lg p-4 text-left transition-colors flex flex-col"
              >
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className="font-medium text-lens-text">{server.name}</span>
                  <TypeBadge type={server.type} />
                  {server.providers?.map(p => <ProviderBadge key={p} id={p} providers={providers} />)}
                </div>
                <div className="font-mono text-[10px] text-lens-text-faint mb-2">{server.id}</div>
                <div className="mt-auto flex items-center justify-between text-xs text-lens-text-dim">
                  <span>{server.toolCount} tool{server.toolCount !== 1 ? 's' : ''}</span>
                  <span>{server.totalCalls.toLocaleString()} calls</span>
                  <span>{formatDate(server.lastUsed)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
