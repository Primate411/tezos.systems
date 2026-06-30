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

function replaceTag(html, pattern, replacement) {
  if (!pattern.test(html)) throw new Error(`Route shell replacement failed: ${pattern}`);
  return html.replace(pattern, replacement);
}

function absolutizeShellAssetRefs(html) {
  return html.replace(/\b(href|src)="(?!https?:|\/|#|mailto:|data:)([^"]+)"/g, (_match, attr, value) => {
    return `${attr}="/${value}"`;
  });
}

function renderRoute(route, dashboardShell) {
  const url = routeUrl(route);
  const image = routeImage(route);
  const escapedTitle = escapeHtml(route.title);
  const escapedDescription = escapeHtml(route.description);
  const robots = escapeHtml(route.robots || 'index, follow, max-image-preview:large');

  let html = absolutizeShellAssetRefs(dashboardShell);
  html = replaceTag(html, /<html lang="en">/, `<html lang="en" data-chamber-route="${escapeHtml(route.slug)}">`);
  html = replaceTag(html, /<title>[\s\S]*?<\/title>/, `<title>${escapedTitle} | tezos.systems</title>`);
  html = replaceTag(html, /<meta name="description" content="[^"]*">/, `<meta name="description" content="${escapedDescription}">`);
  html = replaceTag(html, /<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`);
  html = replaceTag(html, /<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`);
  html = replaceTag(html, /<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${escapedTitle}">`);
  html = replaceTag(html, /<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${escapedDescription}">`);
  html = replaceTag(html, /<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${image}">`);
  html = replaceTag(html, /<meta property="og:image:width" content="[^"]*">/, '<meta property="og:image:width" content="1200">');
  html = replaceTag(html, /<meta property="og:image:height" content="[^"]*">/, '<meta property="og:image:height" content="630">');
  html = replaceTag(html, /<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${escapedTitle}">`);
  html = replaceTag(html, /<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${escapedDescription}">`);
  html = replaceTag(html, /<meta name="twitter:image" content="[^"]*">/, `<meta name="twitter:image" content="${image}">`);
  html = replaceTag(html, /<meta name="robots" content="[^"]*">/, `<meta name="robots" content="${robots}">`);
  return html.replace(/[ \t]+$/gm, '');
}

async function main() {
  const dashboardShell = await fs.readFile(path.join(ROOT, 'index.html'), 'utf8');
  for (const route of CHAMBER_ROUTES) {
    const dir = path.join(ROOT, route.slug);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'index.html'), renderRoute(route, dashboardShell));
  }
  console.log(`Wrote ${CHAMBER_ROUTES.length} chamber route pages`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
