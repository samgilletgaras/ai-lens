import { CACHE_TTL } from '../../utils.js';
import { register } from '../stats.js';
import { scanWorkspaces, streamJsonl } from './ghcopilot-sessions.js';

const _statsCache = new Map();

async function getStats(project = null) {
  const key = project ?? '__global__';
  const now = Date.now();
  const cached = _statsCache.get(key);
  if (cached && now - cached.time < CACHE_TTL) return cached.data;

  const workspaces = scanWorkspaces();
  const targets = project ? (workspaces.has(project) ? [project] : []) : [...workspaces.keys()];

  let sessions = 0, messages = 0, toolCalls = 0;
  const activity = {}, topToolsMap = new Map();

  for (const proj of targets) {
    const { files } = workspaces.get(proj);
    sessions += files.size;
    for (const [, fileInfo] of files) {
      try {
        await streamJsonl(fileInfo.filePath, event => {
          if (event.type !== 'user.message' && event.type !== 'assistant.message') return;
          messages++;
          const ts = event.timestamp ? new Date(event.timestamp).getTime() : null;
          if (ts && isFinite(ts)) { const day = new Date(ts).toISOString().slice(0, 10); activity[day] = (activity[day] ?? 0) + 1; }
          if (event.type === 'assistant.message' && Array.isArray(event.data?.toolRequests)) {
            for (const req of event.data.toolRequests) { toolCalls++; const name = req.name ?? 'unknown'; topToolsMap.set(name, (topToolsMap.get(name) ?? 0) + 1); }
          }
        });
      } catch { /* skip */ }
    }
  }

  const data = {
    totals: { sessions, messages, toolCalls },
    tokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, cacheHitRate: 0 },
    models: {}, topTools: [...topToolsMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count })),
    activity, hooks: { success: 0, failure: 0, avgDurationMs: 0 }, estimatedCostUsd: 0,
  };
  _statsCache.set(key, { data, time: now });
  return data;
}

register('ghcopilot', { getStats });
