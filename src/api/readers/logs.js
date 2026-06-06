import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { PROJECTS_DIR, CACHE_TTL, isTmp } from '../utils.js';

let _logsCache = null;
let _logsCacheTs = 0;

export async function getLogs(page = 0, pageSize = 10) {
  if (!fs.existsSync(PROJECTS_DIR)) return { data: [], total: 0 };
  const now = Date.now();
  if (_logsCache && now - _logsCacheTs < CACHE_TTL) {
    return { data: _logsCache.slice(page * pageSize, (page + 1) * pageSize), total: _logsCache.length };
  }

  const logs = [];
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
        try {
          const raw = JSON.parse(line);
          logs.push({ project: proj, session: sessionId, lineNumber, raw });
        } catch(e) {}
      }
    }
  }

  logs.sort((a, b) => {
    const ta = typeof a.raw.timestamp === 'string' ? new Date(a.raw.timestamp).getTime() : 0;
    const tb = typeof b.raw.timestamp === 'string' ? new Date(b.raw.timestamp).getTime() : 0;
    return tb - ta;
  });

  _logsCache = logs;
  _logsCacheTs = Date.now();
  return { data: logs.slice(page * pageSize, (page + 1) * pageSize), total: logs.length };
}
