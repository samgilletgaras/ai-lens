import fs from 'fs';
import path from 'path';
import { PI_AGENT_DIR, PI_SESSIONS_DIR } from '../utils.js';
import '../readers/pi/pi-sessions.js';
import '../readers/pi/pi-stats.js';
import '../readers/pi/pi-logs.js';
import '../readers/pi/pi-skills.js';
import '../readers/pi/pi-agents.js';
import '../readers/pi/pi-mcps.js';

export const name = 'Pi';
export const icon = 'Terminal';
export const capabilities = {
  hasHistory: true, hasStats: true, hasLogs: true,
  hasSkills: true, hasAgents: true, hasMcps: true,
  hasMemory: false, hasPlans: false,
};

export const isAvailable = async () => fs.existsSync(PI_SESSIONS_DIR);

// hasMcps is gated on whether the optional community MCP extension is installed
export const extras = async () => ({
  capabilities: {
    ...capabilities,
    hasMcps: fs.existsSync(path.join(PI_AGENT_DIR, 'mcp.json')),
  },
});
