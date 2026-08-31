/**
 * Canonical explanatory copy for the Staking Chamber guide view.
 *
 * Keep this module DOM-free so the browser room, generated route metadata,
 * structured data, and static truth checks can all read the same source.
 */

export const STAKING_GUIDE_COPY = Object.freeze({
    kicker: 'Delegation, direct stake, and baking',
    title: 'How Tezos staking works',
    intro: 'Tezos has three related but different roles. Choose the role first, then inspect the baker and the terms that apply to that role.',
    roles: Object.freeze([
        Object.freeze({
            id: 'delegation',
            label: 'Delegation',
            summary: 'Keep custody and liquidity',
            detail: 'Point transferable XTZ at a baker without freezing it. Any delegator reward payout, timing, rate, and fee are the baker\'s off-chain policy, so verify those terms directly.'
        }),
        Object.freeze({
            id: 'direct-staking',
            label: 'Direct staking',
            summary: 'Protocol rewards, frozen balance',
            detail: 'Stake directly with a baker for protocol-distributed rewards. Direct staking freezes XTZ until the protocol unstaking and finalization process completes, and stake can share penalties for punishable baker offenses.'
        }),
        Object.freeze({
            id: 'baking',
            label: 'Baking',
            summary: 'Operate a validator',
            detail: 'Run the infrastructure that proposes and attests blocks. Baking is an operator role with current protocol, key-management, availability, and capital requirements; it is not another name for delegating or direct staking.'
        })
    ]),
    comparisonRows: Object.freeze([
        Object.freeze({ label: 'Availability', delegation: 'Not frozen; transferable', staking: 'Frozen while staked, then subject to unstaking and finalization' }),
        Object.freeze({ label: 'Custody', delegation: 'You keep your keys', staking: 'You keep your keys' }),
        Object.freeze({ label: 'Protocol penalties', delegation: 'Delegated balance is not slashable', staking: 'Stake can share penalties for punishable baker offenses' }),
        Object.freeze({ label: 'Reward terms', delegation: 'Off-chain baker payout policy; verify timing, rate, and fee directly', staking: 'Protocol-distributed reward split after the baker\'s on-chain edge' }),
        Object.freeze({ label: 'Minimum', delegation: 'No protocol minimum', staking: 'No protocol minimum; a baker may set an acceptance minimum' })
    ]),
    edgeNote: 'The on-chain edge_of_baking_over_staking applies to direct external staking. External stakers share the portion remaining after the baker\'s 0–100% external-staker edge. It is not a delegation fee.',
    apyNote: 'These are gross network-rate estimates from live issuance, supply, staked XTZ, delegated participation, and the protocol staking/delegation weight. They are not promised personal yield. Delegation remains subject to the baker\'s off-chain payout policy; direct external-staker rewards are reduced by that baker\'s on-chain edge.',
    steps: Object.freeze([
        Object.freeze({ label: 'Use a compatible wallet', detail: 'Keep control of the keys and verify the account you intend to delegate or stake from.' }),
        Object.freeze({ label: 'Fund it with XTZ', detail: 'Verify the receiving address before moving funds.' }),
        Object.freeze({ label: 'Inspect a baker', detail: 'Check current capacity and on-chain context, then verify any published delegation payout policy or direct-staker acceptance terms.' }),
        Object.freeze({ label: 'Choose the role', detail: 'Delegate for liquid, baker-operated payouts or directly stake for frozen, protocol-distributed rewards.' }),
        Object.freeze({ label: 'Review the wallet operation', detail: 'Confirm the baker, amount, action, and resulting liquidity before approving it.' })
    ]),
    context: Object.freeze([
        'Delegation stays liquid; direct staking does not.',
        'Tezos has used proof-of-stake since mainnet launch in 2018.',
        'Protocol upgrades are proposed and adopted through on-chain governance, with the tracked history documented in the Protocol Anthology.',
        'Delegation, direct staking, and baking retain different payout, liquidity, penalty, and operational assumptions.'
    ]),
    faq: Object.freeze([
        Object.freeze({
            question: 'What is Tezos staking?',
            answer: 'Tezos lets an account delegate transferable XTZ to a baker or stake directly with one. Delegation does not freeze the balance; direct staking does. Baking is the separate validator role that proposes and attests blocks.'
        }),
        Object.freeze({
            question: 'How much can I earn?',
            answer: 'Rates are dynamic and depend on network participation, protocol issuance, and the terms of the selected baker. The Staking Chamber shows gross network-rate estimates only when their live source inputs are available.'
        }),
        Object.freeze({
            question: 'Are XTZ locked when staking?',
            answer: 'Delegated XTZ are not frozen and remain transferable. Directly staked XTZ are frozen and must pass through the protocol unstaking and finalization process before becoming spendable again.'
        }),
        Object.freeze({
            question: 'Is the direct-staking edge a delegation fee?',
            answer: 'No. A baker\'s on-chain external-staker edge applies to direct external staking. Delegation payouts are separate baker-operated transfers whose timing, rate, and fee policy are not enforced by the protocol.'
        }),
        Object.freeze({
            question: 'Is there a minimum amount?',
            answer: 'There is no protocol minimum to delegate or directly stake, although a baker can set an acceptance minimum for external stakers. Running a baker is a separate operator role with current protocol requirements.'
        })
    ])
});

export const STAKING_GUIDE_FAQ = STAKING_GUIDE_COPY.faq;
