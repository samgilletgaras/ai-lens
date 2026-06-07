import type { ProviderInfo } from '../types';
import { slugify } from '../utils';

// Small colored badge showing an item's source provider under the "All Providers"
// view. Provider-agnostic: resolves the id to a display name/badge color via the
// /api/config provider list — no provider-name branching.
export function ProviderBadge({ id, providers, className = '' }: { id: string; providers: ProviderInfo[]; className?: string }) {
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded border shrink-0 provider-badge provider-badge-${slugify(id)} ${className}`}>
      {providers.find(p => p.id === id)?.name ?? id}
    </span>
  );
}
