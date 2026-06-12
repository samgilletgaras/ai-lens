import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseFrontmatter, CACHE_TTL, tildeHome } from '../../utils.js';
import { register } from '../memory.js';
import { registerCacheClear } from './ghcopilot-cli-sessions.js';

// The CLI exposes one user-editable global instructions file:
//   ~/.copilot/copilot-instructions.md — applied to every session
//
// Per-project instructions live in .github/copilot-instructions.md inside each
// repo, but those belong to the project, not ~/.copilot/, so they are out of scope
// under the local-files-only / no-hardcoded-path constraint.

const INSTRUCTIONS_PATH = path.join(os.homedir(), '.copilot', 'copilot-instructions.md');
const GLOBAL_PROJECT = 'Copilot CLI Global';

let _cache = null, _cacheTime = 0;
registerCacheClear(() => { _cache = null; _cacheTime = 0; });

async function getMemory(project = null, filename = null) {
  const key = `${project ?? ''}::${filename ?? ''}`;
  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL) {
    const all = _cache;
    return all.filter(e => (!project || e.project === project) && (!filename || e.filename === filename));
  }

  const out = [];
  if (fs.existsSync(INSTRUCTIONS_PATH)) {
    try {
      const raw = fs.readFileSync(INSTRUCTIONS_PATH, 'utf8');
      const { meta, body } = parseFrontmatter(raw);
      out.push({
        project: GLOBAL_PROJECT,
        filename: 'copilot-instructions.md',
        name: meta.name || 'Copilot Instructions',
        description: meta.description || 'Global instructions applied to every CLI session',
        type: meta.type || null,
        snippet: body.trim().slice(0, 200) || null,
        sourcePath: tildeHome(INSTRUCTIONS_PATH),
        ...(filename === 'copilot-instructions.md' ? { frontmatter: { ...meta }, body } : {}),
      });
    } catch { }
  }

  _cache = out;
  _cacheTime = now;
  return out.filter(e => (!project || e.project === project) && (!filename || e.filename === filename));
}

register('ghcopilot-cli', { getMemory });
