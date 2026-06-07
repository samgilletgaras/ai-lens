import { ALL_PROVIDER, packId, unpackId } from '../utils.js';

const registry = new Map();

export function register(name, impl) { registry.set(name, impl); }

function resolve(provider) { return registry.get(provider) ?? null; }

export async function getMemory(provider, project, filename) {
  if (provider === ALL_PROVIDER) {
    if (project) {
      const { provider: src, id } = unpackId(project);
      const impl = src ? registry.get(src) : null;
      if (!impl) return [];
      const r = await impl.getMemory(id, filename);
      return r.map(e => ({ ...e, project }));
    }
    const out = [];
    for (const [id, impl] of registry) {
      try {
        const r = await impl.getMemory(null, null);
        for (const e of r) out.push({ ...e, project: packId(id, e.project), provider: id });
      } catch { /* skip */ }
    }
    return out;
  }
  return resolve(provider)?.getMemory(project, filename) ?? Promise.resolve([]);
}
