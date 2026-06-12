import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { clearAllCaches } from '../readers/ghcopilot-cli/ghcopilot-cli-sessions.js';
import '../readers/ghcopilot-cli/ghcopilot-cli-stats.js';
import '../readers/ghcopilot-cli/ghcopilot-cli-logs.js';
import '../readers/ghcopilot-cli/ghcopilot-cli-mcps.js';
import '../readers/ghcopilot-cli/ghcopilot-cli-agents.js';
import '../readers/ghcopilot-cli/ghcopilot-cli-skills.js';
import '../readers/ghcopilot-cli/ghcopilot-cli-memory.js';

export { clearAllCaches };

export const name = 'GitHub Copilot (CLI)';
export const icon = 'Terminal';
export const capabilities = {
  hasHistory: true, hasStats: true, hasLogs: true, hasSkills: true,
  hasAgents: true, hasMcps: true, hasMemory: true, hasPlans: false,
};

const SESSION_STATE_DIR = path.join(os.homedir(), '.copilot', 'session-state');

export async function isAvailable() {
  try {
    const entries = fs.readdirSync(SESSION_STATE_DIR, { withFileTypes: true });
    return entries.some(e =>
      (e.isFile() && e.name.endsWith('.jsonl')) ||
      (e.isDirectory() && /^[0-9a-f-]{36}$/i.test(e.name))
    );
  } catch { return false; }
}
