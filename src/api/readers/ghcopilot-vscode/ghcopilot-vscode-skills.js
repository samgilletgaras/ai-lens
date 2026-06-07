import fs from 'fs';
import path from 'path';
import os from 'os';
import { parseFrontmatter, CACHE_TTL, tildeHome } from '../../utils.js';
import { register } from '../skills.js';

// Global Copilot skills: ~/.copilot/skills/<slug>/SKILL.md
const COPILOT_SKILLS_DIR = path.join(os.homedir(), '.copilot', 'skills');

let _cache = null, _cacheTime = 0;

async function getSkills() {
  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL) return _cache;
  const skills = [];
  if (!fs.existsSync(COPILOT_SKILLS_DIR)) { _cache = skills; _cacheTime = now; return skills; }
  let entries;
  try { entries = fs.readdirSync(COPILOT_SKILLS_DIR); } catch { _cache = skills; _cacheTime = now; return skills; }
  for (const entry of entries) {
    const entryPath = path.join(COPILOT_SKILLS_DIR, entry);
    if (!fs.statSync(entryPath).isDirectory()) continue;
    const skillMdPath = path.join(entryPath, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) continue;
    const content = fs.readFileSync(skillMdPath, 'utf8');
    const { meta, body } = parseFrontmatter(content);
    let description = meta.description || null;
    if (!description) {
      for (const line of body.split('\n')) {
        const t = line.trim();
        if (t && !t.startsWith('#')) { description = t.slice(0, 200); break; }
      }
    }
    const name = meta.name || entry.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const trigger = meta.trigger || null;
    skills.push({ slug: entry, name, description, hasSkillMd: true, trigger, totalCalls: 0, lastUsed: null, sourcePath: tildeHome(skillMdPath) });
  }
  skills.sort((a, b) => a.slug.localeCompare(b.slug));
  _cache = skills;
  _cacheTime = now;
  return skills;
}

function getSkillDetail(slug) {
  const entryPath = path.join(COPILOT_SKILLS_DIR, slug);
  const skillMdPath = path.join(entryPath, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) return null;
  const content = fs.readFileSync(skillMdPath, 'utf8');
  const { meta, body } = parseFrontmatter(content);
  const name = meta.name || slug.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const displayMeta = {};
  for (const [k, v] of Object.entries(meta)) {
    if (v !== undefined && v !== null && v !== '') displayMeta[k] = String(v);
  }
  return { slug, name, hasSkillMd: true, frontmatter: displayMeta, body: body || null, sourcePath: tildeHome(skillMdPath) };
}

register('ghcopilot-vscode', { getSkills, getSkillDetail });
