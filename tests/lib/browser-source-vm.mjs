import fs from 'node:fs/promises';
import vm from 'node:vm';
const ROOT = new URL('../../', import.meta.url);

// Execute the actual browser module with isolated imports and controlled I/O.
export async function loadModule(file, exposure, globals = {}) {
  let source = await fs.readFile(new URL(file, ROOT), 'utf8');
  if (['js/core/api.js', 'js/features/price.js', 'js/core/my-tezos-request-broker.mjs', 'js/core/storage.js'].includes(file)) {
    source = await fs.readFile(new URL('js/core/request-policy.mjs', ROOT), 'utf8') + '\n'
      + await fs.readFile(new URL('js/core/source-payloads.mjs', ROOT), 'utf8') + '\n' + source;
  }
  source = source.replace(/^import\s+[^;]+;\s*$/gm, '')
    .replace(/^export\s+\{[^;]+\};\s*$/gm, '')
    .replace(/\bexport\s+(?=(?:async\s+)?function\b|(?:const|let|class)\b)/g, '')
    .replace(/import\.meta\.url/g, JSON.stringify(new URL(file, ROOT).href));
  const context = vm.createContext({ console: { warn() {}, error() {} }, debugLog() {}, URL, URLSearchParams, Headers, DOMException, AbortController,
    setTimeout, clearTimeout, API_URLS: { tzkt: 'https://tzkt.test', octez: 'https://rpc.test' },
    CACHE_TTLS: { memory: 60_000 }, ...globals });
  new vm.Script(`${source}\nglobalThis.result = { ${exposure} };`, { filename: file }).runInContext(context);
  return context.result;
}
