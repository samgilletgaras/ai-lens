import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { PI_SESSIONS_DIR, CACHE_TTL, isTmp, makeBoundedLogCollector } from '../../utils.js';
import { register } from '../logs.js';

let _cache = null, _cacheTs = 0;

async function getLogs(page = 0, pageSize = 10) {
  if (!fs.existsSync(PI_SESSIONS_DIR)) return { data: [], total: 0 };

  const now = Date.now();
  if (_cache && now - _cacheTs < CACHE_TTL) {
    return { data: _cache.data.slice(page * pageSize, (page + 1) * pageSize), total: _cache.total };
  }

  const collector = makeBoundedLogCollector();

  for (const projEntry of fs.readdirSync(PI_SESSIONS_DIR, { withFileTypes: true })) {
    if (!projEntry.isDirectory() || isTmp(projEntry.name)) continue;
    const dirPath = path.join(PI_SESSIONS_DIR, projEntry.name);

    let files;
    try { files = fs.readdirSync(dirPath).filter(f => f.endsWith('.jsonl')); }
    catch { continue; }

    for (const f of files) {
      const sessionId = f.replace(/\.jsonl$/, '');
      const filePath = path.join(dirPath, f);
      const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
      let lineNumber = 0;
      for await (const line of rl) {
        lineNumber++;
        if (!line.trim()) continue;
        try {
          collector.push({ project: projEntry.name, session: sessionId, lineNumber, raw: JSON.parse(line) });
        } catch { /* skip malformed lines */ }
      }
    }
  }

  _cache = collector.finish();
  _cacheTs = Date.now();
  return { data: _cache.data.slice(page * pageSize, (page + 1) * pageSize), total: _cache.total };
}

register('pi', { getLogs });
