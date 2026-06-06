import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { PROJECTS_DIR, CLAUDE_DIR, MCP_PLUGINS_DIR, CACHE_TTL, isTmp } from '../utils.js';

let _mcpUsageCache = null;
let _mcpUsageCacheTs = 0;

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

export async function scanMcpUsage() {
  if (_mcpUsageCache && Date.now() - _mcpUsageCacheTs < CACHE_TTL) return _mcpUsageCache;
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
  _mcpUsageCache = usage;
  _mcpUsageCacheTs = Date.now();
  return usage;
}

function mcpServerName(serverId) {
  if (serverId.startsWith('claude_ai_')) return serverId.slice(10).replace(/_/g, ' ');
  return serverId.charAt(0).toUpperCase() + serverId.slice(1);
}

export async function getMcps(serverId = null) {
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
    servers.push({
      id, name,
      type: isClaude ? 'cloud' : 'plugin',
      config: cfg ? { command: cfg.command, args: cfg.args, type: cfg.type, url: cfg.url } : null,
      toolCount: toolsArr.length,
      totalCalls: usage ? usage.totalCalls : 0,
      lastUsed: usage ? usage.lastUsed || null : null,
      ...(auth ? { auth } : {}),
      ...(serverId ? { tools: toolsArr } : {}),
    });
  }

  if (serverId) return servers[0] || null;
  return servers.sort((a, b) => b.totalCalls - a.totalCalls || a.name.localeCompare(b.name));
}
