import { useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import type { Provider } from '../types';
import { apiUrl } from '../utils';

const THEMES: { id: 'default' | 'tycho' | 'parchment'; name: string; colors: string[] }[] = [
  { id: 'default',   name: 'Carbon',    colors: ['#1e1e1e', '#3f3f46', '#71717a', '#f59e0b'] },
  { id: 'tycho',     name: 'Tycho',     colors: ['#1e2125', '#333940', '#897981', '#C17A6A'] },
  { id: 'parchment', name: 'Parchment', colors: ['#f5f0e8', '#ddd4be', '#8b7050', '#b83c1a'] },
];

interface Props {
  demoMode: boolean;
  hasClaudeDir: boolean;
  hasGhcopilotDir: boolean;
  provider: Provider;
  onProviderChange: (p: Provider) => void;
  onToggle: (value: boolean) => void;
  theme: 'default' | 'tycho' | 'parchment';
  onThemeChange: (t: 'default' | 'tycho' | 'parchment') => void;
}

export function SettingsViewer({ demoMode, hasClaudeDir, hasGhcopilotDir, provider, onProviderChange, onToggle, theme, onThemeChange }: Props) {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    fetch(apiUrl('/api/config', demoMode))
      .then(r => r.json())
      .then(d => { if (d.data?.version) setVersion(d.data.version); })
      .catch(() => {});
  }, [demoMode]);

  return (
    <div className="flex-1 overflow-y-auto w-full">
      <div className="p-8 max-w-7xl mx-auto">
        <h2 className="text-2xl font-semibold flex items-center mb-2">
          <Settings className="mr-3 text-lens-accent" /> Settings
        </h2>
        <p className="text-lens-text-dim text-sm mb-8">Preferences are saved in your browser.</p>

        {!hasClaudeDir && (
          <div className="mb-6 flex items-start gap-3 bg-lens-accent/10 border border-lens-accent/30 rounded-lg px-4 py-3">
            <span className="text-lens-accent text-lg mt-0.5">⚠</span>
            <div>
              <div className="text-sm font-medium text-lens-accent">No ~/.claude directory detected</div>
              <div className="text-xs text-lens-text-dim mt-0.5">Demo mode was enabled automatically. Toggle it off to view real data once Claude Code is set up.</div>
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
            <div className="flex gap-2 shrink-0 ml-6">
              <button
                onClick={() => onProviderChange('claude')}
                className={`px-3 py-1.5 rounded text-xs border transition-colors ${provider === 'claude' ? 'border-lens-accent bg-lens-accent/10 text-lens-accent' : 'border-lens-border text-lens-text-sub hover:border-lens-border-hi'}`}
              >
                Claude Code
              </button>
              <button
                onClick={() => onProviderChange('ghcopilot')}
                disabled={!hasGhcopilotDir && !demoMode}
                title={!hasGhcopilotDir && !demoMode ? 'No GitHub Copilot workspace data found' : undefined}
                className={`px-3 py-1.5 rounded text-xs border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${provider === 'ghcopilot' ? 'border-lens-accent bg-lens-accent/10 text-lens-accent' : 'border-lens-border text-lens-text-sub hover:border-lens-border-hi'}`}
              >
                GitHub Copilot
              </button>
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
          Claude Lens · local session history explorer{version ? ` · v${version}` : ''}
        </p>
      </div>
    </div>
  );
}
