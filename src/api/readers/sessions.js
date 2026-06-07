// Pure registry — no knowledge of any specific provider.
// Each provider registers its implementation on import.

import { ALL_PROVIDER, packId, unpackId } from '../utils.js';

const registry = new Map();

export function register(name, impl) {
  registry.set(name, impl);
}

function resolve(provider) {
  const impl = registry.get(provider);
  if (!impl) throw new Error(`No sessions implementation registered for provider: ${provider}`);
  return impl;
}

// Route a packed project id (`<provider>:::<realId>`) to its source impl.
function routed(project) {
  const { provider, id } = unpackId(project);
  return { impl: provider ? registry.get(provider) : null, id, provider };
}

export async function getProjects(provider) {
  if (provider === ALL_PROVIDER) {
    const out = [];
    for (const [id, impl] of registry) {
      let projs = [];
      try { projs = await impl.getProjects(); } catch { projs = []; }
      for (const p of projs) out.push({ ...p, id: packId(id, p.id), provider: id });
    }
    return out.sort((a, b) => b.lastUpdated - a.lastUpdated);
  }
  return resolve(provider).getProjects();
}

export async function getSessions(provider, project, page = 0, pageSize = 20) {
  if (provider === ALL_PROVIDER) {
    const { impl, id, provider: src } = routed(project);
    if (!impl) return { data: [], total: 0 };
    const r = await impl.getSessions(id, page, pageSize);
    return { ...r, data: r.data.map(s => ({ ...s, project, provider: src })) };
  }
  return resolve(provider).getSessions(project, page, pageSize);
}

export async function getMessages(provider, project, sessionId) {
  if (provider === ALL_PROVIDER) {
    const { impl, id } = routed(project);
    return impl ? impl.getMessages(id, sessionId) : [];
  }
  return resolve(provider).getMessages(project, sessionId);
}
