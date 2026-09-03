#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function slugify(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function replaceRequired(html, pattern, replacement) {
  if (!pattern.test(html)) throw new Error(`Anthology route replacement failed: ${pattern}`);
  return html.replace(pattern, replacement);
}

function storyDescription(protocol) {
  const value = protocol.history?.subtitle || protocol.headline || `${protocol.name} in the Tezos Protocol Anthology.`;
  return String(value).replace(/\s+/g, ' ').trim().slice(0, 190);
}

function structuredData(protocol, url, description) {
  const value = [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: protocol.history?.title || `${protocol.name} Protocol`,
      name: `${protocol.name} Protocol — Protocol Anthology`,
      description,
      url,
      datePublished: protocol.date,
      dateModified: protocol.date,
      isPartOf: {
        '@type': 'CollectionPage',
        name: 'Protocol Anthology',
        url: 'https://tezos.systems/anthology/'
      },
      author: { '@type': 'Person', name: 'Primate', url: 'https://tezos.systems/' },
      publisher: { '@type': 'Person', name: 'Primate', url: 'https://tezos.systems/' },
      about: { '@type': 'Thing', name: 'Tezos protocol governance' }
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Tezos Systems', item: 'https://tezos.systems/' },
        { '@type': 'ListItem', position: 2, name: 'Protocol Anthology', item: 'https://tezos.systems/anthology/' },
        { '@type': 'ListItem', position: 3, name: protocol.name, item: url }
      ]
    }
  ];
  return `    <!-- Route-specific structured data: generated, do not edit in route shells -->\n    <script type="application/ld+json">\n${JSON.stringify(value, null, 2).replaceAll('<', '\\u003c')}\n    </script>`;
}

function renderStoryRoute(shell, protocol) {
  const slug = slugify(protocol.name);
  const url = `https://tezos.systems/anthology/${slug}/`;
  const storyTitle = protocol.history?.title || `${protocol.name} Protocol`;
  const pageTitle = `${storyTitle} — Protocol Anthology`;
  const description = storyDescription(protocol);
  const escapedTitle = escapeHtml(pageTitle);
  const escapedDescription = escapeHtml(description);
  let html = shell;
  html = replaceRequired(html, /(<html lang="en" data-chamber-route="anthology")([^>]*>)/, `$1 data-anthology-protocol="${slug}"$2`);
  html = replaceRequired(html, /<title>[\s\S]*?<\/title>/, `<title>${escapedTitle} | tezos.systems</title>`);
  html = replaceRequired(html, /<meta name="description" content="[^"]*">/, `<meta name="description" content="${escapedDescription}">`);
  html = replaceRequired(html, /<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`);
  html = replaceRequired(html, /<meta property="og:type" content="[^"]*">/, '<meta property="og:type" content="article">');
  html = replaceRequired(html, /<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`);
  html = replaceRequired(html, /<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${escapedTitle}">`);
  html = replaceRequired(html, /<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${escapedDescription}">`);
  html = replaceRequired(html, /<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${escapedTitle}">`);
  html = replaceRequired(html, /<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${escapedDescription}">`);
  html = replaceRequired(
    html,
    /\s*<!-- Route-specific structured data: generated, do not edit in route shells -->\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/,
    `\n${structuredData(protocol, url, description)}`
  );
  return html.replace(/[ \t]+$/gm, '');
}

async function main() {
  const checkOnly = process.argv.includes('--check');
  const shell = await fs.readFile(path.join(ROOT, 'anthology', 'index.html'), 'utf8');
  const data = JSON.parse(await fs.readFile(path.join(ROOT, 'data', 'protocol-data.json'), 'utf8'));
  const drift = [];
  for (const protocol of data.protocols || []) {
    const slug = slugify(protocol.name);
    if (!slug) continue;
    const filename = path.join(ROOT, 'anthology', slug, 'index.html');
    const expected = renderStoryRoute(shell, protocol);
    if (checkOnly) {
      const current = await fs.readFile(filename, 'utf8').catch(() => '');
      if (current !== expected) drift.push(`anthology/${slug}/index.html`);
      continue;
    }
    await fs.mkdir(path.dirname(filename), { recursive: true });
    await fs.writeFile(filename, expected);
  }
  if (drift.length) throw new Error(`Generated Anthology route drift:\n${drift.map((file) => `- ${file}`).join('\n')}`);
  console.log(`${checkOnly ? 'Verified' : 'Wrote'} ${(data.protocols || []).length} Anthology story pages`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
