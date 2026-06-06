import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { PROJECTS_DIR, SKILLS_DIR, CACHE_TTL, isTmp, parseFrontmatter } from '../utils.js';

let _skillUsageCache = null;
let _skillUsageCacheTs = 0;

export async function scanSkillUsage() {
  if (_skillUsageCache && Date.now() - _skillUsageCacheTs < CACHE_TTL) return _skillUsageCache;
  const usage = {};
  if (!fs.existsSync(PROJECTS_DIR)) return usage;
  for (const proj of fs.readdirSync(PROJECTS_DIR)) {
    if (isTmp(proj)) continue;
    const pPath = path.join(PROJECTS_DIR, proj);
    if (!fs.statSync(pPath).isDirectory()) continue;
    let files;
    try { files = fs.readdirSync(pPath).filter(f => f.endsWith('.jsonl')); }
    catch(e) { continue; }
    for (const f of files) {
      const filePath = path.join(pPath, f);
      const fileStream = fs.createReadStream(filePath);
      const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
      for await (const line of rl) {
        if (!line.includes('"Skill"')) continue;
        try {
          const parsed = JSON.parse(line);
          const tstamp = parsed.timestamp ? new Date(parsed.timestamp).getTime() : 0;
          const content = parsed.message?.content;
          if (!Array.isArray(content)) continue;
          for (const block of content) {
            if (block?.type !== 'tool_use' || block.name !== 'Skill') continue;
            const slug = block.input?.skill;
            if (typeof slug !== 'string' || !slug) continue;
            if (!usage[slug]) usage[slug] = { totalCalls: 0, lastUsed: 0 };
            usage[slug].totalCalls++;
            if (tstamp > usage[slug].lastUsed) usage[slug].lastUsed = tstamp;
          }
        } catch(e) {}
      }
    }
  }
  _skillUsageCache = usage;
  _skillUsageCacheTs = Date.now();
  return usage;
}

export async function getSkills() {
  if (!fs.existsSync(SKILLS_DIR)) return [];
  const usageMap = await scanSkillUsage();
  const skills = [];
  for (const entry of fs.readdirSync(SKILLS_DIR)) {
    const entryPath = path.join(SKILLS_DIR, entry);
    if (!fs.statSync(entryPath).isDirectory()) continue;

    const skillMdPath = path.join(entryPath, 'SKILL.md');
    let description = null, hasSkillMd = false, trigger = null;
    if (fs.existsSync(skillMdPath)) {
      hasSkillMd = true;
      const content = fs.readFileSync(skillMdPath, 'utf8');
      const { meta, body } = parseFrontmatter(content);
      if (meta.description) {
        description = meta.description.slice(0, 200);
      } else {
        for (const line of body.split('\n')) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) { description = trimmed.slice(0, 200); break; }
        }
      }
      if (meta.trigger) trigger = meta.trigger;
    }

    const name = entry.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const u = usageMap[entry];
    skills.push({
      slug: entry, name, description, hasSkillMd, trigger,
      totalCalls: u ? u.totalCalls : 0,
      lastUsed: u ? u.lastUsed || null : null,
    });
  }
  return skills.sort((a, b) => b.totalCalls - a.totalCalls || a.slug.localeCompare(b.slug));
}

export function getSkillDetail(slug) {
  const entryPath = path.join(SKILLS_DIR, slug);
  const skillMdPath = path.join(entryPath, 'SKILL.md');
  const hasSkillMd = fs.existsSync(skillMdPath);
  const name = slug.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  let frontmatter = {}, body = null;
  if (hasSkillMd) {
    const content = fs.readFileSync(skillMdPath, 'utf8');
    const parsed = parseFrontmatter(content);
    frontmatter = parsed.meta;
    body = parsed.body;
  }
  return { slug, name, hasSkillMd, frontmatter, body };
}
