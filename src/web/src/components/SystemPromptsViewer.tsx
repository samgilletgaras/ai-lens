import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ScrollText, ArrowLeft, FileText } from 'lucide-react';
import type { SystemPromptEntry, ProviderInfo } from '../types';
import { apiUrl } from '../utils';
import { ProviderBadge } from './ProviderBadge';
import { ProviderFilterBar } from './ProviderFilterBar';
import { LoadingSpinner } from './LoadingSpinner';
import { SourcePath } from './SourcePath';

export function SystemPromptsViewer({ demoMode, providers = [], provider, showSourcePaths = true }: { demoMode?: boolean; providers?: ProviderInfo[]; provider?: string | null; showSourcePaths?: boolean }) {
  const [entries, setEntries] = useState<SystemPromptEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [providerFilter, setProviderFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<SystemPromptEntry | null>(null);

  useEffect(() => {
    let ignore = false;
    fetch(apiUrl('/api/system-prompts', !!demoMode))
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

  if (selected) {
    return (
      <div className="flex-1 overflow-y-auto w-full">
        <div className="p-8 max-w-7xl mx-auto">
          <button onClick={() => setSelected(null)} className="flex items-center text-lens-text-sub hover:text-lens-text text-sm mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to System Prompts
          </button>

          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h1 className="text-2xl font-semibold text-lens-text">{selected.label}</h1>
            {selected.provider && <ProviderBadge id={selected.provider} providers={providers} />}
          </div>
          <div className="font-mono text-[11px] text-lens-text-faint mb-1">{selected.filename}</div>
          {showSourcePaths && selected.sourcePath && (
            <div className="flex items-center gap-2 text-[10px] text-lens-text-faint mb-5">
              <span className="shrink-0">Source:</span>
              <SourcePath path={selected.sourcePath} />
            </div>
          )}

          {selected.content ? (
            <div className="prose max-w-none prose-pre:bg-lens-deep prose-pre:border prose-pre:border-lens-border prose-code:text-lens-accent text-lens-text-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{selected.content}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-lens-text-faint text-sm italic">File is empty.</p>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-lens-text-dim"><LoadingSpinner label="Loading system prompts…" /></div>;
  }

  if (error) {
    return <div className="flex-1 flex items-center justify-center text-rose-400 text-sm"><p>{error}</p></div>;
  }

  if (entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-lens-text-dim">
        <div className="text-center">
          <ScrollText className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>No system prompt files found</p>
        </div>
      </div>
    );
  }

  const isAllMode = !provider || provider === 'all';
  const presentProviderIds = isAllMode
    ? [...new Set(entries.map(e => e.provider).filter(Boolean) as string[])].sort()
    : [];

  const filtered = providerFilter
    ? entries.filter(e => e.provider === providerFilter)
    : entries;

  return (
    <div className="flex-1 overflow-y-auto w-full">
      <div className="p-8 max-w-7xl mx-auto">
        <div className="mb-4">
          <h2 className="text-2xl font-semibold flex items-center">
            <ScrollText className="mr-3 text-lens-accent" /> System Prompts
          </h2>
          <p className="text-lens-text-dim text-sm mt-1">
            {providerFilter ? `${filtered.length} of ${entries.length} files` : `${entries.length} ${entries.length === 1 ? 'file' : 'files'}`}
          </p>
        </div>

        {isAllMode && (
          <ProviderFilterBar providers={providers} presentIds={presentProviderIds} filter={providerFilter} onChange={setProviderFilter} />
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((entry, i) => {
            const snippet = entry.content.split('\n').filter(l => l.trim() && !l.startsWith('#')).slice(0, 3).join(' ').slice(0, 200);
            return (
              <button
                key={`${entry.provider ?? ''}-${entry.filename}-${i}`}
                onClick={() => setSelected(entry)}
                className="bg-lens-surface border border-lens-border hover:border-lens-border-hi rounded-lg p-4 text-left transition-colors flex flex-col"
              >
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <FileText className="w-4 h-4 text-lens-accent flex-shrink-0" />
                  <span className="font-medium text-lens-text">{entry.label}</span>
                  {entry.provider && <ProviderBadge id={entry.provider} providers={providers} />}
                </div>
                <div className="font-mono text-[10px] text-lens-text-faint mb-2">{entry.filename}</div>
                {snippet ? (
                  <p className="text-lens-text-dim text-xs flex-1 line-clamp-3">{snippet}</p>
                ) : (
                  <p className="text-lens-text-faint text-xs flex-1 italic">Empty file</p>
                )}
                {showSourcePaths && entry.sourcePath && (
                  <div className="mt-2 font-mono text-[9px] text-lens-text-faint truncate" title={entry.sourcePath}>
                    {entry.sourcePath}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
