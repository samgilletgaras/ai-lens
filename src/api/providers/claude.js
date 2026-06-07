import fs from 'fs';
import { CLAUDE_DIR } from '../utils.js';
import '../readers/claude/claude-sessions.js';
import '../readers/claude/claude-stats.js';
import '../readers/claude/claude-logs.js';
import '../readers/claude/claude-mcps.js';
import '../readers/claude/claude-skills.js';
import '../readers/claude/claude-agents.js';
import '../readers/claude/claude-memory.js';
import '../readers/claude/claude-plans.js';

export const name = 'Claude';
export const icon = 'Sparkles'; // lucide icon name (resolved by name on the frontend)
export const capabilities = {
  hasHistory: true, hasStats: true, hasLogs: true, hasSkills: true,
  hasAgents: true, hasMcps: true, hasMemory: true, hasPlans: true,
};
export const isAvailable = async () => fs.existsSync(CLAUDE_DIR);
