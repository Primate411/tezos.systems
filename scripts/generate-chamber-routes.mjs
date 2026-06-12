#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAMBER_ROUTES, routeImage, routeUrl } from './lib/chamber-routes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderRoute(route) {
  const url = routeUrl(route);
  const image = routeImage(route);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(route.title)} | tezos.systems</title>
  <meta name="description" content="${escapeHtml(route.description)}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="tezos.systems">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${escapeHtml(route.title)}">
  <meta property="og:description" content="${escapeHtml(route.description)}">
  <meta property="og:image" content="${image}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(route.title)}">
  <meta name="twitter:description" content="${escapeHtml(route.description)}">
  <meta name="twitter:image" content="${image}">
  <meta http-equiv="refresh" content="0; url=/${route.hash}">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#070b1a;color:#eaf0ff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    main{max-width:680px;padding:32px;text-align:center}
    a{color:${route.accent};text-decoration:none}
    .eyebrow{font-size:.75rem;letter-spacing:.18em;text-transform:uppercase;color:${route.accent};margin-bottom:12px}
  </style>
  <script>location.replace('/${route.hash}');</script>
</head>
<body>
  <main>
    <div class="eyebrow">${escapeHtml(route.eyebrow)}</div>
    <h1>${escapeHtml(route.shortTitle)}</h1>
    <p>${escapeHtml(route.description)}</p>
    <p><a href="/${route.hash}">Open ${escapeHtml(route.shortTitle)} on Tezos Systems</a></p>
    <noscript><p>JavaScript is disabled. Use the link above to open the live dashboard room.</p></noscript>
  </main>
</body>
</html>
`;
}

async function main() {
  for (const route of CHAMBER_ROUTES) {
    const dir = path.join(ROOT, route.slug);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'index.html'), renderRoute(route));
  }
  console.log(`Wrote ${CHAMBER_ROUTES.length} chamber route pages`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
