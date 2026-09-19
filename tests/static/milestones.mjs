// Static contracts owned by milestones. Shared dependencies remain explicit.
export function createMilestonesStaticChecks({
  MILESTONE_BASE_THRESHOLDS,
  MILESTONE_CATALOG_SCHEMA,
  MILESTONE_MOMENT_TTL_MS,
  MILESTONE_REFRESH_COMMITS,
  MILESTONE_REFRESH_DAYS,
  advanceMilestoneTrack,
  assert,
  claimMilestoneArrival,
  cycleMilestoneStartLevel,
  deriveMilestoneMoments,
  extendMilestoneThresholds,
  fail,
  generatedMilestoneAnchor,
  generatedMilestoneMoments,
  generatedMilestoneThresholds,
  mergedMilestoneThresholds,
  milestoneCatalogCadence,
  normalizeMilestoneStore,
  pass,
  qualifyMilestoneNearState,
  readText
}) {
  function checkMilestoneLifecycleBehavior() {
    try {
      const now = 1_700_000_000_000;
      const ttlMs = 72 * 60 * 60 * 1000;
      const thresholds = [100, 200];
      const legacyStore = normalizeMilestoneStore({
        'blocks:100': { track: 'blocks', target: '100', createdAt: now - 1000 }
      });
      const baseline = advanceMilestoneTrack(legacyStore, {
        trackId: 'blocks',
        currentValue: 105,
        thresholds,
        now,
        ttlMs
      });
      assert.equal(baseline.baseline, true);
      assert.equal(baseline.activeMoments.length, 0);
      assert.equal(legacyStore.tracks.blocks.celebratedTargets['100'].baseline, true);

      const store = normalizeMilestoneStore(null);
      const first = advanceMilestoneTrack(store, {
        trackId: 'blocks',
        currentValue: 95,
        thresholds,
        now,
        ttlMs
      });
      assert.equal(first.activeMoments.length, 0);
      const crossing = advanceMilestoneTrack(store, {
        trackId: 'blocks',
        currentValue: 101,
        thresholds,
        now: now + 1000,
        ttlMs
      });
      assert.equal(crossing.newlyCrossed.length, 1);
      assert.equal(crossing.activeMoments[0].expiresAt, now + 1000 + ttlMs);

      const movedAway = advanceMilestoneTrack(store, {
        trackId: 'blocks',
        currentValue: 150,
        thresholds,
        now: now + ttlMs - 1000,
        ttlMs
      });
      assert.equal(movedAway.activeMoments.length, 1);
      const expired = advanceMilestoneTrack(store, {
        trackId: 'blocks',
        currentValue: 99,
        thresholds,
        now: now + ttlMs + 1001,
        ttlMs
      });
      assert.equal(expired.activeMoments.length, 0);
      assert.ok(store.tracks.blocks.celebratedTargets['100']);
      const noRearm = advanceMilestoneTrack(store, {
        trackId: 'blocks',
        currentValue: 101,
        thresholds,
        now: now + ttlMs + 2000,
        ttlMs
      });
      assert.equal(noRearm.newlyCrossed.length, 0);
      assert.equal(noRearm.activeMoments.length, 0);

      const arrivals = new Set();
      assert.equal(claimMilestoneArrival(arrivals, 'blocks|100|event'), true);
      assert.equal(claimMilestoneArrival(arrivals, 'blocks|100|event'), false);
      assert.equal(claimMilestoneArrival(arrivals, 'blocks|200|event'), true);

      const catalogMoments = deriveMilestoneMoments({
        currentValue: 112,
        thresholds,
        now: now + (24 * 60 * 60 * 1000),
        ttlMs,
        anchorValue: 95,
        anchorObservedAt: now
      });
      assert.equal(catalogMoments.length, 1);
      assert.equal(catalogMoments[0].target, 100);
      assert.ok(catalogMoments[0].createdAt > now);
      assert.equal(catalogMoments[0].expiresAt, catalogMoments[0].createdAt + MILESTONE_MOMENT_TTL_MS);
      const staleCatalogMoments = deriveMilestoneMoments({
        currentValue: 180,
        thresholds,
        now: now + (10 * 24 * 60 * 60 * 1000),
        ttlMs,
        anchorValue: 95,
        anchorObservedAt: now
      });
      assert.equal(staleCatalogMoments.length, 0);

      const tooEarly = qualifyMilestoneNearState({
        currentValue: 2852,
        thresholds: [3000],
        nearWindow: 180,
        dailyRate: 1,
        maxLeadDays: 14,
        absoluteMaxDays: 30
      });
      assert.equal(tooEarly, null);
      const withinTwoWeeks = qualifyMilestoneNearState({
        currentValue: 2988,
        thresholds: [3000],
        nearWindow: 180,
        dailyRate: 1,
        maxLeadDays: 14,
        absoluteMaxDays: 30
      });
      assert.equal(Math.ceil(withinTwoWeeks.etaDays), 12);
      const beyondAbsoluteCap = qualifyMilestoneNearState({
        currentValue: 2969,
        thresholds: [3000],
        nearWindow: 180,
        dailyRate: 1,
        maxLeadDays: 45,
        absoluteMaxDays: 30
      });
      assert.equal(beyondAbsoluteCap, null);
      const insideAbsoluteCap = qualifyMilestoneNearState({
        currentValue: 2971,
        thresholds: [3000],
        nearWindow: 180,
        dailyRate: 1,
        maxLeadDays: 45,
        absoluteMaxDays: 30
      });
      assert.equal(Math.ceil(insideAbsoluteCap.etaDays), 29);
      pass('milestone lifecycle behavior covers shared receipts, baseline, crossing, TTL, tombstones, one-time arrival, and the 30-day near cap');
    } catch (error) {
      fail(`milestone lifecycle behavior failed: ${error.message}`);
    }
  }

  async function checkMilestoneCatalogContracts() {
    try {
      const catalog = JSON.parse(await readText('data/milestone-catalog.json'));
      assert.equal(catalog.schema, MILESTONE_CATALOG_SCHEMA);
      assert.equal(catalog.cadence?.days, MILESTONE_REFRESH_DAYS);
      assert.equal(catalog.cadence?.commits, MILESTONE_REFRESH_COMMITS);
      assert.ok(Number.isFinite(Number(catalog.generatedAtCommitCount)));
      assert.ok(Number.isFinite(Date.parse(catalog.generatedAt)));
      assert.ok(generatedMilestoneAnchor(catalog, 'blocks'));
      assert.ok(Array.isArray(generatedMilestoneMoments(catalog, 'blocks')));

      for (const trackId of Object.keys(MILESTONE_BASE_THRESHOLDS)) {
        const generated = generatedMilestoneThresholds(catalog, trackId);
        const base = MILESTONE_BASE_THRESHOLDS[trackId];
        assert.ok(generated.length >= base.length, `${trackId} generated thresholds should preserve the base catalog`);
        assert.deepEqual(generated.slice(0, base.length), [...base]);
        assert.ok(catalog.tracks?.[trackId]?.nextTarget == null || generated.includes(catalog.tracks[trackId].nextTarget));
      }

      assert.ok(MILESTONE_BASE_THRESHOLDS.cycle.includes(1250));
      assert.ok(MILESTONE_BASE_THRESHOLDS.cycle.includes(1300));
      assert.ok(MILESTONE_BASE_THRESHOLDS.cycle.includes(1400));
      const staleCycleCatalog = {
        schema: MILESTONE_CATALOG_SCHEMA,
        tracks: { cycle: { thresholds: [1000, 1250, 1500] } }
      };
      assert.ok(mergedMilestoneThresholds(staleCycleCatalog, 'cycle').includes(1300));
      assert.equal(cycleMilestoneStartLevel({
        currentCycle: 1300,
        currentCycleStartLevel: 14174689,
        targetCycle: 1300,
        blocksPerCycle: 14400
      }), 14174689);
      assert.equal(cycleMilestoneStartLevel({
        currentCycle: 1302,
        currentCycleStartLevel: 14203489,
        targetCycle: 1300,
        blocksPerCycle: 14400
      }), 14174689);
      const extendedCycles = extendMilestoneThresholds('cycle', 2601);
      assert.ok(extendedCycles.includes(2700) && extendedCycles.includes(2800));
      assert.equal(extendedCycles[extendedCycles.indexOf(2700) + 1] - 2700, 100);
      const extendedBlocks = extendMilestoneThresholds('blocks', 31_200_000);
      assert.ok(extendedBlocks.at(-1) > 31_200_000);
      const cadenceBase = Date.parse('2026-07-01T00:00:00Z');
      assert.equal(milestoneCatalogCadence({ generatedAt: new Date(cadenceBase).toISOString(), generatedAtCommitCount: 700, now: cadenceBase + (13 * 86400000), commitCount: 799 }).due, false);
      assert.equal(milestoneCatalogCadence({ generatedAt: new Date(cadenceBase).toISOString(), generatedAtCommitCount: 700, now: cadenceBase + (14 * 86400000), commitCount: 799 }).due, true);
      assert.equal(milestoneCatalogCadence({ generatedAt: new Date(cadenceBase).toISOString(), generatedAtCommitCount: 700, now: cadenceBase + (13 * 86400000), commitCount: 800 }).due, true);
      const generator = await readText('scripts/generate-milestone-catalog.mjs');
      const orchestrator = await readText('scripts/refresh-generated-surfaces.mjs');
      for (const snippet of ['MILESTONE_REFRESH_DAYS', 'MILESTONE_REFRESH_COMMITS', '--project-next-commit']) {
        assert.ok(generator.includes(snippet) || orchestrator.includes(snippet), `milestone cadence missing ${snippet}`);
      }
      assert.ok(generator.includes('recentCrossings'));
      assert.ok(generator.includes('MILESTONE_MOMENT_TTL_MS'));
      assert.ok(generator.includes("const OCTEZ = 'https://eu.rpc.tez.capital'"));
      assert.ok(generator.includes("const OCTEZ_ARCHIVE = 'https://tezos-mainnet.octez.io'"));
      assert.ok(generator.includes('fetchJson(OCTEZ_ARCHIVE, headerPath)'));
      assert.ok(generator.includes('exactCycleMilestoneMoment'));
      assert.ok(generator.includes('Octez mainnet head and cycle with TzKT indexed statistics'));
      assert.ok(orchestrator.includes("MILESTONE_TARGETS = ['data/milestone-catalog.json']"));
      pass('milestone catalog preserves curated thresholds and regenerates after 14 days or 100 commits');
    } catch (error) {
      fail(`milestone catalog contracts failed: ${error.message}`);
    }
  }

  async function checkVisitStreakBehavior() {
    const originalGlobals = new Map();
    const rememberGlobal = (key) => {
      originalGlobals.set(key, {
        exists: Object.prototype.hasOwnProperty.call(globalThis, key),
        value: globalThis[key]
      });
    };
    const restoreGlobals = () => {
      for (const [key, original] of originalGlobals) {
        if (original.exists) globalThis[key] = original.value;
        else delete globalThis[key];
      }
    };
    const createStorage = (seed = {}) => {
      const values = new Map(Object.entries(seed).map(([key, value]) => [key, String(value)]));
      return {
        getItem: (key) => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value))
      };
    };

    for (const key of ['__visitStreakEnqueue', 'document', 'localStorage', 'requestAnimationFrame', 'setTimeout']) {
      rememberGlobal(key);
    }

    try {
      const source = await readText('js/features/streak.js');
      const styles = `${await readText('css/styles.css')}\n${await readText('css/shell-extras.css')}`;
      const queueImport = "import { enqueueToast } from '../ui/toast-queue.js';";
      assert.ok(source.includes(queueImport), 'visit streak must keep using the shared toast queue');
      assert.doesNotMatch(source, /STREAK_SCOPE_COPY|Browser-local · Details in Settings/, 'signal toasts must not expose storage mechanics');
      for (const contract of [
        '.visit-streak-toast.signal-bloom',
        '.signal-bloom-sigil',
        '.signal-bloom-number',
        '.signal-bloom-share',
        '@keyframes signal-bloom-digit-enter',
        '@media (prefers-reduced-motion: reduce)'
      ]) {
        assert.ok(styles.includes(contract), `Signal Bloom CSS missing ${contract}`);
      }
      const testSource = source.replace(
        queueImport,
        'const enqueueToast = (item) => globalThis.__visitStreakEnqueue(item);'
      );
      const moduleUrl = `data:text/javascript;base64,${Buffer.from(testSource).toString('base64')}`;
      const { initStreak } = await import(moduleUrl);
      const now = new Date(2026, 6, 10, 12, 0, 0);
      const today = '2026-07-10';
      const yesterday = '2026-07-09';

      const runVisit = (seed = {}) => {
        const queued = [];
        const current = { textContent: '' };
        globalThis.localStorage = createStorage(seed);
        globalThis.__visitStreakEnqueue = (item) => queued.push(item);
        globalThis.document = {
          getElementById: (id) => id === 'visit-streak-current' ? current : null
        };
        initStreak(now);
        return { current, queued, storage: globalThis.localStorage };
      };

      const renderToast = (item) => {
        const appended = [];
        class FakeElement {
          constructor(tagName) {
            this.tagName = tagName;
            this.children = [];
            this.listeners = new Map();
            this.classNames = new Set();
            this.classList = {
              add: (...names) => names.forEach((name) => this.classNames.add(name)),
              remove: (...names) => names.forEach((name) => this.classNames.delete(name))
            };
            this.textContent = '';
            this.isConnected = false;
          }
          setAttribute(name, value) { this[name] = String(value); }
          addEventListener(name, listener) { this.listeners.set(name, listener); }
          append(...children) { this.children.push(...children); }
          remove() { this.isConnected = false; }
        }
        globalThis.document = {
          createElement: (tagName) => new FakeElement(tagName),
          body: {
            appendChild: (node) => {
              node.isConnected = true;
              appended.push(node);
            }
          }
        };
        globalThis.requestAnimationFrame = (callback) => callback();
        globalThis.setTimeout = (callback) => {
          callback();
          return 0;
        };
        item.show(() => {}, item.duration);
        return appended[0];
      };
      const findByClass = (node, className) => {
        if (!node) return null;
        if (String(node.className || '').split(/\s+/).includes(className)) return node;
        for (const child of node.children || []) {
          const found = findByClass(child, className);
          if (found) return found;
        }
        return null;
      };

      const firstVisit = runVisit();
      assert.equal(firstVisit.queued.length, 0, 'first visit must start silently without a welcome toast');
      assert.equal(firstVisit.current.textContent, 'Current streak: 1 day');
      assert.equal(firstVisit.storage.getItem('tezos_streak_count'), '1');
      assert.equal(firstVisit.storage.getItem('tezos_streak_last_visit'), today);

      const sameDayReload = runVisit({
        tezos_streak_count: 2,
        tezos_streak_last_visit: today
      });
      assert.equal(sameDayReload.queued.length, 0, 'same-day reload must not replay the streak toast');
      assert.equal(sameDayReload.current.textContent, 'Current streak: 2 days');

      const nextDayVisit = runVisit({
        tezos_streak_count: 1,
        tezos_streak_last_visit: yesterday
      });
      assert.equal(nextDayVisit.queued.length, 0, 'ordinary advancing days must stay silent');
      assert.equal(nextDayVisit.storage.getItem('tezos_streak_count'), '2');

      const resetVisit = runVisit({
        tezos_streak_count: 8,
        tezos_streak_last_visit: '2026-07-01'
      });
      assert.equal(resetVisit.storage.getItem('tezos_streak_count'), '1');
      assert.equal(resetVisit.queued.length, 0, 'a missed-day reset must stay silent');

      for (const ordinaryCount of [8, 14, 30, 60, 99, 101, 364, 366]) {
        const ordinaryVisit = runVisit({
          tezos_streak_count: ordinaryCount - 1,
          tezos_streak_last_visit: yesterday
        });
        assert.equal(ordinaryVisit.queued.length, 0, `ordinary Day ${ordinaryCount} must stay silent`);
        assert.equal(ordinaryVisit.storage.getItem('tezos_streak_count'), String(ordinaryCount));
      }

      const signalCounts = [7, 10, 11, 22, 33, 100, 111, 222, 333, 365, 444, 555, 666, 777, 888, 999, 1000, 1111];
      for (const signalCount of signalCounts) {
        const signalVisit = runVisit({
          tezos_streak_count: signalCount - 1,
          tezos_streak_last_visit: yesterday
        });
        assert.equal(signalVisit.queued.length, 1, `Day ${signalCount} must enqueue one hidden signal`);
        assert.equal(signalVisit.queued[0].duration, 11000, `Day ${signalCount} signal duration mismatch`);
        const signalToast = renderToast(signalVisit.queued[0]);
        assert.match(signalToast.className, /\bsignal-bloom\b/);
        assert.match(signalToast.className, /\bmilestone\b/);
        assert.equal(signalToast['data-streak-count'], String(signalCount));
        assert.ok(signalToast['data-signal-kind'], `Day ${signalCount} signal kind missing`);
        const announcement = findByClass(signalToast, 'signal-bloom-announcement');
        assert.match(announcement?.textContent || '', new RegExp(`Day ${signalCount.toLocaleString('en-US')}`));
        assert.doesNotMatch(announcement?.textContent || '', /browser-local|stored locally|Settings → Visit streak/i);
        const number = findByClass(signalToast, 'signal-bloom-number');
        assert.equal((number?.children || []).map((child) => child.textContent).join(''), signalCount.toLocaleString('en-US'));
        const share = findByClass(signalToast, 'signal-bloom-share');
        assert.equal(share?.textContent, 'Share the signal');
        assert.match(share?.['aria-label'] || '', new RegExp(`Day ${signalCount.toLocaleString('en-US')}`));
      }

      pass('visit streak advances quietly and blooms only for the hidden numerology and landmark signal catalog');
    } catch (error) {
      fail(`visit streak behavior failed: ${error.message}`);
    } finally {
      restoreGlobals();
    }
  }

  return { checkMilestoneLifecycleBehavior, checkMilestoneCatalogContracts, checkVisitStreakBehavior };
}
