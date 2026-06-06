import fs from 'fs';
import path from 'path';
import { PROJECTS_DIR, isTmp, parseFrontmatter } from '../utils.js';

export async function getMemory(project = null, filename = null) {
  const entries = [];
  if (!fs.existsSync(PROJECTS_DIR)) return entries;

  for (const proj of fs.readdirSync(PROJECTS_DIR)) {
    if (isTmp(proj)) continue;
    if (project && proj !== project) continue;
    const memDir = path.join(PROJECTS_DIR, proj, 'memory');
    if (!fs.existsSync(memDir)) continue;

    const files = fs.readdirSync(memDir).filter(f => f.endsWith('.md'));
    for (const f of files) {
      if (filename && f !== filename) continue;
      try {
        const raw = fs.readFileSync(path.join(memDir, f), 'utf8');
        const { meta, body } = parseFrontmatter(raw);
        for (const [, k, v] of raw.matchAll(/^\s{1,}([\w-]+)\s*:\s*(.+)/gm)) {
          if (!meta[k]) meta[k] = v.trim();
        }
        delete meta.metadata;
        const type = meta.type || null;
        entries.push({
          project: proj,
          filename: f,
          name: meta.name || (f === 'MEMORY.md' ? 'Memory Index' : f.replace('.md', '')),
          description: meta.description || null,
          type,
          snippet: body.trim().slice(0, 200) || null,
          ...(filename ? { frontmatter: { ...meta }, body } : {}),
        });
      } catch(e) {}
    }
  }
  return entries;
}
