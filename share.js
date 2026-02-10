/**
 * Share/Screenshot functionality for tezos.systems
 */

let html2canvasLoaded = false;

// Each stat maps to an array of { label, text(value, change) }
// change: 'up' | 'down' | 'neutral' | ''
const TWEET_OPTIONS = {
    'total-bakers': [
        // Standard
        { label: '📊 Standard', text: (v) => `Tezos has ${v} active bakers securing the network right now.\n\nReal-time stats →` },
        { label: '📊 Standard', text: (v) => `${v} independent validators running Tezos consensus.\n\nNo permission needed. No minimum stake. Just bake.` },
        { label: '📊 Standard', text: (v) => `Current Tezos baker count: ${v}\n\nEvery single one ran by an independent operator. That's decentralization you can count.` },
        // Dunk
        { label: '🔥 Dunk', text: (v) => `${v} independent bakers on Tezos. Each one can run on a Raspberry Pi.\n\nDecentralization isn't a marketing slide.` },
        { label: '🔥 Dunk', text: (v) => `ETH requires 32 ETH (~$64K+) to solo validate.\nTezos requires... a Raspberry Pi and some XTZ.\n\n${v} bakers chose the permissionless option.` },
        { label: '🔥 Dunk', text: (v) => `Tezos has ${v} bakers running multiple client implementations. Octez, Mavkit — real client diversity from day one.\n\nNo single points of failure.` },
        { label: '🔥 Dunk', text: (v) => `"Decentralized" chains with a foundation kill switch vs ${v} Tezos bakers that literally no one can shut down.\n\nChoose wisely.` },
        // Flex
        { label: '💪 Flex', text: (v) => `${v} validators. No foundation permission. No expensive hardware requirement.\n\nThat's what permissionless actually looks like.` },
        { label: '💪 Flex', text: (v) => `${v} bakers, each one an equal vote in protocol governance.\n\nNo delegation to insiders. No "governance tokens." Just stake and vote.` },
        // Recruit
        { label: '📢 Recruit', text: (v, c) => c === 'down'
            ? `Baker count trending down to ${v} — your vote has never mattered more.\n\nLess competition, more rewards. Start baking today →\nhttps://docs.tez.capital`
            : `${v} bakers and counting. The barrier to entry is shockingly low.\n\nGot a spare machine? You could be earning rewards by tonight →\nhttps://docs.tez.capital` },
        { label: '📢 Recruit', text: (v, c) => c === 'down'
            ? `Fewer bakers = bigger slice of the pie. ${v} and dropping.\n\nSeriously, if you hold XTZ and aren't baking, what are you doing?`
            : `Every new baker makes Tezos stronger. Currently at ${v}.\n\nNo lockup, no slashing, no $64K minimum. What's stopping you?` },
        // Question
        { label: '❓ Question', text: (v) => `${v} independent bakers on Tezos.\n\nHow many validators does your chain need to go down before you start worrying?` },
        { label: '❓ Question', text: (v) => `Genuine question: why would anyone stake on a chain with slashing risk when Tezos has ${v} bakers earning yield with zero slashing?` },
        // Comparison
        { label: '📈 Compare', text: (v) => `Validator accessibility:\n• Tezos: ${v} bakers (anyone can join, low hardware)\n• ETH: ~1M validators (32 ETH minimum, ~$64K+)\n• SOL: ~1,800 (expensive hardware required)\n\nPermissionless means permissionless.` },
    ],
    'tz4-adoption': [
        // Standard
        { label: '📊 Standard', text: (v) => `${v} of Tezos bakers now use tz4/BLS signatures — 63× bandwidth savings over traditional keys.\n\nTrack the migration →` },
        { label: '📊 Standard', text: (v) => `BLS signature adoption on Tezos: ${v}\n\nSmaller consensus messages, faster finality, better scalability. The upgrade path is working.` },
        // Dunk
        { label: '🔥 Dunk', text: (v) => `${v} of Tezos bakers already migrated to BLS signatures.\n\nETH is still working through its account abstraction roadmap. Tezos ships.` },
        { label: '🔥 Dunk', text: (v) => `While other chains debate signature schemes in Discord, ${v} of Tezos bakers already upgraded to BLS.\n\nOn-chain governance means upgrades actually happen.` },
        { label: '🔥 Dunk', text: (v) => `BLS signatures give Tezos 63× bandwidth savings on consensus.\n\nMost chains are still debating whether to even adopt aggregate signatures.` },
        // Flex
        { label: '💪 Flex', text: (v) => `${v} tz4/BLS adoption. 63× bandwidth savings. The chain upgrades itself AND its bakers upgrade with it.\n\nThis is what a living protocol looks like.` },
        { label: '💪 Flex', text: (v) => `tz4 adoption at ${v} and climbing.\n\nBLS aggregate signatures mean Tezos consensus gets lighter as more bakers adopt. The network literally gets better over time.` },
        // Question
        { label: '❓ Question', text: (v) => `${v} of Tezos bakers voluntarily upgraded their signing keys to a more efficient scheme.\n\nWhen was the last time your chain's validators proactively improved consensus?` },
        { label: '❓ Question', text: (v) => `63× bandwidth savings from BLS signatures. ${v} adoption and growing.\n\nWhy isn't every chain doing this?` },
        // Comparison
        { label: '📈 Compare', text: (v) => `Signature tech comparison:\n• Tezos: BLS aggregate sigs (${v} adopted), 63× savings\n• ETH: Still primarily ECDSA, EIP-7702 in progress\n• Solana: Ed25519 only\n\nTezos moves fast because governance works.` },
    ],
    'staking-apy': [
        // Standard
        { label: '📊 Standard', text: (v) => `Tezos staking APY: ${v}\n\nNo lockup. No slashing. No minimum. Just delegate and earn.` },
        { label: '📊 Standard', text: (v) => `Current XTZ staking yield: ${v}\n\nFully liquid — use your tokens anytime while earning rewards.` },
        // Dunk
        { label: '🔥 Dunk', text: (v) => `Tezos staking: ${v} APY. No lockups, no slashing surprises, no "restaking" ponzi needed.\n\nJust honest yield for securing the network.` },
        { label: '🔥 Dunk', text: (v) => `ETH staking: lock 32 ETH, risk slashing, need Lido wrapper.\nTezos staking: ${v} APY, fully liquid, delegate any amount.\n\nOne of these is user-friendly.` },
        { label: '🔥 Dunk', text: (v) => `Tezos: ${v} APY, liquid, no slashing.\nCosmos: similar APY, 21-day unbonding, slashing risk.\n\nWhy do people accept worse terms?` },
        // Flex
        { label: '💪 Flex', text: (v) => `${v} APY for securing one of the most technically advanced L1s in crypto.\n\nNo wrappers. No lockups. No slashing. Just XTZ.` },
        { label: '💪 Flex', text: (v) => `Earning ${v} just for holding and delegating XTZ.\n\nThe tokenomics actually make sense — adaptive issuance adjusts based on network participation.` },
        // Recruit
        { label: '📢 Recruit', text: (v) => `Not staking your XTZ?\n\nYou're leaving ${v} APY on the table. Delegation takes 2 clicks and your tokens stay liquid.` },
        // Question
        { label: '❓ Question', text: (v) => `${v} staking APY with zero lockup and zero slashing risk.\n\nWhy would anyone choose a chain that punishes you for validating?` },
        { label: '❓ Question', text: (v) => `If you could earn ${v} yield without locking your tokens or risking slashing... why wouldn't you?\n\nSerious question for ETH stakers.` },
    ],
    'issuance-rate': [
        // Standard
        { label: '📊 Standard', text: (v) => `Tezos issuance rate: ${v}\n\nAdaptive issuance — the protocol adjusts based on staking participation. Sound money, on-chain.` },
        { label: '📊 Standard', text: (v) => `Current XTZ issuance: ${v}\n\nNot fixed by decree. Not set by a foundation. Determined by protocol-level economic feedback loops.` },
        // Dunk
        { label: '🔥 Dunk', text: (v) => `Tezos issuance: ${v}. Adaptive, voted on by the network.\n\nNot decided by a foundation in a group chat. Not printed to fund VC rounds.` },
        { label: '🔥 Dunk', text: (v) => `ETH went from PoW to PoS and called it "ultrasound money."\n\nTezos has had adaptive issuance at ${v} governed by on-chain votes. No marketing campaign needed.` },
        { label: '🔥 Dunk', text: (v) => `Solana's inflation: fixed schedule, no governance input.\nTezos issuance: ${v}, dynamically adjusted by protocol economics.\n\nOne is monetary policy. The other is "trust us bro."` },
        // Flex
        { label: '💪 Flex', text: (v) => `${v} issuance rate. Adaptive. Governed. Transparent.\n\nTezos monetary policy is literally encoded in the protocol, not someone's Twitter bio.` },
        // Question
        { label: '❓ Question', text: (v) => `Tezos issuance: ${v}, dynamically adjusted by the protocol itself.\n\nDo you know your chain's issuance schedule? Do you get a vote on it?` },
        { label: '❓ Question', text: (v) => `Should monetary policy be hardcoded, or should it adapt to network conditions?\n\nTezos chose adaptive: ${v} current rate, governed on-chain.` },
        // Comparison
        { label: '📈 Compare', text: (v) => `Issuance governance:\n• BTC: Fixed halving (no input)\n• ETH: Core dev decisions\n• SOL: Fixed schedule\n• XTZ: ${v} — adaptive, on-chain governed\n\nOnly one lets stakeholders vote.` },
    ],
    'staking-ratio': [
        // Standard
        { label: '📊 Standard', text: (v) => `${v} of all XTZ is now staked.\n\nStrong participation = strong security = healthy network.` },
        { label: '📊 Standard', text: (v) => `Tezos staking ratio: ${v}\n\nEvery staked XTZ is a vote of confidence in the network's future.` },
        // Dunk
        { label: '🔥 Dunk', text: (v) => `${v} of XTZ staked natively. No Lido. No liquid staking derivatives. No wrapper tokens.\n\nIt's built into the protocol. Novel concept, apparently.` },
        { label: '🔥 Dunk', text: (v) => `ETH staking ratio: ~28% (and a large chunk through Lido/Coinbase).\nTezos staking ratio: ${v} — natively, directly, no middleman.\n\nThe difference is protocol design.` },
        { label: '🔥 Dunk', text: (v) => `${v} staked on Tezos without needing a single liquid staking derivative.\n\nETH needed an entire DeFi vertical just to make staking usable. Tezos ships it at the protocol level.` },
        // Flex
        { label: '💪 Flex', text: (v) => `${v} staking ratio. XTZ holders don't just hold — they participate.\n\nStaking IS governance on Tezos. Your stake is your vote.` },
        { label: '💪 Flex', text: (v) => `${v} of all XTZ securing the network.\n\nFully liquid. No lockups. No intermediaries. This is how PoS should work.` },
        // Question
        { label: '❓ Question', text: (v) => `${v} of XTZ staked natively vs ETH's ~28% (largely through third parties).\n\nWhich network has better aligned incentives?` },
        { label: '❓ Question', text: (v) => `If ${v} of a token's supply is actively staked and governing the chain, is that bullish or bearish?\n\n(It's bullish.)` },
        // Comparison
        { label: '📈 Compare', text: (v) => `Staking participation:\n• Tezos: ${v} (native, liquid)\n• ETH: ~28% (largely via Lido/Coinbase)\n• SOL: ~65% (lockup required)\n• ATOM: ~63% (21-day unbonding)\n\nTezos: highest effective participation, zero lockup.` },
    ],
    'total-burned': [
        // Standard
        { label: '📊 Standard', text: (v) => `${v} XTZ burned and removed from circulation permanently.\n\nEvery smart contract call, every transaction — a little more gets burned.` },
        { label: '📊 Standard', text: (v) => `Total XTZ burned: ${v}\n\nDeflationary pressure built directly into protocol economics.` },
        // Dunk
        { label: '🔥 Dunk', text: (v) => `${v} XTZ burned.\n\nETH needed EIP-1559 and years of debate to add fee burning. Tezos just... had it.` },
        { label: '🔥 Dunk', text: (v) => `"Ultrasound money" requires a marketing campaign.\n\nTezos just quietly burns ${v} XTZ through normal protocol operations. No branding needed.` },
        // Flex
        { label: '💪 Flex', text: (v) => `${v} XTZ gone forever. Not locked. Not staked. Burned.\n\nAdaptive issuance + protocol-level burning = genuinely sound tokenomics.` },
        { label: '💪 Flex', text: (v) => `Every smart contract call on Tezos burns XTZ. Total so far: ${v}\n\nMore usage = more scarcity. The flywheel works.` },
        // Question
        { label: '❓ Question', text: (v) => `${v} XTZ permanently burned through protocol operations.\n\nAt what point does a token with adaptive issuance AND burn mechanics become the most sound money in crypto?` },
        { label: '❓ Question', text: (v) => `Adaptive issuance + ${v} XTZ burned.\n\nIs Tezos the most underappreciated deflationary asset in crypto right now?` },
        // Comparison
        { label: '📈 Compare', text: (v) => `Burn mechanics:\n• ETH: EIP-1559 base fee burn (since Aug 2021)\n• BTC: None\n• SOL: 50% of fees burned\n• XTZ: ${v} burned via storage fees + operations\n\nTezos had fee burning before it was cool.` },
    ],
    'total-supply': [
        { label: '📊 Standard', text: (v) => `Total XTZ supply: ${v}\n\nWith adaptive issuance and ongoing burns, this number tells a story of sound monetary policy.` },
        { label: '📊 Standard', text: (v) => `${v} total XTZ in existence.\n\nNo VC unlocks. No team dumps. Transparent, on-chain economics.` },
        { label: '💪 Flex', text: (v) => `${v} XTZ total supply. Every token accounted for on-chain.\n\nNo hidden wallets. No surprise unlocks. No "strategic reserves."` },
        { label: '🔥 Dunk', text: (v) => `${v} XTZ total supply.\n\nFully transparent on-chain economics. No mysterious wallet movements, no surprise foundation sells.` },
        { label: '❓ Question', text: (v) => `Total XTZ supply: ${v}\n\nWith burns reducing this number every day, do you know which direction your chain's supply is heading?` },
    ],
    'delegated': [
        { label: '📊 Standard', text: (v) => `${v} XTZ delegated to bakers — fully liquid, earning rewards, participating in governance.\n\nAll without a single wrapper token.` },
        { label: '📊 Standard', text: (v) => `${v} XTZ actively delegated on Tezos.\n\nDelegation is native. No smart contract risk. No third-party custody.` },
        { label: '💪 Flex', text: (v) => `${v} XTZ delegated — liquid, no lockup, no wrapper token, no intermediary.\n\nJust point your tokens at a baker and earn. Revolutionary, apparently.` },
        { label: '🔥 Dunk', text: (v) => `ETH stakers: lock 32 ETH, use Lido wrapper, risk slashing.\nTezos delegators: ${v} XTZ delegated, fully liquid, zero risk.\n\nSame concept. Wildly different UX.` },
        { label: '❓ Question', text: (v) => `${v} XTZ delegated without a single lockup or wrapper.\n\nWhy does every other chain make staking so complicated?` },
        { label: '📢 Recruit', text: (v) => `${v} XTZ already delegated. Are yours?\n\nDelegation takes 2 minutes and your tokens never leave your wallet. Zero excuses.` },
    ],
    'cycle-progress': [
        { label: '📊 Standard', text: (v) => `Tezos cycle ${v} in progress.\n\nEvery cycle: bakers validate, stakers earn, governance continues. The machine keeps running.` },
        { label: '💪 Flex', text: (v) => `Cycle ${v} ticking along on Tezos.\n\nNo downtime. No "degraded performance." No emergency patches. Just blocks, every 6 seconds.` },
        { label: '🔥 Dunk', text: (v) => `Tezos cycle ${v}. Chain has never stopped.\n\nSolana had 4 major outages between 2021-2022. Tezos: zero. Ever.` },
        { label: '❓ Question', text: (v) => `Tezos is on cycle ${v} with zero downtime ever.\n\nWhat's the uptime record for your L1?` },
    ],
    'proposal': [
        { label: '📊 Standard', text: (v) => `Tezos governance: ${v}\n\nOn-chain, transparent, binding. The protocol evolves through baker votes.` },
        { label: '📊 Standard', text: (v) => `Current Tezos governance state: ${v}\n\nNo off-chain signaling. No "rough consensus." Real votes with real consequences.` },
        { label: '🔥 Dunk', text: (v) => `Tezos governance: ${v}\n\nNo hard forks. No dictators. No "rough consensus." No foundation veto. Just votes.` },
        { label: '🔥 Dunk', text: (v) => `${v}\n\nOther chains: "We'll discuss governance in the Discord."\nTezos: "We voted on-chain and it's live." Different breed.` },
        { label: '💪 Flex', text: (v) => `${v}\n\nTezos governance works because it's not optional. Every upgrade, every parameter change — voted on by the people running the chain.` },
        { label: '❓ Question', text: (v) => `${v}\n\nWhen was the last time YOU got to vote on a protocol upgrade for your chain? Tezos bakers vote on every single one.` },
        { label: '📈 Compare', text: (v) => `Governance models:\n• BTC: Mailing list arguments + miner signaling\n• ETH: Core dev calls (ACD)\n• SOL: Foundation decides\n• Tezos: ${v} — on-chain binding votes\n\nOnly one is actually democratic.` },
    ],
    'voting-period': [
        { label: '📊 Standard', text: (v) => `Tezos voting: ${v}\n\nMulti-round on-chain governance. Every baker gets a proportional vote.` },
        { label: '📊 Standard', text: (v) => `Current Tezos voting period: ${v}\n\nFive rounds ensure thorough deliberation before any upgrade goes live.` },
        { label: '💪 Flex', text: (v) => `${v}\n\nTezos governance: proposal → exploration → cooldown → promotion → adoption.\n\n5 stages. All on-chain. All transparent. All voted.` },
        { label: '🔥 Dunk', text: (v) => `Tezos: ${v}\nETH: "We'll discuss it at Devcon and maybe do an EIP."\n\nOne has a governance process. The other has vibes.` },
        { label: '❓ Question', text: (v) => `${v}\n\nTezos has formalized on-chain governance with multiple voting rounds. Your chain has... a Discord poll?` },
    ],
    'participation': [
        { label: '📊 Standard', text: (v) => `${v} voter participation in current Tezos governance period.\n\nOn-chain democracy with real turnout.` },
        { label: '📊 Standard', text: (v) => `Tezos governance participation: ${v}\n\nStakeholders actually show up to vote. The governance isn't theater.` },
        { label: '🔥 Dunk', text: (v) => `${v} voter turnout on Tezos governance.\n\nHigher than most national elections. Definitely higher than ETH's non-binding Snapshot polls.` },
        { label: '🔥 Dunk', text: (v) => `${v} participation rate.\n\nCardano launched Voltaire governance in 2024. Tezos has had binding on-chain votes since 2019.` },
        { label: '💪 Flex', text: (v) => `${v} governance participation. Tezos bakers don't just validate — they govern.\n\nStaking IS governance. No separate "governance token" needed.` },
        { label: '❓ Question', text: (v) => `${v} of Tezos stake actively voting on protocol upgrades.\n\nWhat's the governance participation rate on your chain? Do you even know?` },
        { label: '❓ Question', text: (v) => `${v} voter participation on Tezos.\n\nIf your chain's governance is "multisig controlled by the foundation," is it really decentralized?` },
        { label: '📈 Compare', text: (v) => `Governance participation:\n• Tezos: ${v} (binding on-chain votes)\n• ETH: Coin votes on Snapshot (non-binding)\n• SOL: No formal governance mechanism\n• BTC: Miner signaling only\n\nTezos is the only L1 with real on-chain democracy.` },
    ],
    'tx-volume': [
        { label: '📊 Standard', text: (v) => `${v} transactions on Tezos in the last 24 hours.\n\nSub-cent fees. 6-second finality. Real usage.` },
        { label: '📊 Standard', text: (v) => `24h Tezos transaction volume: ${v}\n\nEvery single one final in seconds, for less than a penny.` },
        { label: '🔥 Dunk', text: (v) => `${v} txs in 24h on Tezos.\n\nAll of them actually finalized. Deterministic finality — not probabilistic "it's probably fine."` },
        { label: '🔥 Dunk', text: (v) => `${v} Tezos transactions today. Average fee: sub-cent.\n\nEven with ETH's low gas right now, Tezos L1 fees are still a fraction of a cent. Consistently.` },
        { label: '💪 Flex', text: (v) => `${v} txs in 24h. 6-second blocks. Sub-cent fees. Deterministic finality.\n\nNot a testnet. Not an L2. This is the L1.` },
        { label: '💪 Flex', text: (v) => `${v} transactions processed on Tezos today.\n\nAll verified. All final. All cheap. Boring? Maybe. But boring infrastructure is good infrastructure.` },
        { label: '❓ Question', text: (v) => `${v} transactions in 24h with sub-cent fees and deterministic finality.\n\nAt what point do people realize Tezos already solved the reliability problem at L1?` },
        { label: '📈 Compare', text: (v) => `L1 reliability + cost:\n• Tezos: ${v} txs/24h, sub-cent fees, zero downtime ever\n• ETH: Low fees now but historically volatile, 12s blocks\n• SOL: High throughput but 4 major outages in 2021-2022\n\nReliable AND cheap. Tezos.` },
    ],
    'contract-calls': [
        { label: '📊 Standard', text: (v) => `${v} smart contract calls on Tezos in 24h.\n\nFormally verified contracts, sub-cent execution. The developer experience matters.` },
        { label: '📊 Standard', text: (v) => `24h Tezos contract calls: ${v}\n\nReal dApps, real users, real on-chain activity.` },
        { label: '🔥 Dunk', text: (v) => `${v} contract calls in 24h on Tezos. Sub-cent each.\n\nFormal verification support means fewer exploits. The smart contract security difference is real.` },
        { label: '💪 Flex', text: (v) => `${v} contract calls in 24h. Formally verified. Battle-tested. Cheap to call.\n\nTezos smart contracts: where "move fast and break things" meets mathematical proofs.` },
        { label: '💪 Flex', text: (v) => `${v} smart contract interactions today.\n\nMichelson and SmartPy contracts with formal verification built in. When the contract says X, it does X. No reentrancy exploits.` },
        { label: '❓ Question', text: (v) => `${v} contract calls on Tezos today.\n\nHow many DeFi exploits has Tezos had vs ETH? Formal verification matters.` },
        { label: '📈 Compare', text: (v) => `Smart contract security:\n• ETH: Billions lost to exploits over the years\n• SOL: Multiple DeFi hacks\n• Tezos: ${v} calls/day, formal verification, near-zero exploits\n\nSecurity-first design pays off.` },
    ],
    'funded-accounts': [
        { label: '📊 Standard', text: (v) => `${v} funded accounts on Tezos.\n\nEvery single one is a real address with real value.` },
        { label: '📊 Standard', text: (v) => `Tezos network: ${v} funded accounts and growing.\n\nOrganic growth from real usage, not airdrop farmers.` },
        { label: '💪 Flex', text: (v) => `${v} funded accounts. No sybil-farmed airdrops inflating the numbers.\n\nTezos doesn't need fake metrics. The fundamentals speak.` },
        { label: '🔥 Dunk', text: (v) => `${v} Tezos accounts with real balances.\n\nNot "unique wallets" created for a points program that evaporate after the airdrop. Actual users.` },
        { label: '❓ Question', text: (v) => `${v} funded accounts on Tezos.\n\nHow many of your chain's "active wallets" are just bots farming airdrops?` },
        { label: '📢 Recruit', text: (v) => `${v} funded accounts on Tezos.\n\nJoining takes seconds. No gas wars. No failed transactions. Just a working blockchain.` },
    ],
    'smart-contracts': [
        { label: '📊 Standard', text: (v) => `${v} smart contracts deployed on Tezos.\n\nFormally verified. Upgradeable through governance. Built to last.` },
        { label: '📊 Standard', text: (v) => `Tezos smart contract count: ${v}\n\nWritten in Michelson, SmartPy, or Ligo — all with formal verification support.` },
        { label: '💪 Flex', text: (v) => `${v} smart contracts deployed on a chain where formal verification is a first-class citizen.\n\nYour money deserves mathematically proven contracts.` },
        { label: '🔥 Dunk', text: (v) => `${v} Tezos contracts, many formally verified.\n\nSolidity devs: "We'll just audit it." Tezos devs: "We'll just prove it correct."` },
        { label: '❓ Question', text: (v) => `${v} smart contracts on Tezos with formal verification support.\n\nWhen billions are at stake, would you rather have an "audit" or a mathematical proof?` },
        { label: '📢 Recruit', text: (v) => `${v} contracts deployed on Tezos.\n\nSmartPy makes it shockingly easy to write formally verifiable contracts. Solidity devs: you'd feel right at home.` },
    ],
    'tokens': [
        { label: '📊 Standard', text: (v) => `${v} tokens on Tezos.\n\nFA2 standard: multi-asset, composable, and way cleaner than ERC-20.` },
        { label: '📊 Standard', text: (v) => `Tezos token ecosystem: ${v} tokens and counting.\n\nEvery one running on sub-cent transaction fees.` },
        { label: '💪 Flex', text: (v) => `${v} tokens on Tezos using the FA2 standard.\n\nOne standard for fungible, NFTs, and multi-asset. ETH needed ERC-20, ERC-721, AND ERC-1155.` },
        { label: '🔥 Dunk', text: (v) => `${v} tokens on Tezos. The FA2 standard handles fungible, NFTs, and multi-asset in one clean interface.\n\nETH's token standard fragmentation is a feature, apparently.` },
        { label: '❓ Question', text: (v) => `${v} tokens on Tezos with sub-cent transfer fees.\n\nRemember when ETH gas was $50+ per swap? Those days may be over, but Tezos fees have been sub-cent since day one.` },
    ],
    'rollups': [
        { label: '📊 Standard', text: (v) => `${v} smart rollups live on Tezos.\n\nEnshrined L2 scaling — verified by the protocol itself, not a multisig.` },
        { label: '📊 Standard', text: (v) => `Tezos smart rollups: ${v}\n\nL2 scaling that's part of the protocol, not bolted on as a business.` },
        { label: '🔥 Dunk', text: (v) => `${v} smart rollups on Tezos. Enshrined in the protocol.\n\nETH rollups: "Trust this multisig to not steal your funds."\nTezos rollups: "The L1 verifies everything."\n\nNot the same.` },
        { label: '🔥 Dunk', text: (v) => `${v} Tezos rollups, all enshrined.\n\nMost ETH L2s still run centralized sequencers with admin keys. Tezos rollups are verified by the protocol itself.` },
        { label: '💪 Flex', text: (v) => `${v} smart rollups. Protocol-enshrined. No admin keys. No centralized sequencer.\n\nThis is what real L2 scaling looks like.` },
        { label: '💪 Flex', text: (v) => `Tezos smart rollups: ${v} and growing. Run any VM — EVM, WASM, whatever.\n\nThe L1 secures them all. No separate trust assumptions.` },
        { label: '❓ Question', text: (v) => `${v} Tezos rollups, all verified by the L1 protocol itself.\n\nHow many ETH rollups have fully removed their admin keys? Almost none.` },
        { label: '📈 Compare', text: (v) => `L2 architecture:\n• ETH: Mostly centralized sequencers + multisig admin keys\n• Tezos: ${v} enshrined rollups, L1-verified, no admin keys\n\nOne is "rollup" in name. The other is rollup in design.` },
    ],
};

// Protocol-specific tweet options — keyed by protocol name for targeted tweets
const PROTOCOL_TWEET_OPTIONS_BY_NAME = {
    'Athens': [
        { label: '📊 Standard', text: (name, num, headline, total) => `Athens: Tezos' first-ever self-amendment. May 2019.\n\nReduced baking threshold from 10k to 8k tez and doubled gas limits. The governance system worked on its very first try.` },
        { label: '💪 Flex', text: (name, num, headline, total) => `May 2019: Tezos proved self-amendment wasn't just theory.\n\nAthens passed through on-chain governance and activated without a fork. No other blockchain had ever done this.` },
        { label: '🔥 Dunk', text: (name, num, headline, total) => `Athens (May 2019): The first time a blockchain upgraded itself through on-chain voting.\n\nETH was still on PoW. Cardano had no smart contracts. Tezos was already self-amending.` },
        { label: '❓ Question', text: (name, num, headline, total) => `Athens proved on-chain governance works — May 2019.\n\nTezos has now done it ${total} times. How many on-chain voted upgrades has your chain completed?` },
        { label: '📈 Compare', text: (name, num, headline, total) => `First on-chain self-amendment in blockchain history: Tezos Athens, May 2019.\n\nSince then: ${total} more upgrades, zero forks. No other L1 has matched this governance track record.` },
    ],
    'Babylon': [
        { label: '📊 Standard', text: (name, num, headline, total) => `Babylon (Oct 2019): Emmy+ consensus, smart contract entrypoints, and account system overhaul.\n\nTezos was refining its consensus algorithm while most chains hadn't shipped one.` },
        { label: '💪 Flex', text: (name, num, headline, total) => `Babylon introduced smart contract entrypoints — typed function calls to contracts.\n\nClean, composable contract interfaces in 2019. The kind of developer UX others are still catching up to.` },
        { label: '🔥 Dunk', text: (name, num, headline, total) => `Babylon shipped Emmy+ consensus and entrypoints in October 2019.\n\nETH didn't get its consensus upgrade (The Merge) until September 2022 — three years later.` },
        { label: '❓ Question', text: (name, num, headline, total) => `Babylon added typed entrypoints to Tezos smart contracts in 2019.\n\nHow many chains have properly typed contract call interfaces even now?` },
    ],
    'Carthage': [
        { label: '📊 Standard', text: (name, num, headline, total) => `Carthage (Mar 2020): 30% more gas capacity.\n\nNotable because the first Carthage proposal was rejected — proving governance works both ways.` },
        { label: '💪 Flex', text: (name, num, headline, total) => `The first Carthage proposal failed with 3.5% support (needed 5%). Then it was fixed and passed.\n\nThat's not a bug — that's governance working as designed.` },
        { label: '🔥 Dunk', text: (name, num, headline, total) => `Carthage's first proposal was rejected, fixed, and resubmitted successfully.\n\nOn-chain governance means bad proposals get stopped. When was the last time your chain's community blocked a bad upgrade?` },
        { label: '❓ Question', text: (name, num, headline, total) => `Carthage proved Tezos governance can reject proposals too.\n\nIf your chain can only approve upgrades but never reject them, is that really governance?` },
    ],
    'Delphi': [
        { label: '📊 Standard', text: (name, num, headline, total) => `Delphi (Nov 2020): Storage costs dropped 4× and the gas model was completely recomputed.\n\nMaking the chain cheaper and more efficient — through an on-chain vote.` },
        { label: '💪 Flex', text: (name, num, headline, total) => `Delphi cut storage costs from 1 tez to 0.25 tez per kilobyte. November 2020.\n\nProtocol-level cost optimization voted on by bakers. No foundation decree needed.` },
        { label: '🔥 Dunk', text: (name, num, headline, total) => `Delphi made Tezos 4× cheaper for storage in November 2020.\n\nETH's fee problem got so bad they needed an entirely new fee market (EIP-1559, August 2021). Tezos just voted and shipped.` },
        { label: '❓ Question', text: (name, num, headline, total) => `Delphi cut Tezos storage costs 4× through a governance vote.\n\nWhen your chain needs economic parameter changes, who decides? The community or a core team?` },
    ],
    'Edo': [
        { label: '📊 Standard', text: (name, num, headline, total) => `Edo (Feb 2021): Sapling privacy, BLS12-381 curve, and tickets for L2.\n\nPrivacy-preserving transactions at the protocol level — not a mixer, not a wrapper.` },
        { label: '💪 Flex', text: (name, num, headline, total) => `Edo shipped protocol-level privacy (Sapling) and the BLS12-381 curve in February 2021.\n\nZk-proof infrastructure built into the L1, years before the "zk everything" hype cycle.` },
        { label: '🔥 Dunk', text: (name, num, headline, total) => `Tezos had BLS12-381 curve support since February 2021 (Edo).\n\nThe same cryptographic primitive that's now the foundation of every zk-rollup. Tezos was early.` },
        { label: '❓ Question', text: (name, num, headline, total) => `Edo added Sapling privacy and BLS12-381 to Tezos in February 2021.\n\nHow many L1s have native privacy-preserving transaction support built into the protocol?` },
        { label: '📈 Compare', text: (name, num, headline, total) => `ZK cryptography adoption:\n• Tezos: BLS12-381 since Feb 2021 (Edo)\n• ETH: Still building zk infrastructure via L2s\n• Most L1s: No native ZK support\n\nTezos shipped zk primitives before the zk hype.` },
    ],
    'Florence': [
        { label: '📊 Standard', text: (name, num, headline, total) => `Florence (May 2021): Depth-first execution and 32KB operation support.\n\nA technical refinement that made smart contract execution more predictable.` },
        { label: '💪 Flex', text: (name, num, headline, total) => `Florence switched Tezos to depth-first contract execution — more predictable, more composable.\n\nNotably, "Baking Accounts" were removed after the community found undocumented breaking changes. Governance works.` },
        { label: '🔥 Dunk', text: (name, num, headline, total) => `Florence removed a feature (Baking Accounts) because the community found undocumented breaking changes.\n\nOn-chain governance caught a problem and fixed it. Try doing that with a hard fork.` },
        { label: '❓ Question', text: (name, num, headline, total) => `Florence proved Tezos governance can remove problematic features, not just add new ones.\n\nCan your chain's governance subtract complexity? Or does it only grow?` },
    ],
    'Granada': [
        { label: '📊 Standard', text: (name, num, headline, total) => `Granada (Aug 2021): Block time cut from 60s to 30s, gas reduced 3-6×, and Liquidity Baking introduced.\n\nThe most controversial Tezos upgrade — protocol-level DEX liquidity.` },
        { label: '💪 Flex', text: (name, num, headline, total) => `Granada introduced Liquidity Baking — the protocol itself providing DEX liquidity. August 2021.\n\nNo other L1 has ever attempted protocol-level liquidity subsidies. Love it or hate it, it was genuinely novel.` },
        { label: '🔥 Dunk', text: (name, num, headline, total) => `Granada shipped protocol-level liquidity in August 2021.\n\nEvery block, the protocol minted tez for a DEX pool. No other chain has attempted this because most chains can't upgrade their economic model through governance.` },
        { label: '❓ Question', text: (name, num, headline, total) => `Granada made Tezos the only L1 to subsidize DEX liquidity at the protocol level.\n\nIs protocol-managed liquidity the future, or should markets handle it? Tezos let bakers decide.` },
        { label: '📈 Compare', text: (name, num, headline, total) => `Block time evolution:\n• Granada (Aug 2021): 60s → 30s\n• Mumbai (Mar 2023): 30s → 15s\n• Paris (Jun 2024): 15s → 10s\n• Tallinn (Jan 2026): 8s → 6s\n\nTezos keeps getting faster through governance.` },
    ],
    'Hangzhou': [
        { label: '📊 Standard', text: (name, num, headline, total) => `Hangzhou (Dec 2021): On-chain views, timelock encryption, and global constants.\n\nClean composability primitives that make contract-to-contract calls actually work.` },
        { label: '💪 Flex', text: (name, num, headline, total) => `Hangzhou added on-chain views to Tezos — contracts can read each other's state without callbacks.\n\nDecember 2021. Simple, clean, composable. The way smart contracts should work.` },
        { label: '🔥 Dunk', text: (name, num, headline, total) => `Hangzhou shipped timelock encryption in December 2021 — commit-reveal without the trust assumptions.\n\nProtocol-level primitives for fair ordering. Most chains are still debating MEV solutions.` },
        { label: '❓ Question', text: (name, num, headline, total) => `Hangzhou gave Tezos on-chain views and timelock encryption in 2021.\n\nDoes your chain have protocol-level commit-reveal for fair ordering, or are you still getting front-run?` },
    ],
    'Ithaca': [
        { label: '📊 Standard', text: (name, num, headline, total) => `Ithaca (Apr 2022): Tenderbake consensus — deterministic finality in ~1 minute.\n\nTezos moved from probabilistic to deterministic finality. Once confirmed, it's final. Period.` },
        { label: '💪 Flex', text: (name, num, headline, total) => `Ithaca shipped Tenderbake in April 2022 — deterministic finality for Tezos.\n\n2-block finality (~1 min). No reorgs. No "wait for 12 confirmations." When Tezos says final, it means final.` },
        { label: '🔥 Dunk', text: (name, num, headline, total) => `Tezos has had deterministic finality since April 2022 (Ithaca/Tenderbake).\n\nETH still uses probabilistic finality — technically, transactions can reorg. Tezos blocks are mathematically final.` },
        { label: '❓ Question', text: (name, num, headline, total) => `Tenderbake gave Tezos deterministic finality in April 2022.\n\nDoes your chain have mathematical finality, or just "probably final after enough confirmations"?` },
        { label: '📈 Compare', text: (name, num, headline, total) => `Finality models:\n• BTC: ~60 min (6 confirmations, probabilistic)\n• ETH: ~15 min (probabilistic, can reorg)\n• Tezos: ~12 seconds (deterministic since Ithaca, Apr 2022)\n\nDeterministic > probabilistic.` },
    ],
    'Jakarta': [
        { label: '📊 Standard', text: (name, num, headline, total) => `Jakarta (Jun 2022): Transaction rollups debut, tz4/BLS addresses introduced.\n\nThe first step toward enshrined L2 scaling on Tezos.` },
        { label: '💪 Flex', text: (name, num, headline, total) => `Jakarta introduced BLS signature support (tz4 addresses) in June 2022.\n\n63× bandwidth savings for consensus. The foundation for Tezos' scalability roadmap.` },
        { label: '🔥 Dunk', text: (name, num, headline, total) => `Jakarta shipped transaction rollups in June 2022.\n\nEnshrined in the protocol. Not a VC-funded L2 with a centralized sequencer and admin keys.` },
        { label: '❓ Question', text: (name, num, headline, total) => `Jakarta added BLS signatures to Tezos in June 2022 — 63× bandwidth savings.\n\nWhy aren't more chains adopting aggregate signatures for consensus efficiency?` },
    ],
    'Kathmandu': [
        { label: '📊 Standard', text: (name, num, headline, total) => `Kathmandu (Sep 2022): Contract events (EMIT) and VDF randomness.\n\nProper event systems and verifiable randomness — protocol-level infrastructure.` },
        { label: '💪 Flex', text: (name, num, headline, total) => `Kathmandu added VDF-based randomness to Tezos in September 2022.\n\nVerifiable, unbiasable randomness at the protocol level. Not Chainlink. Not an oracle. Built in.` },
        { label: '🔥 Dunk', text: (name, num, headline, total) => `Kathmandu shipped protocol-level VDF randomness in September 2022.\n\nMost chains rely on external oracles for randomness. Tezos builds it into the protocol.` },
        { label: '❓ Question', text: (name, num, headline, total) => `Kathmandu gave Tezos verifiable randomness and contract events in 2022.\n\nDoes your chain have unbiasable randomness built into the protocol, or do you trust an oracle?` },
    ],
    'Lima': [
        { label: '📊 Standard', text: (name, num, headline, total) => `Lima (Dec 2022): Consensus keys — separate your baking key from your funds.\n\nOperational security for validators, voted in through governance.` },
        { label: '💪 Flex', text: (name, num, headline, total) => `Lima let bakers separate consensus keys from spending keys — December 2022.\n\nYour baking operation doesn't need access to your funds. Basic security that most chains still don't offer.` },
        { label: '🔥 Dunk', text: (name, num, headline, total) => `Lima gave Tezos bakers consensus key separation in December 2022.\n\nETH validators still can't separate their signing key from their withdrawal credentials without third-party tools.` },
        { label: '❓ Question', text: (name, num, headline, total) => `Lima introduced consensus key separation for Tezos bakers.\n\nCan your chain's validators use a hot signing key without exposing their funds? Tezos has since December 2022.` },
    ],
    'Mumbai': [
        { label: '📊 Standard', text: (name, num, headline, total) => `Mumbai (Mar 2023): 15-second blocks and Smart Rollups go live.\n\nEnshrined L2 scaling — the L1 protocol verifies rollup execution. No multisig. No admin keys.` },
        { label: '💪 Flex', text: (name, num, headline, total) => `Mumbai shipped Smart Rollups in March 2023. Enshrined in the protocol.\n\nAny VM — EVM, WASM, whatever — verified by the L1. This is what a rollup-centric roadmap looks like when done right.` },
        { label: '🔥 Dunk', text: (name, num, headline, total) => `Tezos shipped enshrined Smart Rollups in March 2023.\n\nETH's rollup-centric roadmap is still mostly centralized sequencers with admin keys. Tezos enshrined rollups at the protocol level.` },
        { label: '❓ Question', text: (name, num, headline, total) => `Mumbai shipped protocol-enshrined Smart Rollups in March 2023.\n\nHow many ETH L2s have fully removed their admin keys and centralized sequencers? Still waiting.` },
        { label: '📈 Compare', text: (name, num, headline, total) => `Rollup security:\n• Tezos Smart Rollups (Mar 2023): L1-verified, no admin keys\n• ETH rollups: Centralized sequencers, multisig upgradeable\n• Most L2s: "Trust us, we'll decentralize later"\n\nTezos shipped it right the first time.` },
    ],
    'Nairobi': [
        { label: '📊 Standard', text: (name, num, headline, total) => `Nairobi (Jun 2023): Smart Rollup improvements and DAL foundations.\n\nIterating on L2 infrastructure — outbox messages and precise gas accounting.` },
        { label: '💪 Flex', text: (name, num, headline, total) => `Nairobi refined Smart Rollups with outbox messages and laid the DAL foundations. June 2023.\n\nTezos doesn't just ship features — it iterates on them through governance.` },
        { label: '🔥 Dunk', text: (name, num, headline, total) => `Nairobi improved Tezos rollups just 3 months after Mumbai launched them.\n\nShip, iterate, improve — all through on-chain votes. No waiting years for "the next hard fork."` },
        { label: '❓ Question', text: (name, num, headline, total) => `Nairobi iterated on Smart Rollups just 3 months after they launched.\n\nHow fast can your chain iterate on new features? Tezos governance enables rapid, safe evolution.` },
    ],
    'Oxford': [
        { label: '📊 Standard', text: (name, num, headline, total) => `Oxford (Feb 2024): The first protocol proposal ever REJECTED by Tezos bakers.\n\nAdaptive Issuance was too complex. Bakers said no. Oxford 2 passed with AI disabled.` },
        { label: '💪 Flex', text: (name, num, headline, total) => `Oxford was the first rejected proposal in Tezos history. February 2024.\n\nBakers reviewed the economics, found issues, and voted it down. Then a fixed version passed. This is governance working exactly as designed.` },
        { label: '🔥 Dunk', text: (name, num, headline, total) => `Tezos bakers rejected Oxford's economic changes in February 2024 — a historic first.\n\nWhen was the last time validators on your chain blocked an upgrade they disagreed with? On Tezos, it's a feature.` },
        { label: '❓ Question', text: (name, num, headline, total) => `Oxford proved Tezos governance isn't rubber-stamping.\n\nBakers rejected complex economic changes, the proposal was fixed, and a clean version passed. Can your chain do this?` },
        { label: '📈 Compare', text: (name, num, headline, total) => `Governance power:\n• Oxford rejected → fixed → Oxford 2 passed (Tezos)\n• ETH: Core devs decide, community signals but can't block\n• SOL: Foundation pushes updates\n\nOnly on Tezos can validators actually reject protocol changes.` },
    ],
    'Paris': [
        { label: '📊 Standard', text: (name, num, headline, total) => `Paris (Jun 2024): 10-second blocks and the Data Availability Layer goes live.\n\nFaster blocks + native data availability for rollups. All voted in by bakers.` },
        { label: '💪 Flex', text: (name, num, headline, total) => `Paris launched Tezos' Data Availability Layer in June 2024.\n\nNative DA for rollups — no third-party DA layer needed. The L1 handles data availability itself.` },
        { label: '🔥 Dunk', text: (name, num, headline, total) => `Paris shipped a native Data Availability Layer in June 2024.\n\nETH rollups still depend on expensive L1 calldata or third-party DA layers like Celestia. Tezos built it in.` },
        { label: '❓ Question', text: (name, num, headline, total) => `Paris gave Tezos a native Data Availability Layer in June 2024.\n\nDoes your L1 provide data availability for rollups natively, or do you need a separate chain for that?` },
        { label: '📈 Compare', text: (name, num, headline, total) => `Data availability:\n• Tezos DAL (Jun 2024): Native, protocol-level\n• ETH: EIP-4844 blobs (limited), relies on third-party DA\n• Celestia: Separate chain just for DA\n\nTezos integrates DA at the protocol level.` },
    ],
    'Paris C': [
        { label: '📊 Standard', text: (name, num, headline, total) => `Paris C (Jun 2024): Quick DAL parameter tuning follow-up.\n\nThe ability to ship a fast follow-up fix through governance — that's operational maturity.` },
        { label: '💪 Flex', text: (name, num, headline, total) => `Paris C: a rapid governance follow-up to tune DAL parameters. June 2024.\n\nTezos can ship a targeted fix in weeks, not months. The governance pipeline is fast when it needs to be.` },
        { label: '🔥 Dunk', text: (name, num, headline, total) => `Paris C shipped a parameter fix just weeks after Paris B.\n\nMost chains would need an emergency hard fork for this. Tezos just ran another governance cycle.` },
        { label: '❓ Question', text: (name, num, headline, total) => `Paris C was a rapid follow-up governance cycle for DAL tuning.\n\nCan your chain ship targeted parameter fixes through governance in weeks? Tezos can.` },
    ],
    'Quebec': [
        { label: '📊 Standard', text: (name, num, headline, total) => `Quebec (Jan 2025): 8-second blocks and Adaptive Maximum issuance.\n\nThe most contested upgrade in Tezos history — 6 months of economic governance warfare.` },
        { label: '💪 Flex', text: (name, num, headline, total) => `Quebec was the most contested Tezos upgrade ever. Community alternatives (Qena, Q3NA) challenged core developers for 6 months.\n\nThe protocol survived it. That's stress-tested governance.` },
        { label: '🔥 Dunk', text: (name, num, headline, total) => `Quebec saw the first serious community challenge to core developer proposals. Qena42 won a Proposal vote with 59.9%.\n\nThis level of contested economic governance doesn't exist anywhere else in crypto.` },
        { label: '❓ Question', text: (name, num, headline, total) => `Quebec: 6 months of economic governance debate. Community alternatives. Competing proposals.\n\nHas your chain's community ever produced a competing protocol proposal? On Tezos, it's just democracy.` },
        { label: '📈 Compare', text: (name, num, headline, total) => `Economic governance:\n• BTC: Block size war lasted years, caused a chain split\n• ETH: EIP-1559 debate, core devs decided\n• Tezos Quebec: 6-month community debate, on-chain votes, no fork\n\nContested governance without breaking the chain.` },
    ],
    'Rio': [
        { label: '📊 Standard', text: (name, num, headline, total) => `Rio (May 2025): Daily cycles and DAL rewards activated.\n\nCycles compressed from ~2.8 days to ~1 day. Faster reward distribution, faster governance.` },
        { label: '💪 Flex', text: (name, num, headline, total) => `Rio compressed Tezos cycles to ~1 day. May 2025.\n\nFaster rewards, faster governance periods, faster iteration. The protocol keeps getting leaner.` },
        { label: '🔥 Dunk', text: (name, num, headline, total) => `Rio activated DAL incentives — rewarding operators who contribute data availability. May 2025.\n\nTezos pays for infrastructure at the protocol level. No separate token. No VC-funded side chain.` },
        { label: '❓ Question', text: (name, num, headline, total) => `Rio compressed Tezos cycles to ~1 day and activated DAL rewards.\n\nDoes your chain incentivize data availability operators at the protocol level?` },
    ],
    'Seoul': [
        { label: '📊 Standard', text: (name, num, headline, total) => `Seoul (Sep 2025): Attestation aggregation and BLS Proof of Possession.\n\nConsensus gets lighter and more secure with every upgrade.` },
        { label: '💪 Flex', text: (name, num, headline, total) => `Seoul shipped attestation aggregation in September 2025.\n\nFewer messages, same security. Tezos consensus keeps getting more efficient through governance-driven upgrades.` },
        { label: '🔥 Dunk', text: (name, num, headline, total) => `Seoul brought attestation aggregation to Tezos — September 2025.\n\nETH's been discussing attestation aggregation for years. Tezos voted it in and shipped it.` },
        { label: '❓ Question', text: (name, num, headline, total) => `Seoul shipped attestation aggregation for Tezos in September 2025.\n\nHow many consensus optimizations has your chain shipped through governance? Tezos keeps iterating.` },
        { label: '📈 Compare', text: (name, num, headline, total) => `Consensus efficiency:\n• Tezos Seoul (Sep 2025): Attestation aggregation, BLS PoP\n• ETH: Discussing similar features in roadmap\n• SOL: Turbine protocol (fixed architecture)\n\nTezos evolves consensus through governance. Others wait for hard forks.` },
    ],
    'Tallinn': [
        { label: '📊 Standard', text: (name, num, headline, total) => `Tallinn (Jan 2026): 6-second blocks. Tezos' fastest block time yet.\n\nPlus All Bakers Attest prep — once 50% of bakers adopt BLS, every baker will attest every block.` },
        { label: '💪 Flex', text: (name, num, headline, total) => `Tallinn: 6-second blocks on Tezos. January 2026.\n\nFrom 60s (pre-Granada) to 6s in 4 years. That's a 10× improvement delivered through governance, not hard forks.` },
        { label: '🔥 Dunk', text: (name, num, headline, total) => `Tezos now has 6-second blocks (Tallinn, Jan 2026). ETH is still at 12 seconds.\n\nTezos has halved its block time through governance 4 times. ETH's block time hasn't changed since The Merge.` },
        { label: '❓ Question', text: (name, num, headline, total) => `Tezos went from 60-second to 6-second blocks in 4 years — all through on-chain governance.\n\nWhat's your chain's block time? Has it ever improved through a governance vote?` },
        { label: '📈 Compare', text: (name, num, headline, total) => `Block time evolution:\n• Tezos: 60s → 30s → 15s → 10s → 8s → 6s (all governance-voted)\n• ETH: 12s (fixed since The Merge, Sep 2022)\n• BTC: 10 min (never changed)\n\nTezos keeps getting faster because governance works.` },
    ],
};

// Generic fallback for protocols not in the specific map
const PROTOCOL_TWEET_OPTIONS_GENERIC = [
    { label: '📊 Standard', text: (name, num, headline, total) => `Tezos upgrade #${num}: ${name}\n\n"${headline}"\n\n${total} self-amendments. Zero hard forks. The protocol evolves through votes.` },
    { label: '📊 Standard', text: (name, num, headline, total) => `${name} is live on Tezos. Upgrade #${num} of ${total}.\n\n${headline}\n\nAll voted on-chain by bakers. No foundation approval needed.` },
    { label: '🔥 Dunk', text: (name, num, headline, total) => `${total} upgrades. Zero forks. Latest: ${name} — ${headline}\n\nBTC has had ~3 soft forks in 15 years. ETH has had ~15 hard forks. Tezos just votes and ships.` },
    { label: '💪 Flex', text: (name, num, headline, total) => `Upgrade #${num}: ${name}.\n\n${headline}\n\n${total} self-amendments since 2018. Every single one voted on-chain. No contentious forks. Ever.` },
    { label: '🗳️ Governance', text: (name, num, headline, total) => `While other chains debate who gets to push the button, Tezos bakers just voted in upgrade #${num}: ${name}.\n\nDemocracy works when you actually build it into the protocol.` },
    { label: '❓ Question', text: (name, num, headline, total) => `${name}: "${headline}"\n\nVoted on by bakers. Activated on-chain. No fork.\n\nUpgrade #${num} of ${total}. Is any other L1 even close to this governance track record?` },
];

// Wrapper: PROTOCOL_TWEET_OPTIONS kept as array for backward compat
const PROTOCOL_TWEET_OPTIONS = PROTOCOL_TWEET_OPTIONS_GENERIC;

/**
 * Get protocol-specific tweet options, falling back to generic
 */
function getProtocolTweetOptions(protocol, num, total) {
    const specific = PROTOCOL_TWEET_OPTIONS_BY_NAME[protocol.name];
    if (specific) {
        return specific.map(o => ({
            label: o.label,
            text: o.text(protocol.name, num, protocol.headline, total)
        }));
    }
    return PROTOCOL_TWEET_OPTIONS_GENERIC.map(o => ({
        label: o.label,
        text: o.text(protocol.name, num, protocol.headline, total)
    }));
}

const TIMELINE_TWEET_OPTIONS = [
    { label: '📊 Standard', text: (total) => `${total} protocol upgrades. Zero hard forks. Tezos governance in action since 2018.` },
    { label: '📊 Standard', text: (total) => `Tezos: ${total} self-amendments, all voted on-chain, zero contentious forks.\n\nThis is what a self-amending blockchain actually looks like.` },
    { label: '🔥 Dunk', text: (total) => `${total} upgrades. Zero forks. Zero foundation vetoes.\n\nBTC can't agree on block size (remember the BCH split?). ETH split the chain over The DAO hack. Tezos just votes and ships.` },
    { label: '🔥 Dunk', text: (total) => `Other chains call themselves "decentralized" but upgrades are decided by a handful of people on a call.\n\nTezos has ${total} on-chain voted upgrades. Show me another L1 with this record.` },
    { label: '🔥 Dunk', text: (total) => `Solana: Foundation pushes updates.\nETH: Core devs decide on ACD calls.\nBTC: Miner signaling and mailing list debates.\nTezos: ${total} on-chain voted upgrades, zero forks.\n\nGovernance matters.` },
    { label: '💪 Flex', text: (total) => `${total} self-amendments since 2018. Every single one voted on-chain by bakers.\n\nNo king. No committee. No off-chain governance theater. Just code and consensus.` },
    { label: '💪 Flex', text: (total) => `The Tezos protocol has evolved ${total} times without breaking, forking, or stopping.\n\nThat's not just technology. That's institutional design.` },
    { label: '🗳️ Democracy', text: (total) => `Imagine a blockchain that upgrades itself ${total} times without splitting in half.\n\nYou don't have to imagine. It's Tezos.` },
    { label: '🗳️ Democracy', text: (total) => `${total} protocol upgrades.\n${total} on-chain votes.\nZero forks.\nZero downtime.\n\nThis is governance. Everything else is theater.` },
    { label: '❓ Question', text: (total) => `${total} self-amendments. Zero forks. Since 2018.\n\nName another L1 with a better governance track record. I'll wait.` },
    { label: '❓ Question', text: (total) => `If a blockchain can't upgrade itself without forking, is it really decentralized?\n\nTezos: ${total} upgrades. Zero forks. The question answers itself.` },
    { label: '📈 Compare', text: (total) => `Governance track record:\n• BTC: ~3 soft forks in 16 years\n• ETH: ~15 hard forks (including The DAO chain split)\n• Tezos: ${total} self-amendments, zero forks\n\nOn-chain governance works. The data proves it.` },
];

const TWEET_SUFFIX = '\n\nhttps://tezos.systems';
const DASHBOARD_TWEET = 'Real-time Tezos network stats — bakers, staking, governance, burns, and more.\n\nhttps://tezos.systems';

/**
 * Load html2canvas dynamically
 */
async function loadHtml2Canvas() {
    if (html2canvasLoaded) return;
    
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        script.onload = () => {
            html2canvasLoaded = true;
            resolve();
        };
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

/**
 * Get change direction from a card's trend arrow
 */
function getCardChange(card) {
    if (!card) return '';
    const trend = card.querySelector('.trend-arrow');
    if (!trend) return '';
    if (trend.classList.contains('up')) return 'up';
    if (trend.classList.contains('down')) return 'down';
    return 'neutral';
}

/**
 * Shuffle array in-place (Fisher-Yates)
 */
function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/**
 * Pick a random subset of options, ensuring category diversity
 */
function pickRandomOptions(allOptions, count = 4) {
    if (allOptions.length <= count) return [...allOptions];
    // Try to get diverse categories
    const byCategory = {};
    allOptions.forEach(o => {
        const cat = o.label.split(' ')[1] || o.label;
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(o);
    });
    const categories = Object.keys(byCategory);
    shuffleArray(categories);
    const picked = [];
    // One from each category first
    for (const cat of categories) {
        if (picked.length >= count) break;
        const items = byCategory[cat];
        picked.push(items[Math.floor(Math.random() * items.length)]);
    }
    // Fill remaining slots randomly from unpicked
    if (picked.length < count) {
        const remaining = allOptions.filter(o => !picked.includes(o));
        shuffleArray(remaining);
        picked.push(...remaining.slice(0, count - picked.length));
    }
    return shuffleArray(picked);
}

/**
 * Get all tweet options for a card
 */
function getTweetOptions(card) {
    if (!card) return [{ label: '📊 Standard', text: DASHBOARD_TWEET }];
    const stat = card.getAttribute('data-stat');
    const valueFront = card.querySelector('.stat-value');
    const value = valueFront ? valueFront.textContent.trim() : '';
    const change = getCardChange(card);
    const options = TWEET_OPTIONS[stat];
    if (options && value) {
        return options.map(o => ({ label: o.label, text: o.text(value, change) + TWEET_SUFFIX }));
    }
    const label = card.querySelector('.stat-label');
    const labelText = label ? label.textContent.trim() : 'Tezos stats';
    return [{ label: '📊 Standard', text: `${labelText}: ${value}\n\nhttps://tezos.systems` }];
}

/**
 * Get randomized subset of tweet options for display
 */
function getRandomTweetOptions(card) {
    const all = getTweetOptions(card);
    return pickRandomOptions(all, 4);
}

/**
 * Get smart tweet text for a card (first option, backward compat)
 */
function getTweetText(card) {
    return getTweetOptions(card)[0].text;
}

/**
 * Get human-readable card title
 */
function getCardTitle(card) {
    if (!card) return 'Dashboard';
    const label = card.querySelector('.stat-label');
    return label ? label.textContent.trim() : 'Stat';
}

/**
 * Initialize share functionality
 */
export function initShare() {
    const shareBtn = document.getElementById('share-btn');
    if (shareBtn) {
        shareBtn.addEventListener('click', captureAndShare);
    }
    
    // Add per-card share buttons
    addCardShareButtons();
}

/**
 * Add share buttons to all stat cards
 */
function addCardShareButtons() {
    const cards = document.querySelectorAll('.stat-card');
    cards.forEach(card => {
        const btn = document.createElement('button');
        btn.className = 'card-share-btn';
        btn.innerHTML = '📸';
        btn.title = 'Share this stat';
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            captureCard(card);
        });
        card.appendChild(btn);
    });
}

/**
 * Capture a single card and show share modal
 */
async function captureCard(card) {
    const btn = card.querySelector('.card-share-btn');
    if (btn) {
        btn.innerHTML = '⏳';
        btn.style.opacity = '1';
    }
    
    try {
        await loadHtml2Canvas();
        
        const isMatrix = document.body.getAttribute('data-theme') === 'matrix';
        const brandColor = isMatrix ? '#00ff00' : '#00d4ff';
        const bgColor = isMatrix ? '#0a0a0a' : '#0a0a0f';
        
        // Read data from the card
        const statLabel = card.querySelector('.stat-label')?.textContent.trim() || '';
        const statValue = card.querySelector('.stat-value')?.textContent.trim() || '';
        const trendEl = card.querySelector('.trend-arrow');
        const trendText = trendEl ? trendEl.textContent.trim() : '';
        const trendClass = trendEl ? (trendEl.classList.contains('up') ? 'up' : trendEl.classList.contains('down') ? 'down' : 'neutral') : '';
        
        // Get section name
        const section = card.closest('.stats-section');
        const sectionName = section?.querySelector('.section-title')?.textContent.trim() || '';
        
        // Try to extract sparkline data from Chart.js
        let sparklineData = null;
        const sparkCanvas = card.querySelector('.sparkline-chart');
        if (sparkCanvas && typeof Chart !== 'undefined') {
            try {
                const chart = Chart.getChart(sparkCanvas);
                if (chart && chart.data.datasets[0]) {
                    sparklineData = chart.data.datasets[0].data.slice();
                }
            } catch (e) { /* Chart.js not available, skip */ }
        }
        
        // Create branded 1200x630 wrapper
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
            position: fixed; top: -9999px; left: -9999px;
            width: 1200px; height: 630px;
            background: ${bgColor};
            font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'SF Pro Display', sans-serif;
            color: white;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 0;
        `;
        
        // Background gradients for depth
        const gradient = document.createElement('div');
        gradient.style.cssText = `
            position: absolute; top: 0; left: 0; right: 0; bottom: 0; pointer-events: none;
            background: 
                radial-gradient(ellipse at 30% 20%, ${isMatrix ? 'rgba(0,255,0,0.08)' : 'rgba(0,212,255,0.08)'} 0%, transparent 50%),
                radial-gradient(ellipse at 70% 80%, ${isMatrix ? 'rgba(0,200,0,0.05)' : 'rgba(183,148,246,0.05)'} 0%, transparent 50%),
                radial-gradient(circle at 50% 50%, ${isMatrix ? 'rgba(0,255,0,0.03)' : 'rgba(0,212,255,0.03)'} 0%, transparent 70%);
        `;
        wrapper.appendChild(gradient);
        
        // Inner border glow
        const borderGlow = document.createElement('div');
        borderGlow.style.cssText = `
            position: absolute; top: 12px; left: 12px; right: 12px; bottom: 12px;
            border: 1px solid ${isMatrix ? 'rgba(0,255,0,0.15)' : 'rgba(0,212,255,0.15)'};
            border-radius: 12px;
            box-shadow: inset 0 0 30px ${isMatrix ? 'rgba(0,255,0,0.03)' : 'rgba(0,212,255,0.03)'},
                        0 0 15px ${isMatrix ? 'rgba(0,255,0,0.05)' : 'rgba(0,212,255,0.05)'};
            pointer-events: none;
        `;
        wrapper.appendChild(borderGlow);
        
        // Content container
        const content = document.createElement('div');
        content.style.cssText = `
            position: relative; z-index: 1;
            width: 100%; height: 100%;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            padding: 40px 60px;
            box-sizing: border-box;
        `;
        
        // Title: TEZOS SYSTEMS
        const title = document.createElement('div');
        title.style.cssText = `
            font-family: 'Orbitron', sans-serif;
            font-size: 36px; font-weight: 900;
            color: ${brandColor};
            letter-spacing: 4px;
            text-transform: uppercase;
            text-shadow: 0 0 30px ${isMatrix ? 'rgba(0,255,0,0.5)' : 'rgba(0,212,255,0.5)'},
                         0 0 60px ${isMatrix ? 'rgba(0,255,0,0.3)' : 'rgba(0,212,255,0.3)'},
                         0 0 90px ${isMatrix ? 'rgba(0,255,0,0.1)' : 'rgba(0,212,255,0.1)'};
            margin-bottom: 6px;
        `;
        title.textContent = 'TEZOS SYSTEMS';
        content.appendChild(title);
        
        // Divider line
        const divider = document.createElement('div');
        divider.style.cssText = `
            width: 200px; height: 1px;
            background: linear-gradient(90deg, transparent, ${isMatrix ? 'rgba(0,255,0,0.4)' : 'rgba(0,212,255,0.4)'}, transparent);
            margin: 10px 0 16px 0;
        `;
        content.appendChild(divider);
        
        // Section label
        if (sectionName) {
            const sectionEl = document.createElement('div');
            sectionEl.style.cssText = `
                font-size: 14px; font-weight: 600;
                color: ${isMatrix ? 'rgba(0,255,0,0.4)' : 'rgba(0,212,255,0.4)'};
                text-transform: uppercase;
                letter-spacing: 3px;
                margin-bottom: 20px;
            `;
            sectionEl.textContent = sectionName;
            content.appendChild(sectionEl);
        }
        
        // Stat label
        const labelEl = document.createElement('div');
        labelEl.style.cssText = `
            font-size: 18px; font-weight: 600;
            color: rgba(255,255,255,0.5);
            text-transform: uppercase;
            letter-spacing: 2px;
            margin-bottom: 12px;
        `;
        labelEl.textContent = statLabel;
        content.appendChild(labelEl);
        
        // HERO stat value
        const valueEl = document.createElement('div');
        valueEl.style.cssText = `
            font-size: 120px; font-weight: 800;
            color: ${brandColor};
            line-height: 1;
            letter-spacing: -2px;
            text-shadow: 0 0 40px ${isMatrix ? 'rgba(0,255,0,0.4)' : 'rgba(0,212,255,0.4)'},
                         0 0 80px ${isMatrix ? 'rgba(0,255,0,0.2)' : 'rgba(0,212,255,0.2)'};
            margin-bottom: 12px;
            text-align: center;
            max-width: 1000px;
            overflow: hidden;
        `;
        // Scale down font for long values
        const valLen = statValue.length;
        if (valLen > 12) {
            valueEl.style.fontSize = '64px';
        } else if (valLen > 8) {
            valueEl.style.fontSize = '80px';
        } else if (valLen > 5) {
            valueEl.style.fontSize = '100px';
        }
        valueEl.textContent = statValue;
        content.appendChild(valueEl);
        
        // Trend indicator
        if (trendText) {
            const trendColors = { up: '#00ff88', down: '#ff4466', neutral: '#666666' };
            const trendBgColors = { up: 'rgba(0,255,136,0.1)', down: 'rgba(255,68,102,0.1)', neutral: 'rgba(255,255,255,0.05)' };
            const trendColor = trendColors[trendClass] || '#666';
            const trendBg = trendBgColors[trendClass] || 'rgba(255,255,255,0.05)';
            const trendElNew = document.createElement('div');
            trendElNew.style.cssText = `
                font-size: 24px; font-weight: 700;
                color: ${trendColor};
                padding: 6px 18px;
                background: ${trendBg};
                border: 1px solid ${trendColor}33;
                border-radius: 8px;
                margin-bottom: 16px;
                letter-spacing: 0.5px;
            `;
            trendElNew.textContent = trendText;
            content.appendChild(trendElNew);
        }
        
        // Sparkline as SVG (or decorative bars)
        const sparkContainer = document.createElement('div');
        sparkContainer.style.cssText = 'width: 400px; height: 50px; margin-bottom: 8px;';
        
        if (sparklineData && sparklineData.length > 1) {
            // Render as inline SVG polyline
            const w = 400, h = 50;
            const nums = sparklineData.map(Number).filter(n => !isNaN(n));
            const min = Math.min(...nums);
            const max = Math.max(...nums);
            const range = max - min || 1;
            const points = nums.map((v, i) => {
                const x = (i / (nums.length - 1)) * w;
                const y = h - ((v - min) / range) * (h - 4) - 2;
                return `${x.toFixed(1)},${y.toFixed(1)}`;
            }).join(' ');
            
            const sparkColor = isMatrix ? '#00ff00' : '#00d4ff';
            sparkContainer.innerHTML = `
                <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stop-color="${sparkColor}" stop-opacity="0.2"/>
                            <stop offset="100%" stop-color="${sparkColor}" stop-opacity="0"/>
                        </linearGradient>
                    </defs>
                    <polygon points="${(nums.map((v, i) => {
                        const x = (i / (nums.length - 1)) * w;
                        const y = h - ((v - min) / range) * (h - 4) - 2;
                        return `${x.toFixed(1)},${y.toFixed(1)}`;
                    }).join(' '))} ${w},${h} 0,${h}" fill="url(#sparkFill)"/>
                    <polyline points="${points}" fill="none" stroke="${sparkColor}" stroke-width="2" stroke-opacity="0.7" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            `;
        } else {
            // Decorative bar chart as fallback
            const barCount = 20;
            const sparkColor = isMatrix ? '#00ff00' : '#00d4ff';
            let barsHtml = '';
            for (let i = 0; i < barCount; i++) {
                // Create a wave pattern
                const height = 10 + Math.sin((i / barCount) * Math.PI * 2 + (trendClass === 'up' ? 0.5 : trendClass === 'down' ? 2.5 : 1.5)) * 15 + Math.random() * 8;
                const opacity = 0.15 + (i / barCount) * 0.25;
                barsHtml += `<div style="width: 12px; height: ${height}px; background: ${sparkColor}; opacity: ${opacity}; border-radius: 2px;"></div>`;
            }
            sparkContainer.innerHTML = `<div style="display: flex; align-items: flex-end; justify-content: center; gap: 4px; height: 100%;">${barsHtml}</div>`;
        }
        content.appendChild(sparkContainer);
        
        wrapper.appendChild(content);
        
        // Footer (absolute positioned at bottom)
        const footer = document.createElement('div');
        footer.style.cssText = `
            position: absolute; bottom: 24px; left: 40px; right: 40px;
            display: flex; justify-content: space-between; align-items: center;
            z-index: 1;
        `;
        footer.innerHTML = `
            <span style="font-size: 13px; color: rgba(255,255,255,0.3);">${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            <span style="font-size: 13px; color: rgba(255,255,255,0.35); letter-spacing: 0.5px;">Powered by <span style="color: ${brandColor}; font-weight: 600;">Tez Capital</span></span>
        `;
        wrapper.appendChild(footer);
        
        document.body.appendChild(wrapper);
        
        const canvas = await html2canvas(wrapper, {
            backgroundColor: bgColor,
            scale: 2,
            useCORS: true,
            logging: false,
            width: 1200,
            height: 630,
            windowWidth: 1200
        });
        
        wrapper.remove();
        
        const allOptions = getTweetOptions(card);
        const displayOptions = pickRandomOptions(allOptions, 4);
        const cardTitle = getCardTitle(card);
        showShareModal(canvas, displayOptions, cardTitle, allOptions);
        
    } catch (error) {
        console.error('Card screenshot failed:', error);
        showNotification('Screenshot failed. Try again.', 'error');
    } finally {
        if (btn) {
            btn.innerHTML = '📸';
            btn.style.opacity = '';
        }
    }
}

/**
 * Show section picker modal, then capture selected sections
 */
async function captureAndShare() {
    const sections = [];
    // Add Protocols section (upgrade clock)
    const upgradeClock = document.getElementById('upgrade-clock');
    if (upgradeClock) {
        sections.push({ name: 'Protocols', element: upgradeClock });
    }
    document.querySelectorAll('.stats-section').forEach(sec => {
        const titleEl = sec.querySelector('.section-header .section-title');
        if (titleEl) {
            // Get text without chevron span
            const name = Array.from(titleEl.childNodes)
                .filter(n => n.nodeType === Node.TEXT_NODE)
                .map(n => n.textContent.trim())
                .join('');
            sections.push({ name: name || titleEl.textContent.trim(), element: sec });
        }
    });
    
    // Build picker modal
    const existing = document.getElementById('section-picker-modal');
    if (existing) existing.remove();
    
    const isMatrix = document.body.getAttribute('data-theme') === 'matrix';
    const accentColor = isMatrix ? '#00ff00' : '#00d4ff';
    
    const modal = document.createElement('div');
    modal.id = 'section-picker-modal';
    modal.className = 'share-modal-overlay';
    modal.innerHTML = `
        <div class="share-modal-content" style="max-width: 420px;">
            <div class="share-modal-header">
                <h3>Select Sections to Capture</h3>
                <button class="share-modal-close">×</button>
            </div>
            <div style="padding: 20px;">
                <div style="display: flex; justify-content: flex-end; margin-bottom: 12px;">
                    <button id="section-toggle-all" style="background: none; border: 1px solid rgba(255,255,255,0.15); color: ${accentColor}; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 0.8rem; font-weight: 600; transition: all 0.2s;">Deselect All</button>
                </div>
                <div id="section-checkboxes" style="display: flex; flex-direction: column; gap: 10px;">
                    ${sections.map((s, i) => `
                        <label style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; cursor: pointer; transition: all 0.2s;">
                            <input type="checkbox" checked data-section-idx="${i}" style="accent-color: ${accentColor}; width: 18px; height: 18px; cursor: pointer;">
                            <span style="color: var(--text-primary); font-size: 0.9rem; font-weight: 500;">${s.name}</span>
                        </label>
                    `).join('')}
                </div>
            </div>
            <div style="padding: 16px 20px; border-top: 1px solid rgba(255,255,255,0.1); display: flex; gap: 12px;">
                <button id="section-capture-btn" class="share-action-btn" style="flex: 1; background: rgba(${isMatrix ? '0,255,0' : '0,212,255'},0.15); border-color: ${accentColor}; color: ${accentColor}; font-weight: 600;">
                    <span>📸</span> Capture
                </button>
                <button id="section-cancel-btn" class="share-action-btn" style="flex: 0 0 auto;">
                    Cancel
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('visible'));
    
    const closeModal = () => {
        modal.classList.remove('visible');
        setTimeout(() => modal.remove(), 200);
    };
    
    modal.querySelector('.share-modal-close').addEventListener('click', closeModal);
    modal.querySelector('#section-cancel-btn').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    
    // Toggle all
    const toggleBtn = modal.querySelector('#section-toggle-all');
    toggleBtn.addEventListener('click', () => {
        const boxes = modal.querySelectorAll('input[type="checkbox"]');
        const allChecked = Array.from(boxes).every(b => b.checked);
        boxes.forEach(b => b.checked = !allChecked);
        toggleBtn.textContent = allChecked ? 'Select All' : 'Deselect All';
    });
    
    // Update toggle text on individual change
    modal.querySelector('#section-checkboxes').addEventListener('change', () => {
        const boxes = modal.querySelectorAll('input[type="checkbox"]');
        const allChecked = Array.from(boxes).every(b => b.checked);
        toggleBtn.textContent = allChecked ? 'Deselect All' : 'Select All';
    });
    
    // Capture button
    modal.querySelector('#section-capture-btn').addEventListener('click', () => {
        const boxes = modal.querySelectorAll('input[type="checkbox"]');
        const selectedIndices = Array.from(boxes).filter(b => b.checked).map(b => parseInt(b.dataset.sectionIdx));
        if (selectedIndices.length === 0) {
            showNotification('Select at least one section.', 'error');
            return;
        }
        const selectedSections = selectedIndices.map(i => sections[i]);
        closeModal();
        doCaptureAndShare(selectedSections);
    });
}

/**
 * Actually capture the dashboard with selected sections
 */
async function doCaptureAndShare(selectedSections) {
    const shareBtn = document.getElementById('share-btn');
    const originalText = shareBtn.innerHTML;
    
    try {
        shareBtn.innerHTML = '<span class="share-icon">⏳</span>';
        shareBtn.disabled = true;
        
        await loadHtml2Canvas();
        
        const elementsToHide = [
            document.querySelector('.header'),
            document.querySelector('.corner-ribbon'),
            document.getElementById('ultra-canvas'),
            document.getElementById('ultra-selector'),
            document.querySelector('.matrix-rain'),
            ...document.querySelectorAll('.card-share-btn')
        ].filter(Boolean);
        
        elementsToHide.forEach(el => el.style.visibility = 'hidden');
        
        const wrapper = document.createElement('div');
        wrapper.id = 'screenshot-wrapper';
        wrapper.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 1200px;
            background: ${getComputedStyle(document.body).background};
            padding: 30px;
            z-index: -1;
            overflow: hidden;
        `;
        
        const mainContent = document.querySelector('.main-content');
        const clone = mainContent.cloneNode(true);
        clone.style.cssText = 'margin: 0; padding: 0;';
        
        // Add Protocols section (upgrade-clock is outside .main-content)
        const selectedNames = new Set(selectedSections.map(s => s.name));
        if (selectedNames.has('Protocols')) {
            const ucOriginal = document.getElementById('upgrade-clock');
            if (ucOriginal) {
                const ucClone = ucOriginal.cloneNode(true);
                ucClone.style.marginBottom = '20px';
                // Remove infographic (too tall for capture) and toggle
                ucClone.querySelectorAll('.protocol-infographic, .infographic-toggle').forEach(el => el.remove());
                clone.insertBefore(ucClone, clone.firstChild);
            }
        }
        
        // Remove card share buttons and info buttons from clone
        clone.querySelectorAll('.card-share-btn, .card-info-btn, .card-tooltip').forEach(el => el.remove());
        
        // Remove unselected sections from clone (upgrade-clock already handled above)
        if (!selectedNames.has('Protocols')) {
            const uc = clone.querySelector('.upgrade-clock');
            if (uc) uc.remove();
        }
        
        clone.querySelectorAll('.stats-section').forEach(sec => {
            const titleEl = sec.querySelector('.section-header .section-title');
            if (titleEl) {
                // Strip chevron spans to match picker names
                const cleanName = Array.from(titleEl.childNodes)
                    .filter(n => n.nodeType === Node.TEXT_NODE)
                    .map(n => n.textContent.trim())
                    .join('');
                if (!selectedNames.has(cleanName) && !selectedNames.has(titleEl.textContent.trim())) {
                    sec.remove();
                }
            }
        });
        
        // Remove bottom margin/padding on last visible section
        const lastSection = clone.querySelector('.stats-section:last-child');
        if (lastSection) lastSection.style.marginBottom = '0';
        
        // Remove section chevrons and infographic toggle from capture
        clone.querySelectorAll('.section-chevron, .infographic-toggle').forEach(el => el.remove());
        
        // Convert sparkline canvases to images (html2canvas can't render Chart.js canvases from clones)
        document.querySelectorAll('canvas[id$="-sparkline"]').forEach(origCanvas => {
            const cloneCanvas = clone.querySelector('#' + origCanvas.id);
            if (cloneCanvas && origCanvas.width > 0) {
                try {
                    const img = document.createElement('img');
                    img.src = origCanvas.toDataURL('image/png');
                    img.style.cssText = cloneCanvas.style.cssText || 'width:100%;height:100%;';
                    img.width = origCanvas.width;
                    img.height = origCanvas.height;
                    cloneCanvas.parentNode.replaceChild(img, cloneCanvas);
                } catch(e) { /* ignore CORS errors */ }
            }
        });
        
        // Expand any collapsed sections in clone
        clone.querySelectorAll('.stats-section.collapsed').forEach(sec => {
            sec.classList.remove('collapsed');
            var grid = sec.querySelector('.stats-grid');
            if (grid) { grid.style.maxHeight = ''; grid.style.overflow = ''; grid.style.opacity = '1'; }
        });
        
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        `;
        
        const isMatrix = document.body.getAttribute('data-theme') === 'matrix';
        const brandColor = isMatrix ? '#00ff00' : '#00d4ff';
        
        header.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                <span style="font-family: 'Orbitron', sans-serif; font-size: 28px; font-weight: 900; color: ${brandColor}; letter-spacing: 2px; text-transform: uppercase; text-shadow: 0 0 20px ${brandColor}40, 0 0 40px ${brandColor}20;">TEZOS SYSTEMS</span>
            </div>
            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                <div style="font-size: 14px; color: rgba(255,255,255,0.6);">
                    ${new Date().toLocaleString('en-US', { 
                        month: 'short', 
                        day: 'numeric', 
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    })}
                </div>
                <span style="font-size: 13px; color: rgba(255,255,255,0.4); letter-spacing: 0.5px;">Powered by <span style="color: ${brandColor}; font-weight: 600;">Tez Capital</span></span>
            </div>
        `;
        
        wrapper.appendChild(header);
        wrapper.appendChild(clone);
        
        // Trim bottom padding — measure actual content
        clone.style.paddingBottom = '0';
        clone.style.marginBottom = '0';
        
        document.body.appendChild(wrapper);
        
        // Trim wrapper height to actual content (avoid dead space)
        const actualHeight = wrapper.scrollHeight;
        wrapper.style.height = actualHeight + 'px';
        
        const canvas = await html2canvas(wrapper, {
            backgroundColor: isMatrix ? '#000000' : '#0a0a0f',
            scale: 2,
            useCORS: true,
            logging: false,
            width: 1200,
            height: actualHeight,
            windowWidth: 1200
        });
        
        wrapper.remove();
        elementsToHide.forEach(el => el.style.visibility = '');
        
        showShareModal(canvas, DASHBOARD_TWEET, 'Dashboard');
        
    } catch (error) {
        console.error('Screenshot failed:', error);
        showNotification('Screenshot failed. Try again.', 'error');
    } finally {
        shareBtn.innerHTML = originalText;
        shareBtn.disabled = false;
    }
}

/**
 * Native share via Web Share API
 */
async function nativeShare(canvas, text) {
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    const file = new File([blob], 'tezos-stats.png', { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ text, url: 'https://tezos.systems', files: [file] });
    }
}

/**
 * Show modal with share options
 * tweetTextOrOptions: string (legacy) or array of {label, text}
 */
function showShareModal(canvas, tweetTextOrOptions, title, allOptionsForRefresh) {
    const existing = document.getElementById('share-modal');
    if (existing) existing.remove();
    
    // Normalize to options array
    let tweetOptions = Array.isArray(tweetTextOrOptions)
        ? tweetTextOrOptions
        : [{ label: '📊 Standard', text: tweetTextOrOptions }];
    
    // Keep all options for refresh functionality
    const allTweetOptions = allOptionsForRefresh || tweetOptions;
    
    const isMatrix = document.body.getAttribute('data-theme') === 'matrix';
    const accent = isMatrix ? '#00ff00' : '#00d4ff';
    const accentRgb = isMatrix ? '0,255,0' : '0,212,255';
    
    // Check Web Share API support
    const canNativeShare = typeof navigator.canShare === 'function';
    const nativeShareBtn = canNativeShare 
        ? `<button class="share-action-btn" id="share-native"><span>📱</span> Share</button>` 
        : '';
    
    // Build tweet picker HTML helper
    function buildPickerHtml(options) {
        if (options.length <= 1) return '';
        return `
        <div class="tweet-picker" style="
            padding: 12px 16px;
            border-bottom: 1px solid rgba(255,255,255,0.08);
            max-height: 200px;
            overflow-y: auto;
        ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <div style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 1.5px;
                    color: rgba(${accentRgb},0.6); font-weight: 600;">
                    Choose tweet style
                </div>
                <button id="tweet-refresh-btn" title="Shuffle options" style="
                    background: none; border: 1px solid rgba(${accentRgb},0.2); color: rgba(${accentRgb},0.6);
                    width: 28px; height: 28px; border-radius: 6px; cursor: pointer; font-size: 14px;
                    display: flex; align-items: center; justify-content: center;
                    transition: all 0.2s;
                ">🔄</button>
            </div>
            ${options.map((opt, i) => `
                <label class="tweet-option" style="
                    display: flex; align-items: flex-start; gap: 10px;
                    padding: 8px 10px; margin-bottom: 4px;
                    background: ${i === 0 ? `rgba(${accentRgb},0.08)` : 'rgba(255,255,255,0.02)'};
                    border: 1px solid ${i === 0 ? `rgba(${accentRgb},0.25)` : 'rgba(255,255,255,0.06)'};
                    border-radius: 8px; cursor: pointer;
                    transition: all 0.2s ease;
                ">
                    <input type="radio" name="tweet-choice" value="${i}" ${i === 0 ? 'checked' : ''}
                        style="accent-color: ${accent}; margin-top: 2px; flex-shrink: 0;">
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 0.75rem; font-weight: 600; color: rgba(255,255,255,0.7); margin-bottom: 2px;">
                            ${opt.label}
                        </div>
                        <div style="font-size: 0.68rem; color: rgba(255,255,255,0.4); line-height: 1.4;
                            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${opt.text.split('\n')[0]}
                        </div>
                    </div>
                </label>
            `).join('')}
        </div>
    `;
    }
    const pickerHtml = buildPickerHtml(tweetOptions);
    
    const modal = document.createElement('div');
    modal.id = 'share-modal';
    modal.className = 'share-modal-overlay';
    modal.innerHTML = `
        <div class="share-modal-content" style="max-height: 90vh; overflow-y: auto;">
            <div class="share-modal-header">
                <h3>Share: ${title}</h3>
                <button class="share-modal-close">×</button>
            </div>
            <div class="share-modal-preview">
                <img src="${canvas.toDataURL('image/png')}" alt="Snapshot" />
            </div>
            ${pickerHtml}
            <div class="share-modal-actions">
                <button class="share-action-btn" id="share-download">
                    <span>💾</span> Download
                </button>
                <button class="share-action-btn" id="share-copy">
                    <span>📋</span> Copy
                </button>
                <button class="share-action-btn" id="share-twitter">
                    <span>𝕏</span> Post
                </button>
                ${nativeShareBtn}
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    requestAnimationFrame(() => {
        modal.classList.add('visible');
    });
    
    // Style tweet option hover/selection
    const styleOptions = () => {
        modal.querySelectorAll('.tweet-option').forEach(label => {
            const radio = label.querySelector('input[type="radio"]');
            if (radio.checked) {
                label.style.background = `rgba(${accentRgb},0.08)`;
                label.style.borderColor = `rgba(${accentRgb},0.25)`;
            } else {
                label.style.background = 'rgba(255,255,255,0.02)';
                label.style.borderColor = 'rgba(255,255,255,0.06)';
            }
        });
    };
    
    const wirePickerEvents = () => {
        modal.querySelectorAll('.tweet-option').forEach(label => {
            label.addEventListener('change', styleOptions);
            label.addEventListener('mouseenter', () => {
                const radio = label.querySelector('input[type="radio"]');
                if (!radio.checked) label.style.background = `rgba(${accentRgb},0.04)`;
            });
            label.addEventListener('mouseleave', () => styleOptions());
        });
    };
    wirePickerEvents();
    
    // Refresh button — reshuffle tweet options
    const wireRefresh = () => {
        const btn = modal.querySelector('#tweet-refresh-btn');
        if (!btn || allTweetOptions.length <= 4) return;
        btn.addEventListener('click', () => {
            tweetOptions = pickRandomOptions(allTweetOptions, 4);
            const picker = modal.querySelector('.tweet-picker');
            if (picker) {
                picker.outerHTML = buildPickerHtml(tweetOptions);
                wirePickerEvents();
                wireRefresh();
            }
        });
    };
    wireRefresh();
    
    // Helper to get selected tweet text
    const getSelectedTweet = () => {
        const checked = modal.querySelector('input[name="tweet-choice"]:checked');
        const idx = checked ? parseInt(checked.value) : 0;
        return tweetOptions[idx]?.text || tweetOptions[0]?.text || '';
    };
    
    modal.querySelector('.share-modal-close').addEventListener('click', () => closeShareModal(modal));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeShareModal(modal);
    });
    
    // Download
    modal.querySelector('#share-download').addEventListener('click', () => {
        const link = document.createElement('a');
        link.download = `tezos-systems-${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        showNotification('Image downloaded!', 'success');
    });
    
    // Copy to clipboard
    modal.querySelector('#share-copy').addEventListener('click', async () => {
        try {
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
            ]);
            showNotification('Copied to clipboard!', 'success');
        } catch (err) {
            showNotification('Clipboard not supported. Use download instead.', 'error');
        }
    });
    
    // Share on X/Twitter — copy image to clipboard first, then open X
    modal.querySelector('#share-twitter').addEventListener('click', async () => {
        const selectedTweet = getSelectedTweet();
        try {
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
            ]);
            showNotification('Image copied! Paste it into your tweet (Ctrl+V / ⌘V)', 'success');
        } catch (err) {
            // Clipboard failed — still open X
        }
        const text = encodeURIComponent(selectedTweet);
        window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
    });
    
    // Native share
    const nativeBtn = modal.querySelector('#share-native');
    if (nativeBtn) {
        nativeBtn.addEventListener('click', async () => {
            try {
                await nativeShare(canvas, getSelectedTweet());
            } catch (err) {
                if (err.name !== 'AbortError') {
                    showNotification('Share failed.', 'error');
                }
            }
        });
    }
}

/**
 * Close share modal
 */
function closeShareModal(modal) {
    modal.classList.remove('visible');
    setTimeout(() => modal.remove(), 200);
}

/**
 * Show notification toast
 */
function showNotification(message, type = 'info') {
    const existing = document.querySelector('.share-notification');
    if (existing) existing.remove();
    
    const isMatrix = document.body.getAttribute('data-theme') === 'matrix';
    const colors = {
        success: isMatrix ? '#00ff00' : '#10b981',
        error: isMatrix ? '#ff0000' : '#ef4444',
        info: isMatrix ? '#00ff00' : '#00d4ff'
    };
    
    const notification = document.createElement('div');
    notification.className = 'share-notification';
    notification.style.cssText = `
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%) translateY(20px);
        background: rgba(0, 0, 0, 0.9);
        border: 1px solid ${colors[type]};
        color: ${colors[type]};
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        z-index: 10010;
        opacity: 0;
        transition: all 0.2s ease;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    requestAnimationFrame(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateX(-50%) translateY(0)';
    });
    
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(-50%) translateY(20px)';
        setTimeout(() => notification.remove(), 200);
    }, 3000);
}

// ─── Protocol History Share ─────────────────────────────────────────

let protocolDataCache = null;

async function getProtocolData() {
    if (protocolDataCache) return protocolDataCache;
    try {
        const resp = await fetch('protocol-data.json');
        protocolDataCache = await resp.json();
        return protocolDataCache;
    } catch (e) {
        console.error('Failed to load protocol-data.json', e);
        return null;
    }
}

function getThemeColors() {
    const isMatrix = document.body.getAttribute('data-theme') === 'matrix';
    const brand = isMatrix ? '#00ff00' : '#00d4ff';
    const bg = isMatrix ? '#0a0a0a' : '#0a0a0f';
    const brandRgb = isMatrix ? '0,255,0' : '0,212,255';
    return { isMatrix, brand, bg, brandRgb };
}

function createBaseWrapper(bg, brandRgb) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
        position: fixed; top: -9999px; left: -9999px;
        width: 1200px; height: 630px;
        background: ${bg};
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'SF Pro Display', sans-serif;
        color: white; overflow: hidden;
        display: flex; flex-direction: column;
        padding: 0;
    `;
    // Background gradients
    const gradient = document.createElement('div');
    gradient.style.cssText = `
        position: absolute; top: 0; left: 0; right: 0; bottom: 0; pointer-events: none;
        background:
            radial-gradient(ellipse at 30% 20%, rgba(${brandRgb},0.08) 0%, transparent 50%),
            radial-gradient(ellipse at 70% 80%, rgba(${brandRgb},0.04) 0%, transparent 50%),
            radial-gradient(circle at 50% 50%, rgba(${brandRgb},0.03) 0%, transparent 70%);
    `;
    wrapper.appendChild(gradient);
    // Border glow
    const border = document.createElement('div');
    border.style.cssText = `
        position: absolute; top: 12px; left: 12px; right: 12px; bottom: 12px;
        border: 1px solid rgba(${brandRgb},0.15); border-radius: 12px;
        box-shadow: inset 0 0 30px rgba(${brandRgb},0.03), 0 0 15px rgba(${brandRgb},0.05);
        pointer-events: none;
    `;
    wrapper.appendChild(border);
    return wrapper;
}

function addFooter(wrapper, brand, leftText) {
    const footer = document.createElement('div');
    footer.style.cssText = `
        position: absolute; bottom: 24px; left: 40px; right: 40px;
        display: flex; justify-content: space-between; align-items: center; z-index: 1;
    `;
    footer.innerHTML = `
        <span style="font-size: 13px; color: rgba(255,255,255,0.35);">${leftText}</span>
        <span style="font-size: 13px; color: rgba(255,255,255,0.35); letter-spacing: 0.5px;">Powered by <span style="color: ${brand}; font-weight: 600;">Tez Capital</span></span>
    `;
    wrapper.appendChild(footer);
}

/**
 * Capture a single protocol card as a shareable 1200×630 image
 */
export async function captureProtocol(protocol) {
    try {
        await loadHtml2Canvas();
        const { brand, bg, brandRgb } = getThemeColors();
        const data = await getProtocolData();
        const total = data?.meta?.totalUpgrades || 21;

        const wrapper = createBaseWrapper(bg, brandRgb);

        const content = document.createElement('div');
        content.style.cssText = `
            position: relative; z-index: 1;
            width: 100%; height: 100%;
            display: flex; flex-direction: column;
            padding: 48px 60px 70px 60px;
            box-sizing: border-box;
        `;

        // Title
        content.innerHTML += `
            <div style="font-family:'Orbitron',sans-serif; font-size:32px; font-weight:900; color:${brand};
                letter-spacing:4px; text-transform:uppercase; margin-bottom:2px;
                text-shadow: 0 0 30px rgba(${brandRgb},0.5), 0 0 60px rgba(${brandRgb},0.3), 0 0 90px rgba(${brandRgb},0.1);">
                TEZOS SYSTEMS
            </div>
            <div style="font-size:13px; font-weight:600; color:rgba(${brandRgb},0.4); text-transform:uppercase;
                letter-spacing:3px; margin-bottom:12px;">PROTOCOL HISTORY</div>
            <div style="width:200px; height:1px; background:linear-gradient(90deg, transparent, rgba(${brandRgb},0.4), transparent); margin-bottom:28px;"></div>
        `;

        // Protocol number + name
        const num = protocol.number - 3; // Athens is #1 (code 4)
        content.innerHTML += `
            <div style="display:flex; align-items:baseline; gap:16px; margin-bottom:8px;">
                <span style="font-family:'Orbitron',sans-serif; font-size:48px; font-weight:900; color:rgba(255,255,255,0.15);">#${num}</span>
                <span style="font-family:'Orbitron',sans-serif; font-size:48px; font-weight:900; color:${brand};
                    text-shadow: 0 0 30px rgba(${brandRgb},0.4);">${protocol.name.toUpperCase()}</span>
            </div>
        `;

        // Date
        const dateStr = new Date(protocol.date + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
        content.innerHTML += `
            <div style="font-size:16px; color:rgba(255,255,255,0.4); margin-bottom:20px;">Activated: ${dateStr}</div>
        `;

        // Headline quote
        content.innerHTML += `
            <div style="font-size:20px; font-style:italic; color:rgba(255,255,255,0.7); margin-bottom:24px;
                padding-left:16px; border-left:3px solid rgba(${brandRgb},0.3);">
                "${protocol.headline}"
            </div>
        `;

        // Key changes
        const changes = (protocol.changes || []).slice(0, 5);
        if (changes.length) {
            let changesHtml = `<div style="font-size:14px; font-weight:700; color:rgba(255,255,255,0.5); text-transform:uppercase; letter-spacing:2px; margin-bottom:10px;">Key Changes</div>`;
            changes.forEach(c => {
                changesHtml += `<div style="font-size:16px; color:rgba(255,255,255,0.65); margin-bottom:6px; padding-left:8px;">• ${c}</div>`;
            });
            content.innerHTML += `<div>${changesHtml}</div>`;
        }

        wrapper.appendChild(content);
        addFooter(wrapper, brand, `${total} upgrades • Zero forks`);
        document.body.appendChild(wrapper);

        const canvas = await html2canvas(wrapper, {
            backgroundColor: bg, scale: 2, useCORS: true, logging: false, width: 1200, height: 630, windowWidth: 1200
        });
        wrapper.remove();

        const suffix = '\n\nhttps://tezos.systems';
        const allOptions = getProtocolTweetOptions(protocol, num, total).map(o => ({
            ...o,
            text: o.text + suffix
        }));
        const displayOptions = pickRandomOptions(allOptions, 4);
        showShareModal(canvas, displayOptions, `Protocol #${num}: ${protocol.name}`, allOptions);
    } catch (error) {
        console.error('Protocol capture failed:', error);
        showNotification('Screenshot failed. Try again.', 'error');
    }
}

/**
 * Capture the full protocol timeline as a 1200×630 image
 */
export async function captureTimeline(allProtocols) {
    try {
        await loadHtml2Canvas();
        const { brand, bg, brandRgb } = getThemeColors();
        const total = allProtocols.length;

        const wrapper = createBaseWrapper(bg, brandRgb);

        const content = document.createElement('div');
        content.style.cssText = `
            position: relative; z-index: 1;
            width: 100%; height: 100%;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            padding: 48px 40px 70px 40px;
            box-sizing: border-box;
        `;

        // Title
        content.innerHTML += `
            <div style="font-family:'Orbitron',sans-serif; font-size:30px; font-weight:900; color:${brand};
                letter-spacing:4px; text-transform:uppercase; margin-bottom:8px;
                text-shadow: 0 0 30px rgba(${brandRgb},0.5), 0 0 60px rgba(${brandRgb},0.3), 0 0 90px rgba(${brandRgb},0.1);">
                TEZOS SYSTEMS — PROTOCOL HISTORY
            </div>
            <div style="width:300px; height:1px; background:linear-gradient(90deg, transparent, rgba(${brandRgb},0.4), transparent); margin-bottom:40px;"></div>
        `;

        // Timeline pills
        const pillSize = 40;
        const gap = 6;
        const totalWidth = allProtocols.length * (pillSize + gap) - gap;
        let pillsHtml = `<div style="display:flex; gap:${gap}px; justify-content:center; margin-bottom:12px;">`;
        allProtocols.forEach((p, i) => {
            const isCurrent = i === allProtocols.length - 1;
            pillsHtml += `<div style="
                width:${pillSize}px; height:${pillSize}px; border-radius:50%;
                display:flex; align-items:center; justify-content:center;
                font-family:'Orbitron',sans-serif; font-size:14px; font-weight:900;
                color:${isCurrent ? bg : 'rgba(255,255,255,0.7)'};
                background:${isCurrent ? brand : `rgba(${brandRgb},0.12)`};
                border:1px solid ${isCurrent ? brand : `rgba(${brandRgb},0.25)`};
                ${isCurrent ? `box-shadow: 0 0 15px rgba(${brandRgb},0.5);` : ''}
            ">${p.name[0]}</div>`;
        });
        pillsHtml += '</div>';
        content.innerHTML += pillsHtml;

        // Year markers
        const years = {};
        allProtocols.forEach((p, i) => {
            const yr = "'" + p.date.slice(2, 4);
            if (!years[yr]) years[yr] = i;
        });
        let yearHtml = `<div style="display:flex; position:relative; width:${totalWidth}px; height:20px; margin-bottom:36px;">`;
        for (const [yr, idx] of Object.entries(years)) {
            const left = idx * (pillSize + gap) + pillSize / 2;
            yearHtml += `<span style="position:absolute; left:${left}px; transform:translateX(-50%); font-size:12px; color:rgba(255,255,255,0.3); font-weight:600;">${yr}</span>`;
        }
        yearHtml += '</div>';
        content.innerHTML += yearHtml;

        // Tagline
        content.innerHTML += `
            <div style="font-size:22px; font-weight:700; color:rgba(255,255,255,0.6); letter-spacing:1px;">
                ${total} Self-Amendments • Zero Hard Forks • Since 2018
            </div>
        `;

        wrapper.appendChild(content);
        addFooter(wrapper, brand, new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
        document.body.appendChild(wrapper);

        const canvas = await html2canvas(wrapper, {
            backgroundColor: bg, scale: 2, useCORS: true, logging: false, width: 1200, height: 630, windowWidth: 1200
        });
        wrapper.remove();

        const suffix = '\n\nhttps://tezos.systems';
        const allOptions = TIMELINE_TWEET_OPTIONS.map(o => ({
            label: o.label,
            text: o.text(total) + suffix
        }));
        const displayOptions = pickRandomOptions(allOptions, 4);
        showShareModal(canvas, displayOptions, 'Protocol Timeline', allOptions);
    } catch (error) {
        console.error('Timeline capture failed:', error);
        showNotification('Screenshot failed. Try again.', 'error');
    }
}

/**
 * Initialize protocol share buttons on timeline items + timeline share button
 */
export async function initProtocolShare() {
    const data = await getProtocolData();
    if (!data) return;

    const protocols = data.protocols;

    // Wire up per-protocol share on timeline items
    const timelineEl = document.getElementById('upgrade-timeline');
    if (timelineEl) {
        timelineEl.addEventListener('click', (e) => {
            const item = e.target.closest('.timeline-item');
            if (!item) return;
            if (item.classList.contains('contentious')) return;
            const name = item.getAttribute('data-protocol');
            if (!name) return;
            const protocol = protocols.find(p => p.name === name);
            if (protocol) captureProtocol(protocol);
        });
    }

    // Add "Share Timeline" button
    const badgesContainer = document.querySelector('.upgrade-badges');
    if (badgesContainer) {
        const btn = document.createElement('button');
        btn.className = 'timeline-share-btn';
        btn.innerHTML = '📤';
        btn.title = 'Share the full protocol timeline';
        btn.style.cssText = `
            background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
            color: rgba(255,255,255,0.5); width: 36px; height: 36px; border-radius: 8px;
            cursor: pointer; font-size: 16px;
            display: flex; align-items: center; justify-content: center;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            flex-shrink: 0;
            opacity: 0; pointer-events: none;
        `;
        btn.addEventListener('mouseenter', () => {
            const c = getThemeColors();
            btn.style.borderColor = c.brand;
            btn.style.color = c.brand;
            btn.style.background = `rgba(${c.brand === '#00d4ff' ? '0,212,255' : '0,255,0'},0.1)`;
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.borderColor = 'rgba(255,255,255,0.1)';
            btn.style.color = 'rgba(255,255,255,0.5)';
            btn.style.background = 'rgba(255,255,255,0.05)';
        });
        btn.addEventListener('click', () => captureTimeline(protocols));
        badgesContainer.insertBefore(btn, badgesContainer.firstChild);

        const clockSection = document.querySelector('.upgrade-clock-content');
        if (clockSection) {
            clockSection.addEventListener('mouseenter', () => {
                btn.style.opacity = '1';
                btn.style.pointerEvents = 'auto';
            });
            clockSection.addEventListener('mouseleave', () => {
                btn.style.opacity = '0';
                btn.style.pointerEvents = 'none';
            });
        }
    }
}

// Expose captureProtocol globally for infographic row clicks
window.captureProtocol = captureProtocol;