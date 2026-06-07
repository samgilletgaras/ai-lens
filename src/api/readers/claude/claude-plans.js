import fs from 'fs';
import path from 'path';
import { PLANS_DIR, CACHE_TTL, parseFrontmatter, tildeHome } from '../../utils.js';
import { register } from '../plans.js';

let _plansCache = null;
let _plansCacheTs = 0;

async function getPlans(filename = null) {
  if (!filename && _plansCache && Date.now() - _plansCacheTs < CACHE_TTL) return _plansCache;
  if (!fs.existsSync(PLANS_DIR)) return [];
  const files = fs.readdirSync(PLANS_DIR).filter(f => f.endsWith('.md'));
  const plans = [];
  for (const f of files) {
    if (filename && f !== filename) continue;
    try {
      const raw = fs.readFileSync(path.join(PLANS_DIR, f), 'utf8');
      const { meta, body } = parseFrontmatter(raw);
      const mtime = fs.statSync(path.join(PLANS_DIR, f)).mtimeMs;
      let title = meta.name || null;
      if (!title) {
        const headingMatch = body.match(/^#\s+(.+)/m);
        title = headingMatch ? headingMatch[1].trim() : f.replace('.md', '').replace(/-/g, ' ');
      }
      let snippet = null;
      for (const line of body.split('\n')) {
        const t = line.trim();
        if (t && !t.startsWith('#') && !t.startsWith('```') && !t.startsWith('---')) {
          snippet = t.slice(0, 200);
          break;
        }
      }
      plans.push({ filename: f, title, snippet, mtime, sourcePath: tildeHome(path.join(PLANS_DIR, f)), ...(filename ? { body } : {}) });
    } catch(e) {}
  }
  plans.sort((a, b) => b.mtime - a.mtime);
  if (!filename) { _plansCache = plans; _plansCacheTs = Date.now(); }
  return plans;
}

register('claude', { getPlans });
