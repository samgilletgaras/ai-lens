import { ALL_PROVIDER, dedupeBySourcePath } from '../utils.js';

const registry = new Map();

export function register(name, impl) { registry.set(name, impl); }

function resolve(provider) { return registry.get(provider) ?? null; }

export async function getSkills(provider) {
  if (provider === ALL_PROVIDER) {
    const out = [];
    for (const [id, impl] of registry) {
      try { for (const s of await impl.getSkills()) out.push({ ...s, providers: [id] }); } catch { /* skip */ }
    }
    return dedupeBySourcePath(out);
  }
  return resolve(provider)?.getSkills() ?? Promise.resolve([]);
}

// `from` routes detail straight to its source provider in all-mode (set by the UI
// from the list item's provider); falls back to a linear search when absent.
export function getSkillDetail(provider, slug, from = null) {
  if (provider === ALL_PROVIDER) {
    if (from) {
      try { return registry.get(from)?.getSkillDetail(slug) ?? null; } catch { return null; }
    }
    for (const [, impl] of registry) {
      try { const d = impl.getSkillDetail(slug); if (d) return d; } catch { /* skip */ }
    }
    return null;
  }
  return resolve(provider)?.getSkillDetail(slug) ?? null;
}
