import fs from 'node:fs';
import { CACHE_TTL } from '../../utils.js';
import { register } from '../stats.js';
import { scanSessions, streamJsonl, registerCacheClear } from './ghcopilot-cli-sessions.js';

const _statsCache = new Map();
registerCacheClear(() => _statsCache.clear());

function resolveProjectFromYaml(workspaceYamlPath) {
  if (!workspaceYamlPath) return null;
  try {
    const text = fs.readFileSync(workspaceYamlPath, 'utf8');
    for (const line of text.split('\n')) {
      const colon = line.indexOf(':');
      if (colon < 1) continue;
      const k = line.slice(0, colon).trim();
      if (k === 'git_root' || k === 'cwd') return line.slice(colon + 1).trim() || null;
    }
  } catch { }
  return null;
}

async function getStats(project = null) {
  const key = project ?? '__global__';
  const now = Date.now();
  const cached = _statsCache.get(key);
  if (cached && now - cached.time < CACHE_TTL) return cached.data;

  let sessions = 0, messages = 0, toolCalls = 0, hookSuccess = 0, hookFailure = 0;
  const activity = {}, topToolsMap = new Map(), projectMsgCounts = {}, modelsMap = new Map();

  for (const [, info] of scanSessions()) {
    const sessionProject = resolveProjectFromYaml(info.workspaceYamlPath) ?? 'Global';
    if (project && sessionProject !== project) continue;

    sessions++;
    if (!info.eventLogPath) continue;

    let sessionLastTs = 0;
    try {
      await streamJsonl(info.eventLogPath, event => {
        const ts = event.timestamp ? new Date(event.timestamp).getTime() : null;
        if (ts && Number.isFinite(ts) && ts > sessionLastTs) sessionLastTs = ts;

        if (event.type === 'user.message' || event.type === 'assistant.message') {
          messages++;
          if (!project) projectMsgCounts[sessionProject] = (projectMsgCounts[sessionProject] ?? 0) + 1;
        }
        if (event.type === 'assistant.message') {
          // model is on the message itself, not on session.start
          const model = event.data?.model;
          if (model) modelsMap.set(model, (modelsMap.get(model) ?? 0) + 1);
          for (const req of event.data?.toolRequests ?? []) {
            toolCalls++;
            topToolsMap.set(req.name ?? 'unknown', (topToolsMap.get(req.name ?? 'unknown') ?? 0) + 1);
          }
        }
        if (event.type === 'hook.end') {
          if (event.data?.success === true) hookSuccess++; else hookFailure++;
        }
      });
    } catch { }

    if (sessionLastTs > 0) {
      const day = new Date(sessionLastTs).toISOString().slice(0, 10);
      activity[day] = (activity[day] ?? 0) + 1;
    }
  }

  const topProjects = project ? [] : Object.entries(projectMsgCounts)
    .map(([id, messageCount]) => ({ id, messageCount, tokenCount: 0 }))
    .sort((a, b) => b.messageCount - a.messageCount)
    .slice(0, 10);

  const data = {
    totals: { sessions, messages, toolCalls, projects: project ? undefined : Object.keys(projectMsgCounts).length },
    tokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, cacheHitRate: 0, inputEstimated: false },
    models: Object.fromEntries(modelsMap),
    topTools: [...topToolsMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count })),
    activity, hooks: { success: hookSuccess, failure: hookFailure, avgDurationMs: 0 }, estimatedCostUsd: 0,
    stopReasons: {}, topProjects,
  };
  _statsCache.set(key, { data, time: now });
  return data;
}

register('ghcopilot-cli', { getStats });
