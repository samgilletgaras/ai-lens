import fs from 'fs';
import { CURSOR_DATA_DIR } from '../utils.js';
import '../readers/cursor/cursor-sessions.js';
import '../readers/cursor/cursor-stats.js';
import '../readers/cursor/cursor-skills.js';
import '../readers/cursor/cursor-mcps.js';
import '../readers/cursor/cursor-plans.js';
import '../readers/cursor/cursor-agents.js';

export const name = 'Cursor';
export const icon = 'MousePointer2';
export const capabilities = {
  hasHistory: true, hasStats: true, hasLogs: false,
  hasSkills: true, hasAgents: true, hasMcps: true,
  hasMemory: false, hasPlans: true,
};
export const isAvailable = async () => fs.existsSync(CURSOR_DATA_DIR);
