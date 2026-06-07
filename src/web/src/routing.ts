import type { ProviderCapabilities } from './types';

export const SESSION_PAGE_SIZE = 20;
export const VALID_VIEWS = ['history', 'logs', 'skills', 'agents', 'mcps', 'memory', 'plans', 'settings'] as const;
export type AppView = typeof VALID_VIEWS[number];

export const NO_CAPABILITIES: ProviderCapabilities = {
  hasHistory: false, hasStats: false, hasLogs: false, hasSkills: false,
  hasAgents: false, hasMcps: false, hasMemory: false, hasPlans: false,
};

export function parseHash(hash: string): { view: AppView; projectId: string | null; sessionId: string | null } {
  const parts = hash.replace(/^#\/?/, '').split('/');
  const view = (VALID_VIEWS.includes(parts[0] as AppView) ? parts[0] : 'history') as AppView;
  const projectId = view === 'history' ? (parts[1] || null) : null;
  const sessionId = projectId ? (parts[2] || null) : null;
  return { view, projectId, sessionId };
}

export function buildHash(view: AppView, projectId: string | null, sessionId: string | null): string {
  if (view !== 'history') return `#/${view}`;
  if (!projectId) return `#/history`;
  if (!sessionId) return `#/history/${projectId}`;
  return `#/history/${projectId}/${sessionId}`;
}
