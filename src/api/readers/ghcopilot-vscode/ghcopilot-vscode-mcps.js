import fs from 'fs';
import path from 'path';
import { CACHE_TTL } from '../../utils.js';
import { scanWorkspaces, getUserDirs, registerCacheClear } from './ghcopilot-vscode-sessions.js';
import { register } from '../mcps.js';

let _cache = null, _cacheTime = 0;
registerCacheClear(() => { _cache = null; _cacheTime = 0; });

// Global MCP config lives at User/mcp.json in each VS Code variant (stable +
// Insiders). Merge across variants, deduping by server name (first wins) so the
// same global server defined in both doesn't produce duplicate ids.
function readGlobalServers() {
  const servers = [];
  const seen = new Set();
  for (const userDir of getUserDirs()) {
    const mcpPath = path.join(userDir, 'mcp.json');
    let raw;
    try { raw = JSON.parse(fs.readFileSync(mcpPath, 'utf8')); } catch { continue; }
    const mcpServers = raw?.servers;
    if (!mcpServers || typeof mcpServers !== 'object') continue;
    for (const [name, cfg] of Object.entries(mcpServers)) {
      if (typeof cfg !== 'object' || !cfg || seen.has(name)) continue;
      seen.add(name);
      servers.push({
        id: `global:${name}`,
        name,
        type: 'plugin',
        config: { command: cfg.command ?? null, args: cfg.args ?? null, url: cfg.url ?? null },
        source: mcpPath,
        toolCount: 0, totalCalls: 0, lastUsed: null,
      });
    }
  }
  return servers;
}

function readWorkspaceServers() {
  const servers = [];
  for (const [folderPath] of scanWorkspaces()) {
    const mcpJsonPath = path.join(folderPath, '.vscode', 'mcp.json');
    let raw;
    try { raw = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf8')); } catch { continue; }
    const mcpServers = raw?.servers;
    if (!mcpServers || typeof mcpServers !== 'object') continue;
    const wsName = path.basename(folderPath);
    for (const [name, cfg] of Object.entries(mcpServers)) {
      if (typeof cfg !== 'object' || !cfg) continue;
      servers.push({
        id: `workspace:${wsName}:${name}`,
        name,
        type: cfg.url ? 'cloud' : 'plugin',
        config: { command: cfg.command ?? null, args: cfg.args ?? null, url: cfg.url ?? null },
        source: mcpJsonPath,
        toolCount: 0, totalCalls: 0, lastUsed: null,
      });
    }
  }
  return servers;
}

export async function getMcps(serverId = null) {
  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL) {
    if (serverId) return _cache.find(s => s.id === serverId) ?? null;
    return _cache;
  }

  const all = [...readGlobalServers(), ...readWorkspaceServers()];
  all.sort((a, b) => a.name.localeCompare(b.name));
  _cache = all;
  _cacheTime = now;

  if (serverId) {
    const found = all.find(s => s.id === serverId) ?? null;
    return found ? { ...found, tools: [] } : null;
  }
  return all;
}

register('ghcopilot-vscode', { getMcps });
