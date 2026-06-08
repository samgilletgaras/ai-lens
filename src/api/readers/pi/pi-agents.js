import fs from 'fs';
import path from 'path';
import { PI_AGENTS_DIR, CACHE_TTL, parseFrontmatter, tildeHome } from '../../utils.js';
import { register } from '../agents.js';

// Pi stores individual agent definitions in ~/.pi/agent/agents/*.md — the same
// Markdown-with-frontmatter convention as Claude Code's ~/.claude/agents/.

let _cache = null, _cacheTime = 0;

function scanDir(dir, agents, seen) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      scanDir(path.join(dir, entry.name), agents, seen);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const filePath = path.join(dir, entry.name);
    if (seen.has(filePath)) continue;
    seen.add(filePath);

    let content;
    try { content = fs.readFileSync(filePath, 'utf8'); } catch { continue; }
    const { meta, body } = parseFrontmatter(content);
    const slug = entry.name.replace(/\.md$/, '');
    const name = meta.name || slug.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    let description = meta.description || null;
    if (!description) {
      for (const line of body.split('\n')) {
        const t = line.trim();
        if (t && !t.startsWith('#')) { description = t.slice(0, 200); break; }
      }
    }
    let mtime = null;
    try { mtime = fs.statSync(filePath).mtimeMs; } catch { /* ok */ }
    agents.push({ slug, name, description, hasSkillMd: true, trigger: null, totalCalls: 0, lastUsed: mtime, _filePath: filePath, _meta: meta, _body: body });
  }
}

async function getAgents() {
  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL) return _cache;
  const agents = [];
  scanDir(PI_AGENTS_DIR, agents, new Set());
  agents.sort((a, b) => a.name.localeCompare(b.name));
  _cache = agents.map(({ _filePath, _meta, _body, ...rest }) => ({ ...rest, sourcePath: tildeHome(_filePath) }));
  _cacheTime = now;
  return _cache;
}

function getAgentDetail(slug) {
  const agents = [];
  scanDir(PI_AGENTS_DIR, agents, new Set());
  const agent = agents.find(a => a.slug === slug);
  if (!agent) return null;
  const displayMeta = {};
  for (const [k, v] of Object.entries(agent._meta)) {
    if (v !== undefined && v !== null && v !== '') displayMeta[k] = String(v);
  }
  return { slug: agent.slug, name: agent.name, hasSkillMd: true, frontmatter: displayMeta, body: agent._body || null, sourcePath: tildeHome(agent._filePath) };
}

register('pi', { getAgents, getAgentDetail });
