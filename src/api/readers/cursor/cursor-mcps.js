import fs from 'fs';
import path from 'path';
import { CURSOR_PROJECTS_DIR, CURSOR_DATA_DIR, isTmp, tildeHome } from '../../utils.js';
import { register } from '../mcps.js';

// Collect all unique MCP servers from per-project SERVER_METADATA.json files.
// Also reads the global ~/.cursor/mcp.json for additional config.
async function getMcps(serverId = null) {
  const servers = new Map(); // serverIdentifier → { serverName, projects: Set }

  // Scan per-project MCP directories
  if (fs.existsSync(CURSOR_PROJECTS_DIR)) {
    for (const projEntry of fs.readdirSync(CURSOR_PROJECTS_DIR, { withFileTypes: true })) {
      if (!projEntry.isDirectory() || isTmp(projEntry.name)) continue;
      const mcpsDir = path.join(CURSOR_PROJECTS_DIR, projEntry.name, 'mcps');
      if (!fs.existsSync(mcpsDir)) continue;
      for (const serverEntry of fs.readdirSync(mcpsDir, { withFileTypes: true })) {
        if (!serverEntry.isDirectory()) continue;
        const metaPath = path.join(mcpsDir, serverEntry.name, 'SERVER_METADATA.json');
        if (!fs.existsSync(metaPath)) continue;
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          const id = meta.serverIdentifier;
          if (!id) continue;
          if (!servers.has(id)) servers.set(id, { serverName: meta.serverName || id, projects: new Set() });
          servers.get(id).projects.add(projEntry.name);
        } catch { continue; }
      }
    }
  }

  // Merge global ~/.cursor/mcp.json
  const globalMcpPath = path.join(CURSOR_DATA_DIR, 'mcp.json');
  if (fs.existsSync(globalMcpPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(globalMcpPath, 'utf8'));
      const mcpServers = raw.mcpServers || {};
      for (const [id, cfg] of Object.entries(mcpServers)) {
        if (typeof cfg !== 'object' || !cfg) continue;
        if (!servers.has(id)) servers.set(id, { serverName: id, projects: new Set(), globalConfig: cfg });
        else servers.get(id).globalConfig = cfg;
      }
    } catch { /* ignore malformed */ }
  }

  const result = [];
  for (const [id, info] of servers) {
    if (serverId && id !== serverId) continue;
    const cfg = info.globalConfig || null;
    const entry = {
      id,
      name: info.serverName,
      type: 'plugin',
      config: cfg ? { command: cfg.command, args: cfg.args, type: cfg.type, url: cfg.url } : null,
      toolCount: 0,
      totalCalls: 0,
      lastUsed: null,
      source: info.globalConfig ? tildeHome(globalMcpPath) : null,
      ...(serverId ? { tools: [] } : {}),
    };
    result.push(entry);
  }

  if (serverId) return result[0] || null;
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

register('cursor', { getMcps });
