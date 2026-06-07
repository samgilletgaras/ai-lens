import { ALL_PROVIDER } from '../utils.js';

const registry = new Map();

export function register(name, impl) { registry.set(name, impl); }

function resolve(provider) { return registry.get(provider) ?? null; }

// `from` routes detail straight to its source provider in all-mode (set by the UI
// from the list item's provider); falls back to a linear search when absent.
export async function getMcps(provider, id = null, from = null) {
  if (provider === ALL_PROVIDER) {
    if (id) {
      if (from) return (await registry.get(from)?.getMcps(id)) ?? null;
      for (const [, impl] of registry) {
        try {
          const d = await impl.getMcps(id);
          if (d) return d;
        } catch { /* skip */ }
      }
      return null;
    }
    const out = [];
    for (const [pid, impl] of registry) {
      try { for (const m of await impl.getMcps(null)) out.push({ ...m, providers: [pid] }); } catch { /* skip */ }
    }
    return out;
  }
  return resolve(provider)?.getMcps(id) ?? Promise.resolve(id ? null : []);
}
