import { ALL_PROVIDER } from '../utils.js';

const registry = new Map();

export function register(name, impl) { registry.set(name, impl); }

function resolve(provider) { return registry.get(provider) ?? null; }

export async function getAgents(provider) {
  if (provider === ALL_PROVIDER) {
    const out = [];
    for (const [id, impl] of registry) {
      try { for (const a of await impl.getAgents()) out.push({ ...a, provider: id }); } catch { /* skip */ }
    }
    return out;
  }
  return resolve(provider)?.getAgents() ?? Promise.resolve([]);
}

// `from` routes detail straight to its source provider in all-mode; falls back to a
// linear search when absent.
export function getAgentDetail(provider, slug, from = null) {
  if (provider === ALL_PROVIDER) {
    if (from) return registry.get(from)?.getAgentDetail(slug) ?? null;
    for (const [, impl] of registry) {
      const d = impl.getAgentDetail(slug);
      if (d) return d;
    }
    return null;
  }
  return resolve(provider)?.getAgentDetail(slug) ?? null;
}
