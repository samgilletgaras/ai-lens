import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, ArrowLeft, Search } from 'lucide-react';
import type { Skill, SkillDetail, ProviderInfo } from '../types';
import { apiUrl } from '../utils';
import { ProviderBadge } from './ProviderBadge';

export function AgentsViewer({ demoMode, providers = [], showSourcePaths = true }: { demoMode?: boolean; providers?: ProviderInfo[]; showSourcePaths?: boolean }) {
  const [agents, setAgents] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Skill | null>(null);
  const [detail, setDetail] = useState<SkillDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    fetch(apiUrl('/api/agents', demoMode ?? false))
      .then(res => res.json())
      .then(res => {
        if (res.error) throw new Error(res.error);
        setAgents(res.data || []);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [demoMode]);

  function openAgent(agent: Skill) {
    setSelected(agent);
    setDetail(null);
    if (!agent.hasSkillMd) return;
    setDetailLoading(true);
    fetch(apiUrl(`/api/agents?slug=${encodeURIComponent(agent.slug)}${agent.provider ? `&from=${encodeURIComponent(agent.provider)}` : ''}`, demoMode ?? false))
      .then(res => res.json())
      .then(res => { setDetail(res.data ?? null); setDetailLoading(false); })
      .catch(() => setDetailLoading(false));
  }

  function closeAgent() {
    setSelected(null);
    setDetail(null);
    setDetailLoading(false);
  }

  if (selected !== null) {
    const meta = detail?.frontmatter ?? {};
    return (
      <div className="flex-1 overflow-y-auto w-full">
        <div className="p-8 max-w-7xl mx-auto">
          <button onClick={closeAgent} className="flex items-center text-lens-text-sub hover:text-lens-text text-sm mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Agents
          </button>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h1 className="text-2xl font-semibold text-lens-text">{selected.name}</h1>
            {selected.provider && <ProviderBadge id={selected.provider} providers={providers} />}
          </div>
          <div className="font-mono text-[11px] text-lens-text-faint mb-6">{selected.slug}</div>

          {detailLoading && <p className="text-lens-text-dim text-sm">Loading...</p>}

          {!detailLoading && Object.keys(meta).length > 0 && (
            <div className="bg-lens-surface border border-lens-border rounded-lg p-4 mb-6 space-y-2">
              {Object.entries(meta).map(([key, val]) => (
                <div key={key} className="flex gap-4 text-sm">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-lens-text-dim min-w-[100px] pt-0.5 shrink-0">{key}</span>
                  <span className="text-lens-text-body break-all">{val}</span>
                </div>
              ))}
            </div>
          )}

          {!detailLoading && showSourcePaths && detail?.sourcePath && (
            <div className="font-mono text-[10px] text-lens-text-faint mb-4" title={detail.sourcePath}>
              Source: {detail.sourcePath}
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

  if (loading) return <div className="flex-1 flex items-center justify-center text-lens-text-dim"><p>Loading agents...</p></div>;
  if (error) return <div className="flex-1 flex items-center justify-center text-rose-400 text-sm"><p>{error}</p></div>;
  if (agents.length === 0) return <div className="flex-1 flex items-center justify-center text-lens-text-dim"><p>No agents found</p></div>;

  const q = search.toLowerCase().trim();
  const filtered = q
    ? agents.filter(a => a.name.toLowerCase().includes(q) || (a.description && a.description.toLowerCase().includes(q)))
    : agents;

  return (
    <div className="flex-1 overflow-y-auto w-full">
      <div className="p-8 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-2xl font-semibold flex items-center">
            <Bot className="mr-3 text-lens-accent" /> Agents
          </h2>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-lens-text-dim pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search agents..."
              className="bg-lens-surface border border-lens-border focus:border-lens-border-hi rounded-md pl-8 pr-3 py-1.5 text-sm text-lens-text-body placeholder:text-lens-text-faint outline-none transition-colors w-52"
            />
          </div>
        </div>
        <p className="text-lens-text-dim text-sm mb-6">
          {q ? `${filtered.length} of ${agents.length} agents` : `${agents.length} agents`}
        </p>
        {filtered.length === 0 ? (
          <p className="text-lens-text-dim text-sm">No agents match &ldquo;{search}&rdquo;</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(agent => (
              <button
                key={agent.slug}
                onClick={() => openAgent(agent)}
                className="bg-lens-surface border border-lens-border hover:border-lens-border-hi rounded-lg p-4 text-left transition-colors flex flex-col"
              >
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <Bot className="w-3.5 h-3.5 text-lens-text-dim shrink-0" />
                  <span className="font-medium text-lens-text">{agent.name}</span>
                  {agent.provider && <ProviderBadge id={agent.provider} providers={providers} />}
                </div>
                <div className="font-mono text-[10px] text-lens-text-faint mb-2">{agent.slug}</div>
                {agent.description ? (
                  <p className="text-lens-text-dim text-xs flex-1 line-clamp-2">{agent.description}</p>
                ) : (
                  <p className="text-lens-text-faint text-xs flex-1 italic">No description</p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
