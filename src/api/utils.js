import path from 'path';
import os from 'os';

export const PORT = process.env.PORT || 3000;
export const CLAUDE_DIR = path.join(os.homedir(), '.claude');

let _serverSettings = { includeVscodeInsiders: true };
export function getServerSettings() { return _serverSettings; }
export function updateServerSettings(patch) { _serverSettings = { ..._serverSettings, ...patch }; }

export const CURSOR_DATA_DIR     = path.join(os.homedir(), '.cursor');
export const CURSOR_PROJECTS_DIR = path.join(CURSOR_DATA_DIR, 'projects');
export const CURSOR_PLANS_DIR    = path.join(CURSOR_DATA_DIR, 'plans');
export const CURSOR_SKILLS_DIR   = path.join(CURSOR_DATA_DIR, 'skills-cursor');
export const CURSOR_PLUGINS_DIR  = path.join(CURSOR_DATA_DIR, 'plugins');
export const AGENTS_SKILLS_DIR   = path.join(os.homedir(), '.agents', 'skills');

export function getCursorAppDirs() {
  const home = os.homedir();
  const platform = os.platform();
  if (platform === 'linux') {
    const cfg = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
    return [path.join(cfg, 'Cursor', 'User')];
  }
  if (platform === 'darwin') {
    return [path.join(home, 'Library', 'Application Support', 'Cursor', 'User')];
  }
  return [];
}
export const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');
export const SKILLS_DIR = path.join(CLAUDE_DIR, 'skills');
export const AGENTS_DIR = path.join(CLAUDE_DIR, 'agents');
export const PLANS_DIR = path.join(CLAUDE_DIR, 'plans');
export const MCP_PLUGINS_DIR = path.join(CLAUDE_DIR, 'plugins/marketplaces/claude-plugins-official/external_plugins');
export const CACHE_TTL = 60_000;

// Upper bound on how many log entries a logs reader keeps in memory. The logs
// view only ever displays the most-recent few hundred (the frontend caps at
// 500), so there is no reason to materialise every line of every JSONL on a
// large `~/.claude`. See `makeBoundedLogCollector`.
export const LOGS_CAP = 2000;

// Bounded, timestamp-sorted collector for the logs readers. Push entries
// (`{ project, session, lineNumber, raw }`) freely while streaming files; the
// collector keeps only the most-recent `cap` by `raw.timestamp`, truncating
// once it grows past 2×cap so peak memory stays O(cap) instead of O(all lines).
// `finish()` returns `{ data, total }` where `total` is the true count scanned.
export function makeBoundedLogCollector(cap = LOGS_CAP) {
  const ts = (e) => { const t = e.raw?.timestamp; return t ? (new Date(t).getTime() || 0) : 0; };
  let items = [];
  let total = 0;
  return {
    push(entry) {
      items.push(entry);
      total++;
      if (items.length >= cap * 2) { items.sort((a, b) => ts(b) - ts(a)); items.length = cap; }
    },
    finish() {
      items.sort((a, b) => ts(b) - ts(a));
      if (items.length > cap) items.length = cap;
      return { data: items, total };
    },
  };
}

// Reserved meta-provider id: aggregates data across every registered provider.
// Not a real registered provider — synthesized in /api/config and fanned out in
// the registry hubs. Project/memory ids are "packed" with their source provider
// (e.g. `claude:::<id>`) so every drill-down routes back deterministically.
export const ALL_PROVIDER = 'all';
const ID_SEP = ':::';
export const packId = (provider, id) => `${provider}${ID_SEP}${id}`;
export function unpackId(packed) {
  const i = packed.indexOf(ID_SEP);
  return i === -1
    ? { provider: null, id: packed }
    : { provider: packed.slice(0, i), id: packed.slice(i + ID_SEP.length) };
}

// [input, output] USD per 1M tokens. Matched via `model.includes(key)` (first
// hit wins, see claude-stats.js), so order matters: list the more specific
// 4.5+ Opus ids before the generic `claude-opus-4` catch-all, which prices the
// older 4.0/4.1 (and date-suffixed) ids.
export const MODEL_PRICING = {
  // Opus 4.5+ generation
  'claude-opus-4-5': [5, 25], 'claude-opus-4-6': [5, 25], 'claude-opus-4-7': [5, 25], 'claude-opus-4-8': [5, 25],
  // Opus 4.0 / 4.1 and Opus 3 (generic key catches 4.0/4.1, incl. date-suffixed ids)
  'claude-opus-4': [15, 75], 'claude-3-opus': [15, 75],
  // Sonnet (4.x and 3.x are all priced the same)
  'claude-sonnet-4': [3, 15], 'claude-3-7-sonnet': [3, 15], 'claude-3-5-sonnet': [3, 15], 'claude-3-sonnet': [3, 15],
  // Haiku
  'claude-haiku-4-5': [1, 5], 'claude-3-5-haiku': [0.8, 4], 'claude-3-haiku': [0.25, 1.25],
};

export function tildeHome(p) {
  const home = os.homedir();
  return p.startsWith(home) ? `~${p.slice(home.length)}` : p;
}

export function isTmp(name) {
  return name === 'tmp' || name.endsWith('-tmp');
}

// Guard against path traversal: returns true only when `target` resolves to a
// location inside `root`. Used before reading any path built from a request
// param (project/session/file) so `?project=../../..` can't escape the root.
export function isWithin(root, target) {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

// Month-name → 0-based index. Shared by Cursor session and stats readers to
// parse the "<timestamp>Sunday, Jun 7, 2026, …</timestamp>" format.
export const MONTH_NAMES = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };

export function parseFrontmatter(content) {
  if (typeof content !== 'string') return { meta: {}, body: '' };
  const lines = content.split('\n');
  if (!lines[0] || lines[0].trim() !== '---') return { meta: {}, body: content };
  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { endIdx = i; break; }
  }
  if (endIdx === -1) return { meta: {}, body: content };
  const meta = {};
  for (const line of lines.slice(1, endIdx)) {
    const m = line.match(/^([\w-]+)\s*:\s*(.*)/);
    if (m) {
      let val = m[2].trim();
      if (val.length >= 2 && ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))) {
        val = val.slice(1, -1);
      }
      meta[m[1]] = val;
    }
  }
  return { meta, body: lines.slice(endIdx + 1).join('\n').trimStart() };
}

export function parseQuery(url) {
  const u = new URL(url, 'http://localhost');
  return {
    pathname: u.pathname,
    get: (k, def) => u.searchParams.get(k) ?? def,
  };
}

// Dedup items in an "all" aggregation by sourcePath. Items sharing the same
// sourcePath are merged: providers arrays are concatenated, other fields kept
// from the first occurrence. Items without a sourcePath are never merged.
export function dedupeBySourcePath(items) {
  const idx = new Map();
  const out = [];
  for (const item of items) {
    const key = item.sourcePath;
    if (key && idx.has(key)) {
      const existing = out[idx.get(key)];
      existing.providers = [...existing.providers, ...item.providers];
    } else {
      const copy = { ...item, providers: item.providers ? [...item.providers] : [] };
      const i = out.push(copy) - 1;
      if (key) idx.set(key, i);
    }
  }
  return out;
}
