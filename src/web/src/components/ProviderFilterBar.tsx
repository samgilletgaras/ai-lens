import type { ProviderInfo } from '../types';
import { slugify } from '../utils';

export function ProviderFilterBar({ providers, presentIds, filter, onChange }: {
  providers: ProviderInfo[];
  presentIds: string[];
  filter: string | null;
  onChange: (p: string | null) => void;
}) {
  if (presentIds.length < 2) return null;
  return (
    <div className="flex items-center gap-2 mb-4 flex-wrap">
      <button
        onClick={() => onChange(null)}
        className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
          filter === null
            ? 'bg-lens-accent text-lens-deep font-medium'
            : 'bg-lens-border text-lens-text-sub hover:text-lens-text'
        }`}
      >
        All
      </button>
      {presentIds.map(pid => (
        <button
          key={pid}
          onClick={() => onChange(filter === pid ? null : pid)}
          className={`px-2.5 py-1 rounded-full text-xs transition-colors border ${
            filter === pid
              ? `provider-badge provider-badge-${slugify(pid)} font-medium`
              : 'bg-lens-border border-transparent text-lens-text-sub hover:text-lens-text'
          }`}
        >
          {providers.find(p => p.id === pid)?.name ?? pid}
        </button>
      ))}
    </div>
  );
}
