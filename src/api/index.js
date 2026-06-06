import http from 'http';
import fs from 'fs';
import { PORT, CLAUDE_DIR, parseQuery } from './utils.js';
import { config } from './config.js';
import * as demo from './demo-data.js';
import * as claudeProvider from './providers/claude.js';
import * as ghcopilotProvider from './providers/ghcopilot.js';
import * as sessions from './readers/sessions.js';
import * as stats from './readers/stats.js';
import { getLogs } from './readers/logs.js';
import { scanSkillUsage, getSkills, getSkillDetail } from './readers/skills.js';
import { scanMcpUsage, getMcps } from './readers/mcps.js';
import { getMemory } from './readers/memory.js';
import { getPlans } from './readers/plans.js';

const PROVIDERS = { claude: claudeProvider, ghcopilot: ghcopilotProvider };

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

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

  const providerName = q.get('provider') ?? 'claude';

  if (q.pathname === '/api/health') {
    const availability = {};
    for (const [name, p] of Object.entries(PROVIDERS)) {
      const key = 'has' + name.charAt(0).toUpperCase() + name.slice(1) + 'Dir';
      availability[key] = await p.isAvailable();
    }
    ok({ data: { ok: true, ...availability } });
    return;
  }

  if (q.pathname === '/api/config') {
    ok({ data: config });
    return;
  }

  if (q.pathname === '/api/projects') {
    if (q.get('demo')) { ok({ data: demo.DEMO_PROJECTS }); return; }
    try { ok({ data: await sessions.getProjects(providerName) }); } catch(e) { err(e.message); }
    return;
  }

  if (q.pathname === '/api/history') {
    const project = q.get('project', null);
    if (!project) { err('project param required'); return; }
    if (q.get('demo')) {
      const pool = demo.DEMO_SESSIONS;
      const s = pool[project] || [];
      ok({ data: s, total: s.length, page: 0, pageSize: s.length });
      return;
    }
    const page = Math.max(0, parseInt(q.get('page', '0')));
    const pageSize = Math.max(1, parseInt(q.get('pageSize', '20')));
    try {
      const { data, total } = await sessions.getSessions(providerName, project, page, pageSize);
      ok({ data, total, page, pageSize });
    } catch(e) { err(e.message); }
    return;
  }

  if (q.pathname === '/api/messages') {
    const project = q.get('project', null);
    const session = q.get('session', null);
    if (!project || !session) { err('project and session params required'); return; }
    if (q.get('demo')) { ok({ data: demo.DEMO_MESSAGES[session] || [] }); return; }
    try { ok({ data: await sessions.getMessages(providerName, project, session) }); } catch(e) { err(e.message); }
    return;
  }

  if (q.pathname === '/api/logs') {
    const page = Math.max(0, parseInt(q.get('page', '0')));
    const pageSize = Math.max(1, parseInt(q.get('pageSize', '10')));
    if (q.get('demo')) {
      const all = demo.DEMO_LOGS.data;
      ok({ data: all.slice(page * pageSize, (page + 1) * pageSize), total: demo.DEMO_LOGS.total, page, pageSize });
      return;
    }
    try {
      const { data, total } = await getLogs(page, pageSize);
      ok({ data, total, page, pageSize });
    } catch(e) { err(e.message); }
    return;
  }

  if (q.pathname === '/api/stats') {
    const project = q.get('project', null);
    if (q.get('demo')) {
      if (project) {
        const s = demo.DEMO_PROJECT_STATS[project];
        s ? ok({ data: s }) : err('Demo project not found');
      } else {
        ok({ data: demo.DEMO_STATS });
      }
      return;
    }
    try {
      const data = await stats.getStats(providerName, project);
      if (project && !data) { err('Project not found'); return; }
      ok({ data });
    } catch(e) { err(e.message); }
    return;
  }

  if (q.pathname === '/api/skills') {
    const slug = q.get('slug', null);
    if (slug) {
      if (q.get('demo')) { const d = demo.DEMO_SKILL_DETAIL[slug]; d ? ok({ data: d }) : err('Demo skill not found'); return; }
      try { ok({ data: getSkillDetail(slug) }); } catch(e) { err(e.message); }
      return;
    }
    if (q.get('demo')) { ok({ data: demo.DEMO_SKILLS }); return; }
    try { ok({ data: await getSkills() }); } catch(e) { err(e.message); }
    return;
  }

  if (q.pathname === '/api/mcps') {
    const mcpServer = q.get('server', null);
    if (q.get('demo')) {
      if (mcpServer) {
        const d = demo.DEMO_MCP_DETAIL[mcpServer];
        d ? ok({ data: d }) : err('Demo MCP server not found');
      } else {
        ok({ data: demo.DEMO_MCPS });
      }
      return;
    }
    try {
      const data = await getMcps(mcpServer || null);
      if (mcpServer && !data) { err('Server not found'); return; }
      ok({ data });
    } catch(e) { err(e.message); }
    return;
  }

  if (q.pathname === '/api/memory') {
    const project = q.get('project', null);
    const filename = q.get('file', null);
    if (q.get('demo')) {
      if (project && filename) {
        const d = demo.DEMO_MEMORY_DETAIL.find(e => e.project === project && e.filename === filename);
        ok({ data: d ? [d] : [] });
      } else {
        const entries = project ? demo.DEMO_MEMORY.filter(e => e.project === project) : demo.DEMO_MEMORY;
        ok({ data: entries });
      }
      return;
    }
    try { ok({ data: await getMemory(project, filename) }); } catch(e) { err(e.message); }
    return;
  }

  if (q.pathname === '/api/plans') {
    const file = q.get('file', null);
    if (q.get('demo')) {
      if (file) {
        const p = demo.DEMO_PLANS.find(p => p.filename === file);
        ok({ data: p ? [{ ...p, body: demo.DEMO_PLAN_BODY[file] ?? '' }] : [] });
      } else {
        ok({ data: demo.DEMO_PLANS });
      }
      return;
    }
    try { ok({ data: await getPlans(file) }); } catch(e) { err(e.message); }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ data: null, error: 'Not Found' }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Claude Lens CLI backend running on http://127.0.0.1:${PORT}`);
  setImmediate(() => {
    stats.getStats('claude').catch(() => {});
    scanSkillUsage().catch(() => {});
    scanMcpUsage().catch(() => {});
    getLogs().catch(() => {});
  });
});
