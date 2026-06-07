import { CACHE_TTL, makeBoundedLogCollector } from '../../utils.js';
import { scanWorkspaces, streamJsonl, registerCacheClear } from './ghcopilot-vscode-sessions.js';
import { register } from '../logs.js';

let _cache = null, _cacheTime = 0;
registerCacheClear(() => { _cache = null; _cacheTime = 0; });

export async function getLogs(page = 0, pageSize = 10) {
  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL)
    return { data: _cache.data.slice(page * pageSize, (page + 1) * pageSize), total: _cache.total };

  const collector = makeBoundedLogCollector();
  for (const [project, { files }] of scanWorkspaces()) {
    for (const [sessionId, fileInfo] of files) {
      if (!fileInfo.filePath) continue; // chatSessions-only sessions have no transcript to stream
      let lineNumber = 0;
      try {
        await streamJsonl(fileInfo.filePath, event => {
          lineNumber++;
          collector.push({ project, session: sessionId, lineNumber, raw: event });
        });
      } catch { /* skip broken files */ }
    }
  }

  _cache = collector.finish();
  _cacheTime = now;
  return { data: _cache.data.slice(page * pageSize, (page + 1) * pageSize), total: _cache.total };
}

register('ghcopilot-vscode', { getLogs });
