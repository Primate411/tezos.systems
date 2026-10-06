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
