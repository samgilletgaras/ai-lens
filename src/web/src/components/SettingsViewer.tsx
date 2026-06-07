import { useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import type { Provider, ProviderInfo } from '../types';
import { apiUrl, iconFor } from '../utils';

const THEMES: { id: 'default' | 'tycho' | 'parchment'; name: string; colors: string[] }[] = [
  { id: 'default',   name: 'Carbon',    colors: ['#1e1e1e', '#3f3f46', '#71717a', '#f59e0b'] },
  { id: 'tycho',     name: 'Tycho',     colors: ['#1e2125', '#333940', '#897981', '#C17A6A'] },
  { id: 'parchment', name: 'Parchment', colors: ['#f5f0e8', '#ddd4be', '#8b7050', '#b83c1a'] },
];

interface Props {
  demoMode: boolean;
  providers: ProviderInfo[];
  provider: Provider | null;
  onProviderChange: (p: Provider) => void;
  onToggle: (value: boolean) => void;
  theme: 'default' | 'tycho' | 'parchment';
  onThemeChange: (t: 'default' | 'tycho' | 'parchment') => void;
  showSourcePaths: boolean;
  onShowSourcePathsChange: (v: boolean) => void;
}

export function SettingsViewer({ demoMode, providers, provider, onProviderChange, onToggle, theme, onThemeChange, showSourcePaths, onShowSourcePathsChange }: Props) {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    fetch(apiUrl('/api/config', demoMode))
      .then(r => r.json())
      .then(d => { if (d.data?.version) setVersion(d.data.version); })
      .catch(() => {});
  }, [demoMode]);

  const noneAvailable = providers.length > 0 && providers.every(p => !p.available);

  return (
    <div className="flex-1 overflow-y-auto w-full">
      <div className="p-8 max-w-7xl mx-auto">
        <h2 className="text-2xl font-semibold flex items-center mb-2">
          <Settings className="mr-3 text-lens-accent" /> Settings
        </h2>
        <p className="text-lens-text-dim text-sm mb-8">Preferences are saved in your browser.</p>

        {noneAvailable && (
          <div className="mb-6 flex items-start gap-3 bg-lens-accent/10 border border-lens-accent/30 rounded-lg px-4 py-3">
            <span className="text-lens-accent text-lg mt-0.5">⚠</span>
            <div>
              <div className="text-sm font-medium text-lens-accent">No provider data detected</div>
              <div className="text-xs text-lens-text-dim mt-0.5">Demo mode was enabled automatically. Toggle it off to view real data once a supported assistant is set up.</div>
            </div>
          </div>
        )}

        <div className="bg-lens-surface border border-lens-border rounded-lg overflow-hidden mb-6">
          <div className="px-4 py-2.5 border-b border-lens-border">
            <span className="text-[10px] uppercase tracking-wider text-lens-text-dim">Provider</span>
          </div>

          <div className="flex items-center justify-between px-4 py-4">
            <div>
              <div className="text-sm font-medium text-lens-text">Active Provider</div>
              <div className="text-xs text-lens-text-dim mt-0.5">Choose which AI assistant's history to browse.</div>
            </div>
            <div className="flex gap-2 shrink-0 ml-6 flex-wrap justify-end">
              {providers.map(p => {
                const disabled = !p.available && !demoMode;
                const Icon = iconFor(p.icon);
                return (
                  <button
                    key={p.id}
                    onClick={() => onProviderChange(p.id)}
                    disabled={disabled}
                    title={disabled ? `No ${p.name} data found` : undefined}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${provider === p.id ? 'border-lens-accent bg-lens-accent/10 text-lens-accent' : 'border-lens-border text-lens-text-sub hover:border-lens-border-hi'}`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    {p.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="bg-lens-surface border border-lens-border rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 border-b border-lens-border">
            <span className="text-[10px] uppercase tracking-wider text-lens-text-dim">Display</span>
          </div>

          <div className="flex items-center justify-between px-4 py-4">
            <div>
              <div className="text-sm font-medium text-lens-text">Demo Mode</div>
              <div className="text-xs text-lens-text-dim mt-0.5">
                Show sample data instead of reading from real sources.
              </div>
            </div>
            <button
              role="switch"
              aria-checked={demoMode}
              onClick={() => onToggle(!demoMode)}
              className={`relative shrink-0 ml-6 w-10 h-6 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-lens-accent ${demoMode ? 'bg-lens-accent' : 'bg-lens-border'}`}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${demoMode ? 'translate-x-4' : 'translate-x-0'}`}
              />
            </button>
          </div>

          <div className="border-t border-lens-border" />

          <div className="flex items-center justify-between px-4 py-4">
            <div>
              <div className="text-sm font-medium text-lens-text">Show source file paths</div>
              <div className="text-xs text-lens-text-dim mt-0.5">
                Display the on-disk path of each item's source file — sessions, skills, agents, MCPs, memory, and plans. Useful for locating and inspecting the raw data files.
              </div>
            </div>
            <button
              role="switch"
              aria-checked={showSourcePaths}
              onClick={() => onShowSourcePathsChange(!showSourcePaths)}
              className={`relative shrink-0 ml-6 w-10 h-6 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-lens-accent ${showSourcePaths ? 'bg-lens-accent' : 'bg-lens-border'}`}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${showSourcePaths ? 'translate-x-4' : 'translate-x-0'}`}
              />
            </button>
          </div>

          <div className="border-t border-lens-border" />

          <div className="flex items-center justify-between px-4 py-4">
            <div>
              <div className="text-sm font-medium text-lens-text">Theme</div>
              <div className="text-xs text-lens-text-dim mt-0.5">Choose the color palette for the interface.</div>
            </div>
            <div className="shrink-0 ml-6 flex gap-2">
              {THEMES.map(t => (
                <button
                  key={t.id}
                  onClick={() => onThemeChange(t.id)}
                  className={`flex flex-col gap-2 px-3 py-2.5 rounded-lg border text-left transition-colors duration-150 ${theme === t.id ? 'border-lens-accent bg-lens-accent/10' : 'border-lens-border hover:border-lens-border-hi'}`}
                >
                  <span className={`text-xs font-medium ${theme === t.id ? 'text-lens-accent' : 'text-lens-text-sub'}`}>{t.name}</span>
                  <div className="flex items-center">
                    {t.colors.map((color, i) => (
                      <div
                        key={i}
                        style={{ backgroundColor: color, marginLeft: i === 0 ? 0 : -5, zIndex: i }}
                        className="relative w-3.5 h-3.5 rounded-full border border-lens-deep"
                      />
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="text-xs text-lens-text-faint mt-6 text-center">
          AI Lens · local session history explorer{version ? ` · v${version}` : ''}
        </p>
      </div>
    </div>
  );
}
