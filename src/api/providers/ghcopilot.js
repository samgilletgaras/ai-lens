import fs from 'fs';
import { getCandidateDirs } from '../readers/ghcopilot/ghcopilot-sessions.js';
import '../readers/ghcopilot/ghcopilot-stats.js';

export const capabilities = {
  hasHistory: true, hasStats: true, hasLogs: false,
  hasSkills: false, hasMcps: false, hasMemory: false, hasPlans: false,
};

export async function isAvailable() {
  for (const wsDir of getCandidateDirs()) {
    let entries;
    try { entries = fs.readdirSync(wsDir, { withFileTypes: true }); }
    catch { continue; }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const tDir = `${wsDir}/${entry.name}/GitHub.copilot-chat/transcripts`;
      try { if (fs.statSync(tDir).isDirectory()) return true; }
      catch { /* not found */ }
    }
  }
  return false;
}
