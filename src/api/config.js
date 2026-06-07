import { readFileSync } from 'fs';

let version = 'unknown';
try {
  ({ version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')));
} catch { /* version stays 'unknown' if package.json is missing or malformed */ }

export const config = { version };
