import http from 'http';
import { PORT, parseQuery, ALL_PROVIDER } from './utils.js';
import { config } from './config.js';
import * as demo from './demo-data.js';

// Importing providers triggers all reader self-registrations
import * as claudeProvider from './providers/claude.js';
import * as ghcopilotProvider from './providers/ghcopilot-vscode.js';

import * as sessions from './readers/sessions.js';
import * as stats from './readers/stats.js';
import * as logs from './readers/logs.js';
import * as mcps from './readers/mcps.js';
import * as skills from './readers/skills.js';
import * as agents from './readers/agents.js';
import * as memory from './readers/memory.js';
import * as plans from './readers/plans.js';

// To add a new provider: create providers/x.js, import it here, add to PROVIDERS.
const PROVIDERS = {
  claude: claudeProvider,
  'ghcopilot-vscode': ghcopilotProvider,
};

// Default provider when the request omits ?provider= — first registered one.
const DEFAULT_PROVIDER = Object.keys(PROVIDERS)[0];

// CORS allowlist: only the localhost Vite UI origins may read responses.
const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

const server = http.createServer(async (req, res) => {
  // Local-only tool serving private session history: never allow arbitrary
  // origins to read responses. The Vite dev proxy talks to us server-side
  // (not subject to CORS), so this only gates direct browser cross-origin
  // requests — restrict to the localhost UI origins.
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
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

  const providerName = q.get('provider') ?? DEFAULT_PROVIDER;

  if (q.pathname === '/api/health') {
    ok({ data: { ok: true } });
    return;
  }

  if (q.pathname === '/api/config') {
    const providers = [];
    for (const [id, p] of Object.entries(PROVIDERS)) {
      providers.push({ id, name: p.name, icon: p.icon ?? null, capabilities: p.capabilities, available: await p.isAvailable() });
    }
    // Synthesize the "All Providers" meta-provider: union of every provider's
    // capabilities, available if any provider is. Listed first and the default.
    const capKeys = Object.keys(providers[0]?.capabilities ?? {});
    const allEntry = {
      id: ALL_PROVIDER,
      name: 'All Providers',
      icon: 'Boxes',
      capabilities: Object.fromEntries(capKeys.map(k => [k, providers.some(p => p.capabilities[k])])),
      available: providers.some(p => p.available),
    };
    ok({ data: { ...config, providers: [allEntry, ...providers], defaultProvider: ALL_PROVIDER } });
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
      const s = demo.DEMO_SESSIONS[project] || [];
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
      const { data, total } = await logs.getLogs(providerName, page, pageSize);
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
      try { ok({ data: skills.getSkillDetail(providerName, slug, q.get('from', null)) }); } catch(e) { err(e.message); }
      return;
    }
    if (q.get('demo')) { ok({ data: demo.DEMO_SKILLS }); return; }
    try { ok({ data: await skills.getSkills(providerName) }); } catch(e) { err(e.message); }
    return;
  }

  if (q.pathname === '/api/agents') {
    const slug = q.get('slug', null);
    if (slug) {
      if (q.get('demo')) { ok({ data: null }); return; }
      try { ok({ data: agents.getAgentDetail(providerName, slug, q.get('from', null)) }); } catch(e) { err(e.message); }
      return;
    }
    if (q.get('demo')) { ok({ data: [] }); return; }
    try { ok({ data: await agents.getAgents(providerName) }); } catch(e) { err(e.message); }
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
      const data = await mcps.getMcps(providerName, mcpServer || null, q.get('from', null));
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
    try { ok({ data: await memory.getMemory(providerName, project, filename) }); } catch(e) { err(e.message); }
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
    try { ok({ data: await plans.getPlans(providerName, file, q.get('from', null)) }); } catch(e) { err(e.message); }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ data: null, error: 'Not Found' }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Claude Lens CLI backend running on http://127.0.0.1:${PORT}`);
  // Warm up caches for every available provider on startup
  setImmediate(async () => {
    for (const [id, p] of Object.entries(PROVIDERS)) {
      if (!(await p.isAvailable())) continue;
      stats.getStats(id).catch(() => {});
      skills.getSkills(id).catch(() => {});
      mcps.getMcps(id).catch(() => {});
      logs.getLogs(id).catch(() => {});
    }
  });
});
