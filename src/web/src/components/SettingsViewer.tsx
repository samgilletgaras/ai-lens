import { useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import { apiUrl } from '../utils';

interface Props {
  demoMode: boolean;
  hasClaudeDir: boolean;
  onToggle: (value: boolean) => void;
}

export function SettingsViewer({ demoMode, hasClaudeDir, onToggle }: Props) {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    fetch(apiUrl('/api/config', demoMode))
      .then(r => r.json())
      .then(d => { if (d.data?.version) setVersion(d.data.version); })
      .catch(() => {});
  }, [demoMode]);
  return (
    <div className="flex-1 overflow-y-auto w-full">
      <div className="p-8 max-w-2xl mx-auto">
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

        <div className="bg-lens-surface border border-lens-border rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 border-b border-lens-border">
            <span className="text-[10px] uppercase tracking-wider text-lens-text-dim">Display</span>
          </div>

          <div className="flex items-center justify-between px-4 py-4">
            <div>
              <div className="text-sm font-medium text-lens-text">Demo Mode</div>
              <div className="text-xs text-lens-text-dim mt-0.5">
                Show sample data instead of reading from ~/.claude.
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
        </div>

        <p className="text-xs text-lens-text-faint mt-6 text-center">
          Claude Lens · local session history explorer{version ? ` · v${version}` : ''}
        </p>
      </div>
    </div>
  );
}
