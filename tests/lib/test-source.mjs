import { readFile } from 'node:fs/promises';

// Follow the executable entry's feature imports so source contracts continue to
// inspect moved assertions. Unrelated/orphan files do not count as coverage.
export async function readSmokeTestSource(entry = new URL('../smoke.mjs', import.meta.url)) {
  const source = await readFile(entry, 'utf8');
  const modules = [...source.matchAll(/^import \{[^\n]+\} from ['"](\.\/smoke\/[^'"]+\.mjs)['"];$/gm)]
    .map(match => new URL(match[1], entry));
  return [source, ...await Promise.all(modules.map(file => readFile(file, 'utf8')))].join('\n');
}
