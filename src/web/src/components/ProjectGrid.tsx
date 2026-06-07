import { useState } from 'react';
import { FolderOpen } from 'lucide-react';
import type { ProjectSummary, ProviderInfo } from '../types';
import { prettifyProjectName, formatRelative, slugify } from '../utils';

type ProjectSort = 'updated' | 'sessions' | 'name';

export function ProjectGrid({ projects, providers, onOpen }: {
  projects: ProjectSummary[];
  providers: ProviderInfo[];
  onOpen: (id: string) => void;
}) {
  const [sort, setSort] = useState<ProjectSort>('updated');

  const sorted = [...projects].sort((a, b) => {
    if (sort === 'name') return prettifyProjectName(a.id).localeCompare(prettifyProjectName(b.id));
    if (sort === 'sessions') return b.sessionCount - a.sessionCount;
    return (b.lastUpdated || 0) - (a.lastUpdated || 0);
  });

  return (
    <div className="flex-1 overflow-y-auto w-full">
      <div className="p-8 max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <h2 className="text-2xl font-semibold flex items-center flex-1 gap-3">
            <FolderOpen className="text-lens-accent shrink-0" /> Select a Project
          </h2>
          <div className="flex gap-1">
            {(['updated', 'sessions', 'name'] as const).map(s => (
              <button key={s} onClick={() => setSort(s)} className={`px-2 py-1 text-xs rounded transition-colors ${sort === s ? 'bg-lens-border text-lens-accent' : 'text-lens-text-faint hover:text-lens-text-body'}`}>
                {s === 'updated' ? 'Recent' : s === 'sessions' ? 'Sessions' : 'A–Z'}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map(proj => (
            <button key={proj.id} onClick={() => onOpen(proj.id)} className="bg-lens-surface border border-lens-border hover:border-lens-border-hi rounded-lg p-6 text-left transition-colors flex flex-col">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="font-medium text-lens-text text-lg">{prettifyProjectName(proj.id)}</span>
                {proj.provider && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded border shrink-0 provider-badge provider-badge-${slugify(proj.provider)}`}>
                    {providers.find(p => p.id === proj.provider)?.name ?? proj.provider}
                  </span>
                )}
              </div>
              <div className="text-xs text-lens-text-dim truncate mb-4" title={proj.fullPath}>{proj.fullPath}</div>
              <div className="mt-auto flex items-center justify-between text-xs text-lens-text-sub">
                <span>{proj.sessionCount} Sessions</span>
                <span>{proj.lastUpdated ? formatRelative(proj.lastUpdated) : 'Never'}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
