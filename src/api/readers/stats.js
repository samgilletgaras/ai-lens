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
    tokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, cacheHitRate: 0 },
    stopReasons: {}, models: {},
    hooks: { success: 0, failure: 0, avgDurationMs: 0 },
    topProjects: [], activity: {}, estimatedCostUsd: 0, estimatedCostByProvider: {},
  };
  let hookDurTotal = 0, hookDurCount = 0;
  const addMap = (dst, src) => { for (const [k, v] of Object.entries(src ?? {})) dst[k] = (dst[k] || 0) + v; };
  for (const { providerId, stats: s } of parts) {
    if (!s) continue;
    acc.totals.sessions += s.totals.sessions; acc.totals.messages += s.totals.messages; acc.totals.toolCalls += s.totals.toolCalls;
    acc.tokens.input += s.tokens.input; acc.tokens.output += s.tokens.output;
    acc.tokens.cacheRead += s.tokens.cacheRead; acc.tokens.cacheCreation += s.tokens.cacheCreation;
    addMap(acc.stopReasons, s.stopReasons); addMap(acc.activity, s.activity);
    for (const [k, v] of Object.entries(s.models ?? {})) { const key = `${providerId}/${k}`; acc.models[key] = (acc.models[key] || 0) + v; }
    acc.hooks.success += s.hooks.success; acc.hooks.failure += s.hooks.failure;
    if (s.hooks.avgDurationMs && s.hooks.success) { hookDurTotal += s.hooks.avgDurationMs * s.hooks.success; hookDurCount += s.hooks.success; }
    acc.estimatedCostUsd += s.estimatedCostUsd;
    acc.estimatedCostByProvider[providerId] = Math.round((s.estimatedCostUsd || 0) * 100) / 100;
    for (const tp of s.topProjects ?? []) acc.topProjects.push({ ...tp, id: packId(providerId, tp.id), provider: providerId });
  }
  const tot = acc.tokens.input + acc.tokens.cacheRead + acc.tokens.cacheCreation;
  acc.tokens.cacheHitRate = tot > 0 ? Math.round((acc.tokens.cacheRead / tot) * 100) : 0;
  acc.hooks.avgDurationMs = hookDurCount > 0 ? Math.round(hookDurTotal / hookDurCount) : 0;
  acc.topProjects.sort((a, b) => b.messageCount - a.messageCount);
  acc.topProjects = acc.topProjects.slice(0, 5);
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
