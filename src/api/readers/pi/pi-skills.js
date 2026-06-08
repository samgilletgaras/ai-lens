import fs from 'fs';
import path from 'path';
import { PI_SKILLS_DIR, AGENTS_SKILLS_DIR, CACHE_TTL, parseFrontmatter, tildeHome } from '../../utils.js';
import { register } from '../skills.js';

// Extract a YAML block scalar description (>- / >) when parseFrontmatter's
// simple key: value parser cannot handle it.
function extractBlockDescription(raw) {
  const match = raw.match(/^description:\s*>-?\s*\n((?:[ \t]+\S[^\n]*\n?)*)/m);
  if (!match) return null;
  return match[1].split('\n').map(l => l.trim()).filter(Boolean).join(' ').slice(0, 200);
}

function readSkillsFromDir(dir) {
  if (!fs.existsSync(dir)) return [];
  const skills = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const slug = entry.name;
    const skillMdPath = path.join(dir, slug, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) continue;

    let description = null, trigger = null;
    try {
      const content = fs.readFileSync(skillMdPath, 'utf8');
      const { meta, body } = parseFrontmatter(content);
      const isBlockScalar = meta.description === '>-' || meta.description === '>';
      if (meta.description && !isBlockScalar) {
        description = meta.description.slice(0, 200);
      } else if (isBlockScalar) {
        description = extractBlockDescription(content);
      }
      if (!description) {
        for (const line of body.split('\n')) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---')) {
            description = trimmed.slice(0, 200);
            break;
          }
        }
      }
      if (meta.trigger) trigger = meta.trigger;
    } catch { continue; }

    const name = slug.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    skills.push({ slug, name, description, hasSkillMd: true, trigger, totalCalls: 0, lastUsed: null, sourcePath: tildeHome(skillMdPath) });
  }
  return skills;
}

let _skillsCache = null, _skillsCacheTs = 0;

async function getSkills() {
  const now = Date.now();
  if (_skillsCache && now - _skillsCacheTs < CACHE_TTL) return _skillsCache;

  const piSkills = readSkillsFromDir(PI_SKILLS_DIR);
  const piSlugs = new Set(piSkills.map(s => s.slug));

  // Global agentskills.io skills — skip slugs already covered by Pi's own dir
  const globalSkills = readSkillsFromDir(AGENTS_SKILLS_DIR).filter(s => !piSlugs.has(s.slug));

  _skillsCache = [...piSkills, ...globalSkills].sort((a, b) => a.slug.localeCompare(b.slug));
  _skillsCacheTs = now;
  return _skillsCache;
}

function getSkillDetail(slug) {
  const candidates = [
    path.join(PI_SKILLS_DIR, slug, 'SKILL.md'),
    path.join(AGENTS_SKILLS_DIR, slug, 'SKILL.md'),
  ];
  const skillMdPath = candidates.find(p => fs.existsSync(p));
  if (!skillMdPath) return null;

  const name = slug.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  let frontmatter = {}, body = null;
  try {
    const content = fs.readFileSync(skillMdPath, 'utf8');
    const parsed = parseFrontmatter(content);
    frontmatter = parsed.meta;
    body = parsed.body;
  } catch { return null; }

  return { slug, name, hasSkillMd: true, frontmatter, body, sourcePath: tildeHome(skillMdPath) };
}

register('pi', { getSkills, getSkillDetail });
