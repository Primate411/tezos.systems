#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAMBER_ROUTES, routeImage, routeUrl } from './lib/chamber-routes.mjs';
import { renderStandaloneChamberShell } from './lib/standalone-chamber-shell.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHAMBER_CATEGORY_KEYS = Object.freeze([
  'ecosystem',
  'network',
  'capital',
  'bakers',
  'governance',
  'people',
  'history'
]);
const CHAMBER_CATEGORY_BY_ROUTE_HASH = Object.freeze({
  '#ecosystem': 'ecosystem',
  '#pulse': 'network',
  '#health': 'network',
  '#tezosx': 'network',
  '#capital': 'capital',
  '#minerals': 'capital',
  '#uranium': 'capital',
  '#metals': 'capital',
  '#whales': 'capital',
  '#staking': 'capital',
  '#leaderboard': 'bakers',
  '#tz4': 'bakers',
  '#chamber': 'governance',
  '#l2chamber': 'governance',
  '#lb': 'governance',
  '#ledger-flow': 'people',
  '#domains': 'people',
  '#maxis': 'people',
  '#tezoscrp': 'people',
  '#protocol-history': 'history',
  '#history': 'history'
});

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

function jsonLd(value) {
  return JSON.stringify(value, null, 2).replaceAll('<', '\\u003c');
}

function renderRouteStructuredData(route, url, image) {
  const schema = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: route.shortTitle,
      headline: route.title,
      url,
      description: route.description,
      primaryImageOfPage: image,
      isPartOf: {
        '@type': 'WebSite',
        name: 'Tezos Systems',
        url: 'https://tezos.systems/'
      },
      about: {
        '@type': 'Thing',
        name: 'Tezos'
      },
      publisher: {
        '@type': 'Person',
        name: 'Primate',
        url: 'https://tezos.systems/',
        email: 'primate@tez.capital',
        sameAs: [
          'https://x.com/BakingBenjamins',
          'https://github.com/Primate411'
        ],
        affiliation: {
          '@type': 'Organization',
          name: 'Tez Capital',
          url: 'https://tez.capital'
        }
      }
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Tezos Systems',
          item: 'https://tezos.systems/'
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: route.shortTitle,
          item: url
        }
      ]
    }
  ];

  if (Array.isArray(route.faq) && route.faq.length) {
    schema.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: route.faq.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.answer
        }
      }))
    });
  }

  return `    <!-- Route-specific structured data: generated, do not edit in route shells -->
    <script type="application/ld+json">
${jsonLd(schema)}
    </script>`;
}

function absolutizeShellAssetRefs(html) {
  return html.replace(/\b(href|src)="(?!https?:|\/|#|mailto:|data:)([^"]+)"/g, (_match, attr, value) => {
    return `${attr}="/${value}"`;
  });
}

function setInitialChamberCategory(html, expandedKey) {
  if (!CHAMBER_CATEGORY_KEYS.includes(expandedKey)) {
    throw new Error(`Unknown initial Chamber category: ${expandedKey}`);
  }

  for (const categoryKey of CHAMBER_CATEGORY_KEYS) {
    const marker = `data-chamber-category="${categoryKey}"`;
    const markerIndex = html.indexOf(marker);
    if (markerIndex < 0) throw new Error(`Route shell is missing Chamber category ${categoryKey}`);
    const sectionStart = html.lastIndexOf('<section', markerIndex);
    const sectionEndMarker = '</section>';
    const sectionEnd = html.indexOf(sectionEndMarker, markerIndex);
    if (sectionStart < 0 || sectionEnd < 0) throw new Error(`Route shell category ${categoryKey} is malformed`);

    const expanded = categoryKey === expandedKey;
    const cardsId = `chamber-category-${categoryKey}-cards`;
    let section = html.slice(sectionStart, sectionEnd + sectionEndMarker.length);
    section = section.replace(/data-chamber-expanded="(?:true|false)"/, `data-chamber-expanded="${expanded}"`);
    section = section.replace(/aria-expanded="(?:true|false)"/, `aria-expanded="${expanded}"`);
    section = section.replace(
      new RegExp(`(id="${cardsId}")(?: hidden)?`),
      `$1${expanded ? '' : ' hidden'}`
    );
    if (!section.includes(`data-chamber-expanded="${expanded}"`)
      || !section.includes(`aria-expanded="${expanded}"`)
      || !section.includes(`id="${cardsId}"${expanded ? '' : ' hidden'}`)) {
      throw new Error(`Route shell category ${categoryKey} disclosure could not be set`);
    }
    html = `${html.slice(0, sectionStart)}${section}${html.slice(sectionEnd + sectionEndMarker.length)}`;
  }
  return html;
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
  html = replaceTag(
    html,
    /\s*<!-- JSON-LD Structured Data -->[\s\S]*?(?=\s*<!-- GoatCounter Analytics -->)/,
    `\n${renderRouteStructuredData(route, url, image)}\n`
  );
  html = html.replace(/\s*<!-- Price Intelligence Structured Data -->\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/, '');
  html = setInitialChamberCategory(
    html,
    CHAMBER_CATEGORY_BY_ROUTE_HASH[route.hash] || 'ecosystem'
  );
  if (route.slug === 'tezoscrp') html = renderStandaloneChamberShell(html);
  return html.replace(/[ \t]+$/gm, '');
}

async function main() {
  const checkOnly = process.argv.includes('--check');
  const dashboardShell = await fs.readFile(path.join(ROOT, 'index.html'), 'utf8');
  const drift = [];
  for (const route of CHAMBER_ROUTES) {
    const dir = path.join(ROOT, route.slug);
    const filename = path.join(dir, 'index.html');
    const expected = renderRoute(route, dashboardShell);
    if (checkOnly) {
      const current = await fs.readFile(filename, 'utf8').catch(() => '');
      if (current !== expected) drift.push(`${route.slug}/index.html`);
      continue;
    }
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filename, expected);
  }
  if (drift.length) {
    throw new Error(`Generated chamber route drift:\n${drift.map((file) => `- ${file}`).join('\n')}`);
  }
  console.log(`${checkOnly ? 'Verified' : 'Wrote'} ${CHAMBER_ROUTES.length} chamber route pages`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
