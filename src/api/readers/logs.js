import { ALL_PROVIDER, packId } from '../utils.js';

const registry = new Map();

export function register(name, impl) { registry.set(name, impl); }

function resolve(provider) { return registry.get(provider) ?? null; }

const tsOf = (e) => (typeof e.raw?.timestamp === 'string' ? new Date(e.raw.timestamp).getTime() : 0);

export async function getLogs(provider, page = 0, pageSize = 10) {
  if (provider === ALL_PROVIDER) {
    const all = [];
    let total = 0;
    for (const [id, impl] of registry) {
      try {
        // Each impl returns its most-recent (bounded) entries plus the true
        // scanned count; merge the entries for ordering but keep `total` honest.
        const r = await impl.getLogs(0, Number.MAX_SAFE_INTEGER);
        total += r.total ?? r.data.length;
        for (const e of r.data) all.push({ ...e, project: packId(id, e.project) });
      } catch { /* skip */ }
    }
    all.sort((a, b) => tsOf(b) - tsOf(a));
    return { data: all.slice(page * pageSize, (page + 1) * pageSize), total };
  }
  return resolve(provider)?.getLogs(page, pageSize) ?? Promise.resolve({ data: [], total: 0 });
}
