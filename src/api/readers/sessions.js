import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { PROJECTS_DIR, isTmp } from '../utils.js';

const _sessionCache = {};
const _messageCache = {};

export async function getProjects() {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  const projects = [];
  for (const proj of fs.readdirSync(PROJECTS_DIR)) {
    if (isTmp(proj)) continue;
    const pPath = path.join(PROJECTS_DIR, proj);
    if (!fs.statSync(pPath).isDirectory()) continue;
    let files;
    try { files = fs.readdirSync(pPath).filter(f => f.endsWith('.jsonl')); }
    catch(e) { continue; }
    let lastUpdated = 0;
    for (const f of files) {
      const mtime = fs.statSync(path.join(pPath, f)).mtimeMs;
      if (mtime > lastUpdated) lastUpdated = mtime;
    }
    projects.push({ id: proj, fullPath: proj, sessionCount: files.length, lastUpdated });
  }
  return projects.sort((a, b) => b.lastUpdated - a.lastUpdated);
}

export async function getProjectSessions(project, page = 0, pageSize = 20) {
  const pPath = path.join(PROJECTS_DIR, project);
  if (!fs.existsSync(pPath) || !fs.statSync(pPath).isDirectory()) return { data: [], total: 0 };
  let files;
  try { files = fs.readdirSync(pPath).filter(f => f.endsWith('.jsonl')); }
  catch(e) { return { data: [], total: 0 }; }

  const cacheKey = files.map(f => `${f}:${fs.statSync(path.join(pPath, f)).mtimeMs}`).join('|');
  if (_sessionCache[project]?.key === cacheKey) {
    const s = _sessionCache[project].sessions;
    return { data: s.slice(page * pageSize, (page + 1) * pageSize), total: s.length };
  }

  const sessions = [];
  for (const f of files) {
    const sessionId = f.replace('.jsonl', '');
    const filePath = path.join(pPath, f);
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    let firstMessageTs = 0, lastMessageTs = 0;
    let tokIn = 0, tokOut = 0, tokCR = 0, tokCC = 0, turnCount = 0;
    let hasMessages = false, preview = '';
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        const tstamp = new Date(parsed.timestamp).getTime() || 0;
        if (tstamp) { if (!firstMessageTs) firstMessageTs = tstamp; lastMessageTs = tstamp; }
        if (parsed.type === 'user') {
          turnCount++;
          hasMessages = true;
          if (!preview && !parsed.isMeta) {
            const content = parsed.message?.content;
            if (typeof content === 'string' && !content.trimStart().startsWith('<')) {
              preview = content.slice(0, 150).trim();
            } else if (Array.isArray(content)) {
              const hasToolResult = content.some(b => b.type === 'tool_result');
              if (!hasToolResult) {
                const tb = content.find(b => b.type === 'text');
                if (tb?.text) preview = tb.text.slice(0, 150).trim();
              }
            }
          }
        } else if (parsed.type === 'assistant') {
          hasMessages = true;
          const u = parsed.message?.usage;
          if (u) {
            tokIn += u.input_tokens || 0;
            tokOut += u.output_tokens || 0;
            tokCR += u.cache_read_input_tokens || 0;
            tokCC += u.cache_creation_input_tokens || 0;
          }
        } else if (parsed.type === 'attachment' || parsed.type === 'system') {
          hasMessages = true;
        }
      } catch(e) {}
    }

    if (hasMessages) {
      sessions.push({
        id: sessionId,
        project,
        lastUpdated: lastMessageTs || 0,
        firstMessageTs,
        preview,
        tokens: { input: tokIn, output: tokOut, cacheRead: tokCR, cacheCreation: tokCC },
        turnCount,
      });
    }
  }

  sessions.sort((a, b) => b.lastUpdated - a.lastUpdated);
  _sessionCache[project] = { key: cacheKey, sessions };
  return { data: sessions.slice(page * pageSize, (page + 1) * pageSize), total: sessions.length };
}

export async function getSessionMessages(project, sessionId) {
  const filePath = path.join(PROJECTS_DIR, project, `${sessionId}.jsonl`);
  if (!fs.existsSync(filePath)) return [];
  const mtime = fs.statSync(filePath).mtimeMs;
  const cacheKey = `${project}/${sessionId}`;
  if (_messageCache[cacheKey]?.mtime === mtime) return _messageCache[cacheKey].messages;

  const messages = [];
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      const tstamp = new Date(parsed.timestamp).getTime();
      if (parsed.type === 'user') {
        messages.push({ role: 'user', content: parsed.message.content, timestamp: tstamp || 0 });
      } else if (parsed.type === 'assistant') {
        messages.push({ role: 'assistant', content: parsed.message.content, timestamp: tstamp || 0 });
      } else if (parsed.type === 'attachment') {
        messages.push({ role: 'system_attachment', content: parsed.attachment, timestamp: tstamp || 0 });
      } else if (parsed.type === 'system') {
        messages.push({ role: 'system', content: parsed.content, timestamp: tstamp || 0 });
      }
    } catch(e) {}
  }
  _messageCache[cacheKey] = { mtime, messages };
  return messages;
}
