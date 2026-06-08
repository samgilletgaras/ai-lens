import fs from 'fs';
import path from 'path';
import { PI_AGENT_DIR, tildeHome } from '../../utils.js';
import { register } from '../mcps.js';

const MCP_JSON_PATH       = path.join(PI_AGENT_DIR, 'mcp.json');
const MCP_CACHE_JSON_PATH = path.join(PI_AGENT_DIR, 'mcp-cache.json');

// Read configured MCP servers from mcp.json and enrich with tool metadata from
// mcp-cache.json. Both files are optional (MCP is a community extension).
async function getMcps(serverId = null) {
  const servers = new Map(); // id → { name, config, tools }

  // Read mcp.json — both common formats use a top-level `mcpServers` object.
  if (fs.existsSync(MCP_JSON_PATH)) {
    try {
      const raw = JSON.parse(fs.readFileSync(MCP_JSON_PATH, 'utf8'));
      const mcpServers = raw.mcpServers || {};
      for (const [id, cfg] of Object.entries(mcpServers)) {
        if (typeof cfg !== 'object' || !cfg) continue;
        servers.set(id, {
          name: id,
          config: { command: cfg.command ?? null, args: cfg.args ?? null, url: cfg.url ?? null },
          tools: [],
        });
      }
    } catch { /* tolerate malformed file */ }
  }

  // Enrich with tool metadata from mcp-cache.json when present.
  if (fs.existsSync(MCP_CACHE_JSON_PATH)) {
    try {
      const raw = JSON.parse(fs.readFileSync(MCP_CACHE_JSON_PATH, 'utf8'));
      for (const [id, info] of Object.entries(raw)) {
        if (typeof info !== 'object' || !info) continue;
        if (!servers.has(id)) servers.set(id, { name: id, config: null, tools: [] });
        const entry = servers.get(id);
        if (Array.isArray(info.tools)) {
          entry.tools = info.tools.map(t => ({
            name: typeof t === 'string' ? t : (t.name ?? String(t)),
            count: 0,
            lastUsed: null,
          }));
        }
      }
    } catch { /* tolerate malformed file */ }
  }

  const result = [];
  for (const [id, info] of servers) {
    if (serverId && id !== serverId) continue;
    const cfg = info.config;
    result.push({
      id,
      name: info.name,
      type: 'plugin',
      config: cfg ? { command: cfg.command, args: cfg.args, url: cfg.url } : null,
      toolCount: info.tools.length,
      totalCalls: 0,
      lastUsed: null,
      source: fs.existsSync(MCP_JSON_PATH) ? tildeHome(MCP_JSON_PATH) : null,
      ...(serverId ? { tools: info.tools } : {}),
    });
  }

  if (serverId) return result[0] || null;
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

register('pi', { getMcps });
