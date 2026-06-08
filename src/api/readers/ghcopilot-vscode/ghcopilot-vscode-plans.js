import fs from 'fs';
import path from 'path';
import { parseFrontmatter, CACHE_TTL, isTmp, tildeHome } from '../../utils.js';
import { getCandidateDirs, getUserDirs, registerCacheClear, decodeWorkspaceUri } from './ghcopilot-vscode-sessions.js';
import { register } from '../plans.js';

// Copilot has no dedicated plans store like Claude's ~/.claude/plans/. Instead the
// built-in "Plan" agent persists the plan it produces through the memory tool, as a
// markdown file named plan*.md inside <ext>/memory-tool/memories. We surface those
// here so they show under the Plans nav (they also remain visible under Memory).
// Per-session plans live under a memory dir named after the base64'd session id.
const EXT_DIR_NAMES = ['GitHub.copilot-chat', 'github.copilot-chat'];
const MEMORY_SUBPATH = ['memory-tool', 'memories'];
const PLAN_FILE = /^plan.*\.md$/i;

let _cache = null;
let _cacheTs = 0;
registerCacheClear(() => { _cache = null; _cacheTs = 0; });

// VS Code keys per-session memory dirs by the base64-encoded session id; decode it
// back for a friendly, stable filename (fall back to the raw dir name on failure).
function decodeSessionDir(name) {
  try {
    const decoded = Buffer.from(name, 'base64').toString('utf8');
    return /^[0-9a-f-]{16,}$/i.test(decoded) ? decoded : name;
  } catch { return name; }
}

function firstExisting(candidates) {
  for (const c of candidates) { if (fs.existsSync(c)) return c; }
  return null;
}

// Recursively collect plan*.md files, returning paths relative to `root` (POSIX-style).
function walkPlans(root, rel = '') {
  const out = [];
  const dir = rel ? path.join(root, rel) : root;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return out; }
  for (const e of entries) {
    const childRel = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walkPlans(root, childRel));
    else if (e.isFile() && PLAN_FILE.test(e.name)) out.push({ rel: childRel, full: path.join(root, childRel) });
  }
  return out;
}

// Flat list of { filename, fullPath } across both scopes. `filename` is a stable,
// unique key the detail lookup re-derives the same way.
function collectEntries() {
  const entries = [];

  // Global scope (cross-workspace) under each variant's globalStorage.
  for (const userDir of getUserDirs()) {
    const memDir = firstExisting(EXT_DIR_NAMES.map(ext => path.join(userDir, 'globalStorage', ext, ...MEMORY_SUBPATH)));
    if (!memDir) continue;
    for (const f of walkPlans(memDir)) entries.push({ filename: `global/${f.rel}`, fullPath: f.full });
  }

  // Per-workspace scope, keyed by the session id its memory dir is named after.
  for (const wsDir of getCandidateDirs()) {
    let hashes;
    try { hashes = fs.readdirSync(wsDir, { withFileTypes: true }); }
    catch { continue; }
    for (const entry of hashes) {
      if (!entry.isDirectory()) continue;
      const base = path.join(wsDir, entry.name);
      const memDir = firstExisting(EXT_DIR_NAMES.map(ext => path.join(base, ext, ...MEMORY_SUBPATH)));
      if (!memDir) continue;
      const files = walkPlans(memDir);
      if (files.length === 0) continue;
      let folderPath = null;
      try {
        const parsed = JSON.parse(fs.readFileSync(path.join(base, 'workspace.json'), 'utf8'));
        folderPath = parsed.folder ? decodeWorkspaceUri(parsed.folder) : null;
      } catch { /* fall back to hash */ }
      if (folderPath && isTmp(path.basename(folderPath))) continue;
      for (const f of files) {
        // rel is <sessionDirB64>/<...>/plan.md — decode the leading dir to the session id.
        const [head, ...rest] = f.rel.split('/');
        const key = [decodeSessionDir(head), ...rest].join('/');
        entries.push({ filename: key, fullPath: f.full });
      }
    }
  }
  return entries;
}

function toPlan(entry, withBody) {
  const raw = fs.readFileSync(entry.fullPath, 'utf8');
  const { meta, body } = parseFrontmatter(raw);
  const mtime = fs.statSync(entry.fullPath).mtimeMs;
  let title = meta.name || null;
  if (!title) {
    const headingMatch = body.match(/^#{1,6}\s+(.+)/m);
    title = headingMatch ? headingMatch[1].trim() : entry.filename;
  }
  let snippet = null;
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (t && !t.startsWith('#') && !t.startsWith('```') && !t.startsWith('---')) {
      snippet = t.slice(0, 200);
      break;
    }
  }
  return { filename: entry.filename, title, snippet, mtime, sourcePath: tildeHome(entry.fullPath), ...(withBody ? { body } : {}) };
}

async function getPlans(filename = null) {
  if (!filename && _cache && Date.now() - _cacheTs < CACHE_TTL) return _cache;
  const plans = [];
  for (const e of collectEntries()) {
    if (filename && e.filename !== filename) continue;
    try { plans.push(toPlan(e, !!filename)); } catch { /* skip unreadable */ }
  }
  plans.sort((a, b) => b.mtime - a.mtime);
  if (!filename) { _cache = plans; _cacheTs = Date.now(); }
  return plans;
}

register('ghcopilot-vscode', { getPlans });
