import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { PI_SESSIONS_DIR, CACHE_TTL, isTmp, isWithin } from '../../utils.js';
import { register } from '../stats.js';

let _statsCache = null, _statsCacheTs = 0;
const _projectStatsCache = {};

async function globalStats() {
  const now = Date.now();
  if (_statsCache && now - _statsCacheTs < CACHE_TTL) return _statsCache;

  const empty = {
    totals: { sessions: 0, messages: 0, toolCalls: 0, projects: 0 },
    tokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, cacheHitRate: 0 },
    stopReasons: {}, models: {},
    hooks: { success: 0, failure: 0, avgDurationMs: 0 },
    topTools: [], topProjects: [], activity: {}, estimatedCostUsd: 0,
  };
  if (!fs.existsSync(PI_SESSIONS_DIR)) return empty;

  let sessions = 0, messages = 0, toolCalls = 0;
  let tokInput = 0, tokOutput = 0, tokCacheRead = 0, tokCacheWrite = 0;
  let totalCostUsd = 0;
  const models = {}, toolUsage = {}, activityByDay = {}, projectStats = {};

  for (const projEntry of fs.readdirSync(PI_SESSIONS_DIR, { withFileTypes: true })) {
    if (!projEntry.isDirectory() || isTmp(projEntry.name)) continue;
    const dirPath = path.join(PI_SESSIONS_DIR, projEntry.name);

    let projMessages = 0;
    for (const f of fs.readdirSync(dirPath).filter(n => n.endsWith('.jsonl'))) {
      sessions++;
      let sessionLastTs = 0;

      const rl = readline.createInterface({
        input: fs.createReadStream(path.join(dirPath, f)),
        crlfDelay: Infinity,
      });
      for await (const line of rl) {
        if (!line.trim()) continue;
        let entry;
        try { entry = JSON.parse(line); } catch { continue; }
        if (entry.type !== 'message' || !entry.message) continue;

        const msg = entry.message;
        const ts = entry.timestamp ? new Date(entry.timestamp).getTime() : 0;
        if (ts > sessionLastTs) sessionLastTs = ts;

        if (msg.role === 'user') {
          messages++;
          projMessages++;
        } else if (msg.role === 'assistant') {
          messages++;
          projMessages++;

          if (msg.model) models[msg.model] = (models[msg.model] || 0) + 1;
          if (msg.stopReason) {
            // stopReasons tracked but not surfaced in the standard stats shape
          }

          const u = msg.usage;
          if (u) {
            tokInput    += u.input      || 0;
            tokOutput   += u.output     || 0;
            tokCacheRead  += u.cacheRead  || 0;
            tokCacheWrite += u.cacheWrite || 0;
            if (u.cost?.total) totalCostUsd += u.cost.total;
          }

          if (Array.isArray(msg.content)) {
            for (const block of msg.content) {
              if (block?.type === 'toolCall' && typeof block.name === 'string') {
                toolCalls++;
                toolUsage[block.name] = (toolUsage[block.name] || 0) + 1;
              }
            }
          }
        }
      }

      if (sessionLastTs > 0) {
        const day = new Date(sessionLastTs).toISOString().slice(0, 10);
        activityByDay[day] = (activityByDay[day] || 0) + 1;
      }
    }
    if (projMessages > 0) projectStats[projEntry.name] = projMessages;
  }

  const totalInputSeen = tokInput + tokCacheRead + tokCacheWrite;

  _statsCache = {
    totals: { sessions, messages, toolCalls, projects: Object.keys(projectStats).length },
    tokens: {
      input: tokInput, output: tokOutput,
      cacheRead: tokCacheRead, cacheCreation: tokCacheWrite,
      cacheHitRate: totalInputSeen > 0 ? Math.round((tokCacheRead / totalInputSeen) * 100) : 0,
    },
    stopReasons: {}, models,
    hooks: { success: 0, failure: 0, avgDurationMs: 0 },
    topTools: Object.entries(toolUsage)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([name, count]) => ({ name, count })),
    topProjects: Object.entries(projectStats)
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([id, messageCount]) => ({ id, messageCount, tokenCount: 0 })),
    activity: activityByDay,
    estimatedCostUsd: Math.round(totalCostUsd * 100) / 100,
  };
  _statsCacheTs = now;
  return _statsCache;
}

async function singleProjectStats(project) {
  const dirPath = path.join(PI_SESSIONS_DIR, project);
  if (!isWithin(PI_SESSIONS_DIR, dirPath) || !fs.existsSync(dirPath)) return null;

  let files;
  try { files = fs.readdirSync(dirPath).filter(f => f.endsWith('.jsonl')); }
  catch { return null; }

  const cacheKey = files
    .map(f => `${f}:${fs.statSync(path.join(dirPath, f)).mtimeMs}`)
    .join('|');
  if (_projectStatsCache[project]?.key === cacheKey) return _projectStatsCache[project].stats;

  let sessions = files.length, messages = 0, toolCalls = 0;
  let tokInput = 0, tokOutput = 0, tokCacheRead = 0, tokCacheWrite = 0, totalCostUsd = 0;
  const models = {}, toolUsage = {}, activityByDay = {};

  for (const f of files) {
    let sessionLastTs = 0;

    const rl = readline.createInterface({
      input: fs.createReadStream(path.join(dirPath, f)),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      if (!line.trim()) continue;
      let entry;
      try { entry = JSON.parse(line); } catch { continue; }
      if (entry.type !== 'message' || !entry.message) continue;

      const msg = entry.message;
      const ts = entry.timestamp ? new Date(entry.timestamp).getTime() : 0;
      if (ts > sessionLastTs) sessionLastTs = ts;

      if (msg.role === 'user') {
        messages++;
      } else if (msg.role === 'assistant') {
        messages++;
        if (msg.model) models[msg.model] = (models[msg.model] || 0) + 1;

        const u = msg.usage;
        if (u) {
          tokInput    += u.input      || 0;
          tokOutput   += u.output     || 0;
          tokCacheRead  += u.cacheRead  || 0;
          tokCacheWrite += u.cacheWrite || 0;
          if (u.cost?.total) totalCostUsd += u.cost.total;
        }

        if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block?.type === 'toolCall' && typeof block.name === 'string') {
              toolCalls++;
              toolUsage[block.name] = (toolUsage[block.name] || 0) + 1;
            }
          }
        }
      }
    }

    if (sessionLastTs > 0) {
      const day = new Date(sessionLastTs).toISOString().slice(0, 10);
      activityByDay[day] = (activityByDay[day] || 0) + 1;
    }
  }

  const totalInputSeen = tokInput + tokCacheRead + tokCacheWrite;
  const stats = {
    totals: { sessions, messages, toolCalls },
    tokens: {
      input: tokInput, output: tokOutput,
      cacheRead: tokCacheRead, cacheCreation: tokCacheWrite,
      cacheHitRate: totalInputSeen > 0 ? Math.round((tokCacheRead / totalInputSeen) * 100) : 0,
    },
    stopReasons: {}, models,
    hooks: { success: 0, failure: 0, avgDurationMs: 0 },
    topTools: Object.entries(toolUsage)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([name, count]) => ({ name, count })),
    topProjects: [],
    activity: activityByDay,
    estimatedCostUsd: Math.round(totalCostUsd * 100) / 100,
  };

  _projectStatsCache[project] = { key: cacheKey, stats };
  return stats;
}

async function getStats(project = null) {
  return project ? singleProjectStats(project) : globalStats();
}

register('pi', { getStats });
