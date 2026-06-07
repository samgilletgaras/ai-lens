import fs from 'fs';
import path from 'path';
import { parseFrontmatter, CACHE_TTL, tildeHome } from '../../utils.js';
import { getUserDirs } from './ghcopilot-vscode-sessions.js';
import { register } from '../agents.js';

let _cache = null, _cacheTime = 0;

function slugify(name) {
  return name.replace(/[^a-z0-9._-]/gi, '-').toLowerCase();
}

function scanDir(dir, agents, seen) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.agent.md')) continue;
    const filePath = path.join(dir, entry.name);
    let content;
    try { content = fs.readFileSync(filePath, 'utf8'); } catch { continue; }
    const { meta, body } = parseFrontmatter(content);
    const name = meta.name || entry.name.replace(/\.agent\.md$/, '');
    const slug = slugify(name);
    if (seen.has(slug)) continue;
    seen.add(slug);
    let mtime = null;
    try { mtime = fs.statSync(filePath).mtimeMs; } catch { /* ok */ }
    agents.push({ slug, name, description: meta.description || null, hasSkillMd: true, trigger: null, totalCalls: 0, lastUsed: mtime, _filePath: filePath, _meta: meta, _body: body });
  }
}

function scanAll() {
  const agents = [];
  const seen = new Set();

  // Scan every VS Code variant's User dir (stable + Insiders); `seen` dedups by
  // slug so an agent present in both variants is listed once (first wins).
  for (const userDir of getUserDirs()) {
    // User custom agents
    scanDir(path.join(userDir, 'prompts'), agents, seen);

    // Built-in Copilot agents (Ask, Explore, Plan, …)
    const storageDir = path.join(userDir, 'globalStorage', 'github.copilot-chat');
    let builtinDirs;
    try { builtinDirs = fs.readdirSync(storageDir, { withFileTypes: true }); } catch { builtinDirs = []; }
    for (const entry of builtinDirs) {
      if (entry.isDirectory()) scanDir(path.join(storageDir, entry.name), agents, seen);
    }
  }

  return agents.sort((a, b) => a.name.localeCompare(b.name));
}

async function getAgents() {
  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL) return _cache;
  const all = scanAll();
  _cache = all.map(({ _filePath, _meta, _body, ...rest }) => ({ ...rest, sourcePath: tildeHome(_filePath) }));
  _cacheTime = now;
  return _cache;
}

function getAgentDetail(slug) {
  const agent = scanAll().find(x => x.slug === slug);
  if (!agent) return null;
  const displayMeta = {};
  for (const [k, v] of Object.entries(agent._meta)) {
    if (v !== undefined && v !== null && v !== '') displayMeta[k] = String(v);
  }
  return { slug: agent.slug, name: agent.name, hasSkillMd: true, frontmatter: displayMeta, body: agent._body || null, sourcePath: tildeHome(agent._filePath) };
}

register('ghcopilot-vscode', { getAgents, getAgentDetail });
