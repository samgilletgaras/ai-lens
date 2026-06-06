import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { PROJECTS_DIR, CACHE_TTL, MODEL_PRICING, isTmp } from '../utils.js';

let _statsCache = null;
let _statsCacheTs = 0;
const _projectStatsCache = {};

function calcCost(tokensByModel) {
  let cost = 0;
  for (const [model, toks] of Object.entries(tokensByModel)) {
    const key = Object.keys(MODEL_PRICING).find(k => model.includes(k));
    const [iRate, oRate] = key ? MODEL_PRICING[key] : [3, 15];
    cost += (toks.input / 1e6) * iRate + (toks.output / 1e6) * oRate;
  }
  return Math.round(cost * 100) / 100;
}

export async function getStats() {
  if (_statsCache && Date.now() - _statsCacheTs < CACHE_TTL) return _statsCache;
  if (!fs.existsSync(PROJECTS_DIR)) {
    return {
      totals: { sessions: 0, messages: 0, toolCalls: 0 },
      tokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, cacheHitRate: 0 },
      stopReasons: {}, models: {},
      hooks: { success: 0, failure: 0, avgDurationMs: 0 },
      topProjects: [], activity: {}, estimatedCostUsd: 0,
    };
  }

  let sessions = 0, messages = 0, toolCalls = 0;
  let tokInput = 0, tokOutput = 0, tokCacheRead = 0, tokCacheCreation = 0;
  const stopReasons = {}, models = {};
  let hookSuccess = 0, hookFailure = 0, hookDurationTotal = 0, hookCount = 0;
  const projectStats = {}, activityByDay = {}, tokensByModel = {};

  for (const proj of fs.readdirSync(PROJECTS_DIR)) {
    if (isTmp(proj)) continue;
    const pPath = path.join(PROJECTS_DIR, proj);
    if (!fs.statSync(pPath).isDirectory()) continue;
    let files;
    try { files = fs.readdirSync(pPath).filter(f => f.endsWith('.jsonl')); }
    catch(e) { continue; }

    sessions += files.length;
    if (!projectStats[proj]) projectStats[proj] = { messageCount: 0, tokenCount: 0 };

    for (const f of files) {
      const filePath = path.join(pPath, f);
      const fileStream = fs.createReadStream(filePath);
      const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
      let sessionLastTs = 0;
      for await (const line of rl) {
        if (!line.trim()) continue;
        const isAssistant = line.includes('"assistant"');
        const isAttachment = line.includes('"attachment"');
        const isUser = line.includes('"user"');
        if (!isAssistant && !isAttachment && !isUser) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.timestamp) {
            const t = new Date(parsed.timestamp).getTime();
            if (t > sessionLastTs) sessionLastTs = t;
          }
          if (parsed.type === 'user') {
            messages++; projectStats[proj].messageCount++;
          } else if (parsed.type === 'assistant') {
            messages++; projectStats[proj].messageCount++;
            const msg = parsed.message;
            if (!msg) continue;
            if (msg.model) models[msg.model] = (models[msg.model] || 0) + 1;
            if (msg.stop_reason) stopReasons[msg.stop_reason] = (stopReasons[msg.stop_reason] || 0) + 1;
            const u = msg.usage;
            if (u) {
              const inp = u.input_tokens || 0, out = u.output_tokens || 0;
              const cr = u.cache_read_input_tokens || 0, cc = u.cache_creation_input_tokens || 0;
              tokInput += inp; tokOutput += out; tokCacheRead += cr; tokCacheCreation += cc;
              projectStats[proj].tokenCount += inp + out;
              if (msg.model) {
                if (!tokensByModel[msg.model]) tokensByModel[msg.model] = { input: 0, output: 0 };
                tokensByModel[msg.model].input += inp;
                tokensByModel[msg.model].output += out;
              }
            }
            if (Array.isArray(msg.content)) {
              for (const block of msg.content) {
                if (block?.type === 'tool_use') toolCalls++;
              }
            }
          } else if (parsed.type === 'attachment') {
            const att = parsed.attachment;
            if (!att) continue;
            if (att.type === 'hook_success') {
              hookSuccess++;
              if (typeof att.durationMs === 'number') { hookDurationTotal += att.durationMs; hookCount++; }
            } else if (att.type === 'hook_failure') {
              hookFailure++;
            }
          }
        } catch(e) {}
      }
      if (sessionLastTs > 0) {
        const dayKey = new Date(sessionLastTs).toISOString().slice(0, 10);
        activityByDay[dayKey] = (activityByDay[dayKey] || 0) + 1;
      }
    }
  }

  const totalCacheTokens = tokInput + tokCacheRead + tokCacheCreation;
  const cacheHitRate = totalCacheTokens > 0 ? Math.round((tokCacheRead / totalCacheTokens) * 100) : 0;
  const topProjects = Object.entries(projectStats)
    .sort((a, b) => b[1].messageCount - a[1].messageCount).slice(0, 5)
    .map(([id, s]) => ({ id, messageCount: s.messageCount, tokenCount: s.tokenCount }));

  _statsCache = {
    totals: { sessions, messages, toolCalls },
    tokens: { input: tokInput, output: tokOutput, cacheRead: tokCacheRead, cacheCreation: tokCacheCreation, cacheHitRate },
    stopReasons, models,
    hooks: { success: hookSuccess, failure: hookFailure, avgDurationMs: hookCount > 0 ? Math.round(hookDurationTotal / hookCount) : 0 },
    topProjects, activity: activityByDay,
    estimatedCostUsd: calcCost(tokensByModel),
  };
  _statsCacheTs = Date.now();
  return _statsCache;
}

export async function getProjectStats(project) {
  const pPath = path.join(PROJECTS_DIR, project);
  if (!fs.existsSync(pPath) || !fs.statSync(pPath).isDirectory()) return null;
  let files;
  try { files = fs.readdirSync(pPath).filter(f => f.endsWith('.jsonl')); }
  catch(e) { return null; }

  const cacheKey = files.map(f => `${f}:${fs.statSync(path.join(pPath, f)).mtimeMs}`).join('|');
  if (_projectStatsCache[project]?.key === cacheKey) return _projectStatsCache[project].stats;

  let sessions = files.length, messages = 0, toolCalls = 0;
  let tokInput = 0, tokOutput = 0, tokCacheRead = 0, tokCacheCreation = 0;
  const models = {}, toolUsage = {}, activityByDay = {}, tokensByModel = {};
  let hookSuccess = 0, hookFailure = 0, hookDurationTotal = 0, hookCount = 0;

  for (const f of files) {
    const filePath = path.join(pPath, f);
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    let sessionLastTs = 0;
    for await (const line of rl) {
      if (!line.trim()) continue;
      const isAssistant = line.includes('"assistant"');
      const isAttachment = line.includes('"attachment"');
      const isUser = line.includes('"user"');
      if (!isAssistant && !isAttachment && !isUser) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed.timestamp) {
          const t = new Date(parsed.timestamp).getTime();
          if (t > sessionLastTs) sessionLastTs = t;
        }
        if (parsed.type === 'user') {
          messages++;
        } else if (parsed.type === 'assistant') {
          messages++;
          const msg = parsed.message;
          if (!msg) continue;
          if (msg.model) models[msg.model] = (models[msg.model] || 0) + 1;
          const u = msg.usage;
          if (u) {
            const inp = u.input_tokens || 0, out = u.output_tokens || 0;
            const cr = u.cache_read_input_tokens || 0, cc = u.cache_creation_input_tokens || 0;
            tokInput += inp; tokOutput += out; tokCacheRead += cr; tokCacheCreation += cc;
            if (msg.model) {
              if (!tokensByModel[msg.model]) tokensByModel[msg.model] = { input: 0, output: 0 };
              tokensByModel[msg.model].input += inp;
              tokensByModel[msg.model].output += out;
            }
          }
          if (Array.isArray(msg.content)) {
            for (const block of msg.content) {
              if (block?.type === 'tool_use') {
                toolCalls++;
                const tn = block.name || 'unknown';
                toolUsage[tn] = (toolUsage[tn] || 0) + 1;
              }
            }
          }
        } else if (parsed.type === 'attachment') {
          const att = parsed.attachment;
          if (!att) continue;
          if (att.type === 'hook_success') {
            hookSuccess++;
            if (typeof att.durationMs === 'number') { hookDurationTotal += att.durationMs; hookCount++; }
          } else if (att.type === 'hook_failure') {
            hookFailure++;
          }
        }
      } catch(e) {}
    }
    if (sessionLastTs > 0) {
      const dayKey = new Date(sessionLastTs).toISOString().slice(0, 10);
      activityByDay[dayKey] = (activityByDay[dayKey] || 0) + 1;
    }
  }

  const totalCacheTokens = tokInput + tokCacheRead + tokCacheCreation;
  const cacheHitRate = totalCacheTokens > 0 ? Math.round((tokCacheRead / totalCacheTokens) * 100) : 0;
  const topTools = Object.entries(toolUsage).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count }));

  const stats = {
    totals: { sessions, messages, toolCalls },
    tokens: { input: tokInput, output: tokOutput, cacheRead: tokCacheRead, cacheCreation: tokCacheCreation, cacheHitRate },
    models, topTools, activity: activityByDay,
    hooks: { success: hookSuccess, failure: hookFailure, avgDurationMs: hookCount > 0 ? Math.round(hookDurationTotal / hookCount) : 0 },
    estimatedCostUsd: calcCost(tokensByModel),
  };
  _projectStatsCache[project] = { key: cacheKey, stats };
  return stats;
}
