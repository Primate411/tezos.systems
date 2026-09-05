import assert from 'node:assert/strict';
import { routeDetails, renderCard } from '../scripts/generate-chamber-og-images.mjs';
import { CHAMBER_ROUTES, routeImage } from '../scripts/lib/chamber-routes.mjs';

const route = slug => CHAMBER_ROUTES.find(entry => entry.slug === slug);
const governance = tally => ({ currentGovernance: { kind: 'proposal', tally } });

for (const missing of [null, undefined, '', false, 'unknown', NaN, Infinity]) {
  const details = routeDetails(route('chamber'), governance({ participationPct: missing, yayPct: missing }));
  assert.deepEqual(details.chips, ['participation unavailable', 'yay unavailable', 'quorum + ballots']);
  assert.equal(details.value, 'Closing date unavailable');
  assert.equal(details.kicker, 'Proposal period');
}
const zero = routeDetails(route('chamber'), governance({ participationPct: 0, yayPct: 0 }));
assert.deepEqual(zero.chips.slice(0, 2), ['0.0% participation', '0.0% yay'], 'real zero remains zero');
const known = routeDetails(route('chamber'), {
  currentGovernance: { kind: 'exploration', proposalName: 'Example', endTime: '2026-09-09T05:05:46Z',
    tally: { participationPct: 75.25, yayPct: 90 } }
});
assert.deepEqual(known.chips.slice(0, 2), ['75.3% participation', '90.0% yay']);
assert.equal(known.value, 'Sep 9, 05:05 UTC');
assert.equal(known.kicker, 'Example Exploration');
assert.equal(routeDetails(route('chamber'), { currentGovernance: { endTime: 'invalid' } }).value, 'Closing date unavailable');

for (const slug of ['chambers', 'anthology']) {
  const details = routeDetails(route(slug), governance({ participationPct: 75, yayPct: 90 }));
  assert.equal(details.body, route(slug).description, `${slug} uses its own reviewed description`);
  assert.doesNotMatch(JSON.stringify(details), /participation|yay|vote closing/);
  assert.doesNotMatch(renderCard(route(slug), null), /Live Room|Closing date unavailable/);
}
assert.deepEqual(routeDetails(route('tezlink'), null), routeDetails(route('tezosx'), null), 'aliases use canonical artwork content');
assert.equal(routeImage(route('anthology')), 'https://tezos.systems/og/anthology.png', 'archive metadata uses its own image');

const future = { slug: 'future-room', eyebrow: 'Future Room', description: 'A reviewed room description.' };
assert.equal(routeDetails(future, governance({ participationPct: 75 })).body, future.description);
assert.deepEqual(routeDetails(future, null).chips, [], 'new rooms never inherit unrelated governance metrics');
for (const entry of CHAMBER_ROUTES) {
  const html = renderCard(entry, null);
  assert(html.includes(`<h1>${entry.shortTitle}</h1>`), `${entry.slug}: route title is preserved`);
  assert(!html.includes('undefined'), `${entry.slug}: missing content stays explicit`);
}
console.log('ok - Chamber OG identity, aliases, archive image and unavailable/zero governance receipts');
