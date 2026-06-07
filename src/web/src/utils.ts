import { Sparkles, GitBranch, Boxes, Bot, MousePointer2, type LucideIcon } from 'lucide-react';

// Generic icon-name → lucide component map (keyed by icon name, NOT provider id).
// Providers declare their icon name in /api/config; this resolves it.
const ICONS: Record<string, LucideIcon> = { Sparkles, GitBranch, Boxes, Bot, MousePointer2 };
export function iconFor(name?: string | null): LucideIcon {
  return (name && ICONS[name]) || Bot;
}

export function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return n.toLocaleString();
}

export function prettifyProjectName(str: string): string {
  if (!str) return 'Unknown Project';
  // Strip an "All Providers" pack prefix (`<provider>:::<id>`) — uniform transform.
  const sepIdx = str.indexOf(':::');
  const id = sepIdx === -1 ? str : str.slice(sepIdx + 3);
  const folderName = id.split('/').pop() || id;
  return folderName.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  const min = Math.floor(ms / 60_000);
  const h = Math.floor(min / 60);
  if (h === 0) return `${min}m`;
  return `${h}h ${min % 60}m`;
}

const PROVIDER_MIGRATIONS: Record<string, string> = { ghcopilot: 'ghcopilot-vscode' };

// CSS-safe slug for a provider id, e.g. 'ghcopilot-vscode' -> 'ghcopilotvscode'.
// Used to pick the per-provider badge class defined in index.css.
export function slugify(id: string): string {
  return id.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

export function apiUrl(path: string, demoMode: boolean): string {
  const raw = localStorage.getItem('lens-provider');
  const provider = raw ? (PROVIDER_MIGRATIONS[raw] ?? raw) : null;
  let url = path;
  if (provider) url += (url.includes('?') ? '&' : '?') + `provider=${provider}`;
  if (demoMode) url += (url.includes('?') ? '&' : '?') + 'demo=true';
  return url;
}

export function formatRelative(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hour = Math.floor(min / 60);
  const day = Math.floor(hour / 24);

  if (sec < 60) return 'just now';
  if (min < 60) return `${min}m ago`;
  if (hour < 24) return `${hour}h ago`;
  if (day === 1) return 'Yesterday';
  if (day < 7) return new Date(ts).toLocaleDateString([], { weekday: 'short' });
  const d = new Date(ts);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}
