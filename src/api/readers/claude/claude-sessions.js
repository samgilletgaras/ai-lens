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

// ─── Block flattening helpers ─────────────────────────────────────────────────

// Flatten a user message's content (string or Block[]) into normalized events.
function flattenUserContent(content, ts, out) {
  if (typeof content === 'string') {
    // May contain Claude slash-command XML tags
    pushUserText(content, ts, out);
    return;
  }
  if (!Array.isArray(content)) return;
  for (const block of content) {
    if (!block) continue;
    if (block.type === 'tool_result') {
      const text = typeof block.content === 'string'
        ? block.content
        : (Array.isArray(block.content)
            ? block.content.map(b => b?.text ?? '').filter(Boolean).join('\n')
            : '');
      out.push({ role: 'tool_result', content: text, is_error: block.is_error ?? false, tool_use_id: block.tool_use_id, timestamp: ts });
    } else if (block.type === 'text' && block.text) {
      pushUserText(block.text, ts, out);
    }
  }
}

// Parse slash-command XML tags out of a user text block.
// Emits a local_command event and/or a clean user text event.
function pushUserText(text, ts, out) {
  if (!text) return;

  // Extract <local-command-caveat>
  let caveat = null;
  const caveatRe = /<local-command-caveat>([\s\S]*?)<\/local-command-caveat>/g;
  const caveatMatches = [...text.matchAll(caveatRe)];
  if (caveatMatches.length) {
    caveat = caveatMatches.map(m => m[1].trim()).join('\n');
    text = text.replace(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/g, '').trim();
  }

  // Strip <command-args>
  text = text.replace(/<command-args>[\s\S]*?<\/command-args>/g, '').trim();

  // Extract <command-message> (fallback name)
  let cmdMsg = null;
  const cmdMsgRe = /<command-message>([\s\S]*?)<\/command-message>/g;
  const cmdMsgMatches = [...text.matchAll(cmdMsgRe)];
  if (cmdMsgMatches.length) {
    cmdMsg = cmdMsgMatches.map(m => m[1].trim()).join(', ');
    text = text.replace(/<command-message>[\s\S]*?<\/command-message>/g, '').trim();
  }

  // Extract <command-name>
  const cmdNameMatch = text.match(/<command-name>(.*?)<\/command-name>/);
  let cmdName = cmdNameMatch ? cmdNameMatch[1] : (cmdMsg || null);
  if (cmdNameMatch) text = text.replace(/<command-name>.*?<\/command-name>/g, '').trim();

  if (cmdName) out.push({ role: 'local_command', name: cmdName, caveat: caveat ?? undefined, timestamp: ts });
  if (text) out.push({ role: 'user', content: text, timestamp: ts });
}

// Flatten an assistant message's content (string or Block[]) into normalized events.
function flattenAssistantContent(content, ts, out) {
  if (typeof content === 'string') {
    if (content.trim()) out.push({ role: 'assistant', content, timestamp: ts });
    return;
  }
  if (!Array.isArray(content)) return;
  for (const block of content) {
    if (!block) continue;
    if (block.type === 'thinking' && block.thinking) {
      out.push({ role: 'thinking', content: block.thinking, timestamp: ts });
    } else if (block.type === 'text' && block.text?.trim()) {
      out.push({ role: 'assistant', content: block.text, timestamp: ts });
    } else if (block.type === 'tool_use') {
      if (block.name === 'Skill' && block.input?.skill) {
        out.push({ role: 'skill_use', name: block.input.skill, id: block.id, timestamp: ts });
      } else {
        out.push({ role: 'tool_use', name: block.name, input: block.input ?? {}, id: block.id, timestamp: ts });
      }
    }
  }
}

// "Base directory for this skill: /path/..." — injected by the harness as a
// standalone user line whenever a skill is loaded. Three observed patterns:
//
//   A: skill_use → tool_result("Launching skill:…") → skill body
//   B: local_command → skill body  (direct injection, no Skill tool call)
//   C: skill_use → skill body      (no tool_result at all)
//
// All three must collapse into a single skill_use event with the body as content.
const SKILL_BODY_RE = /^Base directory for this skill:/;

function skillSlugFromBody(content) {
  const m = content.split('\n')[0].match(/Base directory for this skill:\s+(\S+)/);
  return m ? m[1].split('/').pop() : null;
}

function mergeSkillEvents(events) {
  // Pass 1 — look-ahead from each skill_use to absorb its tool_result (A) and/or
  // skill body (A, C) in one forward scan. Uses index-based removal to avoid
  // mutating the array mid-iteration.
  const toRemove = new Set();
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (ev.role !== 'skill_use') continue;

    let j = i + 1;
    // Pattern A: skip the matching tool_result immediately after the skill_use
    if (j < events.length && events[j].role === 'tool_result' && events[j].tool_use_id === ev.id) {
      toRemove.add(j);
      j++;
    }
    // Patterns A + C: absorb the skill body that now sits at position j
    if (j < events.length && events[j].role === 'user' &&
        typeof events[j].content === 'string' && SKILL_BODY_RE.test(events[j].content)) {
      ev.content = events[j].content;
      toRemove.add(j);
    }
  }
  const pass1 = events.filter((_, i) => !toRemove.has(i));

  // Pass 2 — handle local_command events.
  // Pattern A (drop): local_command immediately followed by a skill_use means the
  //   command triggered that skill — the skill_use is already the canonical event.
  // Pattern B (convert): local_command immediately followed by a skill body means
  //   direct harness injection with no tool call — synthesise a skill_use from it.
  const result = [];
  for (let i = 0; i < pass1.length; i++) {
    const ev = pass1[i];
    if (ev.role !== 'local_command') { result.push(ev); continue; }

    let j = i + 1;
    while (j < pass1.length && pass1[j].role === 'thinking') j++;

    if (j < pass1.length && pass1[j].role === 'skill_use') {
      continue; // Pattern A: drop, skill_use already there
    }

    if (j < pass1.length && pass1[j].role === 'user' &&
        typeof pass1[j].content === 'string' && SKILL_BODY_RE.test(pass1[j].content)) {
      const slug = skillSlugFromBody(pass1[j].content) ?? (ev.name ?? '').replace(/^\//, '');
      result.push({ role: 'skill_use', name: slug, content: pass1[j].content, timestamp: ev.timestamp });
      i = j;
      continue; // Pattern B: converted
    }

    result.push(ev); // genuine local_command
  }
  return result;
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
      const ts = new Date(p.timestamp).getTime() || 0;
      if (p.type === 'user') flattenUserContent(p.message?.content, ts, messages);
      else if (p.type === 'assistant') flattenAssistantContent(p.message?.content, ts, messages);
      else if (p.type === 'attachment') messages.push({ role: 'system_attachment', content: p.attachment, timestamp: ts });
      else if (p.type === 'system') messages.push({ role: 'system', content: p.content ?? '', timestamp: ts });
    } catch { /* skip */ }
  }
  const merged = mergeSkillEvents(messages);
  _messageCache[key] = { mtime, messages: merged };
  return merged;
}

register('claude', { getProjects, getSessions, getMessages });
