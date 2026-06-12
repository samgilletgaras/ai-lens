import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { PI_SESSIONS_DIR, CACHE_TTL, isTmp, isWithin, tildeHome } from '../../utils.js';
import { register } from '../sessions.js';

// ─── Tree traversal ───────────────────────────────────────────────────────────

// Build a flat chronological list of entries along the active branch (root →
// most-recently-updated leaf). Entries without an id (the session header) are
// excluded. When multiple leaves exist (branching via /tree or /fork) we pick
// the one with the latest timestamp, matching how Pi itself resumes sessions.
function getLinearPath(entries) {
  const treeEntries = entries.filter(e => e.id);
  if (treeEntries.length === 0) return [];

  const entryMap = new Map();
  const hasChildren = new Set();
  for (const e of treeEntries) {
    entryMap.set(e.id, e);
    if (e.parentId) hasChildren.add(e.parentId);
  }

  const leaves = treeEntries.filter(e => !hasChildren.has(e.id));
  if (leaves.length === 0) return treeEntries;

  leaves.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const leaf = leaves[0];

  const chain = [];
  let cur = leaf;
  const seen = new Set();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.push(cur);
    if (!cur.parentId) break;
    cur = entryMap.get(cur.parentId);
  }
  return chain.reverse();
}

// ─── Content helpers ──────────────────────────────────────────────────────────

// Flatten Pi user content (string or TextContent[]/ImageContent[]) to a plain
// string. Returns null if nothing printable is found.
function userContentText(content) {
  if (typeof content === 'string') return content.trim() || null;
  if (!Array.isArray(content)) return null;
  return content
    .filter(b => b?.type === 'text' && b.text)
    .map(b => b.text)
    .join('\n')
    .trim() || null;
}

// Flatten toolResult content (array of text blocks or plain string) to a string.
function toolResultText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter(b => b?.type === 'text').map(b => b.text).join('\n');
}

// ─── Event emission ───────────────────────────────────────────────────────────

const SKILL_RE = /^<skill\s+name="([^"]+)"/;

function emitUserMsg(msg, ts, out) {
  const text = userContentText(msg.content);
  if (!text) return;
  const m = SKILL_RE.exec(text);
  if (m) {
    out.push({ role: 'system_attachment', content: text, fileName: m[1], timestamp: ts });
  } else {
    out.push({ role: 'user', content: text, timestamp: ts });
  }
}

function emitAssistantMsg(msg, ts, out) {
  if (!Array.isArray(msg.content)) return;
  for (const block of msg.content) {
    if (!block) continue;
    if (block.type === 'text' && block.text?.trim()) {
      out.push({ role: 'assistant', content: block.text, timestamp: ts });
    } else if (block.type === 'toolCall') {
      out.push({ role: 'tool_use', name: block.name, input: block.arguments ?? {}, id: block.id ?? null, timestamp: ts });
    } else if (block.type === 'thinking' && block.thinking) {
      out.push({ role: 'thinking', content: block.thinking, timestamp: ts });
    }
    // image blocks: skip (binary)
  }
}

const MSG_HANDLERS = {
  user: emitUserMsg,
  assistant: emitAssistantMsg,
  toolResult(msg, ts, out) {
    out.push({ role: 'tool_result', content: toolResultText(msg.content), is_error: msg.isError || false, tool_use_id: msg.toolCallId || null, timestamp: ts });
  },
  bashExecution(msg, ts, out) {
    const content = [msg.command ? `$ ${msg.command}` : null, msg.output ?? ''].filter(Boolean).join('\n');
    out.push({ role: 'tool_result', content, is_error: msg.exitCode != null && msg.exitCode !== 0, tool_use_id: null, timestamp: ts });
  },
  custom(msg, ts, out) {
    if (msg.display) {
      const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      out.push({ role: 'system', content: text, timestamp: ts });
    }
  },
  branchSummary(msg, ts, out) {
    if (msg.summary) out.push({ role: 'system', content: `Branch summary: ${msg.summary}`, timestamp: ts });
  },
  compactionSummary(msg, ts, out) {
    if (msg.summary) out.push({ role: 'system', content: `Context compacted: ${msg.summary}`, timestamp: ts });
  },
};

const ENTRY_HANDLERS = {
  message(entry, ts, out) {
    const handler = entry.message && MSG_HANDLERS[entry.message.role];
    if (handler) handler(entry.message, ts, out);
  },
  compaction(entry, ts, out) {
    if (entry.summary) out.push({ role: 'system', content: `Context compacted: ${entry.summary}`, timestamp: ts });
  },
  branch_summary(entry, ts, out) {
    if (entry.summary) out.push({ role: 'system', content: `Branch summary: ${entry.summary}`, timestamp: ts });
  },
  model_change(entry, ts, out) {
    const model = [entry.provider, entry.modelId].filter(Boolean).join('/');
    if (model) out.push({ role: 'system', content: `Model changed to ${model}`, timestamp: ts });
  },
  custom_message(entry, ts, out) {
    if (!entry.display) return;
    const text = typeof entry.content === 'string' ? entry.content : JSON.stringify(entry.content);
    if (text) out.push({ role: 'system', content: text, timestamp: ts });
  },
  // thinking_level_change, label, custom: intentionally skipped
};

function emitEntry(entry, out) {
  const handler = ENTRY_HANDLERS[entry.type];
  if (handler) handler(entry, entry.timestamp || null, out);
}

// Emit normalized events from the linear path of entries into `out`.
function emitEvents(linearPath, out) {
  for (const entry of linearPath) emitEntry(entry, out);
}

// ─── File reading ──────────────────────────────────────────────────────────────

// Read all JSONL entries from a session file, skipping malformed lines.
async function readEntries(filePath) {
  const entries = [];
  const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try { entries.push(JSON.parse(line)); } catch { /* skip malformed */ }
  }
  return entries;
}

// ─── Public API ───────────────────────────────────────────────────────────────

let _projectsCache = null, _projectsCacheTs = 0;
const _sessionCache = {};

async function getProjects() {
  const now = Date.now();
  if (_projectsCache && now - _projectsCacheTs < CACHE_TTL) return _projectsCache;
  if (!fs.existsSync(PI_SESSIONS_DIR)) return [];

  const projects = [];
  for (const entry of fs.readdirSync(PI_SESSIONS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory() || isTmp(entry.name)) continue;
    const dirPath = path.join(PI_SESSIONS_DIR, entry.name);

    let files;
    try { files = fs.readdirSync(dirPath).filter(f => f.endsWith('.jsonl')); }
    catch { continue; }
    if (files.length === 0) continue;

    // Recover the real cwd from the first line of the first session file.
    let fullPath = null;
    for (const f of files.sort()) {
      try {
        const firstLine = await readFirstLine(path.join(dirPath, f));
        if (firstLine) {
          const hdr = JSON.parse(firstLine);
          if (hdr.type === 'session' && hdr.cwd) { fullPath = hdr.cwd; break; }
        }
      } catch { /* try next file */ }
    }

    let lastUpdated = 0;
    for (const f of files) {
      const mtime = fs.statSync(path.join(dirPath, f)).mtimeMs;
      if (mtime > lastUpdated) lastUpdated = mtime;
    }

    projects.push({
      id: entry.name,
      fullPath: fullPath ?? entry.name,
      sessionCount: files.length,
      lastUpdated,
    });
  }

  projects.sort((a, b) => b.lastUpdated - a.lastUpdated);
  _projectsCache = projects;
  _projectsCacheTs = now;
  return projects;
}

// Read only the first non-empty line of a file (for header extraction).
async function readFirstLine(filePath) {
  const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
  for await (const line of rl) {
    rl.close();
    return line.trim() || null;
  }
  return null;
}

async function getSessions(project, page = 0, pageSize = 20) {
  const dirPath = path.join(PI_SESSIONS_DIR, project);
  if (!isWithin(PI_SESSIONS_DIR, dirPath) || !fs.existsSync(dirPath)) {
    return { data: [], total: 0 };
  }

  let files;
  try { files = fs.readdirSync(dirPath).filter(f => f.endsWith('.jsonl')); }
  catch { return { data: [], total: 0 }; }

  const cacheKey = files
    .map(f => `${f}:${fs.statSync(path.join(dirPath, f)).mtimeMs}`)
    .join('|');
  if (_sessionCache[project]?.key === cacheKey) {
    const s = _sessionCache[project].sessions;
    return { data: s.slice(page * pageSize, (page + 1) * pageSize), total: s.length };
  }

  const sessions = [];
  for (const f of files) {
    const sessionId = f.replace(/\.jsonl$/, '');
    const filePath = path.join(dirPath, f);
    const stat = fs.statSync(filePath);

    let entries;
    try { entries = await readEntries(filePath); } catch { continue; }
    if (entries.length === 0) continue;

    const linearPath = getLinearPath(entries);

    // Extract session display name from the latest session_info entry
    let sessionName = null;
    for (const e of entries) {
      if (e.type === 'session_info' && e.name) sessionName = e.name;
    }

    let preview = null, turnCount = 0, firstTs = null, lastTs = null;
    let tokTotal = 0;
    for (const entry of linearPath) {
      const tsMs = entry.timestamp ? new Date(entry.timestamp).getTime() : 0;
      if (tsMs) {
        if (firstTs === null || tsMs < firstTs) firstTs = tsMs;
        if (lastTs === null || tsMs > lastTs) lastTs = tsMs;
      }
      if (entry.type === 'message' && entry.message) {
        const msg = entry.message;
        if (msg.role === 'user') {
          turnCount++;
          if (!preview) {
            const text = userContentText(msg.content);
            if (text) preview = text.slice(0, 150);
          }
        } else if (msg.role === 'assistant' && msg.usage) {
          tokTotal += (msg.usage.input || 0) + (msg.usage.output || 0);
        }
      }
    }

    sessions.push({
      id: sessionId,
      project,
      name: sessionName || null,
      lastUpdated: lastTs ?? stat.mtimeMs,
      firstMessageTs: firstTs ?? stat.mtimeMs,
      preview,
      turnCount,
      tokens: tokTotal || null,
      sourcePaths: [tildeHome(filePath)],
    });
  }

  sessions.sort((a, b) => b.lastUpdated - a.lastUpdated);
  _sessionCache[project] = { key: cacheKey, sessions };
  return { data: sessions.slice(page * pageSize, (page + 1) * pageSize), total: sessions.length };
}

async function getMessages(project, sessionId) {
  const filePath = path.join(PI_SESSIONS_DIR, project, `${sessionId}.jsonl`);
  if (!isWithin(PI_SESSIONS_DIR, filePath) || !fs.existsSync(filePath)) return [];

  const entries = await readEntries(filePath);
  const linearPath = getLinearPath(entries);
  const events = [];
  emitEvents(linearPath, events);
  return events;
}

register('pi', { getProjects, getSessions, getMessages });
