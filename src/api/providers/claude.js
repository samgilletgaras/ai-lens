import fs from 'fs';
import { CLAUDE_DIR } from '../utils.js';
import '../readers/claude/claude-sessions.js';
import '../readers/claude/claude-stats.js';

export const capabilities = {
  hasHistory: true, hasStats: true, hasLogs: true,
  hasSkills: true, hasMcps: true, hasMemory: true, hasPlans: true,
};

export const isAvailable = async () => fs.existsSync(CLAUDE_DIR);
