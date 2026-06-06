import path from 'path';
import os from 'os';

export const PORT = process.env.PORT || 3000;
export const CLAUDE_DIR = path.join(os.homedir(), '.claude');
export const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');
export const SKILLS_DIR = path.join(CLAUDE_DIR, 'skills');
export const PLANS_DIR = path.join(CLAUDE_DIR, 'plans');
export const MCP_PLUGINS_DIR = path.join(CLAUDE_DIR, 'plugins/marketplaces/claude-plugins-official/external_plugins');
export const CACHE_TTL = 60_000;

export const MODEL_PRICING = {
  'claude-opus-4': [15, 75], 'claude-3-opus': [15, 75],
  'claude-sonnet-4': [3, 15], 'claude-3-5-sonnet': [3, 15], 'claude-3-sonnet': [3, 15],
  'claude-haiku-4': [0.8, 4], 'claude-3-5-haiku': [0.8, 4], 'claude-3-haiku': [0.25, 1.25],
};

export function isTmp(name) {
  return name === 'tmp' || name.endsWith('-tmp') || name.includes('tmp');
}

export function parseFrontmatter(content) {
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

export function parseQuery(url) {
  const u = new URL(url, 'http://localhost');
  return {
    pathname: u.pathname,
    get: (k, def) => u.searchParams.get(k) ?? def,
  };
}
