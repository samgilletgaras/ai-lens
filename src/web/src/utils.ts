export function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return n.toLocaleString();
}

export function prettifyProjectName(str: string): string {
  if (!str) return 'Unknown Project';
  const folderName = str.split('/').pop() || str;
  return folderName.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  const min = Math.floor(ms / 60_000);
  const h = Math.floor(min / 60);
  if (h === 0) return `${min}m`;
  return `${h}h ${min % 60}m`;
}

export function apiUrl(path: string, demoMode: boolean, provider: import('./types').Provider = 'claude'): string {
  let url = path;
  if (provider !== 'claude') url += (url.includes('?') ? '&' : '?') + `provider=${provider}`;
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
