// Pure registry — no knowledge of any specific provider.
// Each provider registers its implementation on import.

import { ALL_PROVIDER } from '../utils.js';

const registry = new Map();

export function register(name, impl) { registry.set(name, impl); }

function resolve(provider) { return registry.get(provider) ?? null; }

// `from` routes detail straight to its source provider in all-mode (set by the UI
// from the list item's provider); falls back to a linear search when absent.
export async function getPlans(provider, filename = null, from = null) {
  if (provider === ALL_PROVIDER) {
    if (filename) {
      if (from) return (await registry.get(from)?.getPlans(filename)) ?? [];
      for (const [, impl] of registry) {
        const r = await impl.getPlans(filename);
        if (r.length) return r;
      }
      return [];
    }
    const out = [];
    for (const [id, impl] of registry) {
      try { for (const p of await impl.getPlans(null)) out.push({ ...p, provider: id }); } catch { /* skip */ }
    }
    out.sort((a, b) => b.mtime - a.mtime);
    return out;
  }
  return resolve(provider)?.getPlans(filename) ?? Promise.resolve([]);
}
