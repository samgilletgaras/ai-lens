import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { CACHE_TTL } from '../../utils.js';
import { register } from '../mcps.js';

// ~/.copilot/mcp-config.json — user-level MCP servers for the CLI.
// The format is { servers: { name: { type, command, args, url, … } } },
// mirroring the VS Code mcp.json shape.
const MCP_CONFIG_PATH = path.join(os.homedir(), '.copilot', 'mcp-config.json');

let _cache = null, _cacheTime = 0;

function readServers() {
  let raw;
  try { raw = JSON.parse(fs.readFileSync(MCP_CONFIG_PATH, 'utf8')); } catch { return []; }
  const servers = raw?.servers;
  if (!servers || typeof servers !== 'object') return [];
  return Object.entries(servers).map(([name, cfg]) => ({
    id: `cli:${name}`,
    name,
    type: cfg.url ? 'cloud' : 'plugin',
    config: { command: cfg.command ?? null, args: cfg.args ?? null, url: cfg.url ?? null },
    source: MCP_CONFIG_PATH,
    toolCount: 0, totalCalls: 0, lastUsed: null,
  }));
}

async function getMcps(serverId = null) {
  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL) {
    if (serverId) return _cache.find(s => s.id === serverId) ?? null;
    return _cache;
  }
  const all = readServers().sort((a, b) => a.name.localeCompare(b.name));
  _cache = all;
  _cacheTime = now;
  if (serverId) return all.find(s => s.id === serverId) ?? null;
  return all;
}

register('ghcopilot-cli', { getMcps });
