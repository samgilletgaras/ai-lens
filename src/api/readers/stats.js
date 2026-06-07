// Pure registry — no knowledge of any specific provider.
// Each provider registers its implementation on import.

import { ALL_PROVIDER, packId, unpackId } from '../utils.js';

const registry = new Map();

export function register(name, impl) {
  registry.set(name, impl);
}

function resolve(provider) {
  const impl = registry.get(provider);
  if (!impl) throw new Error(`No stats implementation registered for provider: ${provider}`);
  return impl;
}

// Merge each provider's global stats into one aggregate. topProjects ids are
// packed with their source provider so they stay routable.
function mergeGlobalStats(parts) {
  const acc = {
    totals: { sessions: 0, messages: 0, toolCalls: 0 },
    tokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, cacheHitRate: 0, inputEstimated: false, outputEstimated: false },
    stopReasons: {}, models: {},
    hooks: { success: 0, failure: 0, avgDurationMs: 0 },
    topProjects: [], activity: {}, estimatedCostUsd: 0, estimatedCostByProvider: {},
  };
  const topToolsMap = {};
  let hookDurTotal = 0, hookDurCount = 0;
  const addMap = (dst, src) => { for (const [k, v] of Object.entries(src ?? {})) dst[k] = (dst[k] || 0) + v; };
  for (const { providerId, stats: s } of parts) {
    if (!s) continue;
    const { totals = {}, tokens = {}, hooks = {} } = s;
    acc.totals.sessions += totals.sessions ?? 0; acc.totals.messages += totals.messages ?? 0; acc.totals.toolCalls += totals.toolCalls ?? 0;
    if (totals.projects) acc.totals.projects = (acc.totals.projects ?? 0) + totals.projects;
    acc.tokens.input += tokens.input ?? 0; acc.tokens.output += tokens.output ?? 0;
    acc.tokens.cacheRead += tokens.cacheRead ?? 0; acc.tokens.cacheCreation += tokens.cacheCreation ?? 0;
    if (tokens.inputEstimated) { acc.tokens.inputEstimated = true; (acc.tokens.inputEstimatedProviders ??= []).push(providerId); }
    if (tokens.outputEstimated) { acc.tokens.outputEstimated = true; (acc.tokens.outputEstimatedProviders ??= []).push(providerId); }
    addMap(acc.stopReasons, s.stopReasons); addMap(acc.activity, s.activity);
    for (const [k, v] of Object.entries(s.models ?? {})) { const key = `${providerId}/${k}`; acc.models[key] = (acc.models[key] || 0) + v; }
    acc.hooks.success += hooks.success ?? 0; acc.hooks.failure += hooks.failure ?? 0;
    if (hooks.avgDurationMs && hooks.success) { hookDurTotal += hooks.avgDurationMs * hooks.success; hookDurCount += hooks.success; }
    acc.estimatedCostUsd += s.estimatedCostUsd ?? 0;
    acc.estimatedCostByProvider[providerId] = Math.round((s.estimatedCostUsd || 0) * 100) / 100;
    for (const tp of s.topProjects ?? []) acc.topProjects.push({ ...tp, id: packId(providerId, tp.id), provider: providerId });
    for (const { name, count } of s.topTools ?? []) { const key = `${providerId}/${name}`; topToolsMap[key] = (topToolsMap[key] || 0) + count; }
  }
  const tot = acc.tokens.input + acc.tokens.cacheRead + acc.tokens.cacheCreation;
  acc.tokens.cacheHitRate = tot > 0 ? Math.round((acc.tokens.cacheRead / tot) * 100) : 0;
  acc.hooks.avgDurationMs = hookDurCount > 0 ? Math.round(hookDurTotal / hookDurCount) : 0;
  acc.topProjects.sort((a, b) => b.messageCount - a.messageCount);
  acc.topProjects = acc.topProjects.slice(0, 5);
  acc.topTools = Object.entries(topToolsMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count }));
  acc.estimatedCostUsd = Math.round(acc.estimatedCostUsd * 100) / 100;
  return acc;
}

export async function getStats(provider, project = null) {
  if (provider === ALL_PROVIDER) {
    if (project) {
      const { provider: src, id } = unpackId(project);
      return src ? (registry.get(src)?.getStats(id) ?? null) : null;
    }
    const parts = [];
    for (const [providerId, impl] of registry) {
      try { parts.push({ providerId, stats: await impl.getStats(null) }); } catch { /* skip */ }
    }
    return mergeGlobalStats(parts);
  }
  return resolve(provider).getStats(project);
}
