import { readFileSync } from 'fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export const config = {
  version,
};
