import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Layers, ArrowLeft, Search, Zap } from 'lucide-react';
import type { Skill, SkillDetail, ProviderInfo } from '../types';
import { apiUrl } from '../utils';
import { ProviderBadge } from './ProviderBadge';
import { ProviderFilterBar } from './ProviderFilterBar';

const META_LABEL: Record<string, string> = {
  name: 'Name',
  description: 'Description',
  trigger: 'Trigger',
};

function metaLabel(key: string) {
  return META_LABEL[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

function formatDate(ts: number | null) {
  if (!ts) return null;
  return new Date(ts).toLocaleDateString();
}

export function SkillsViewer({ demoMode, providers = [], provider, showSourcePaths = true }: { demoMode?: boolean; providers?: ProviderInfo[]; provider?: string | null; showSourcePaths?: boolean }) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState<string | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [skillDetail, setSkillDetail] = useState<SkillDetail | null>(null);
  const [contentLoading, setContentLoading] = useState(false);

  useEffect(() => {
    fetch(apiUrl('/api/skills', demoMode ?? false))
      .then(res => res.json())
      .then(res => {
        if (res.error) throw new Error(res.error);
        setSkills(res.data || []);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [demoMode]);

  function openSkill(skill: Skill) {
    setSelectedSkill(skill);
    setSkillDetail(null);
    if (!skill.hasSkillMd) return;
    setContentLoading(true);
    fetch(apiUrl(`/api/skills?slug=${encodeURIComponent(skill.slug)}${skill.providers?.[0] ? `&from=${encodeURIComponent(skill.providers[0])}` : ''}`, demoMode ?? false))
      .then(res => res.json())
      .then(res => {
        setSkillDetail(res.data ?? null);
        setContentLoading(false);
      })
      .catch(() => setContentLoading(false));
  }

  function closeSkill() {
    setSelectedSkill(null);
    setSkillDetail(null);
    setContentLoading(false);
  }

  if (selectedSkill !== null) {
    const meta = skillDetail?.frontmatter ?? {};
    const metaEntries = Object.entries(meta);
    return (
      <div className="flex-1 overflow-y-auto w-full">
        <div className="p-8 max-w-7xl mx-auto">
          <button
            onClick={closeSkill}
            className="flex items-center text-lens-text-sub hover:text-lens-text text-sm mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Skills
          </button>

          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h1 className="text-2xl font-semibold text-lens-text">{selectedSkill.name}</h1>
            {selectedSkill.providers?.map(p => <ProviderBadge key={p} id={p} providers={providers} />)}
          </div>
          <div className="font-mono text-[11px] text-lens-text-faint mb-6">{selectedSkill.slug}</div>

          {contentLoading && <p className="text-lens-text-dim text-sm">Loading...</p>}

          {!contentLoading && (
            <div className="bg-lens-surface border border-lens-border rounded-lg p-4 mb-6 space-y-2">
              <div className="flex gap-4 text-sm border-b border-lens-border pb-2 mb-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-lens-text-dim min-w-[80px] pt-0.5 shrink-0">Usage</span>
                <span className="text-lens-text-body">
                  {selectedSkill.totalCalls > 0
                    ? <>{selectedSkill.totalCalls.toLocaleString()} calls{selectedSkill.lastUsed ? <span className="text-lens-text-dim"> · Last used {formatDate(selectedSkill.lastUsed)}</span> : null}</>
                    : <span className="text-lens-text-dim italic">Never used</span>
                  }
                </span>
              </div>
              {metaEntries.map(([key, val]) => (
                <div key={key} className="flex gap-4 text-sm">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-lens-text-dim min-w-[80px] pt-0.5 shrink-0">
                    {metaLabel(key)}
                  </span>
                  <span className="text-lens-text-body break-all">{val}</span>
                </div>
              ))}
            </div>
          )}

          {!contentLoading && showSourcePaths && skillDetail?.sourcePath && (
            <div className="font-mono text-[10px] text-lens-text-faint mb-4" title={skillDetail.sourcePath}>
              Source: {skillDetail.sourcePath}
            </div>
          )}

          {!contentLoading && skillDetail?.body && (
            <div className="prose max-w-none prose-pre:bg-lens-deep prose-pre:border prose-pre:border-lens-border prose-code:text-lens-accent text-lens-text-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{skillDetail.body}</ReactMarkdown>
            </div>
          )}

          {!contentLoading && !selectedSkill.hasSkillMd && (
            <p className="text-lens-text-dim text-sm">No SKILL.md found for this skill.</p>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-lens-text-dim">
        <p>Loading skills...</p>
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

  if (skills.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-lens-text-dim">
        <p>No skills found</p>
      </div>
    );
  }

  const isAllMode = !provider || provider === 'all';
  const presentProviderIds = isAllMode
    ? [...new Set(skills.flatMap(s => s.providers ?? []))].sort()
    : [];

  const providerFiltered = providerFilter
    ? skills.filter(s => s.providers?.includes(providerFilter))
    : skills;

  const q = search.toLowerCase().trim();
  const filtered = q
    ? providerFiltered.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.slug.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q))
      )
    : providerFiltered;

  return (
    <div className="flex-1 overflow-y-auto w-full">
      <div className="p-8 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-2xl font-semibold flex items-center">
            <Layers className="mr-3 text-lens-accent" /> Installed Skills
          </h2>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-lens-text-dim pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search skills..."
              className="bg-lens-surface border border-lens-border focus:border-lens-border-hi rounded-md pl-8 pr-3 py-1.5 text-sm text-lens-text-body placeholder:text-lens-text-faint outline-none transition-colors w-52"
            />
          </div>
        </div>
        <p className="text-lens-text-dim text-sm mb-4">
          {q
            ? `${filtered.length} of ${skills.length} skills`
            : (() => {
                const used = skills.filter(s => s.totalCalls > 0).length;
                return used > 0
                  ? `${used} of ${skills.length} skills used`
                  : `${skills.length} skills installed`;
              })()
          }
        </p>
        {isAllMode && (
          <ProviderFilterBar providers={providers} presentIds={presentProviderIds} filter={providerFilter} onChange={setProviderFilter} />
        )}
        {filtered.length === 0 ? (
          <p className="text-lens-text-dim text-sm">No skills match &ldquo;{search}&rdquo;</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(skill => (
              <button
                key={skill.slug}
                onClick={() => openSkill(skill)}
                className="bg-lens-surface border border-lens-border hover:border-lens-border-hi rounded-lg p-4 text-left transition-colors flex flex-col"
              >
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className="font-medium text-lens-text">{skill.name}</span>
                  {skill.trigger && (
                    <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-lens-accent/15 text-lens-accent border border-lens-accent/20 font-mono">
                      <Zap className="w-2.5 h-2.5" />{skill.trigger}
                    </span>
                  )}
                  {skill.providers?.map(p => <ProviderBadge key={p} id={p} providers={providers} />)}
                </div>
                <div className="font-mono text-[10px] text-lens-text-faint mb-2">{skill.slug}</div>
                {skill.description ? (
                  <p className="text-lens-text-dim text-xs flex-1 line-clamp-2">{skill.description}</p>
                ) : (
                  <p className="text-lens-text-faint text-xs flex-1 italic">No description</p>
                )}
                <div className="mt-2 flex items-center justify-between text-xs">
                  {skill.totalCalls > 0 ? (
                    <>
                      <span className="text-lens-text-sub">{skill.totalCalls.toLocaleString()} calls</span>
                      <span className="text-lens-text-faint">{formatDate(skill.lastUsed)}</span>
                    </>
                  ) : (
                    <span className="text-lens-text-faint italic">Never used</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
