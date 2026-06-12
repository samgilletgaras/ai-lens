import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import { CACHE_TTL, isTmp, tildeHome } from '../../utils.js';
import { register } from '../sessions.js';

const SESSION_STATE_DIR = path.join(os.homedir(), '.copilot', 'session-state');
const FALLBACK_PROJECT = 'Global';

const _extraCacheClears = [];
export function registerCacheClear(fn) { _extraCacheClears.push(fn); }
export function clearAllCaches() {
  _scanCache = null; _scanCacheTime = 0;
  _projectsCache = null; _projectsCacheTime = 0;
  _projectBySession.clear(); _sessionsCache.clear(); _messagesCache.clear();
  for (const fn of _extraCacheClears) fn();
}

// ─── Simple YAML parser ────────────────────────────────────────────────────────
// workspace.yaml only contains flat scalar key: value pairs — no need for a full
// YAML library under the Node-core-only constraint.
function parseSimpleYaml(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const colon = line.indexOf(':');
    if (colon < 1) continue;
    const key = line.slice(0, colon).trim();
    const val = line.slice(colon + 1).trim();
    if (key && val) out[key] = val;
  }
  return out;
}

// ─── Streaming ─────────────────────────────────────────────────────────────────

export async function streamJsonl(filePath, onLine) {
  return new Promise((resolve, reject) => {
    let stream;
    try { stream = fs.createReadStream(filePath, { encoding: 'utf8' }); }
    catch (e) { reject(e); return; }
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    rl.on('line', line => { if (line.trim()) try { onLine(JSON.parse(line)); } catch { } });
    rl.on('close', resolve);
    rl.on('error', reject);
    stream.on('error', reject);
  });
}

// ─── Session scan ──────────────────────────────────────────────────────────────
// Each session can have:
//   session-state/<id>.jsonl              — flat event log (older / aborted sessions)
//   session-state/<id>/events.jsonl       — event log in dir (newer sessions with checkpoints)
//   session-state/<id>/workspace.yaml     — project metadata (cwd, git_root, branch …)
//
// When both a flat .jsonl and a dir exist, the dir's events.jsonl takes precedence
// (it is the primary log for newer sessions that also have checkpoints/files).

let _scanCache = null, _scanCacheTime = 0;

export function scanSessions() {
  const now = Date.now();
  if (_scanCache && now - _scanCacheTime < CACHE_TTL) return _scanCache;
  _scanCache = scanSessionsUncached();
  _scanCacheTime = now;
  return _scanCache;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function registerFlatJsonl(sessions, entry) {
  const id = entry.name.slice(0, -6);
  if (!UUID_RE.test(id)) return;
  const existing = sessions.get(id) ?? {};
  // Only set flat path if no dir-based log already registered for this id
  if (!existing.eventLogPath) {
    sessions.set(id, { ...existing, eventLogPath: path.join(SESSION_STATE_DIR, entry.name) });
  }
}

function registerSessionDir(sessions, entry) {
  const id = entry.name;
  const dirPath = path.join(SESSION_STATE_DIR, id);
  const eventsJsonl = path.join(dirPath, 'events.jsonl');
  const workspaceYaml = path.join(dirPath, 'workspace.yaml');
  const existing = sessions.get(id) ?? {};
  sessions.set(id, {
    ...existing,
    // dir's events.jsonl always wins over the flat .jsonl when present
    eventLogPath: fs.existsSync(eventsJsonl) ? eventsJsonl : (existing.eventLogPath ?? null),
    workspaceYamlPath: fs.existsSync(workspaceYaml) ? workspaceYaml : null,
  });
}

function scanSessionsUncached() {
  const sessions = new Map(); // id → { eventLogPath, workspaceYamlPath }
  let entries;
  try { entries = fs.readdirSync(SESSION_STATE_DIR, { withFileTypes: true }); }
  catch { return sessions; }

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.jsonl')) registerFlatJsonl(sessions, entry);
    else if (entry.isDirectory() && UUID_RE.test(entry.name)) registerSessionDir(sessions, entry);
  }
  return sessions;
}

// ─── Project resolution ────────────────────────────────────────────────────────

const _projectBySession = new Map();

function cwdFromYaml(workspaceYamlPath) {
  try {
    const yaml = parseSimpleYaml(fs.readFileSync(workspaceYamlPath, 'utf8'));
    const cwd = yaml.git_root || yaml.cwd;
    if (cwd && cwd !== '/' && !isTmp(path.basename(cwd))) return cwd;
  } catch { }
  return null;
}

async function cwdFromEvents(eventLogPath) {
  let found = null;
  try {
    await streamJsonl(eventLogPath, event => {
      if (found) return;
      if (event.type === 'session.info' && event.data?.infoType === 'folder_trust') {
        const m = event.data.message?.match(/^Folder (.+) has been added/);
        if (m && !isTmp(path.basename(m[1]))) found = m[1];
      }
    });
  } catch { }
  return found;
}

async function resolveProject(id, info) {
  if (_projectBySession.has(id)) return _projectBySession.get(id);
  const project =
    (info.workspaceYamlPath ? cwdFromYaml(info.workspaceYamlPath) : null) ??
    (info.eventLogPath ? await cwdFromEvents(info.eventLogPath) : null) ??
    FALLBACK_PROJECT;
  _projectBySession.set(id, project);
  return project;
}

// ─── Session summary ───────────────────────────────────────────────────────────

function mtimeOf(p) { try { return fs.statSync(p).mtimeMs; } catch { return 0; } }

async function summariseSession(id, info, project) {
  let firstTs = null, lastTs = null, preview = '', turnCount = 0;
  const metadata = {};

  if (info.workspaceYamlPath) {
    try {
      const yaml = parseSimpleYaml(fs.readFileSync(info.workspaceYamlPath, 'utf8'));
      if (yaml.name && yaml.name !== 'false') metadata.name = yaml.name;
      if (yaml.branch) metadata.branch = yaml.branch;
    } catch { }
  }

  if (info.eventLogPath) {
    try {
      await streamJsonl(info.eventLogPath, event => {
        const ts = event.timestamp ? new Date(event.timestamp).getTime() : null;
        if (ts && Number.isFinite(ts)) {
          if (!firstTs || ts < firstTs) firstTs = ts;
          if (!lastTs || ts > lastTs) lastTs = ts;
        }
        if (event.type === 'session.start') {
          metadata.copilotVersion = event.data?.copilotVersion ?? metadata.copilotVersion;
        }
        if (event.type === 'user.message') {
          turnCount++;
          const content = event.data?.content;
          if (!preview && typeof content === 'string') preview = content.slice(0, 150);
        }
      });
    } catch { }
  }

  const mtime = info.eventLogPath ? mtimeOf(info.eventLogPath) : 0;
  const sourcePaths = [];
  if (info.eventLogPath) sourcePaths.push(tildeHome(info.eventLogPath));
  if (info.workspaceYamlPath) sourcePaths.push(tildeHome(info.workspaceYamlPath));

  return {
    id, project,
    firstMessageTs: firstTs ?? mtime,
    lastUpdated: lastTs ?? mtime,
    preview, turnCount, metadata, sourcePaths,
  };
}

// ─── Message normalisation ─────────────────────────────────────────────────────

function tryParseJson(s) { try { return JSON.parse(s); } catch { return s; } }

const HANDLERS = {
  'session.start'(event, ts, messages) {
    const ver = event.data?.copilotVersion;
    messages.push({ role: 'system', content: ver ? `Session started (Copilot ${ver})` : 'Session started', timestamp: ts });
  },
  'session.info'(event, ts, messages) {
    const msg = event.data?.message;
    if (msg) messages.push({ role: 'system', content: msg, timestamp: ts });
  },
  'user.message'(event, ts, messages) {
    const { content, source } = event.data ?? {};
    if (!content) return;
    // skill-* sources are context injected by the CLI, not user-typed text
    if (typeof source === 'string' && source.startsWith('skill-')) {
      messages.push({ role: 'system_attachment', content, fileName: source.slice(6), timestamp: ts });
    } else {
      messages.push({ role: 'user', content, timestamp: ts });
    }
  },
  'assistant.message'(event, ts, messages) {
    const d = event.data ?? {};
    if (d.content?.trim()) messages.push({ role: 'assistant', content: d.content, timestamp: ts });
    for (const req of d.toolRequests ?? []) {
      messages.push({
        role: 'tool_use',
        name: req.name ?? '',
        input: typeof req.arguments === 'string' ? tryParseJson(req.arguments) : (req.arguments ?? {}),
        id: req.toolCallId ?? req.id ?? undefined,
        timestamp: ts,
      });
    }
  },
  'tool.execution_complete'(event, ts, messages) {
    const d = event.data ?? {};
    const rc = d.result?.content;
    let content;
    if (rc === undefined) {
      content = d.error?.message ?? '';
    } else if (typeof rc === 'string') {
      content = rc;
    } else {
      content = JSON.stringify(rc);
    }
    messages.push({ role: 'tool_result', content, isError: d.success === false, id: d.toolCallId ?? undefined, timestamp: ts });
  },
  // tool.execution_start is redundant with toolRequests in assistant.message — skipped
};

function normaliseEvent(event, messages) {
  const handler = HANDLERS[event.type];
  if (handler) handler(event, event.timestamp ? new Date(event.timestamp).getTime() : 0, messages);
}

// ─── Implementations ────────────────────────────────────────────────────────────

let _projectsCache = null, _projectsCacheTime = 0;
const _sessionsCache = new Map();
const _messagesCache = new Map();

async function getProjects() {
  const now = Date.now();
  if (_projectsCache && now - _projectsCacheTime < CACHE_TTL) return _projectsCache;

  const projectMap = new Map(); // project → { lastUpdated, sessionCount }
  for (const [id, info] of scanSessions()) {
    const project = await resolveProject(id, info);
    const mtime = info.eventLogPath ? mtimeOf(info.eventLogPath) : 0;
    const existing = projectMap.get(project) ?? { lastUpdated: 0, sessionCount: 0 };
    projectMap.set(project, {
      lastUpdated: Math.max(existing.lastUpdated, mtime),
      sessionCount: existing.sessionCount + 1,
    });
  }

  const projects = [...projectMap.entries()].map(([id, { lastUpdated, sessionCount }]) => ({
    id, fullPath: id, sessionCount, lastUpdated,
  }));
  projects.sort((a, b) => b.lastUpdated - a.lastUpdated);
  _projectsCache = projects;
  _projectsCacheTime = now;
  return projects;
}

async function getSessions(project, page, pageSize) {
  const now = Date.now();
  const cached = _sessionsCache.get(project);
  if (cached && now - cached.time < CACHE_TTL)
    return { data: cached.data.slice(page * pageSize, (page + 1) * pageSize), total: cached.data.length };

  const summaries = [];
  for (const [id, info] of scanSessions()) {
    const proj = await resolveProject(id, info);
    if (proj !== project) continue;
    try { summaries.push(await summariseSession(id, info, project)); } catch { }
  }
  summaries.sort((a, b) => b.lastUpdated - a.lastUpdated);
  _sessionsCache.set(project, { data: summaries, time: now });
  return { data: summaries.slice(page * pageSize, (page + 1) * pageSize), total: summaries.length };
}

async function getMessages(project, session) {
  const key = `${project}:${session}`;
  const now = Date.now();
  const cached = _messagesCache.get(key);
  if (cached && now - cached.time < CACHE_TTL) return cached.data;

  const info = scanSessions().get(session);
  const messages = [];
  if (info?.eventLogPath) {
    try {
      await streamJsonl(info.eventLogPath, event => normaliseEvent(event, messages));
    } catch { }
  }

  _messagesCache.set(key, { data: messages, time: now });
  return messages;
}

register('ghcopilot-cli', { getProjects, getSessions, getMessages });
