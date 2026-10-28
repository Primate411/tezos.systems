import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile('js/features/my-tezos-tezosx.mjs', 'utf8');
const refresh = source.match(/export async function refreshMyTezosTezosX\([^]*?\n\}/)?.[0].replace(/^export /, '');
assert(refresh, 'the Tezos X refresh owner must exist');

function overlap() {
    let finish;
    const active = new Promise(resolve => { finish = resolve; });
    const calls = [];
    const aborted = [];
    const context = vm.createContext({
        refreshInFlight: active, queuedLoadMore: null, generation: 7,
        selectedAddress: 'account-a', currentDetails: { nextPageParams: { block: 42 } },
        visible: true, calls,
        refreshController: { abort: () => aborted.push(true) },
        readLinkedAccounts: () => [], scopedLinkedAccounts: () => [],
        renderLinkedAccounts() {}, renderSummary() {}, renderDetails() {}, setStatus() {}
    });
    const invoke = vm.runInContext(`${refresh}
        function isVisible() { return visible; }
        const invoke = refreshMyTezosTezosX;
        refreshMyTezosTezosX = options => { calls.push(options); return 'next page'; };
        invoke;
    `, context);
    return { context, calls, aborted, invoke, finish() { context.refreshInFlight = null; finish('current page'); } };
}

const queued = overlap();
const first = queued.invoke({ loadMore: true });
const duplicate = queued.invoke({ loadMore: true });
assert.equal(queued.calls.length, 0, 'pagination waits for the active read');
queued.finish();
assert.equal(await first, 'next page');
assert.equal(await duplicate, 'next page');
assert.equal(queued.calls.length, 1, 'overlapping clicks request one page');
assert.equal(queued.calls[0].loadMore, true);
assert.equal(queued.context.queuedLoadMore, null, 'completed intent is released');

for (const change of [
    state => { state.selectedAddress = 'account-b'; },
    state => { state.generation++; },
    state => { state.visible = false; },
    state => { state.currentDetails = { nextPageParams: null }; }
]) {
    const test = overlap();
    const pending = test.invoke({ loadMore: true });
    change(test.context);
    test.finish();
    assert.equal(await pending, null, 'obsolete, hidden or exhausted pagination does not start');
    assert.equal(test.calls.length, 0);
    assert.equal(test.context.queuedLoadMore, null);
}

const background = overlap();
const joined = background.invoke({ background: true });
background.finish();
assert.equal(await joined, 'current page', 'background polling still coalesces');
assert.equal(background.calls.length, 0);
const replaced = overlap();
const obsolete = replaced.invoke({ loadMore: true });
await replaced.invoke({ force: true });
assert.equal(replaced.context.queuedLoadMore, null, 'a forced account read releases the old queue immediately');
assert.equal(replaced.aborted.length, 1);
replaced.finish();
assert.equal(await obsolete, null);
assert.equal(replaced.calls.length, 0);
console.log('ok - Tezos X retains pagination intent across background reads, coalesces clicks, and discards obsolete work');

// IndexedDB completion can arrive after inclusion, scope or visibility changes.
function persistenceRace() {
    let finishWrite, rejectWrite, startedWrite;
    const writing = new Promise(resolve => { startedWrite = resolve; });
    const disk = new Promise((resolve, reject) => { finishWrite = resolve; rejectWrite = reject; });
    let paused = true;
    const statuses = [], renders = [];
    const context = vm.createContext({
        AbortController,
        refreshInFlight: null, refreshController: null, queuedLoadMore: null,
        generation: 0, selectedAddress: 'account-a', currentDetails: null,
        accountRows: [], paginationBusy: false, visible: true,
        entries: [{ address: 'account-a', included: true }],
        MY_TEZOS_SCOPE_ALL: 'all', readMyTezosScope: () => 'all',
        scopedLinkedAccounts: entries => entries,
        renderLinkedAccounts() {},
        renderSummary: () => renders.push('summary'),
        renderDetails: () => renders.push('details'),
        setStatus: (text, state) => statuses.push({ text, state }),
        getMyTezosMeta: async () => null,
        fetchEtherlinkNativeBalances: async addresses => addresses.map(address => ({ address, nativeXtz: 2.5 })),
        fetchEtherlinkAccountOverview: async () => ({ transactions: 42 }),
        fetchEtherlinkAccountDetails: async () => ({
            transactions: [], tokens: [], nfts: [], nextPageParams: null,
            receipt: { coverage: { state: 'complete' }, warnings: [] }
        }),
        mergeById: (prior = [], next = []) => [...prior, ...next],
        myTezosAccountKey: (layer, address) => `${layer}:${address}`,
        putMyTezosRecords: persist, replaceMyTezosAccountRecords: persist, setMyTezosMeta: persist,
        formatFreshnessStamp: () => 'Etherlink · just now',
        document: { getElementById: () => null }
    });
    function persist() { startedWrite(); return paused ? disk : Promise.resolve(); }
    const invoke = vm.runInContext(`${refresh}
        function isVisible() { return visible; }
        function readLinkedAccounts() { return entries; }
        refreshMyTezosTezosX;
    `, context);
    return { context, invoke, writing, statuses, renders, finishWrite, rejectWrite, resume() { paused = false; } };
}

for (const scenario of ['excluded', 'excluded-write-error', 'new-account', 'hidden']) {
    const race = persistenceRace();
    const oldRead = race.invoke();
    await race.writing;
    if (scenario.startsWith('excluded')) {
        race.context.entries[0].included = false;
        await race.invoke({ force: true });
        assert.equal(race.statuses.at(-1).state, 'empty');
    } else if (scenario === 'new-account') {
        race.context.entries = [{ address: 'account-b', included: true }];
        race.context.selectedAddress = 'account-b';
        race.resume();
        await race.invoke({ force: true });
        assert.equal(race.context.currentDetails.address, 'account-b');
    } else {
        race.context.visible = false;
    }
    const statusCount = race.statuses.length;
    const renderCount = race.renders.length;
    if (scenario === 'excluded-write-error') race.rejectWrite(new Error('storage unavailable'));
    else race.finishWrite();
    assert.equal(await oldRead, null, `${scenario}: obsolete persistence must discard its completion`);
    assert.equal(race.statuses.length, statusCount, `${scenario}: old completion cannot overwrite current status`);
    assert.equal(race.renders.length, renderCount, `${scenario}: old completion cannot repaint the current view`);
}
const current = persistenceRace();
const successfulRead = current.invoke();
await current.writing;
current.finishWrite();
assert(await successfulRead, 'the current generation still completes after persistence');
assert.equal(current.statuses.at(-1).state, 'complete');
console.log('ok - Tezos X discards obsolete or hidden persistence completions without losing current reads');
