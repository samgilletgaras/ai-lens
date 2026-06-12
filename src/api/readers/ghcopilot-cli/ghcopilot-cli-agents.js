import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseFrontmatter, CACHE_TTL, tildeHome } from '../../utils.js';
import { register } from '../agents.js';
import { registerCacheClear } from './ghcopilot-cli-sessions.js';

const AGENTS_DIR = path.join(os.homedir(), '.copilot', 'agents');

let _cache = null, _cacheTime = 0;
registerCacheClear(() => { _cache = null; _cacheTime = 0; });

function slugify(name) {
  return name.replace(/[^a-z0-9._-]/gi, '-').toLowerCase();
}

function scanAgents() {
  const agents = [];
  const seen = new Set();
  let entries;
  try { entries = fs.readdirSync(AGENTS_DIR, { withFileTypes: true }); }
  catch { return agents; }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.agent.md')) continue;
    const filePath = path.join(AGENTS_DIR, entry.name);
    let content;
    try { content = fs.readFileSync(filePath, 'utf8'); } catch { continue; }
    const { meta, body } = parseFrontmatter(content);
    const name = meta.name || entry.name.replace(/\.agent\.md$/, '');
    const slug = slugify(name);
    if (seen.has(slug)) continue;
    seen.add(slug);
    let mtime = null;
    try { mtime = fs.statSync(filePath).mtimeMs; } catch { }
    agents.push({ slug, name, description: meta.description || null, hasSkillMd: true, trigger: null, totalCalls: 0, lastUsed: mtime, _filePath: filePath, _meta: meta, _body: body });
  }
  return agents.sort((a, b) => a.name.localeCompare(b.name));
}

async function getAgents() {
  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL) return _cache;
  _cache = scanAgents().map(({ _filePath, _meta, _body, ...rest }) => ({ ...rest, sourcePath: tildeHome(_filePath) }));
  _cacheTime = now;
  return _cache;
}

function getAgentDetail(slug) {
  const agent = scanAgents().find(a => a.slug === slug);
  if (!agent) return null;
  const displayMeta = {};
  for (const [k, v] of Object.entries(agent._meta)) {
    if (v !== undefined && v !== null && v !== '') displayMeta[k] = String(v);
  }
  return { slug: agent.slug, name: agent.name, hasSkillMd: true, frontmatter: displayMeta, body: agent._body || null, sourcePath: tildeHome(agent._filePath) };
}

register('ghcopilot-cli', { getAgents, getAgentDetail });
