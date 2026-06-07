import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { PROJECTS_DIR, CACHE_TTL, isTmp, makeBoundedLogCollector } from '../../utils.js';
import { register } from '../logs.js';

let _cache = null, _cacheTs = 0;

async function getLogs(page = 0, pageSize = 10) {
  if (!fs.existsSync(PROJECTS_DIR)) return { data: [], total: 0 };
  const now = Date.now();
  if (_cache && now - _cacheTs < CACHE_TTL) {
    return { data: _cache.data.slice(page * pageSize, (page + 1) * pageSize), total: _cache.total };
  }

  const collector = makeBoundedLogCollector();
  for (const proj of fs.readdirSync(PROJECTS_DIR)) {
    if (isTmp(proj)) continue;
    const pPath = path.join(PROJECTS_DIR, proj);
    if (!fs.statSync(pPath).isDirectory()) continue;
    let files;
    try { files = fs.readdirSync(pPath).filter(f => f.endsWith('.jsonl')); }
    catch(e) { continue; }
    for (const f of files) {
      const sessionId = f.replace('.jsonl', '');
      const filePath = path.join(pPath, f);
      const fileStream = fs.createReadStream(filePath);
      const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
      let lineNumber = 0;
      for await (const line of rl) {
        lineNumber++;
        if (!line.trim()) continue;
        try { collector.push({ project: proj, session: sessionId, lineNumber, raw: JSON.parse(line) }); }
        catch(e) {}
      }
    }
  }

  _cache = collector.finish();
  _cacheTs = Date.now();
  return { data: _cache.data.slice(page * pageSize, (page + 1) * pageSize), total: _cache.total };
}

register('claude', { getLogs });
