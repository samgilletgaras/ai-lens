import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';

const PORT = process.env.PORT || 3000;
const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');
const SKILLS_DIR = path.join(CLAUDE_DIR, 'skills');
const MCP_PLUGINS_DIR = path.join(CLAUDE_DIR, 'plugins/marketplaces/claude-plugins-official/external_plugins');

function isTmp(name) {
  return name === 'tmp' || name.endsWith('-tmp') || name.includes('tmp');
}

function parseFrontmatter(content) {
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
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      meta[m[1]] = val;
    }
  }
  return { meta, body: lines.slice(endIdx + 1).join('\n').trimStart() };
}

// Fast: uses only file stats, no content reading
async function getProjects() {
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

// Reads one project's JSONL files, returns paginated sessions with messages
async function getProjectSessions(project, page = 0, pageSize = 20) {
  const pPath = path.join(PROJECTS_DIR, project);
  if (!fs.existsSync(pPath) || !fs.statSync(pPath).isDirectory()) {
    return { data: [], total: 0 };
  }

  let files;
  try { files = fs.readdirSync(pPath).filter(f => f.endsWith('.jsonl')); }
  catch(e) { return { data: [], total: 0 }; }

  const sessions = [];
  for (const f of files) {
    const sessionId = f.replace('.jsonl', '');
    const filePath = path.join(pPath, f);
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    const messages = [];
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

    if (messages.length > 0) {
      sessions.push({
        id: sessionId,
        project,
        lastUpdated: messages[messages.length - 1].timestamp || 0,
        messages
      });
    }
  }

  sessions.sort((a, b) => b.lastUpdated - a.lastUpdated);
  const total = sessions.length;
  const data = sessions.slice(page * pageSize, (page + 1) * pageSize);
  return { data, total };
}

// Reads all JSONL files, sorts by timestamp desc, returns one page
async function getLogs(page = 0, pageSize = 10) {
  if (!fs.existsSync(PROJECTS_DIR)) return { data: [], total: 0 };

  const logs = [];
  for (const proj of fs.readdirSync(PROJECTS_DIR)) {
    if (isTmp(proj)) continue;
    const pPath = path.join(PROJECTS_DIR, proj);
    if (!fs.statSync(pPath).isDirectory()) continue;

    let files;
    try { files = fs.readdirSync(pPath).filter(f => f.endsWith('.jsonl')); }
    catch(e) { continue; }

    for (const f of files) {
      const sessionId = f.replace('.jsonl', '');
      const filePath = path.join(pPath, f);
      const fileStream = fs.createReadStream(filePath);
      const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

      let lineNumber = 0;
      for await (const line of rl) {
        lineNumber++;
        if (!line.trim()) continue;
        try {
          const raw = JSON.parse(line);
          logs.push({ project: proj, session: sessionId, lineNumber, raw });
        } catch(e) {}
      }
    }
  }

  logs.sort((a, b) => {
    const ta = typeof a.raw.timestamp === 'string' ? new Date(a.raw.timestamp).getTime() : 0;
    const tb = typeof b.raw.timestamp === 'string' ? new Date(b.raw.timestamp).getTime() : 0;
    return tb - ta;
  });

  const total = logs.length;
  const data = logs.slice(page * pageSize, (page + 1) * pageSize);
  return { data, total };
}

function extractSessionTitle(messages) {
  const firstUser = messages.find(m => m.role === 'user');
  if (!firstUser) return 'New Session';
  let raw = '';
  if (Array.isArray(firstUser.content)) {
    const tb = firstUser.content.find(b => b.type === 'text');
    if (tb) raw = tb.text || '';
  } else if (typeof firstUser.content === 'string') {
    raw = firstUser.content;
  }
  const cmdMatch = raw.match(/<command-message>([\s\S]*?)<\/command-message>/);
  const localCmdMatch = raw.match(/<command-name>(.*?)<\/command-name>/);
  if (localCmdMatch) raw = localCmdMatch[1];
  else if (cmdMatch) raw = cmdMatch[1];
  else raw = raw.replace(/<[\s\S]*?>/g, '').trim();
  raw = raw.split('\n')[0].trim().slice(0, 80);
  return raw || 'New Session';
}

async function searchSessions(query) {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  const ql = query.toLowerCase();
  const results = [];

  outer:
  for (const proj of fs.readdirSync(PROJECTS_DIR)) {
    if (isTmp(proj)) continue;
    const pPath = path.join(PROJECTS_DIR, proj);
    if (!fs.statSync(pPath).isDirectory()) continue;
    let files;
    try { files = fs.readdirSync(pPath).filter(f => f.endsWith('.jsonl')); }
    catch(e) { continue; }

    for (const f of files) {
      if (results.length >= 20) break outer;
      const sessionId = f.replace('.jsonl', '');
      const filePath = path.join(pPath, f);
      const fileStream = fs.createReadStream(filePath);
      const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

      let excerpt = null;
      let lastUpdated = 0;
      const messages = [];

      for await (const line of rl) {
        if (!line.trim()) continue;
        if (!line.toLowerCase().includes(ql)) {
          try {
            const p = JSON.parse(line);
            if (p.timestamp) {
              const t = new Date(p.timestamp).getTime();
              if (t > lastUpdated) lastUpdated = t;
            }
            if (p.type === 'user' || p.type === 'assistant') {
              messages.push({ role: p.type === 'user' ? 'user' : 'assistant', content: p.message?.content || p.content || '', timestamp: lastUpdated });
            }
          } catch(e) {}
          continue;
        }
        try {
          const parsed = JSON.parse(line);
          if (parsed.timestamp) {
            const t = new Date(parsed.timestamp).getTime();
            if (t > lastUpdated) lastUpdated = t;
          }
          if (parsed.type === 'user' || parsed.type === 'assistant') {
            messages.push({ role: parsed.type === 'user' ? 'user' : 'assistant', content: parsed.message?.content || parsed.content || '', timestamp: lastUpdated });
          }
          if (!excerpt) {
            // Try structured extraction first
            const content = (parsed.type === 'user' || parsed.type === 'assistant')
              ? (parsed.message?.content || parsed.content || '')
              : null;
            let text = '';
            if (Array.isArray(content)) {
              for (const block of content) {
                if (block.type === 'text' && block.text) { text = block.text; break; }
                if (block.type === 'tool_use') {
                  const candidate = `${block.name || ''} ${JSON.stringify(block.input || '')}`;
                  if (candidate.toLowerCase().includes(ql)) { text = candidate; break; }
                }
                if (block.type === 'tool_result') {
                  const candidate = typeof block.content === 'string' ? block.content : JSON.stringify(block.content || '');
                  if (candidate.toLowerCase().includes(ql)) { text = candidate; break; }
                }
              }
            } else if (typeof content === 'string') {
              text = content;
            }
            // Fall back to raw line if structured extraction didn't yield the match
            if (!text.toLowerCase().includes(ql)) {
              text = line.replace(/[{}"\\]/g, ' ').replace(/\s+/g, ' ').trim();
            }
            text = text.replace(/<[\s\S]*?>/g, ' ').replace(/\s+/g, ' ').trim();
            const idx = text.toLowerCase().indexOf(ql);
            if (idx !== -1) {
              const start = Math.max(0, idx - 60);
              const end = Math.min(text.length, idx + query.length + 120);
              excerpt = (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
            }
          }
        } catch(e) {}
      }

      if (excerpt) {
        const title = extractSessionTitle(messages);
        results.push({ project: proj, sessionId, title, excerpt, lastUpdated });
      }
    }
  }

  return results.sort((a, b) => b.lastUpdated - a.lastUpdated);
}

async function getStats() {
  if (!fs.existsSync(PROJECTS_DIR)) {
    return {
      totals: { sessions: 0, messages: 0, toolCalls: 0 },
      tokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, cacheHitRate: 0 },
      stopReasons: {},
      models: {},
      hooks: { success: 0, failure: 0, avgDurationMs: 0 },
      topProjects: [],
    };
  }

  let sessions = 0;
  let messages = 0;
  let toolCalls = 0;
  let tokInput = 0, tokOutput = 0, tokCacheRead = 0, tokCacheCreation = 0;
  const stopReasons = {};
  const models = {};
  let hookSuccess = 0, hookFailure = 0, hookDurationTotal = 0, hookCount = 0;
  const projectStats = {};

  for (const proj of fs.readdirSync(PROJECTS_DIR)) {
    if (isTmp(proj)) continue;
    const pPath = path.join(PROJECTS_DIR, proj);
    if (!fs.statSync(pPath).isDirectory()) continue;
    let files;
    try { files = fs.readdirSync(pPath).filter(f => f.endsWith('.jsonl')); }
    catch(e) { continue; }

    sessions += files.length;
    if (!projectStats[proj]) projectStats[proj] = { messageCount: 0, tokenCount: 0 };

    for (const f of files) {
      const filePath = path.join(pPath, f);
      const fileStream = fs.createReadStream(filePath);
      const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
      for await (const line of rl) {
        if (!line.trim()) continue;
        const isAssistant = line.includes('"assistant"');
        const isAttachment = line.includes('"attachment"');
        const isUser = line.includes('"user"');
        if (!isAssistant && !isAttachment && !isUser) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === 'user') {
            messages++;
            projectStats[proj].messageCount++;
          } else if (parsed.type === 'assistant') {
            messages++;
            projectStats[proj].messageCount++;
            const msg = parsed.message;
            if (!msg) continue;
            if (msg.model) models[msg.model] = (models[msg.model] || 0) + 1;
            if (msg.stop_reason) stopReasons[msg.stop_reason] = (stopReasons[msg.stop_reason] || 0) + 1;
            const u = msg.usage;
            if (u) {
              const inp = u.input_tokens || 0;
              const out = u.output_tokens || 0;
              const cr = u.cache_read_input_tokens || 0;
              const cc = u.cache_creation_input_tokens || 0;
              tokInput += inp;
              tokOutput += out;
              tokCacheRead += cr;
              tokCacheCreation += cc;
              projectStats[proj].tokenCount += inp + out;
            }
            if (Array.isArray(msg.content)) {
              for (const block of msg.content) {
                if (block?.type === 'tool_use') toolCalls++;
              }
            }
          } else if (parsed.type === 'attachment') {
            const att = parsed.attachment;
            if (!att) continue;
            if (att.type === 'hook_success') {
              hookSuccess++;
              if (typeof att.durationMs === 'number') {
                hookDurationTotal += att.durationMs;
                hookCount++;
              }
            } else if (att.type === 'hook_failure') {
              hookFailure++;
            }
          }
        } catch(e) {}
      }
    }
  }

  const totalCacheTokens = tokInput + tokCacheRead + tokCacheCreation;
  const cacheHitRate = totalCacheTokens > 0 ? Math.round((tokCacheRead / totalCacheTokens) * 100) : 0;

  const topProjects = Object.entries(projectStats)
    .sort((a, b) => b[1].messageCount - a[1].messageCount)
    .slice(0, 5)
    .map(([id, s]) => ({ id, messageCount: s.messageCount, tokenCount: s.tokenCount }));

  return {
    totals: { sessions, messages, toolCalls },
    tokens: { input: tokInput, output: tokOutput, cacheRead: tokCacheRead, cacheCreation: tokCacheCreation, cacheHitRate },
    stopReasons,
    models,
    hooks: {
      success: hookSuccess,
      failure: hookFailure,
      avgDurationMs: hookCount > 0 ? Math.round(hookDurationTotal / hookCount) : 0,
    },
    topProjects,
  };
}

async function scanSkillUsage() {
  const usage = {};
  if (!fs.existsSync(PROJECTS_DIR)) return usage;
  for (const proj of fs.readdirSync(PROJECTS_DIR)) {
    if (isTmp(proj)) continue;
    const pPath = path.join(PROJECTS_DIR, proj);
    if (!fs.statSync(pPath).isDirectory()) continue;
    let files;
    try { files = fs.readdirSync(pPath).filter(f => f.endsWith('.jsonl')); }
    catch(e) { continue; }
    for (const f of files) {
      const filePath = path.join(pPath, f);
      const fileStream = fs.createReadStream(filePath);
      const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
      for await (const line of rl) {
        if (!line.includes('"Skill"')) continue;
        try {
          const parsed = JSON.parse(line);
          const tstamp = parsed.timestamp ? new Date(parsed.timestamp).getTime() : 0;
          const content = parsed.message?.content;
          if (!Array.isArray(content)) continue;
          for (const block of content) {
            if (block?.type !== 'tool_use' || block.name !== 'Skill') continue;
            const slug = block.input?.skill;
            if (typeof slug !== 'string' || !slug) continue;
            if (!usage[slug]) usage[slug] = { totalCalls: 0, lastUsed: 0 };
            usage[slug].totalCalls++;
            if (tstamp > usage[slug].lastUsed) usage[slug].lastUsed = tstamp;
          }
        } catch(e) {}
      }
    }
  }
  return usage;
}

async function getSkills() {
  if (!fs.existsSync(SKILLS_DIR)) return [];

  const [usageMap] = await Promise.all([scanSkillUsage()]);

  const skills = [];
  for (const entry of fs.readdirSync(SKILLS_DIR)) {
    const entryPath = path.join(SKILLS_DIR, entry);
    if (!fs.statSync(entryPath).isDirectory()) continue;

    const skillMdPath = path.join(entryPath, 'SKILL.md');
    let description = null;
    let hasSkillMd = false;
    let trigger = null;

    if (fs.existsSync(skillMdPath)) {
      hasSkillMd = true;
      const content = fs.readFileSync(skillMdPath, 'utf8');
      const { meta, body } = parseFrontmatter(content);
      if (meta.description) {
        description = meta.description.slice(0, 200);
      } else {
        for (const line of body.split('\n')) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            description = trimmed.slice(0, 200);
            break;
          }
        }
      }
      if (meta.trigger) trigger = meta.trigger;
    }

    const name = entry.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const u = usageMap[entry];
    skills.push({
      slug: entry,
      name,
      description,
      hasSkillMd,
      trigger,
      totalCalls: u ? u.totalCalls : 0,
      lastUsed: u ? u.lastUsed || null : null,
    });
  }

  return skills.sort((a, b) => b.totalCalls - a.totalCalls || a.slug.localeCompare(b.slug));
}

function getMcpPluginConfigs() {
  const configs = {};
  if (!fs.existsSync(MCP_PLUGINS_DIR)) return configs;
  for (const dir of fs.readdirSync(MCP_PLUGINS_DIR)) {
    const mcpJsonPath = path.join(MCP_PLUGINS_DIR, dir, '.mcp.json');
    if (!fs.existsSync(mcpJsonPath)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf8'));
      const servers = raw.mcpServers || raw;
      for (const [serverId, cfg] of Object.entries(servers)) {
        if (typeof cfg !== 'object' || !cfg) continue;
        configs[serverId] = { command: cfg.command, args: cfg.args, type: cfg.type, url: cfg.url, dirName: dir };
      }
    } catch(e) {}
  }
  return configs;
}

async function scanMcpUsage() {
  const usage = {};
  if (!fs.existsSync(PROJECTS_DIR)) return usage;
  for (const proj of fs.readdirSync(PROJECTS_DIR)) {
    if (isTmp(proj)) continue;
    const pPath = path.join(PROJECTS_DIR, proj);
    if (!fs.statSync(pPath).isDirectory()) continue;
    let files;
    try { files = fs.readdirSync(pPath).filter(f => f.endsWith('.jsonl')); }
    catch(e) { continue; }
    for (const f of files) {
      const filePath = path.join(pPath, f);
      const fileStream = fs.createReadStream(filePath);
      const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
      for await (const line of rl) {
        if (!line.includes('"mcp__')) continue;
        try {
          const parsed = JSON.parse(line);
          const tstamp = parsed.timestamp ? new Date(parsed.timestamp).getTime() : 0;
          const content = parsed.message?.content;
          if (!Array.isArray(content)) continue;
          for (const block of content) {
            if (block?.type !== 'tool_use') continue;
            const name = block.name;
            if (typeof name !== 'string' || !name.startsWith('mcp__')) continue;
            const withoutPrefix = name.slice(5);
            const sep = withoutPrefix.indexOf('__');
            if (sep === -1) continue;
            const serverId = withoutPrefix.slice(0, sep);
            const toolName = withoutPrefix.slice(sep + 2);
            if (!usage[serverId]) usage[serverId] = { tools: {}, totalCalls: 0, lastUsed: 0 };
            const entry = usage[serverId];
            entry.totalCalls++;
            if (tstamp > entry.lastUsed) entry.lastUsed = tstamp;
            if (!entry.tools[toolName]) entry.tools[toolName] = { count: 0, lastUsed: 0 };
            entry.tools[toolName].count++;
            if (tstamp > entry.tools[toolName].lastUsed) entry.tools[toolName].lastUsed = tstamp;
          }
        } catch(e) {}
      }
    }
  }
  return usage;
}

function mcpServerName(serverId) {
  if (serverId.startsWith('claude_ai_')) return serverId.slice(10).replace(/_/g, ' ');
  return serverId.charAt(0).toUpperCase() + serverId.slice(1);
}

async function getMcps(serverId = null) {
  const [pluginConfigs, usageMap] = await Promise.all([
    Promise.resolve(getMcpPluginConfigs()),
    scanMcpUsage(),
  ]);

  const authCache = {};
  const authCachePath = path.join(CLAUDE_DIR, 'mcp-needs-auth-cache.json');
  if (fs.existsSync(authCachePath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(authCachePath, 'utf8'));
      for (const [k, v] of Object.entries(raw)) authCache[k] = v;
    } catch(e) {}
  }

  const serverIds = new Set([...Object.keys(pluginConfigs), ...Object.keys(usageMap)]);
  const servers = [];
  for (const id of serverIds) {
    if (serverId && id !== serverId) continue;
    const cfg = pluginConfigs[id] || null;
    const usage = usageMap[id] || null;
    const isClaude = id.startsWith('claude_ai_');
    const name = mcpServerName(id);
    const authKey = isClaude ? `claude.ai ${name}` : null;
    const auth = authKey && authCache[authKey]
      ? { authenticated: true, timestamp: authCache[authKey].timestamp }
      : undefined;
    const toolsArr = usage
      ? Object.entries(usage.tools)
          .map(([n, t]) => ({ name: n, count: t.count, lastUsed: t.lastUsed || null }))
          .sort((a, b) => b.count - a.count)
      : [];
    const entry = {
      id,
      name,
      type: isClaude ? 'cloud' : 'plugin',
      config: cfg ? { command: cfg.command, args: cfg.args, type: cfg.type, url: cfg.url } : null,
      toolCount: toolsArr.length,
      totalCalls: usage ? usage.totalCalls : 0,
      lastUsed: usage ? usage.lastUsed || null : null,
      ...(auth ? { auth } : {}),
      ...(serverId ? { tools: toolsArr } : {}),
    };
    servers.push(entry);
  }

  if (serverId) return servers[0] || null;
  return servers.sort((a, b) => b.totalCalls - a.totalCalls || a.name.localeCompare(b.name));
}

function parseQuery(url) {
  const u = new URL(url, 'http://localhost');
  return {
    pathname: u.pathname,
    get: (k, def) => u.searchParams.get(k) ?? def
  };
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const q = parseQuery(req.url);
  const ok = (payload) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: null, ...payload }));
  };
  const err = (msg) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: null, error: msg }));
  };

  if (req.method !== 'GET') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: null, error: 'Not Found' }));
    return;
  }

  if (q.pathname === '/api/health') {
    ok({ data: 'ok' });
    return;
  }

  if (q.pathname === '/api/skills') {
    const slug = q.get('slug', null);
    if (slug) {
      try {
        const entryPath = path.join(SKILLS_DIR, slug);
        const skillMdPath = path.join(entryPath, 'SKILL.md');
        const hasSkillMd = fs.existsSync(skillMdPath);
        const name = slug.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        let frontmatter = {};
        let body = null;
        if (hasSkillMd) {
          const content = fs.readFileSync(skillMdPath, 'utf8');
          const parsed = parseFrontmatter(content);
          frontmatter = parsed.meta;
          body = parsed.body;
        }
        ok({ data: { slug, name, hasSkillMd, frontmatter, body } });
      } catch(e) { err(e.message); }
      return;
    }
    try { ok({ data: await getSkills() }); }
    catch(e) { err(e.message); }
    return;
  }

  if (q.pathname === '/api/projects') {
    try { ok({ data: await getProjects() }); }
    catch(e) { err(e.message); }
    return;
  }

  if (q.pathname === '/api/history') {
    const project = q.get('project', null);
    if (!project) { err('project param required'); return; }
    const page = Math.max(0, parseInt(q.get('page', '0')));
    const pageSize = Math.max(1, parseInt(q.get('pageSize', '20')));
    try {
      const { data, total } = await getProjectSessions(project, page, pageSize);
      ok({ data, total, page, pageSize });
    } catch(e) { err(e.message); }
    return;
  }

  if (q.pathname === '/api/logs') {
    const page = Math.max(0, parseInt(q.get('page', '0')));
    const pageSize = Math.max(1, parseInt(q.get('pageSize', '10')));
    try {
      const { data, total } = await getLogs(page, pageSize);
      ok({ data, total, page, pageSize });
    } catch(e) { err(e.message); }
    return;
  }

  if (q.pathname === '/api/session') {
    const project = q.get('project', null);
    const sessionId = q.get('id', null);
    if (!project || !sessionId) { err('project and id params required'); return; }
    try {
      const filePath = path.join(PROJECTS_DIR, project, `${sessionId}.jsonl`);
      if (!fs.existsSync(filePath)) { err('Session not found'); return; }
      const messages = [];
      const fileStream = fs.createReadStream(filePath);
      const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
      for await (const line of rl) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          const tstamp = parsed.timestamp ? new Date(parsed.timestamp).getTime() : 0;
          if (parsed.type === 'user') messages.push({ role: 'user', content: parsed.message.content, timestamp: tstamp });
          else if (parsed.type === 'assistant') messages.push({ role: 'assistant', content: parsed.message.content, timestamp: tstamp });
          else if (parsed.type === 'attachment') messages.push({ role: 'system_attachment', content: parsed.attachment, timestamp: tstamp });
          else if (parsed.type === 'system') messages.push({ role: 'system', content: parsed.content, timestamp: tstamp });
        } catch(e) {}
      }
      const lastUpdated = messages.length > 0 ? messages[messages.length - 1].timestamp : 0;
      ok({ data: { id: sessionId, project, lastUpdated, messages } });
    } catch(e) { err(e.message); }
    return;
  }

  if (q.pathname === '/api/search') {
    const query = q.get('q', '').trim();
    if (query.length < 2) { ok({ data: [] }); return; }
    try { ok({ data: await searchSessions(query) }); }
    catch(e) { err(e.message); }
    return;
  }

  if (q.pathname === '/api/stats') {
    try { ok({ data: await getStats() }); }
    catch(e) { err(e.message); }
    return;
  }

  if (q.pathname === '/api/mcps') {
    const server = q.get('server', null);
    try {
      const data = await getMcps(server || null);
      if (server && !data) { err('Server not found'); return; }
      ok({ data });
    } catch(e) { err(e.message); }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ data: null, error: 'Not Found' }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Claude Lens CLI backend running on http://127.0.0.1:${PORT}`);
});
