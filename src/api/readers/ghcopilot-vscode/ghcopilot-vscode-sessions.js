import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';
import { CACHE_TTL, isTmp } from '../../utils.js';
import { register } from '../sessions.js';

// ─── Workspace discovery ──────────────────────────────────────────────────────

// This provider is VS Code only — stable + Insiders. Other editors (Cursor,
// Windsurf, VSCodium) are deliberately NOT listed here; per the architecture
// rules they belong to their own provider, not GitHub Copilot for VS Code.
const VSCODE_APP_NAMES = ['Code', 'Code - Insiders'];

export function getCandidateDirs() {
  const home = os.homedir();
  const platform = os.platform();
  if (platform === 'linux') {
    const configBase = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
    return [
      ...VSCODE_APP_NAMES.map(n => path.join(configBase, n, 'User', 'workspaceStorage')),
      path.join(home, '.vscode-server', 'data', 'User', 'workspaceStorage'),
    ];
  }
  if (platform === 'darwin') {
    const appSupport = path.join(home, 'Library', 'Application Support');
    return VSCODE_APP_NAMES.map(n => path.join(appSupport, n, 'User', 'workspaceStorage'));
  }
  // Windows is intentionally out of scope (see CLAUDE.md data-sourcing rules).
  return [];
}

// VS Code "User" directories (the parent of each workspaceStorage), deduped.
// Use this for User-level data that lives outside workspaceStorage —
// e.g. User/prompts, User/globalStorage, User/mcp.json — so those readers cover
// every VS Code variant (stable + Insiders) instead of hardcoding one path.
export function getUserDirs() {
  return [...new Set(getCandidateDirs().map(d => path.dirname(d)))];
}

function decodeWorkspaceUri(uri) {
  try { return new URL(uri).pathname; } catch { return null; }
}

let _scanCache = null, _scanCacheTime = 0;

// Cached wrapper around the workspace walk. The scan touches every VS Code
// variant's workspaceStorage and reads a workspace.json + transcript dir listing
// per workspace — too expensive to repeat on every getSessions/getMessages/logs
// /stats call, all of which only need the resulting map. Cached for CACHE_TTL;
// the returned map is treated as read-only by every caller.
export function scanWorkspaces() {
  const now = Date.now();
  if (_scanCache && now - _scanCacheTime < CACHE_TTL) return _scanCache;
  _scanCache = scanWorkspacesUncached();
  _scanCacheTime = now;
  return _scanCache;
}

function scanWorkspacesUncached() {
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
      if (!folderPath || isTmp(path.basename(folderPath))) continue;
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

// ─── chatSessions (VS Code native chat store) ─────────────────────────────────

// Copilot's transcripts/*.jsonl does NOT record the opening user prompt — every
// session begins session.start → assistant.message, and the first turn's prompt
// (plus the occasional slash-command / "Try Again" turn) is simply absent. The
// complete, ordered list of user prompts lives in VS Code's sibling
// chatSessions/<sessionId>.jsonl (same session UUID, agent.extensionId
// "GitHub.copilot-chat"). We only ever open the chatSessions file whose id
// matches a transcript we already found, so this stays scoped to this provider's
// own (VS Code Copilot) data — not another editor.
function chatSessionPathFor(transcriptPath, sessionId) {
  // transcriptPath = <hash>/GitHub.copilot-chat/transcripts/<id>.jsonl
  return path.join(path.dirname(transcriptPath), '..', '..', 'chatSessions', `${sessionId}.jsonl`);
}

// The file is an append-only "observable diff" log: a kind:0 base snapshot, then
// kind:2 array-appends to ["requests"], and kind:1 path patches we ignore. We
// only need each request's prompt text + timestamp, so we accumulate the base's
// requests then every appended batch, in order.
async function readChatRequests(transcriptPath, sessionId) {
  const chatPath = chatSessionPathFor(transcriptPath, sessionId);
  if (!fs.existsSync(chatPath)) return null;
  const requests = [];
  try {
    await streamJsonl(chatPath, ev => {
      if (ev.kind === 0 && Array.isArray(ev.v?.requests)) requests.push(...ev.v.requests);
      else if (ev.kind === 2 && Array.isArray(ev.k) && ev.k.length === 1 && ev.k[0] === 'requests' && Array.isArray(ev.v)) requests.push(...ev.v);
    });
  } catch { return null; }
  return requests.map(r => ({
    text: typeof r?.message?.text === 'string' ? r.message.text : '',
    timestamp: typeof r?.timestamp === 'number' ? r.timestamp : 0,
  }));
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
  // Prefer chatSessions for the prompt count + preview: it includes the opening
  // prompt the transcript drops, so the count and preview reflect the real first message.
  const reqs = await readChatRequests(filePath, sessionId);
  if (reqs && reqs.length) {
    turnCount = reqs.length;
    const first = reqs.find(r => r.text.trim());
    if (first) preview = first.text.slice(0, 150);
  }
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

  // Assistant turns (with tool calls) come from the transcript.
  const assistantMsgs = [];
  await streamJsonl(fileInfo.filePath, event => {
    if (event.type === 'assistant.message') { const msg = normaliseAssistant(event); if (msg) assistantMsgs.push(msg); }
  });

  // User turns come from chatSessions when available — it's a superset that
  // includes the opening prompt the transcript omits. Fall back to the
  // transcript's user.message events if the chatSessions file is missing.
  const reqs = await readChatRequests(fileInfo.filePath, session);
  let userMsgs;
  if (reqs) {
    userMsgs = reqs.filter(r => r.text).map(r => ({ role: 'user', content: r.text, timestamp: r.timestamp }));
  } else {
    userMsgs = [];
    await streamJsonl(fileInfo.filePath, event => {
      if (event.type === 'user.message') {
        const content = event.data?.content;
        if (content) userMsgs.push({ role: 'user', content, timestamp: event.timestamp ? new Date(event.timestamp).getTime() : 0 });
      }
    });
  }

  // Merge chronologically; on a tie the user prompt precedes its assistant turn.
  const messages = [...userMsgs, ...assistantMsgs].sort((a, b) =>
    (a.timestamp - b.timestamp) || ((a.role === 'user' ? 0 : 1) - (b.role === 'user' ? 0 : 1)));
  _messagesCache.set(key, { data: messages, time: now });
  return messages;
}

register('ghcopilot-vscode', { getProjects, getSessions, getMessages });
