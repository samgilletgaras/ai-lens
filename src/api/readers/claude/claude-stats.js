import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { PROJECTS_DIR, CACHE_TTL, MODEL_PRICING, isTmp, isWithin } from '../../utils.js';
import { register } from '../stats.js';

let _statsCache = null, _statsCacheTs = 0;
const _projectStatsCache = {};

function calcCost(tokensByModel) {
  let cost = 0;
  for (const [model, toks] of Object.entries(tokensByModel)) {
    const k = Object.keys(MODEL_PRICING).find(k => model.includes(k));
    const [iRate, oRate] = k ? MODEL_PRICING[k] : [3, 15];
    cost += (toks.input / 1e6) * iRate + (toks.output / 1e6) * oRate;
  }
  return Math.round(cost * 100) / 100;
}

async function globalStats() {
  if (_statsCache && Date.now() - _statsCacheTs < CACHE_TTL) return _statsCache;
  if (!fs.existsSync(PROJECTS_DIR)) return { totals: { sessions: 0, messages: 0, toolCalls: 0 }, tokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, cacheHitRate: 0 }, stopReasons: {}, models: {}, hooks: { success: 0, failure: 0, avgDurationMs: 0 }, topProjects: [], activity: {}, estimatedCostUsd: 0 };

  let sessions = 0, messages = 0, toolCalls = 0, tokInput = 0, tokOutput = 0, tokCacheRead = 0, tokCacheCreation = 0;
  const stopReasons = {}, models = {}, toolUsage = {}, projectStats = {}, activityByDay = {}, tokensByModel = {};
  let hookSuccess = 0, hookFailure = 0, hookDurationTotal = 0, hookCount = 0;

  for (const proj of fs.readdirSync(PROJECTS_DIR)) {
    if (isTmp(proj)) continue;
    const pPath = path.join(PROJECTS_DIR, proj);
    if (!fs.statSync(pPath).isDirectory()) continue;
    let files; try { files = fs.readdirSync(pPath).filter(f => f.endsWith('.jsonl')); } catch { continue; }
    sessions += files.length;
    if (!projectStats[proj]) projectStats[proj] = { messageCount: 0, tokenCount: 0 };
    for (const f of files) {
      const rl = readline.createInterface({ input: fs.createReadStream(path.join(pPath, f)), crlfDelay: Infinity });
      let sessionLastTs = 0;
      for await (const line of rl) {
        if (!line.trim() || (!line.includes('"assistant"') && !line.includes('"attachment"') && !line.includes('"user"'))) continue;
        try {
          const p = JSON.parse(line);
          if (p.timestamp) { const t = new Date(p.timestamp).getTime(); if (t > sessionLastTs) sessionLastTs = t; }
          if (p.type === 'user') { messages++; projectStats[proj].messageCount++; }
          else if (p.type === 'assistant') {
            messages++; projectStats[proj].messageCount++;
            const msg = p.message; if (!msg) continue;
            if (msg.model) models[msg.model] = (models[msg.model] || 0) + 1;
            if (msg.stop_reason) stopReasons[msg.stop_reason] = (stopReasons[msg.stop_reason] || 0) + 1;
            const u = msg.usage;
            if (u) {
              const [inp, out, cr, cc] = [u.input_tokens || 0, u.output_tokens || 0, u.cache_read_input_tokens || 0, u.cache_creation_input_tokens || 0];
              tokInput += inp; tokOutput += out; tokCacheRead += cr; tokCacheCreation += cc; projectStats[proj].tokenCount += inp + out;
              if (msg.model) { if (!tokensByModel[msg.model]) tokensByModel[msg.model] = { input: 0, output: 0 }; tokensByModel[msg.model].input += inp; tokensByModel[msg.model].output += out; }
            }
            if (Array.isArray(msg.content)) for (const b of msg.content) if (b?.type === 'tool_use') { toolCalls++; const n = b.name || 'unknown'; toolUsage[n] = (toolUsage[n] || 0) + 1; }
          } else if (p.type === 'attachment') {
            const att = p.attachment; if (!att) continue;
            if (att.type === 'hook_success') { hookSuccess++; if (typeof att.durationMs === 'number') { hookDurationTotal += att.durationMs; hookCount++; } }
            else if (att.type === 'hook_failure') hookFailure++;
          }
        } catch { /* skip */ }
      }
      if (sessionLastTs > 0) { const d = new Date(sessionLastTs).toISOString().slice(0, 10); activityByDay[d] = (activityByDay[d] || 0) + 1; }
    }
  }

  const total = tokInput + tokCacheRead + tokCacheCreation;
  _statsCache = {
    totals: { sessions, messages, toolCalls, projects: Object.keys(projectStats).length },
    tokens: { input: tokInput, output: tokOutput, cacheRead: tokCacheRead, cacheCreation: tokCacheCreation, cacheHitRate: total > 0 ? Math.round((tokCacheRead / total) * 100) : 0 },
    stopReasons, models,
    topTools: Object.entries(toolUsage).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count })),
    hooks: { success: hookSuccess, failure: hookFailure, avgDurationMs: hookCount > 0 ? Math.round(hookDurationTotal / hookCount) : 0 },
    topProjects: Object.entries(projectStats).sort((a, b) => b[1].messageCount - a[1].messageCount).slice(0, 5).map(([id, s]) => ({ id, messageCount: s.messageCount, tokenCount: s.tokenCount })),
    activity: activityByDay, estimatedCostUsd: calcCost(tokensByModel),
  };
  _statsCacheTs = Date.now();
  return _statsCache;
}

async function projectStats(project) {
  const pPath = path.join(PROJECTS_DIR, project);
  if (!isWithin(PROJECTS_DIR, pPath)) return null;
  if (!fs.existsSync(pPath) || !fs.statSync(pPath).isDirectory()) return null;
  let files; try { files = fs.readdirSync(pPath).filter(f => f.endsWith('.jsonl')); } catch { return null; }

  const cacheKey = files.map(f => `${f}:${fs.statSync(path.join(pPath, f)).mtimeMs}`).join('|');
  if (_projectStatsCache[project]?.key === cacheKey) return _projectStatsCache[project].stats;

  let sessions = files.length, messages = 0, toolCalls = 0, tokInput = 0, tokOutput = 0, tokCacheRead = 0, tokCacheCreation = 0;
  const models = {}, toolUsage = {}, activityByDay = {}, tokensByModel = {};
  let hookSuccess = 0, hookFailure = 0, hookDurationTotal = 0, hookCount = 0;

  for (const f of files) {
    const rl = readline.createInterface({ input: fs.createReadStream(path.join(pPath, f)), crlfDelay: Infinity });
    let sessionLastTs = 0;
    for await (const line of rl) {
      if (!line.trim() || (!line.includes('"assistant"') && !line.includes('"attachment"') && !line.includes('"user"'))) continue;
      try {
        const p = JSON.parse(line);
        if (p.timestamp) { const t = new Date(p.timestamp).getTime(); if (t > sessionLastTs) sessionLastTs = t; }
        if (p.type === 'user') { messages++; }
        else if (p.type === 'assistant') {
          messages++;
          const msg = p.message; if (!msg) continue;
          if (msg.model) { models[msg.model] = (models[msg.model] || 0) + 1; }
          const u = msg.usage;
          if (u) {
            const [inp, out, cr, cc] = [u.input_tokens || 0, u.output_tokens || 0, u.cache_read_input_tokens || 0, u.cache_creation_input_tokens || 0];
            tokInput += inp; tokOutput += out; tokCacheRead += cr; tokCacheCreation += cc;
            if (msg.model) { if (!tokensByModel[msg.model]) tokensByModel[msg.model] = { input: 0, output: 0 }; tokensByModel[msg.model].input += inp; tokensByModel[msg.model].output += out; }
          }
          if (Array.isArray(msg.content)) for (const b of msg.content) if (b?.type === 'tool_use') { toolCalls++; const n = b.name || 'unknown'; toolUsage[n] = (toolUsage[n] || 0) + 1; }
        } else if (p.type === 'attachment') {
          const att = p.attachment; if (!att) continue;
          if (att.type === 'hook_success') { hookSuccess++; if (typeof att.durationMs === 'number') { hookDurationTotal += att.durationMs; hookCount++; } }
          else if (att.type === 'hook_failure') hookFailure++;
        }
      } catch { /* skip */ }
    }
    if (sessionLastTs > 0) { const d = new Date(sessionLastTs).toISOString().slice(0, 10); activityByDay[d] = (activityByDay[d] || 0) + 1; }
  }

  const total = tokInput + tokCacheRead + tokCacheCreation;
  const stats = {
    totals: { sessions, messages, toolCalls },
    tokens: { input: tokInput, output: tokOutput, cacheRead: tokCacheRead, cacheCreation: tokCacheCreation, cacheHitRate: total > 0 ? Math.round((tokCacheRead / total) * 100) : 0 },
    models, topTools: Object.entries(toolUsage).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count })),
    activity: activityByDay, hooks: { success: hookSuccess, failure: hookFailure, avgDurationMs: hookCount > 0 ? Math.round(hookDurationTotal / hookCount) : 0 },
    estimatedCostUsd: calcCost(tokensByModel),
  };
  _projectStatsCache[project] = { key: cacheKey, stats };
  return stats;
}

register('claude', { getStats: (project = null) => project ? projectStats(project) : globalStats() });
