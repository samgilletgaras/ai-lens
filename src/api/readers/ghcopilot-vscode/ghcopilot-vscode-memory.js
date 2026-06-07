import fs from 'fs';
import path from 'path';
import { parseFrontmatter, CACHE_TTL, isTmp, tildeHome } from '../../utils.js';
import { getCandidateDirs, getUserDirs } from './ghcopilot-vscode-sessions.js';
import { register } from '../memory.js';

const _memoryCache = new Map();

// VS Code's Copilot Chat "memory tool" persists plain-markdown memories under
// <ext>/memory-tool/memories. There are two scopes:
//   - Global (cross-workspace): User/globalStorage/github.copilot-chat/...
//   - Per-workspace:            User/workspaceStorage/<hash>/GitHub.copilot-chat/...
// The extension folder casing differs between the two scopes, so we probe both.
const EXT_DIR_NAMES = ['GitHub.copilot-chat', 'github.copilot-chat'];
const MEMORY_SUBPATH = ['memory-tool', 'memories'];
const GLOBAL_PROJECT = 'Copilot Global';
// The Plan agent writes its plans into this same memory tree as plan*.md; those are
// surfaced under Plans (ghcopilot-vscode-plans.js), so skip them here to avoid overlap.
const PLAN_FILE = /^plan.*\.md$/i;

function decodeWorkspaceUri(uri) {
  try { return new URL(uri).pathname; } catch { return null; }
}

// Recursively collect .md files, returning paths relative to `root` (POSIX-style).
function walkMd(root, rel = '') {
  const out = [];
  const dir = rel ? path.join(root, rel) : root;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return out; }
  for (const e of entries) {
    const childRel = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walkMd(root, childRel));
    else if (e.isFile() && e.name.endsWith('.md') && !PLAN_FILE.test(e.name)) out.push({ rel: childRel, full: path.join(root, childRel) });
  }
  return out;
}

function firstExisting(candidates) {
  for (const c of candidates) { if (fs.existsSync(c)) return c; }
  return null;
}

// For each VS Code variant's User dir, the globalStorage memory dir (if present).
function globalMemoryDirs() {
  const dirs = [];
  for (const userDir of getUserDirs()) {
    const memDir = firstExisting(EXT_DIR_NAMES.map(ext => path.join(userDir, 'globalStorage', ext, ...MEMORY_SUBPATH)));
    if (memDir) dirs.push(memDir);
  }
  return dirs;
}

// Map workspace folder path (same id the sessions reader uses) -> memory files.
function scanWorkspaceMemories() {
  const result = new Map();
  for (const wsDir of getCandidateDirs()) {
    let hashes;
    try { hashes = fs.readdirSync(wsDir, { withFileTypes: true }); }
    catch { continue; }
    for (const entry of hashes) {
      if (!entry.isDirectory()) continue;
      const base = path.join(wsDir, entry.name);
      const memDir = firstExisting(EXT_DIR_NAMES.map(ext => path.join(base, ext, ...MEMORY_SUBPATH)));
      if (!memDir) continue;
      const files = walkMd(memDir);
      if (files.length === 0) continue;
      let folderPath = null;
      try {
        const parsed = JSON.parse(fs.readFileSync(path.join(base, 'workspace.json'), 'utf8'));
        folderPath = parsed.folder ? decodeWorkspaceUri(parsed.folder) : null;
      } catch { /* fall back to hash */ }
      folderPath ||= entry.name;
      if (isTmp(path.basename(folderPath))) continue;
      const list = result.get(folderPath) ?? [];
      list.push(...files);
      result.set(folderPath, list);
    }
  }
  return result;
}

// Flat list of { project, filename, fullPath } across both scopes.
function collectEntries() {
  const entries = [];
  for (const memDir of globalMemoryDirs()) {
    for (const f of walkMd(memDir)) entries.push({ project: GLOBAL_PROJECT, filename: f.rel, fullPath: f.full });
  }
  for (const [folderPath, files] of scanWorkspaceMemories()) {
    for (const f of files) entries.push({ project: folderPath, filename: f.rel, fullPath: f.full });
  }
  return entries;
}

async function getMemory(project = null, filename = null) {
  const key = `${project ?? ''}::${filename ?? ''}`;
  const now = Date.now();
  const cached = _memoryCache.get(key);
  if (cached && now - cached.time < CACHE_TTL) return cached.data;

  const out = [];
  for (const e of collectEntries()) {
    if (project && e.project !== project) continue;
    if (filename && e.filename !== filename) continue;
    try {
      const raw = fs.readFileSync(e.fullPath, 'utf8');
      const { meta, body } = parseFrontmatter(raw);
      out.push({
        project: e.project,
        filename: e.filename,
        name: meta.name || path.basename(e.filename).replace(/\.md$/, ''),
        description: meta.description || null,
        type: meta.type || null,
        snippet: body.trim().slice(0, 200) || null,
        sourcePath: tildeHome(e.fullPath),
        ...(filename ? { frontmatter: { ...meta }, body } : {}),
      });
    } catch(e) {}
  }
  _memoryCache.set(key, { data: out, time: now });
  return out;
}

register('ghcopilot-vscode', { getMemory });
