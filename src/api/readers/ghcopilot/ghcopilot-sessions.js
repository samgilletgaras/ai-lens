import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';
import { CACHE_TTL } from '../../utils.js';
import { register } from '../sessions.js';

// ─── Workspace discovery ──────────────────────────────────────────────────────

const VSCODE_APP_NAMES = ['Code', 'Code - Insiders', 'VSCodium', 'Cursor', 'Windsurf'];

export function getCandidateDirs() {
  const home = os.homedir();
  const platform = os.platform();
  if (platform === 'linux') {
    const configBase = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
    return [
      ...VSCODE_APP_NAMES.map(n => path.join(configBase, n, 'User', 'workspaceStorage')),
      path.join(home, '.vscode-server', 'data', 'User', 'workspaceStorage'),
      path.join(home, '.cursor-server', 'data', 'User', 'workspaceStorage'),
    ];
  }
  if (platform === 'darwin') {
    const appSupport = path.join(home, 'Library', 'Application Support');
    return VSCODE_APP_NAMES.map(n => path.join(appSupport, n, 'User', 'workspaceStorage'));
  }
  if (platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return VSCODE_APP_NAMES.map(n => path.join(appData, n, 'User', 'workspaceStorage'));
  }
  return [];
}

function decodeWorkspaceUri(uri) {
  try { return new URL(uri).pathname; } catch { return null; }
}

export function scanWorkspaces() {
  const result = new Map();
  for (const wsDir of getCandidateDirs()) {
    let hashes;
    try { hashes = fs.readdirSync(wsDir, { withFileTypes: true }); }
    catch { continue; }
    for (const entry of hashes) {
      if (!entry.isDirectory()) continue;
      const wsJson = path.join(wsDir, entry.name, 'workspace.json');
      const tDir = path.join(wsDir, entry.name, 'GitHub.copilot-chat', 'transcripts');
      if (!fs.existsSync(wsJson) || !fs.existsSync(tDir)) continue;
      let folderPath;
      try {
        const parsed = JSON.parse(fs.readFileSync(wsJson, 'utf8'));
        folderPath = parsed.folder ? decodeWorkspaceUri(parsed.folder) : null;
      } catch { continue; }
      if (!folderPath) continue;
      let entries;
      try { entries = fs.readdirSync(tDir, { withFileTypes: true }); }
      catch { continue; }
      if (!result.has(folderPath)) result.set(folderPath, { files: new Map() });
      const proj = result.get(folderPath);
      for (const f of entries) {
        if (!f.isFile() || !f.name.endsWith('.jsonl')) continue;
        const sessionId = f.name.slice(0, -6);
        const filePath = path.join(tDir, f.name);
        try {
          const { mtimeMs } = fs.statSync(filePath);
          const existing = proj.files.get(sessionId);
          if (!existing || existing.mtime < mtimeMs) proj.files.set(sessionId, { filePath, mtime: mtimeMs });
        } catch { /* skip */ }
      }
    }
  }
  return result;
}

// ─── Streaming ────────────────────────────────────────────────────────────────

export async function streamJsonl(filePath, onLine) {
  return new Promise((resolve, reject) => {
    let stream;
    try { stream = fs.createReadStream(filePath, { encoding: 'utf8' }); }
    catch (e) { reject(e); return; }
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    rl.on('line', line => { if (line.trim()) try { onLine(JSON.parse(line)); } catch { /* skip */ } });
    rl.on('close', resolve);
    rl.on('error', reject);
    stream.on('error', reject);
  });
}

// ─── Session parsing ──────────────────────────────────────────────────────────

async function summariseFile(filePath, sessionId, project) {
  let firstTs = null, lastTs = null, preview = '', turnCount = 0;
  const metadata = {};
  await streamJsonl(filePath, event => {
    const ts = event.timestamp ? new Date(event.timestamp).getTime() : null;
    if (ts && isFinite(ts)) { if (!firstTs || ts < firstTs) firstTs = ts; if (!lastTs || ts > lastTs) lastTs = ts; }
    if (event.type === 'session.start') {
      if (event.data?.copilotVersion) metadata.copilotVersion = event.data.copilotVersion;
      if (event.data?.vscodeVersion) metadata.vscodeVersion = event.data.vscodeVersion;
    }
    if (event.type === 'user.message') {
      turnCount++;
      const content = event.data?.content;
      if (!preview && content && typeof content === 'string') preview = content.slice(0, 150);
    }
  });
  return { id: sessionId, project, firstMessageTs: firstTs ?? 0, lastUpdated: lastTs ?? firstTs ?? 0, preview, turnCount, metadata };
}

function tryParseJson(s) { try { return JSON.parse(s); } catch { return s; } }

function normaliseAssistant(event) {
  const d = event.data ?? {};
  const blocks = [];
  if (d.content && typeof d.content === 'string' && d.content.trim()) blocks.push({ type: 'text', text: d.content });
  if (Array.isArray(d.toolRequests)) {
    for (const req of d.toolRequests) {
      blocks.push({ type: 'tool_use', id: req.toolCallId ?? req.id ?? '', name: req.name ?? '', input: typeof req.arguments === 'string' ? tryParseJson(req.arguments) : (req.arguments ?? {}) });
    }
  }
  if (blocks.length === 0) return null;
  return { role: 'assistant', content: blocks, timestamp: event.timestamp ? new Date(event.timestamp).getTime() : 0 };
}

// ─── Implementations ──────────────────────────────────────────────────────────

let _projectsCache = null, _projectsCacheTime = 0;
const _sessionsCache = new Map();
const _messagesCache = new Map();

async function getProjects() {
  const now = Date.now();
  if (_projectsCache && now - _projectsCacheTime < CACHE_TTL) return _projectsCache;
  const projects = [];
  for (const [folderPath, { files }] of scanWorkspaces()) {
    if (files.size === 0) continue;
    const lastUpdated = Math.max(...[...files.values()].map(f => f.mtime));
    projects.push({ id: folderPath, fullPath: folderPath, sessionCount: files.size, lastUpdated });
  }
  projects.sort((a, b) => b.lastUpdated - a.lastUpdated);
  _projectsCache = projects; _projectsCacheTime = now;
  return projects;
}

async function getSessions(project, page, pageSize) {
  const now = Date.now();
  const cached = _sessionsCache.get(project);
  if (cached && now - cached.time < CACHE_TTL)
    return { data: cached.data.slice(page * pageSize, (page + 1) * pageSize), total: cached.data.length };
  const info = scanWorkspaces().get(project);
  if (!info) return { data: [], total: 0 };
  const summaries = [];
  for (const [sessionId, fileInfo] of info.files) {
    try { summaries.push(await summariseFile(fileInfo.filePath, sessionId, project)); }
    catch { /* skip broken files */ }
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
  const info = scanWorkspaces().get(project);
  const fileInfo = info?.files.get(session);
  if (!fileInfo) return [];
  const messages = [];
  await streamJsonl(fileInfo.filePath, event => {
    const ts = event.timestamp ? new Date(event.timestamp).getTime() : 0;
    if (event.type === 'user.message') { const content = event.data?.content; if (content) messages.push({ role: 'user', content, timestamp: ts }); }
    else if (event.type === 'assistant.message') { const msg = normaliseAssistant(event); if (msg) messages.push(msg); }
  });
  _messagesCache.set(key, { data: messages, time: now });
  return messages;
}

register('ghcopilot', { getProjects, getSessions, getMessages });
