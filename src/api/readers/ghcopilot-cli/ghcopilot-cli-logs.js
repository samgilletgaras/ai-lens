import { CACHE_TTL, makeBoundedLogCollector } from '../../utils.js';
import { register } from '../logs.js';
import { scanSessions, streamJsonl, registerCacheClear } from './ghcopilot-cli-sessions.js';

let _cache = null, _cacheTime = 0;
registerCacheClear(() => { _cache = null; _cacheTime = 0; });

async function getLogs(page = 0, pageSize = 10) {
  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL)
    return { data: _cache.data.slice(page * pageSize, (page + 1) * pageSize), total: _cache.total };

  const collector = makeBoundedLogCollector();
  for (const [sessionId, info] of scanSessions()) {
    if (!info.eventLogPath) continue;
    let lineNumber = 0;
    try {
      await streamJsonl(info.eventLogPath, event => {
        lineNumber++;
        collector.push({ project: null, session: sessionId, lineNumber, raw: event });
      });
    } catch { }
  }

  _cache = collector.finish();
  _cacheTime = now;
  return { data: _cache.data.slice(page * pageSize, (page + 1) * pageSize), total: _cache.total };
}

register('ghcopilot-cli', { getLogs });
