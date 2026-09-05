import assert from 'node:assert/strict';

export async function smokeGovernancePeriods(browser, baseUrl, { installFeatureMocks }) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await installFeatureMocks(context, { etherlinkQuiet: true, blockHeadAutoAdvance: false });
    const head = 12345678;
    const contract = 'KT1AXRU3wLc87WNhLhVGrgqDGubLACUMUgPb';
    const candidate = '007a6ac98660fa68cab09abfb3a59be93ccf4a5d47aeb44a00ffb0a3babdba448a';
    let scenario = '';
    let views = 0;
    const json = (route, value) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(value) });
    await context.route(`**/contracts/${contract}/storage`, route => json(route, {
        config: { started_at_level: String(head - 47 * 67200 - 100), period_length: '67200',
            proposal_quorum: '1', promotion_quorum: '5', promotion_supermajority: '75' },
        voting_context: { period_index: scenario === 'current-ballot' ? '47' : scenario === 'advanced-promotion' ? '46' : '41',
            period: scenario.includes('proposal') || scenario === 'advanced-promotion'
                ? { proposal: { winner_candidate: candidate, max_upvotes_voting_power: '90000000', total_voting_power: '100000000' } }
                : { promotion: { winner_candidate: candidate, yea_voting_power: '1', nay_voting_power: '90000000',
                    pass_voting_power: '0', total_voting_power: '100000000' } } }
    }));
    await context.route('**/helpers/scripts/run_script_view', route => {
        views += 1;
        assert(route.request().url().includes(`/blocks/${head}/`), 'The view is pinned to the observed head');
        const body = route.request().postDataJSON();
        assert.equal(body.view, 'get_voting_state');
        assert.equal(body.contract, contract);
        if (scenario === 'view-unavailable') return route.fulfill({ status: 503, body: '{}' });
        return json(route, { data: { prim: 'Pair', args: [{ int: scenario === 'view-mismatch' ? '48' : '47' },
            { prim: scenario === 'advanced-promotion' ? 'Right' : 'Left', args: [{ prim: 'Unit' }] }, { int: '67099' }] } });
    });
    await context.route('**/votes/total_voting_power', route => json(route, '200000000'));
    await context.addInitScript(() => {
        localStorage.setItem('tezos-systems-theme', 'clean');
        localStorage.setItem('tezos-toured', '1');
        localStorage.setItem('tezos-welcomed', '1');
    });
    try {
        const page = await context.newPage();
        for (const [name, expected] of [
            ['expired-promotion', 'No Proposal'], ['expired-proposal', 'No Proposal'],
            ['advanced-promotion', 'NOT PASSING'], ['current-ballot', 'CANNOT PASS'],
            ['view-unavailable', 'Data delayed'], ['view-mismatch', 'Data delayed']
        ]) {
            scenario = name;
            views = 0;
            await page.goto(`${baseUrl}/?theme=clean&scenario=${name}#l2chamber`, { waitUntil: 'domcontentloaded' });
            await page.waitForFunction(text => document.getElementById('etherlink-governance-entry-value')?.textContent === text, expected);
            const state = await page.locator('#etherlink-governance-entry-card').evaluate(el => ({
                active: el.dataset.etherlinkGovernanceLive, text: el.innerText, risk: el.classList.contains('chamber-entry-risk')
            }));
            assert.equal(state.active, String(['advanced-promotion', 'current-ballot'].includes(name)), name);
            assert.equal(views > 0, name !== 'current-ballot', name);
            if (name.startsWith('expired')) assert(!/CANNOT PASS|007a6ac/.test(state.text) && !state.risk, name);
            if (name === 'advanced-promotion') {
                await page.waitForFunction(() => /Promotion not passing/.test(document.querySelector('#etherlink-governance-modal .chamber-badge')?.textContent));
                assert.match(state.text, /Quorum 0\.0%/, 'A fresh Promotion cannot inherit proposal upvotes or old ballots');
            }
        }
    } finally { await context.close(); }
}
