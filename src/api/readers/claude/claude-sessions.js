import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { PROJECTS_DIR, isTmp, isWithin, tildeHome } from '../../utils.js';
import { register } from '../sessions.js';

const _sessionCache = {};
const _messageCache = {};

async function getProjects() {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  const projects = [];
  for (const proj of fs.readdirSync(PROJECTS_DIR)) {
    if (isTmp(proj)) continue;
    const pPath = path.join(PROJECTS_DIR, proj);
    if (!fs.statSync(pPath).isDirectory()) continue;
    let files;
    try { files = fs.readdirSync(pPath).filter(f => f.endsWith('.jsonl')); }
    catch { continue; }
    let lastUpdated = 0;
    for (const f of files) { const mtime = fs.statSync(path.join(pPath, f)).mtimeMs; if (mtime > lastUpdated) lastUpdated = mtime; }
    projects.push({ id: proj, fullPath: proj, sessionCount: files.length, lastUpdated });
  }
  return projects.sort((a, b) => b.lastUpdated - a.lastUpdated);
}

async function getSessions(project, page, pageSize) {
  const pPath = path.join(PROJECTS_DIR, project);
  if (!isWithin(PROJECTS_DIR, pPath)) return { data: [], total: 0 };
  if (!fs.existsSync(pPath) || !fs.statSync(pPath).isDirectory()) return { data: [], total: 0 };
  let files;
  try { files = fs.readdirSync(pPath).filter(f => f.endsWith('.jsonl')); }
  catch { return { data: [], total: 0 }; }

  const cacheKey = files.map(f => `${f}:${fs.statSync(path.join(pPath, f)).mtimeMs}`).join('|');
  if (_sessionCache[project]?.key === cacheKey) {
    const s = _sessionCache[project].sessions;
    return { data: s.slice(page * pageSize, (page + 1) * pageSize), total: s.length };
  }

  const sessions = [];
  for (const f of files) {
    const sessionId = f.replace('.jsonl', '');
    const rl = readline.createInterface({ input: fs.createReadStream(path.join(pPath, f)), crlfDelay: Infinity });
    let firstMessageTs = 0, lastMessageTs = 0, tokIn = 0, tokOut = 0, tokCR = 0, tokCC = 0, turnCount = 0;
    let hasMessages = false, preview = '';
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const p = JSON.parse(line);
        const ts = new Date(p.timestamp).getTime() || 0;
        if (ts) { if (!firstMessageTs) firstMessageTs = ts; lastMessageTs = ts; }
        if (p.type === 'user') {
          turnCount++; hasMessages = true;
          if (!preview && !p.isMeta) {
            const c = p.message?.content;
            if (typeof c === 'string' && !c.trimStart().startsWith('<')) preview = c.slice(0, 150).trim();
            else if (Array.isArray(c) && !c.some(b => b.type === 'tool_result')) { const tb = c.find(b => b.type === 'text'); if (tb?.text) preview = tb.text.slice(0, 150).trim(); }
          }
        } else if (p.type === 'assistant') {
          hasMessages = true;
          const u = p.message?.usage;
          if (u) { tokIn += u.input_tokens || 0; tokOut += u.output_tokens || 0; tokCR += u.cache_read_input_tokens || 0; tokCC += u.cache_creation_input_tokens || 0; }
        } else if (p.type === 'attachment' || p.type === 'system') { hasMessages = true; }
      } catch { /* skip */ }
    }
    if (hasMessages) sessions.push({ id: sessionId, project, lastUpdated: lastMessageTs || 0, firstMessageTs, preview, tokens: { input: tokIn, output: tokOut, cacheRead: tokCR, cacheCreation: tokCC }, turnCount, sourcePaths: [tildeHome(path.join(pPath, `${sessionId}.jsonl`))] });
  }
  sessions.sort((a, b) => b.lastUpdated - a.lastUpdated);
  _sessionCache[project] = { key: cacheKey, sessions };
  return { data: sessions.slice(page * pageSize, (page + 1) * pageSize), total: sessions.length };
}

async function getMessages(project, sessionId) {
  const filePath = path.join(PROJECTS_DIR, project, `${sessionId}.jsonl`);
  if (!isWithin(PROJECTS_DIR, filePath)) return [];
  if (!fs.existsSync(filePath)) return [];
  const mtime = fs.statSync(filePath).mtimeMs;
  const key = `${project}/${sessionId}`;
  if (_messageCache[key]?.mtime === mtime) return _messageCache[key].messages;
  const messages = [];
  const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const p = JSON.parse(line);
      const ts = new Date(p.timestamp).getTime();
      if (p.type === 'user') messages.push({ role: 'user', content: p.message.content, timestamp: ts || 0 });
      else if (p.type === 'assistant') messages.push({ role: 'assistant', content: p.message.content, timestamp: ts || 0 });
      else if (p.type === 'attachment') messages.push({ role: 'system_attachment', content: p.attachment, timestamp: ts || 0 });
      else if (p.type === 'system') messages.push({ role: 'system', content: p.content, timestamp: ts || 0 });
    } catch { /* skip */ }
  }
  _messageCache[key] = { mtime, messages };
  return messages;
}

register('claude', { getProjects, getSessions, getMessages });
