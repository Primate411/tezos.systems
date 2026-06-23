#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const CleanCSS = require('clean-css');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, 'css', 'styles.css');
const BASE_MIN = path.join(ROOT, 'css', 'styles.min.css');
const THEME_DIR = path.join(ROOT, 'css', 'themes');
const THEMES = ['aurora', 'matrix', 'default', 'void', 'ember', 'signal', 'nerv', 'clean', 'dark', 'bubblegum', 'abyss', 'moss', 'warzone'];

function emptyBuckets() {
  return Object.fromEntries(THEMES.map((theme) => [theme, '']));
}

function findNextOpenBrace(css, startIndex) {
  let quote = null;
  let escaped = false;
  let inComment = false;

  for (let i = startIndex; i < css.length; i += 1) {
    const char = css[i];
    const next = css[i + 1];

    if (inComment) {
      if (char === '*' && next === '/') {
        inComment = false;
        i += 1;
      }
      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '/' && next === '*') {
      inComment = true;
      i += 1;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === '{') return i;
  }

  return -1;
}

function findMatchingBrace(css, openIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  let inComment = false;

  for (let i = openIndex; i < css.length; i += 1) {
    const char = css[i];
    const next = css[i + 1];

    if (inComment) {
      if (char === '*' && next === '/') {
        inComment = false;
        i += 1;
      }
      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '/' && next === '*') {
      inComment = true;
      i += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function splitSelectors(selectorText) {
  const selectors = [];
  let current = '';
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (const char of selectorText) {
    if (quote) {
      current += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === '(' || char === '[') depth += 1;
    if (char === ')' || char === ']') depth = Math.max(0, depth - 1);
    if (char === ',' && depth === 0) {
      selectors.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  if (current.trim()) selectors.push(current.trim());
  return selectors;
}

function selectorTheme(selector) {
  if (/:not\([^)]*data-theme/i.test(selector)) return null;
  const matches = Array.from(selector.matchAll(/data-theme\s*=\s*["']?([a-z0-9-]+)["']?/gi)).map((match) => match[1]);
  if (matches.length !== 1) return null;
  return THEMES.includes(matches[0]) ? matches[0] : null;
}

function renderRule(selectors, body) {
  return `${selectors.join(',\n')}{${body}}\n`;
}

function splitRule(prefix, body, block) {
  const selectorText = prefix.replace(/\/\*[\s\S]*?\*\//g, '').trim();
  if (!selectorText || selectorText.startsWith('@')) return { base: `${block}\n`, themes: emptyBuckets() };
  const selectors = splitSelectors(selectorText);
  if (!selectors.length) return { base: `${block}\n`, themes: emptyBuckets() };

  const baseSelectors = [];
  const themes = emptyBuckets();
  let moved = false;
  for (const selector of selectors) {
    const theme = selectorTheme(selector);
    if (theme) {
      themes[theme] += renderRule([selector], body);
      moved = true;
    } else {
      baseSelectors.push(selector);
    }
  }

  if (!moved) return { base: `${block}\n`, themes: emptyBuckets() };

  return {
    base: baseSelectors.length ? renderRule(baseSelectors, body) : '',
    themes
  };
}

function mergeBuckets(target, source) {
  for (const theme of THEMES) {
    if (source[theme]) target[theme] += source[theme];
  }
}

function splitCss(css) {
  let base = '';
  const themes = emptyBuckets();
  let cursor = 0;

  while (cursor < css.length) {
    const open = findNextOpenBrace(css, cursor);
    if (open < 0) {
      base += css.slice(cursor);
      break;
    }

    const close = findMatchingBrace(css, open);
    if (close < 0) {
      base += css.slice(cursor);
      break;
    }

    const prefix = css.slice(cursor, open);
    const body = css.slice(open + 1, close);
    const block = css.slice(cursor, close + 1);
    const trimmedPrefix = prefix.replace(/\/\*[\s\S]*?\*\//g, '').trim();

    if (/^@(media|supports|container|layer)\b/i.test(trimmedPrefix)) {
      const inner = splitCss(body);
      if (inner.base.trim()) base += `${prefix}{${inner.base}}\n`;
      for (const theme of THEMES) {
        if (inner.themes[theme].trim()) themes[theme] += `${prefix}{${inner.themes[theme]}}\n`;
      }
    } else {
      const rule = splitRule(prefix, body, block);
      base += rule.base;
      mergeBuckets(themes, rule.themes);
    }

    cursor = close + 1;
  }

  return { base, themes };
}

function minify(css, file) {
  const result = new CleanCSS({ level: 1 }).minify(css);
  if (result.errors?.length) {
    throw new Error(`CSS minify failed for ${file}: ${result.errors.join('; ')}`);
  }
  return `${result.styles}\n`;
}

function cleanGeneratedText(text) {
  return text.replace(/[ \t]+$/gm, '').replace(/\n+$/g, '\n');
}

async function main() {
  const source = await fs.readFile(SOURCE, 'utf8');
  const { base, themes } = splitCss(source);
  await fs.mkdir(THEME_DIR, { recursive: true });
  await fs.writeFile(BASE_MIN, minify(base, 'css/styles.min.css'));

  let moved = 0;
  for (const theme of THEMES) {
    const css = `/* Generated from css/styles.css by scripts/build-css.mjs. Do not edit directly. */\n${themes[theme]}`;
    const cssFile = path.join(THEME_DIR, `${theme}.css`);
    const minFile = path.join(THEME_DIR, `${theme}.min.css`);
    await fs.writeFile(cssFile, cleanGeneratedText(css));
    await fs.writeFile(minFile, minify(css, `css/themes/${theme}.min.css`));
    moved += themes[theme].length;
  }

  const baseKb = Buffer.byteLength(await fs.readFile(BASE_MIN)) / 1024;
  const themeKb = Object.fromEntries(await Promise.all(THEMES.map(async (theme) => [
    theme,
    Math.round((await fs.stat(path.join(THEME_DIR, `${theme}.min.css`))).size / 1024)
  ])));
  console.log(`Built css/styles.min.css (${baseKb.toFixed(1)} KB) plus ${THEMES.length} lazy theme bundles`);
  console.log(`Moved ${(moved / 1024).toFixed(1)} KB of source theme rules`, themeKb);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
