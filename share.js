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
        // New historian tweets (static)
        { label: '💪 Flex', text: () => `250 independent bakers securing Tezos.\n\nNo permission needed. No minimum stake requirements. Just run a node and start baking.` },
        { label: '📊 Standard', text: () => `Home bakers welcome: Tezos runs on Raspberry Pis, not data centers.\n\n250 validators proving decentralization works.` },
        { label: '📢 Recruit', text: () => `Want to become a Tezos baker? You need:\n• A computer\n• Internet\n• Some XTZ to stake\n\nThat's it. No foundation approval required.` },
        { label: '💪 Flex', text: () => `250 bakers. Zero gatekeepers.\n\nTezos: where permissionless actually means permissionless.` },
        { label: '🔥 Dunk', text: () => `Other chains: 'Decentralized*'\n*21 validators, foundation-approved\n\nTezos: 250 independent bakers, anyone can join` },
        { label: '❓ Question', text: () => `Why does Tezos have 250+ active bakers when other chains struggle with validator diversity?\n\nMaybe permissionless design actually matters.` },
        { label: '⚔️ Compare', text: () => `Ethereum: 900,000+ validators (mostly Lido)\nTezos: 250 independent bakers\n\nGuess which one has actual decentralization?` },
        { label: '🔥 Dunk', text: () => `Running a Tezos baker from your garage > Running an ETH validator through Coinbase` },
        { label: '📊 Standard', text: () => `250 bakers keeping Tezos alive 24/7.\n\nSome run from bedrooms. Some from offices. All keeping the network permissionless.` },
        { label: '🔥 Dunk', text: () => `Tezos baker requirements:\n✅ Any computer\n✅ Basic tech skills\n✅ Some XTZ\n\nSolana validator requirements:\n❌ $100k+ server\n❌ Data center\n❌ Prayer circle` },
        { label: '💪 Flex', text: () => `250 active bakers prove that low barriers to entry create real decentralization.\n\nNot just in theory. In practice.` },
        { label: '⚔️ Compare', text: () => `Home baking on Tezos: possible\nHome validating on Solana: impossible\nHome staking on Ethereum: Lido'd` },
        { label: '📢 Recruit', text: () => `Developer looking for a truly decentralized chain to build on?\n\nTezos: 250 independent bakers, no validator oligarchy` },
        { label: '📊 Standard', text: () => `250 bakers. 250 different setups. 250 independent operators.\n\nThis is what decentralization looks like.` },
        { label: '🔥 Dunk', text: () => `Tezos bakers: your neighbor with a Raspberry Pi\nOther chain validators: Coinbase with a data center\n\nSpot the difference?` },
        { label: '📢 Recruit', text: () => `Want to secure a billion-dollar network?\n\nTezos makes it possible from your living room. 250 bakers already proving it works.` },
        { label: '💪 Flex', text: () => `250 independent bakers > 4 mining pools` },
        { label: '📊 Standard', text: () => `Permissionless baking isn't just a buzzword on Tezos.\n\n250 active bakers prove anyone can participate in consensus.` },
        { label: '❓ Question', text: () => `How many Tezos bakers does it take to secure a network?\n\n250 independent ones, apparently.` },
        { label: '📢 Recruit', text: () => `Tezos: Come for the self-amendment, stay for the actual decentralization.\n\n250 bakers can't all be wrong.` },
        { label: '📊 Standard', text: () => `Some chains have validators. Tezos has bakers.\n\nSemantics? Maybe. But 250 independent operators isn't.` },
        { label: '💪 Flex', text: () => `Blockchain trilemma solved:\n✅ Secure (250 bakers)\n✅ Decentralized (permissionless)\n✅ Scalable (6s blocks)\n\nTezos checked all boxes.` },
        { label: '⚔️ Compare', text: () => `Why run a Tezos baker instead of an ETH validator?\n\n250 independent bakers > 900k Lido nodes` },
        { label: '💪 Flex', text: () => `250 bakers keeping Tezos decentralized while other chains chase validator count statistics.\n\nQuality > quantity.` },
        { label: '🔥 Dunk', text: () => `Decentralization speedrun:\n1. Make validation accessible\n2. Remove gatekeepers\n3. Wait for 250 independent bakers\n\nTezos any%` },
        { label: '📢 Recruit', text: () => `Building on a chain with actual validator diversity?\n\nTezos: 250 independent bakers, zero foundation control` },
        { label: '📊 Standard', text: () => `250 Tezos bakers proving that decentralization doesn't require sacrificing performance or security.` },
        { label: '📊 Standard', text: () => `Home baking: alive and well on Tezos.\n\n250 independent bakers, many running from bedrooms and basements.` },
        { label: '❓ Question', text: () => `Are 250 independent validators enough for decentralization, or do you need 900,000 controlled by one entity?` },
        { label: '💪 Flex', text: () => `Tezos solved the validator centralization problem by making validation actually accessible.\n\n250 bakers and counting.` },
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
        // New historian tweets (static)
        { label: '📊 Standard', text: () => `tz4 addresses rolling out across Tezos.\n\nBLS signature aggregation bringing consensus into the modern era.` },
        { label: '💪 Flex', text: () => `Consensus key migration to BLS signatures: because cryptographic upgrades shouldn't require hard forks.` },
        { label: '📊 Standard', text: () => `tz4: where bakers upgrade their cryptography without breaking the network.\n\nSelf-amendment working as designed.` },
        { label: '📊 Standard', text: () => `BLS signatures on Tezos: faster verification, smaller signatures, better performance.\n\ntz4 addresses making it happen.` },
        { label: '💪 Flex', text: () => `tz4 adoption proves Tezos can upgrade its cryptography seamlessly.\n\nTry doing that with a hard fork.` },
        { label: '📢 Recruit', text: () => `Migrating to tz4 addresses? You're upgrading Tezos consensus cryptography in real-time.\n\nNo drama. No forks.` },
        { label: '📊 Standard', text: () => `BLS signature aggregation through tz4:\n• Faster verification\n• Smaller signatures\n• Better performance\n\nMath > marketing` },
        { label: '🔥 Dunk', text: () => `Other chains: 'Major cryptographic upgrade requires hard fork and 6 months of drama'\nTezos: 'tz4 addresses are live'` },
        { label: '📊 Standard', text: () => `tz4 addresses bringing BLS signatures to Tezos consensus.\n\nBecause even cryptography can be upgraded gracefully.` },
        { label: '💪 Flex', text: () => `Consensus key migration happening live on Tezos.\n\nBLS signatures through tz4 addresses, zero downtime.` },
        { label: '❓ Question', text: () => `Why use outdated cryptography when you can upgrade to tz4?\n\nBLS signatures aren't just faster—they're the future.` },
        { label: '⚔️ Compare', text: () => `tz4 vs legacy addresses: BLS signature aggregation vs single signatures.\n\nMath doesn't lie about which is better.` },
        { label: '📢 Recruit', text: () => `Want to use cutting-edge cryptography in production?\n\ntz4 addresses on Tezos: BLS signatures live and working.` },
        { label: '💪 Flex', text: () => `Cryptographic upgrade without network drama?\n\ntz4 adoption on Tezos proving self-amendment works for more than just protocols.` },
        { label: '📊 Standard', text: () => `BLS signature aggregation through tz4: because consensus should use the best available cryptography.` },
        { label: '📊 Standard', text: () => `tz4 addresses aren't just new—they're cryptographically superior.\n\nBLS signatures making Tezos consensus faster and smaller.` },
        { label: '🔥 Dunk', text: () => `Other protocols: 'We'll add BLS signatures in v3.0 after the hard fork'\nTezos: 'tz4 addresses are already live'` },
        { label: '📊 Standard', text: () => `Consensus key migration to BLS happening seamlessly on Tezos.\n\ntz4 addresses: where cryptographic upgrades meet reality.` },
        { label: '❓ Question', text: () => `How do you upgrade a blockchain's cryptography without breaking everything?\n\ntz4 addresses on Tezos have the answer.` },
        { label: '📢 Recruit', text: () => `Building with modern cryptography matters.\n\ntz4 addresses bringing BLS signatures to Tezos—no waiting required.` },
        { label: '💪 Flex', text: () => `BLS signature aggregation through tz4:\n✅ Live on mainnet\n✅ Faster verification\n✅ Zero downtime upgrade\n\nThis is how you do cryptography.` },
        { label: '📊 Standard', text: () => `tz4 adoption showing that Tezos can upgrade anything—even its own cryptographic foundations.` },
        { label: '📊 Standard', text: () => `Consensus keys migrating to BLS signatures via tz4.\n\nBecause self-amendment applies to cryptography too.` },
        { label: '⚔️ Compare', text: () => `tz4 vs other address formats: BLS aggregation vs individual signatures.\n\nGuess which one scales better?` },
        { label: '📢 Recruit', text: () => `Want to see cryptographic innovation in action?\n\ntz4 addresses bringing BLS signatures to Tezos consensus layer.` },
        { label: '📊 Standard', text: () => `BLS signatures through tz4: smaller, faster, mathematically superior.\n\nTezos consensus getting the upgrade it deserves.` },
        { label: '🔥 Dunk', text: () => `Hard fork for cryptographic upgrades? That's so 2017.\n\ntz4 addresses proving seamless upgrades are possible.` },
        { label: '📊 Standard', text: () => `tz4 adoption: where cutting-edge cryptography meets production blockchain.\n\nBLS signatures making consensus better.` },
        { label: '❓ Question', text: () => `Can your blockchain upgrade its own cryptography without drama?\n\ntz4 addresses on Tezos making it look easy.` },
        { label: '💪 Flex', text: () => `Migrating to tz4 addresses means joining Tezos's cryptographic future.\n\nBLS signatures: better math for better consensus.` },
    ],
    'current-cycle': [
        // New historian tweets (static) for current cycle
        { label: '📊 Standard', text: () => `Tezos cycles: 8192 blocks of deterministic finality.\n\nTenderbake consensus making every block count.` },
        { label: '💪 Flex', text: () => `Cycle-based consensus on Tezos: where finality isn't probabilistic.\n\nTenderbake bringing deterministic guarantees.` },
        { label: '📊 Standard', text: () => `Current cycle rolling forward with Tenderbake consensus.\n\nBecause probabilistic finality is so last decade.` },
        { label: '📊 Standard', text: () => `Tezos cycles: 8192 blocks, deterministic finality, zero reorganizations.\n\nTenderbake proving consensus can be predictable.` },
        { label: '📢 Recruit', text: () => `Want deterministic finality instead of 'probably final'?\n\nTezos cycles with Tenderbake consensus have you covered.` },
        { label: '🔥 Dunk', text: () => `Bitcoin: 'Wait 6 blocks for safety'\nEthereum: 'Wait 2 epochs for finality'\nTezos: 'Every block is final'\n\nTenderbake > everything` },
        { label: '📊 Standard', text: () => `Cycle-based consensus bringing order to blockchain chaos.\n\nTenderbake on Tezos: where finality means finality.` },
        { label: '💪 Flex', text: () => `8192 blocks per cycle, each one deterministically final.\n\nTezos showing how consensus should work.` },
        { label: '❓ Question', text: () => `What's better than probabilistic finality?\n\nDeterministic finality. Every cycle. Every block.` },
        { label: '⚔️ Compare', text: () => `Tenderbake vs Nakamoto consensus: deterministic vs probabilistic finality.\n\nGuess which one enterprises prefer?` },
        { label: '📢 Recruit', text: () => `Building applications that need real finality guarantees?\n\nTezos cycles with Tenderbake: where 'final' actually means final.` },
        { label: '💪 Flex', text: () => `Cycle progression on Tezos: predictable, deterministic, final.\n\nNo reorgs. No 'probably safe'. Just finality.` },
        { label: '📊 Standard', text: () => `Tenderbake consensus bringing Tendermint-style finality to Tezos.\n\nBecause probabilistic finality is a bug, not a feature.` },
        { label: '❓ Question', text: () => `How do you guarantee transaction finality?\n\nTezos cycles with deterministic consensus have the answer.` },
        { label: '📊 Standard', text: () => `Current cycle: another 8192 blocks of guaranteed finality on Tezos.\n\nTenderbake making consensus boring in the best way.` },
    ],
    'block-times': [
        // New historian tweets (static) for block times
        { label: '📊 Standard', text: () => `Tezos block time evolution:\n30s → 15s → 10s → 8s → 6s\n\nTallinn upgrade proving iterative improvement works.` },
        { label: '💪 Flex', text: () => `6-second blocks on Tezos.\n\nFrom 30 seconds to 6 seconds without breaking anything.` },
        { label: '📊 Standard', text: () => `Block time progression: 30→15→10→8→6 seconds.\n\nTezos getting faster while staying stable.` },
        { label: '📊 Standard', text: () => `Tallinn upgrade: 6-second blocks live on Tezos.\n\nBecause patience is overrated.` },
        { label: '📢 Recruit', text: () => `Want sub-10 second finality?\n\nTezos: 6-second blocks with deterministic consensus.` },
        { label: '🔥 Dunk', text: () => `Other chains: 'Fast blocks cause instability'\nTezos: *casually drops to 6-second blocks*` },
        { label: '⚔️ Compare', text: () => `6-second blocks vs 15-second blocks: Tezos vs Ethereum block times.\n\nGuess which one confirms faster?` },
        { label: '💪 Flex', text: () => `Block time optimization on Tezos: steady progress from 30s to 6s.\n\nNo dramatic rewrites. Just better engineering.` },
        { label: '❓ Question', text: () => `How fast can blockchain consensus go?\n\nTezos: 6-second blocks, deterministic finality, zero compromises.` },
        { label: '📊 Standard', text: () => `Tallinn upgrade bringing 6-second blocks to Tezos.\n\nBecause waiting 30 seconds was so 2018.` },
        { label: '📢 Recruit', text: () => `Building high-frequency applications?\n\nTezos: 6-second blocks, deterministic finality, enterprise-ready.` },
        { label: '💪 Flex', text: () => `30s → 6s block times on Tezos.\n\n5x faster blocks, same reliability. This is how you optimize.` },
        { label: '⚔️ Compare', text: () => `6-second deterministic finality on Tezos > 15-second probabilistic finality elsewhere.` },
        { label: '📊 Standard', text: () => `Block time evolution showing Tezos can get faster without getting unstable.\n\n6 seconds: the sweet spot.` },
        { label: '❓ Question', text: () => `Why wait 15 seconds for a block when you can wait 6?\n\nTallinn upgrade making Tezos the fastest deterministic chain.` },
        { label: '💪 Flex', text: () => `From half-minute blocks to 6-second blocks.\n\nTezos proving optimization doesn't require starting over.` },
        { label: '📊 Standard', text: () => `6-second blocks: fast enough for DeFi, stable enough for enterprise.\n\nTezos finding the perfect balance.` },
        { label: '📊 Standard', text: () => `Block time progression: methodical, tested, deployed.\n\nTezos reaching 6 seconds the right way.` },
        { label: '💪 Flex', text: () => `Tallinn upgrade: where 6-second blocks meet deterministic finality.\n\nHaving your cake and eating it too.` },
        { label: '❓ Question', text: () => `How do you reduce block times by 80% without breaking consensus?\n\nTezos: careful engineering and gradual optimization.` },
    ],
    'zero-downtime': [
        // New historian tweets (static) for zero downtime
        { label: '💪 Flex', text: () => `2,782 days of uptime.\n\nTezos: the chain that never sleeps, never stops, never fails.` },
        { label: '📊 Standard', text: () => `Zero outages. Zero downtime. 2,782 days and counting.\n\nTezos proving reliability isn't negotiable.` },
        { label: '🔥 Dunk', text: () => `2,782 consecutive days live.\n\nSolana could never.` },
        { label: '💪 Flex', text: () => `Uptime: 2,782 days\nDowntime: 0 days\n\nTezos making 99.999% look easy.` },
        { label: '📢 Recruit', text: () => `Building mission-critical applications?\n\nTezos: 2,782 days of perfect uptime speaks for itself.` },
        { label: '⚔️ Compare', text: () => `Tezos uptime: 2,782 days\nSolana uptime: 'It's complicated'\n\nReliability matters.` },
        { label: '❓ Question', text: () => `How many blockchain outages have you lived through?\n\nTezos bakers: zero. Because 2,782 days of uptime.` },
        { label: '📊 Standard', text: () => `Some chains go down for maintenance.\n\nTezos just keeps baking blocks. 2,782 days straight.` },
        { label: '💪 Flex', text: () => `Zero downtime in 2,782 days.\n\nEither Tezos bakers are really good, or the design actually works.` },
        { label: '🔥 Dunk', text: () => `'Is Tezos down?' has never been a trending topic.\n\n2,782 days of uptime will do that.` },
        { label: '📢 Recruit', text: () => `Enterprise blockchain requirements:\n✅ Uptime: 2,782 days\n✅ Outages: 0\n✅ Reliability: Proven\n\nTezos checks all boxes.` },
        { label: '📊 Standard', text: () => `2,782 days without a single network outage.\n\nTezos: where 'always on' actually means always on.` },
        { label: '💪 Flex', text: () => `Perfect uptime for 2,782 days while upgrading protocols, cryptography, and block times.\n\nThis is what stability looks like.` },
        { label: '⚔️ Compare', text: () => `Tezos vs Solana uptime comparison:\nTezos: 100%\nSolana: 'We prefer not to discuss that'` },
        { label: '❓ Question', text: () => `Why hasn't Tezos had an outage in 2,782 days?\n\nMaybe because the validators aren't all running identical software.` },
        { label: '📊 Standard', text: () => `2,782 days of continuous operation.\n\nTezos proving that decentralized doesn't mean unreliable.` },
        { label: '📢 Recruit', text: () => `Building on a chain that's never been down?\n\nTezos: 2,782 days of uptime, zero maintenance windows.` },
        { label: '💪 Flex', text: () => `Some blockchains go offline for upgrades.\n\nTezos upgrades itself without skipping a beat. 2,782 days and counting.` },
        { label: '📊 Standard', text: () => `Network outages: the one thing Tezos bakers refuse to deliver.\n\n2,782 days of perfect uptime.` },
        { label: '❓ Question', text: () => `How many consecutive days can a blockchain run without failure?\n\nTezos: 2,782 and counting.` },
    ],
    'baking-economics': [
        // New historian tweets (static) for baking economics
        { label: '📊 Standard', text: () => `Tezos staking: delegate to a baker or become one yourself.\n\nReal choice, real decentralization.` },
        { label: '📊 Standard', text: () => `Baking rewards on Tezos: earned through consensus participation, not just holding tokens.` },
        { label: '📢 Recruit', text: () => `Want to earn staking rewards without giving up custody?\n\nTezos delegation: non-custodial, baker-operated, permissionless.` },
        { label: '📊 Standard', text: () => `Staking vs baking vs delegating on Tezos:\n• Stake: run your own baker\n• Delegate: choose a baker\n• Earn: either way` },
        { label: '⚔️ Compare', text: () => `Tezos delegation > ETH staking pools.\n\nNon-custodial delegation vs locked ETH. You choose.` },
        { label: '📊 Standard', text: () => `Baking economics: rewards for securing the network, penalties for bad behavior.\n\nIncentives aligned with network health.` },
        { label: '📢 Recruit', text: () => `Why run a Tezos baker?\n\n• Earn staking rewards\n• Help secure the network\n• Maintain decentralization` },
        { label: '🔥 Dunk', text: () => `Liquid staking on other chains: complex DeFi\nTezos delegation: built into the protocol\n\nSimple > complicated` },
        { label: '📊 Standard', text: () => `Tezos baker operations: bake blocks, attest, earn rewards.\n\nConsensus participation that actually pays.` },
        { label: '❓ Question', text: () => `How do you earn yield without giving up your keys?\n\nTezos delegation: non-custodial staking since day one.` },
        { label: '💪 Flex', text: () => `Delegation on Tezos: your XTZ, your choice of baker, your rewards.\n\nNo liquid staking tokens required.` },
        { label: '📢 Recruit', text: () => `Building staking infrastructure that doesn't require custody?\n\nTezos delegation model: the template for how it should work.` },
        { label: '📊 Standard', text: () => `Baking rewards encouraging network participation while keeping barriers low.\n\nEconomics aligned with decentralization.` },
        { label: '💪 Flex', text: () => `Staking economics done right:\n• Non-custodial delegation\n• Permissionless baking\n• Aligned incentives\n\nTezos figured it out.` },
        { label: '❓ Question', text: () => `Is earning staking rewards worth giving up custody of your tokens?\n\nTezos delegation says no.` },
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
        // New economics tweets (static)
        { label: '📊 Standard', text: () => `Tezos staking APY: ~9.5% if you run your own baker, ~3.2% if you delegate. No lockup periods, no slashing risk for delegators. That's risk-adjusted yield done right.` },
        { label: '⚔️ Compare', text: () => `Ethereum staking: ~3-4% with slashing risk. Tezos delegation: ~3.2% with no slashing risk. Solana: ~7% but your tokens are locked. Which sounds better?` },
        { label: '💪 Flex', text: () => `~9.5% APY for running a Tezos baker, ~3.2% for delegating with zero lockup. We've been doing liquid staking since 2018 while others were still figuring out PoS.` },
        { label: '🔥 Dunk', text: () => `Other chains: "Lock your tokens for 21 days to earn 4%." Tezos: "Here's 3.2% with no lockup and no slashing risk." Gee, tough choice.` },
        { label: '❓ Question', text: () => `What's better: 7% APY with your tokens locked for weeks, or 3.2% with instant liquidity and no slashing risk? Tezos delegation makes this an easy choice.` },
        { label: '📢 Recruit', text: () => `DeFi builders: Tezos offers ~3.2% delegation APY with no lockup as your baseline yield. Build yield strategies on top of liquid, staked assets.` },
        { label: '📊 Standard', text: () => `Tezos delegation: ~3.2% APY, no lockup, no slashing risk for delegators. Your XTZ stays liquid while earning staking rewards. That's how you do risk-free yield.` },
        { label: '⚔️ Compare', text: () => `Cardano: ~5% with delegation pools. Polkadot: ~12% but locked for 28 days. Tezos: ~3.2% delegation with instant liquidity. Quality over complexity.` },
        { label: '💪 Flex', text: () => `Running a Tezos baker gets you ~9.5% APY. That's real yield from securing a network that's been running smoothly since 2018. No gimmicks, just math.` },
        { label: '🔥 Dunk', text: () => `Liquid staking protocols charging 10% fees to solve what problem exactly? Tezos has had native liquid delegation at ~3.2% APY since genesis.` },
        { label: '❓ Question', text: () => `Why would you lock tokens for weeks to earn 7% when you can get 3.2% on Tezos with instant liquidity? What's the real risk-adjusted return?` },
        { label: '📢 Recruit', text: () => `Portfolio managers: Tezos delegation offers ~3.2% APY baseline with no lockup periods. Liquid staking that doesn't compromise capital efficiency.` },
        { label: '📊 Standard', text: () => `Current Tezos yields: ~9.5% APY for baking, ~3.2% for delegation. No complex liquid staking derivatives needed - it's been native since day one.` },
        { label: '⚔️ Compare', text: () => `Cosmos: ~9% but unbonding takes 21 days. Near: ~10% with lockup. Tezos: ~3.2% delegation with zero lockup. Lower rate, higher capital efficiency.` },
        { label: '💪 Flex', text: () => `~9.5% APY for running a Tezos baker, plus you're securing a network with 4+ years of smooth operation and ongoing upgrades. That's yield with purpose.` },
        { label: '🔥 Dunk', text: () => `Liquid staking tokens trading at discounts because of unlock delays? Tezos delegation doesn't need derivative tokens because your XTZ stays liquid at ~3.2% APY.` },
        { label: '❓ Question', text: () => `Is 3.2% APY low for crypto? Not when it comes with instant liquidity, no slashing risk, and the ability to use your XTZ in DeFi simultaneously.` },
        { label: '📢 Recruit', text: () => `Institutional investors: Tezos delegation provides ~3.2% yield with no lockup periods or complex derivatives. Clean exposure to staking rewards.` },
        { label: '📊 Standard', text: () => `Tezos staking economics: ~9.5% for bakers who secure the network, ~3.2% for delegators who provide stake. Aligned incentives with no artificial complexity.` },
        { label: '⚔️ Compare', text: () => `Algorand: ~6% governance rewards. Avalanche: ~9% but locked. Tezos: ~3.2% delegation with liquid tokens that work across all DeFi protocols immediately.` },
        { label: '💪 Flex', text: () => `Four years of ~9.5% baker yields and ~3.2% delegation returns with zero major slashing events. Tezos staking: boring in the best possible way.` },
        { label: '🔥 Dunk', text: () => `Complex liquid staking protocols everywhere while Tezos has had native liquid delegation since 2018. Sometimes the simple solution is just better engineered.` },
        { label: '❓ Question', text: () => `What if staking didn't require giving up liquidity? Tezos delegation at ~3.2% APY proves that liquid staking was always possible, just not prioritized.` },
        { label: '📢 Recruit', text: () => `Yield farmers: Start with ~3.2% risk-free from Tezos delegation, then layer DeFi strategies on top. Liquid staking as your foundation.` },
        { label: '📊 Standard', text: () => `Real Tezos APY: ~9.5% for running infrastructure, ~3.2% for delegation. No lockups, no slashing for delegators, no complex derivatives needed.` },
        { label: '⚔️ Compare', text: () => `Ethereum liquid staking: complex protocols, smart contract risk, fees. Tezos: native delegation at protocol level, ~3.2% APY, zero additional risk.` },
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
        // New economics tweets (static)
        { label: '📊 Standard', text: () => `Tezos has adaptive issuance at ~3.5-3.7% that adjusts based on network participation. More staking = lower inflation. It's monetary policy that responds to actual usage.` },
        { label: '⚔️ Compare', text: () => `While Bitcoin prints ~1.7% and Ethereum around 0.8%, Tezos runs ~3.6% but it's adaptive. The network literally adjusts its own monetary policy based on staking participation.` },
        { label: '💪 Flex', text: () => `Adaptive issuance was controversial during Quebec but now it's live and working. Tezos inflation adjusts automatically based on how many people are securing the network.` },
        { label: '🔥 Dunk', text: () => `Other chains: fixed inflation schedules. Tezos: "Let's make monetary policy responsive to actual network participation." Quebec upgrade was peak engineering.` },
        { label: '❓ Question', text: () => `What if a blockchain could adjust its own inflation rate based on network security? That's exactly what Tezos does with adaptive issuance. Smart money meets smart contracts.` },
        { label: '📢 Recruit', text: () => `Looking for a network where inflation isn't arbitrary? Tezos adaptive issuance means monetary policy responds to actual staking participation, not some dev's spreadsheet.` },
        { label: '📊 Standard', text: () => `Tezos issuance rate: ~3.6% but adaptive. More staking participation = lower inflation automatically. It's like having a central bank that actually responds to market conditions.` },
        { label: '⚔️ Compare', text: () => `Bitcoin: halving every 4 years. Ethereum: merge to deflationary. Tezos: adaptive issuance that responds to real-time network participation. Which sounds more sophisticated?` },
        { label: '💪 Flex', text: () => `Remember when people said adaptive issuance was too complex? Now Tezos has monetary policy that actually responds to network security in real-time. Quebec aged like fine wine.` },
        { label: '🔥 Dunk', text: () => `Other blockchains: "Our tokenomics are set in stone forever." Tezos: "What if inflation adjusted based on how many people are actually securing the network?"` },
        { label: '❓ Question', text: () => `Why should blockchain inflation be fixed when network participation varies? Tezos adaptive issuance adjusts ~3.5-3.7% based on actual staking ratios.` },
        { label: '📢 Recruit', text: () => `Building on a network with adaptive monetary policy? Tezos issuance responds to staking participation - inflation that makes economic sense.` },
        { label: '📊 Standard', text: () => `Tezos runs ~3.6% issuance but it's not arbitrary. The rate adjusts automatically based on how much of the supply is actively securing the network through staking.` },
        { label: '⚔️ Compare', text: () => `Ethereum went deflationary with the merge. Tezos went adaptive with Quebec. One burns tokens, the other adjusts inflation based on actual network participation.` },
        { label: '💪 Flex', text: () => `Quebec upgrade brought adaptive issuance to Tezos. Now we have a blockchain where monetary policy responds to network security in real-time. That's next-level tokenomics.` },
        { label: '🔥 Dunk', text: () => `Fixed supply chains be like "our tokenomics never change" while Tezos is over here with adaptive issuance that actually responds to network participation like grown-up money.` },
        { label: '❓ Question', text: () => `What's better: fixed inflation or inflation that adjusts based on network security? Tezos adaptive issuance at ~3.6% gives us responsive monetary policy.` },
        { label: '📢 Recruit', text: () => `Want to build on a network with sophisticated tokenomics? Tezos adaptive issuance means inflation adjusts automatically based on staking participation.` },
        { label: '📊 Standard', text: () => `Low inflation, high utility: Tezos runs ~3.6% adaptive issuance that decreases when more people stake. It's monetary policy that responds to actual network usage.` },
        { label: '⚔️ Compare', text: () => `Bitcoin: ~1.7% fixed. Solana: ~7% fixed. Tezos: ~3.6% adaptive. Guess which one adjusts its monetary policy based on actual network participation?` },
        { label: '💪 Flex', text: () => `Adaptive issuance was the Quebec upgrade's crown jewel. Tezos now has inflation that responds to staking participation automatically. That's evolution in action.` },
        { label: '🔥 Dunk', text: () => `Other chains: "We set inflation at launch and never touch it." Tezos: "What if we made monetary policy actually responsive to network conditions?" *chef's kiss*` },
        { label: '❓ Question', text: () => `Is ~3.6% inflation high? Not when it's adaptive. Tezos adjusts issuance based on staking participation - more security means lower inflation automatically.` },
        { label: '📢 Recruit', text: () => `Developers: Tezos adaptive issuance means you're building on a network where monetary policy evolves with actual usage patterns, not arbitrary tokenomics.` },
        { label: '📊 Standard', text: () => `Current Tezos issuance: ~3.6% but adaptive. The network literally adjusts its own inflation based on how many people are participating in consensus. Smart money, literally.` },
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
        // New economics tweets (static)
        { label: '📊 Standard', text: () => `Tezos staking ratio: ~27.87% of supply actively securing the network. That's real skin in the game from people who believe in long-term network health.` },
        { label: '⚔️ Compare', text: () => `Bitcoin hash rate varies wildly with price. Tezos has ~27.87% of supply consistently staking regardless of market conditions. Which feels more secure?` },
        { label: '💪 Flex', text: () => `~27.87% staking ratio on Tezos means over 300 million XTZ committed to network security. That's not speculation - that's conviction in the protocol.` },
        { label: '🔥 Dunk', text: () => `Other chains: "Our staking ratio dropped because prices went down." Tezos: ~27.87% staying steady because people actually believe in the tech.` },
        { label: '❓ Question', text: () => `What does ~27.87% staking ratio tell you about network participants? Maybe that they're not just here for quick flips but actual long-term value creation?` },
        { label: '📢 Recruit', text: () => `Protocol developers: ~27.87% of Tezos supply is staking, showing real commitment from network participants. Build where people have skin in the game.` },
        { label: '📊 Standard', text: () => `Current Tezos staking ratio: ~27.87%. Nearly 28% of all XTZ is actively participating in network consensus. That's meaningful participation in governance.` },
        { label: '⚔️ Compare', text: () => `Solana: staking ratio varies with validator performance. Cardano: ~70% but simpler delegation. Tezos: steady ~27.87% with active governance participation.` },
        { label: '💪 Flex', text: () => `~27.87% staking ratio represents hundreds of millions in XTZ committed to Tezos security and governance. These aren't passive holders - they're active participants.` },
        { label: '🔥 Dunk', text: () => `Networks with 90%+ staking ratios: "Look how popular we are!" Tezos at ~27.87%: "Our stakers chose conviction over forced participation." Quality matters.` },
        { label: '❓ Question', text: () => `Is ~27.87% staking ratio too low or just right? What matters more - forced participation through token design or genuine conviction in the protocol?` },
        { label: '📢 Recruit', text: () => `Enterprise adoption: ~27.87% of Tezos supply actively staking shows real network participation and long-term commitment from the community.` },
        { label: '📊 Standard', text: () => `Tezos staking ratio: ~27.87% and growing steadily. No forced participation through token mechanics - people stake because they believe in the network.` },
        { label: '⚔️ Compare', text: () => `Polkadot: complex parachain auctions for participation. Cosmos: varying rates across zones. Tezos: consistent ~27.87% staking from genuine conviction.` },
        { label: '💪 Flex', text: () => `~27.87% staking ratio means real economic security on Tezos. These are network participants with actual skin in the game, not just yield farmers.` },
        { label: '🔥 Dunk', text: () => `High staking ratios through forced mechanisms vs. Tezos' ~27.87% through genuine participation. One shows tokenomics, the other shows conviction.` },
        { label: '❓ Question', text: () => `What makes ~27.87% staking ratio meaningful? It represents free choice to participate in Tezos governance and security without artificial incentives.` },
        { label: '📢 Recruit', text: () => `Institutional research: ~27.87% Tezos staking ratio represents genuine network participation without forced lockup mechanisms. Quality over quantity.` },
        { label: '📊 Standard', text: () => `Network security through ~27.87% staking ratio: over 300 million XTZ committed to Tezos consensus. That's hundreds of millions in skin in the game.` },
        { label: '⚔️ Compare', text: () => `Ethereum 2.0: ~25% staking. Near: ~65% staking. Tezos: ~27.87% staking with liquid delegation. Sometimes less forced participation means more genuine commitment.` },
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
        // New economics tweets (static)
        { label: '📊 Standard', text: () => `~2.19 million XTZ burned through transaction fees. That's deflationary pressure from actual network usage - tokens removed permanently through economic activity.` },
        { label: '⚔️ Compare', text: () => `Ethereum burns ETH post-merge. Bitcoin has no burning mechanism. Tezos: 2.19M XTZ burned from fees since genesis. Deflationary through usage.` },
        { label: '💪 Flex', text: () => `2.19 million XTZ burned and gone forever. That's organic deflation from network usage, not artificial token mechanics. Real economic activity driving scarcity.` },
        { label: '🔥 Dunk', text: () => `Buy-back-and-burn programs be like "we'll create fake scarcity" while Tezos has burned 2.19M XTZ through actual usage since 2018. Organic > artificial.` },
        { label: '❓ Question', text: () => `What creates better deflationary pressure: artificial burning mechanisms or 2.19M XTZ burned through genuine network usage and economic activity?` },
        { label: '📢 Recruit', text: () => `Tokenomics analysts: 2.19M XTZ permanently burned through transaction fees represents organic deflation from real economic activity, not artificial scarcity.` },
        { label: '📊 Standard', text: () => `Fee burning on Tezos: 2.19 million XTZ permanently removed from circulation. Deflationary mechanics that scale with actual network usage and adoption.` },
        { label: '⚔️ Compare', text: () => `Polygon: fee burning with EIP-1559. BNB: quarterly burns by Binance. Tezos: 2.19M XTZ burned organically through four years of transaction fees.` },
        { label: '💪 Flex', text: () => `2.19 million XTZ burned through transaction fees since 2018. No artificial mechanisms, no governance votes to burn - just organic deflation from usage.` },
        { label: '🔥 Dunk', text: () => `Protocols announcing "we'll burn tokens to increase scarcity" while Tezos quietly burned 2.19M XTZ through actual usage over four years. Results > announcements.` },
        { label: '❓ Question', text: () => `Why are artificial token burns popular when 2.19M XTZ burned through real fees shows that organic deflation works? What's wrong with usage-based scarcity?` },
        { label: '📢 Recruit', text: () => `DeFi analysts: 2.19M XTZ burned represents deflationary pressure that scales with network adoption - fees creating scarcity through genuine economic activity.` },
        { label: '📊 Standard', text: () => `Tezos burning mechanics: 2.19 million XTZ permanently destroyed through transaction fees. Deflation that increases with network usage and adoption.` },
        { label: '⚔️ Compare', text: () => `Avalanche: fee burning on C-chain. Fantom: partial fee burning. Tezos: 2.19M XTZ burned through consistent fee burning since genesis. Steady deflation.` },
        { label: '💪 Flex', text: () => `2.19M XTZ burned over four years of operation shows that fee-based deflation works at scale. No artificial mechanisms needed - just sound tokenomics.` },
    ],
    'total-supply': [
        { label: '📊 Standard', text: (v) => `Total XTZ supply: ${v}\n\nWith adaptive issuance and ongoing burns, this number tells a story of sound monetary policy.` },
        { label: '📊 Standard', text: (v) => `${v} total XTZ in existence.\n\nNo VC unlocks. No team dumps. Transparent, on-chain economics.` },
        { label: '💪 Flex', text: (v) => `${v} XTZ total supply. Every token accounted for on-chain.\n\nNo hidden wallets. No surprise unlocks. No "strategic reserves."` },
        { label: '🔥 Dunk', text: (v) => `${v} XTZ total supply.\n\nFully transparent on-chain economics. No mysterious wallet movements, no surprise foundation sells.` },
        { label: '❓ Question', text: (v) => `Total XTZ supply: ${v}\n\nWith burns reducing this number every day, do you know which direction your chain's supply is heading?` },
        // New economics tweets (static)
        { label: '📊 Standard', text: () => `Tezos total supply: ~1.10 billion XTZ. With ~2.19M burned from fees and adaptive issuance responding to staking, it's deflationary pressure meets sound money.` },
        { label: '⚔️ Compare', text: () => `Bitcoin: 21M cap, deflationary. Ethereum: uncapped, now deflationary. Tezos: 1.10B supply with adaptive issuance and fee burning. Measured tokenomics.` },
        { label: '💪 Flex', text: () => `1.10 billion XTZ total supply with millions already burned and adaptive issuance keeping inflation in check. That's sophisticated monetary policy.` },
        { label: '🔥 Dunk', text: () => `Infinite supply chains: "Number go up forever!" Tezos: 1.10B supply, adaptive issuance, fee burning. Turns out thoughtful tokenomics work better.` },
        { label: '❓ Question', text: () => `Is 1.10 billion XTZ the right supply? With millions burned and adaptive issuance adjusting inflation, what matters more: the number or the mechanics?` },
        { label: '📢 Recruit', text: () => `Financial modeling: 1.10B XTZ supply with deflationary pressure from burns and adaptive issuance. Clean tokenomics for institutional analysis.` },
        { label: '📊 Standard', text: () => `1.10 billion XTZ total supply, but with fee burning and adaptive issuance creating deflationary pressure. Supply isn't fixed, but it's well-managed.` },
        { label: '⚔️ Compare', text: () => `Solana: ~500M supply, high inflation. Cardano: 45B max supply. Tezos: 1.10B with adaptive issuance and burning. Goldilocks tokenomics.` },
        { label: '💪 Flex', text: () => `1.10B XTZ supply with millions burned through usage and adaptive issuance keeping inflation responsive. That's money that responds to actual economic activity.` },
        { label: '🔥 Dunk', text: () => `Fixed supply advocates vs. infinite supply believers while Tezos sits at 1.10B with adaptive issuance and fee burning. Sometimes nuance wins.` },
        { label: '❓ Question', text: () => `What makes 1.10B XTZ supply optimal? It's large enough for global scale but small enough that fee burning and adaptive issuance create meaningful effects.` },
        { label: '📢 Recruit', text: () => `Economic researchers: 1.10B XTZ supply with deflationary mechanisms from burns and adaptive issuance. Real monetary policy experimentation at scale.` },
        { label: '📊 Standard', text: () => `Total Tezos supply: 1.10 billion XTZ. Not too scarce to be useful, not too abundant to be worthless. Balanced tokenomics for a global settlement layer.` },
        { label: '⚔️ Compare', text: () => `Near: ~1B supply, high staking inflation. Cosmos: varies by zone. Tezos: 1.10B supply with adaptive issuance and deflationary burning pressure.` },
        { label: '💪 Flex', text: () => `1.10B XTZ supply creating the foundation for sophisticated monetary policy through adaptive issuance and fee burning. Sound money for the digital age.` },
    ],
    'delegated': [
        { label: '📊 Standard', text: (v) => `${v} XTZ delegated to bakers — fully liquid, earning rewards, participating in governance.\n\nAll without a single wrapper token.` },
        { label: '📊 Standard', text: (v) => `${v} XTZ actively delegated on Tezos.\n\nDelegation is native. No smart contract risk. No third-party custody.` },
        { label: '💪 Flex', text: (v) => `${v} XTZ delegated — liquid, no lockup, no wrapper token, no intermediary.\n\nJust point your tokens at a baker and earn. Revolutionary, apparently.` },
        { label: '🔥 Dunk', text: (v) => `ETH stakers: lock 32 ETH, use Lido wrapper, risk slashing.\nTezos delegators: ${v} XTZ delegated, fully liquid, zero risk.\n\nSame concept. Wildly different UX.` },
        { label: '❓ Question', text: (v) => `${v} XTZ delegated without a single lockup or wrapper.\n\nWhy does every other chain make staking so complicated?` },
        { label: '📢 Recruit', text: (v) => `${v} XTZ already delegated. Are yours?\n\nDelegation takes 2 minutes and your tokens never leave your wallet. Zero excuses.` },
        // New economics tweets (static)
        { label: '📊 Standard', text: () => `~31.23% of Tezos supply is delegated - that's liquid staking without lockup periods or derivative tokens. Your XTZ stays liquid while earning ~3.2% APY.` },
        { label: '⚔️ Compare', text: () => `Ethereum: complex liquid staking protocols. Solana: locked tokens. Tezos: ~31.23% delegated with native liquid staking since 2018. No protocols needed.` },
        { label: '💪 Flex', text: () => `~31.23% delegation ratio on Tezos proves liquid staking was possible from day one. While others built complex workarounds, we had it native.` },
        { label: '🔥 Dunk', text: () => `Liquid staking protocols raising millions to solve problems Tezos solved in 2018. ~31.23% delegated, zero lockups, zero derivative tokens needed.` },
        { label: '❓ Question', text: () => `Why build complex liquid staking derivatives when ~31.23% of Tezos is already delegated with native protocol-level liquid staking? What problem are we solving?` },
        { label: '📢 Recruit', text: () => `DeFi developers: ~31.23% of XTZ is delegated with no lockup periods. Build yield strategies on top of liquid staked assets from day one.` },
        { label: '📊 Standard', text: () => `Tezos delegation model: ~31.23% of supply earning staking rewards while staying 100% liquid. No complex derivatives, no artificial tokens, just clean design.` },
        { label: '⚔️ Compare', text: () => `Cosmos: delegated tokens locked for 21 days. Cardano: liquid but simpler staking. Tezos: ~31.23% delegated with instant liquidity and DeFi compatibility.` },
        { label: '💪 Flex', text: () => `~31.23% delegated on Tezos with zero smart contract risk for liquid staking. Protocol-level delegation is just better engineering than derivative tokens.` },
        { label: '🔥 Dunk', text: () => `Complex liquid staking protocols everywhere while Tezos has had ~31.23% native delegation since genesis. Sometimes the obvious solution is just better.` },
        { label: '❓ Question', text: () => `What's the point of derivative tokens for liquid staking when ~31.23% of Tezos is already delegated with native liquidity? Why overcomplicate?` },
        { label: '📢 Recruit', text: () => `Portfolio managers: ~31.23% of XTZ delegated shows liquid staking at scale without complex derivatives or additional counterparty risk.` },
        { label: '📊 Standard', text: () => `Native delegation on Tezos: ~31.23% of supply participating in liquid staking with no lockups, no slashing risk for delegators, no derivative tokens.` },
        { label: '⚔️ Compare', text: () => `Algorand: participation rewards. Polkadot: bonded tokens. Tezos: ~31.23% delegated with full liquidity. Clean staking without compromise.` },
        { label: '💪 Flex', text: () => `~31.23% delegation proves liquid staking works when it's native to the protocol. Four years of smooth operation without complex workarounds.` },
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
        // New ecosystem tweets (static)
        { label: '📊 Standard', text: () => `101,000 transactions per day on Tezos. That's real usage, not just hype.` },
        { label: '🔥 Dunk', text: () => `Your transaction fee on Tezos today: probably less than your morning coffee stirrer cost.` },
        { label: '⚔️ Compare', text: () => `While other chains charge for a simple transfer, Tezos users pay fractions of a cent for 101K daily transactions.` },
        { label: '💪 Flex', text: () => `101,000 daily transactions with near-zero fees. This is what sustainable blockchain usage looks like.` },
        { label: '📊 Standard', text: () => `Every day, 101,000 people choose Tezos for transactions that actually cost what they should: almost nothing.` },
        { label: '📢 Recruit', text: () => `Want to see what a blockchain looks like when it's actually usable? 101K transactions daily, fees in cents.` },
        { label: '❓ Question', text: () => `How much did your last transaction cost? If it wasn't measured in fractions of a cent, you might be using the wrong chain.` },
        { label: '🔥 Dunk', text: () => `Tezos processes 101,000 transactions daily while your coffee budget could cover fees for a lifetime.` },
        { label: '💪 Flex', text: () => `101K daily transactions. Zero compromises on decentralization. Fees that don't require a loan.` },
        { label: '📊 Standard', text: () => `Transaction fees so low on Tezos, we measure them in fractions of cents. That's not a bug, it's the feature.` },
        { label: '⚔️ Compare', text: () => `Other chains: 'We'll scale soon!' Tezos: 101,000 affordable transactions daily, today.` },
        { label: '📢 Recruit', text: () => `Why pay premium gas when you can get premium blockchain for pennies? 101K daily transactions prove the point.` },
        { label: '📊 Standard', text: () => `Remember when blockchain was supposed to bank the unbanked? 101K daily transactions at fraction-of-cent fees.` },
        { label: '🔥 Dunk', text: () => `Tezos: where your transaction fee costs less than the electricity to click 'send'.` },
        { label: '💪 Flex', text: () => `101,000 transactions daily. Each one proving that blockchain can be both secure AND affordable.` },
        { label: '❓ Question', text: () => `What if I told you there's a blockchain where 101K daily transactions don't require selling a kidney for gas?` },
        { label: '📊 Standard', text: () => `Daily transaction volume: 101K. Daily transaction fee complaints: approaching zero.` },
        { label: '🔥 Dunk', text: () => `Ethereum users discovering Tezos fees: 'Wait, where's the rest of the decimal places?'` },
        { label: '📢 Recruit', text: () => `101,000 people every day choose a blockchain that respects both their time and their wallet.` },
        { label: '💪 Flex', text: () => `Tezos handles 101K transactions daily with fees measured in fractions of cents. This is what adoption looks like.` },
    ],
    'contract-calls': [
        { label: '📊 Standard', text: (v) => `${v} smart contract calls on Tezos in 24h.\n\nFormally verified contracts, sub-cent execution. The developer experience matters.` },
        { label: '📊 Standard', text: (v) => `24h Tezos contract calls: ${v}\n\nReal dApps, real users, real on-chain activity.` },
        { label: '🔥 Dunk', text: (v) => `${v} contract calls in 24h on Tezos. Sub-cent each.\n\nFormal verification support means fewer exploits. The smart contract security difference is real.` },
        { label: '💪 Flex', text: (v) => `${v} contract calls in 24h. Formally verified. Battle-tested. Cheap to call.\n\nTezos smart contracts: where "move fast and break things" meets mathematical proofs.` },
        { label: '💪 Flex', text: (v) => `${v} smart contract interactions today.\n\nMichelson and SmartPy contracts with formal verification built in. When the contract says X, it does X. No reentrancy exploits.` },
        { label: '❓ Question', text: (v) => `${v} contract calls on Tezos today.\n\nHow many DeFi exploits has Tezos had vs ETH? Formal verification matters.` },
        { label: '📈 Compare', text: (v) => `Smart contract security:\n• ETH: Billions lost to exploits over the years\n• SOL: Multiple DeFi hacks\n• Tezos: ${v} calls/day, formal verification, near-zero exploits\n\nSecurity-first design pays off.` },
        // New ecosystem tweets (static)
        { label: '📊 Standard', text: () => `22,000 smart contract calls daily on Tezos. DeFi, NFTs, and innovation that doesn't cost a fortune.` },
        { label: '💪 Flex', text: () => `22K smart contract interactions daily. Each one proving formal verification isn't just academic theory.` },
        { label: '🔥 Dunk', text: () => `Your DeFi swap on other chains: gas. Your DeFi swap on Tezos: still have lunch money left.` },
        { label: '⚔️ Compare', text: () => `22,000 smart contract calls daily where developers actually read the documentation because bugs cost real money.` },
        { label: '📢 Recruit', text: () => `Building DeFi that users can actually afford to use? 22K daily contract calls say developers figured it out.` },
        { label: '❓ Question', text: () => `How many smart contract calls can you afford on your favorite chain? On Tezos: all of them.` },
        { label: '📊 Standard', text: () => `22,000 smart contract calls daily. Michelson smart contracts meet macro innovation.` },
        { label: '💪 Flex', text: () => `While other chains make you choose between security and cost, Tezos delivers both with 22K daily contract calls.` },
        { label: '🔥 Dunk', text: () => `Smart contracts so affordable on Tezos, even the bots can afford to be polite.` },
        { label: '📊 Standard', text: () => `22K contract calls daily. Each interaction backed by formal verification and common sense pricing.` },
        { label: '⚔️ Compare', text: () => `NFT minting on Ethereum: mortgage your house. NFT minting on Tezos: keep your house, mint your art.` },
        { label: '📢 Recruit', text: () => `Want to build DeFi that people can actually use daily? 22K contract calls suggest Tezos developers know something.` },
        { label: '💪 Flex', text: () => `22,000 smart contract calls daily prove that formal verification and usability aren't mutually exclusive.` },
        { label: '❓ Question', text: () => `What's the point of building on a chain where users can't afford to use what you build? 22K daily calls have an answer.` },
        { label: '📊 Standard', text: () => `DeFi protocols on Tezos: built to be used, not just held. 22K daily contract calls prove it.` },
        { label: '💪 Flex', text: () => `22K smart contract calls daily, each one executed with mathematical precision and economic sanity.` },
        { label: '🔥 Dunk', text: () => `Gas fees so high elsewhere that smart contracts are getting dumber. Tezos: 22K calls daily, intelligence included.` },
        { label: '📊 Standard', text: () => `From DeFi to DAOs to NFTs: 22K daily contract calls covering every use case without breaking budgets.` },
        { label: '📢 Recruit', text: () => `Why build on a chain where only whales can afford to play? 22K daily contract calls welcome everyone.` },
        { label: '⚔️ Compare', text: () => `Smart contract calls on Tezos: 22K daily interactions where math meets reality meets affordability.` },
    ],
    'funded-accounts': [
        { label: '📊 Standard', text: (v) => `${v} funded accounts on Tezos.\n\nEvery single one is a real address with real value.` },
        { label: '📊 Standard', text: (v) => `Tezos network: ${v} funded accounts and growing.\n\nOrganic growth from real usage, not airdrop farmers.` },
        { label: '💪 Flex', text: (v) => `${v} funded accounts. No sybil-farmed airdrops inflating the numbers.\n\nTezos doesn't need fake metrics. The fundamentals speak.` },
        { label: '🔥 Dunk', text: (v) => `${v} Tezos accounts with real balances.\n\nNot "unique wallets" created for a points program that evaporate after the airdrop. Actual users.` },
        { label: '❓ Question', text: (v) => `${v} funded accounts on Tezos.\n\nHow many of your chain's "active wallets" are just bots farming airdrops?` },
        { label: '📢 Recruit', text: (v) => `${v} funded accounts on Tezos.\n\nJoining takes seconds. No gas wars. No failed transactions. Just a working blockchain.` },
        // New ecosystem tweets (static)
        { label: '📊 Standard', text: () => `3 million funded accounts on Tezos. That's 3 million people who chose financial sovereignty.` },
        { label: '💪 Flex', text: () => `3M wallets holding XTZ. Each one a vote of confidence in self-sovereign money.` },
        { label: '⚔️ Compare', text: () => `While other chains count TVL, Tezos counts people: 3 million funded accounts and growing.` },
        { label: '📊 Standard', text: () => `3 million accounts funded on Tezos. Adoption that's measured in humans, not hype.` },
        { label: '📢 Recruit', text: () => `Ready to join 3 million people who chose a blockchain that actually works? Your wallet is waiting.` },
        { label: '❓ Question', text: () => `How many funded accounts does it take to prove real adoption? 3 million seems like a good start.` },
        { label: '💪 Flex', text: () => `3 million funded accounts. No pre-mines, no insider allocations. Just people choosing Tezos.` },
        { label: '🔥 Dunk', text: () => `'Is Tezos dead?' ask 3 million funded accounts that apparently didn't get the memo.` },
        { label: '📊 Standard', text: () => `3M accounts holding XTZ because they discovered a blockchain that respects both their intelligence and wallet.` },
        { label: '💪 Flex', text: () => `Network effect in action: 3 million funded accounts choosing proven technology over promises.` },
        { label: '📊 Standard', text: () => `From institutions to individuals: 3 million funded accounts represent real global adoption.` },
        { label: '❓ Question', text: () => `Why do 3 million people keep XTZ in their wallets? Maybe they're onto something.` },
        { label: '📢 Recruit', text: () => `3 million funded accounts can't all be wrong about mathematical precision and low fees.` },
        { label: '⚔️ Compare', text: () => `Other chains measure success in dollars locked. Tezos measures it in people served: 3 million accounts.` },
        { label: '💪 Flex', text: () => `3 million funded accounts prove that when you build it right, they will come and they will stay.` },
        { label: '📊 Standard', text: () => `Blockchain adoption that's real: 3 million accounts funding their own financial future on Tezos.` },
        { label: '🔥 Dunk', text: () => `3M accounts holding XTZ. Turns out people like blockchains that are secure, efficient, AND affordable.` },
        { label: '📢 Recruit', text: () => `Want to be part of something bigger than hype? 3 million funded accounts suggest Tezos is that something.` },
        { label: '❓ Question', text: () => `3 million people looked at all the blockchain options and chose Tezos. What do they know that you don't?` },
        { label: '📊 Standard', text: () => `Sustainable growth looks like 3 million funded accounts choosing technology over marketing.` },
    ],
    'smart-contracts': [
        { label: '📊 Standard', text: (v) => `${v} smart contracts deployed on Tezos.\n\nFormally verified. Upgradeable through governance. Built to last.` },
        { label: '📊 Standard', text: (v) => `Tezos smart contract count: ${v}\n\nWritten in Michelson, SmartPy, or Ligo — all with formal verification support.` },
        { label: '💪 Flex', text: (v) => `${v} smart contracts deployed on a chain where formal verification is a first-class citizen.\n\nYour money deserves mathematically proven contracts.` },
        { label: '🔥 Dunk', text: (v) => `${v} Tezos contracts, many formally verified.\n\nSolidity devs: "We'll just audit it." Tezos devs: "We'll just prove it correct."` },
        { label: '❓ Question', text: (v) => `${v} smart contracts on Tezos with formal verification support.\n\nWhen billions are at stake, would you rather have an "audit" or a mathematical proof?` },
        { label: '📢 Recruit', text: (v) => `${v} contracts deployed on Tezos.\n\nSmartPy makes it shockingly easy to write formally verifiable contracts. Solidity devs: you'd feel right at home.` },
        // New ecosystem tweets (static)
        { label: '📊 Standard', text: () => `259,000 smart contracts deployed on Tezos. Each one mathematically verified and economically viable.` },
        { label: '💪 Flex', text: () => `259K smart contracts where developers sleep well knowing formal verification caught their bugs.` },
        { label: '⚔️ Compare', text: () => `Other chains: 'Move fast and break things.' Tezos: 259K contracts that actually work as intended.` },
        { label: '📊 Standard', text: () => `259,000 deployed contracts. Each one proof that you can have both mathematical rigor and practical utility.` },
        { label: '📢 Recruit', text: () => `Ready to deploy contracts that won't drain user funds? 259K Tezos developers figured out how.` },
        { label: '❓ Question', text: () => `What's the point of deploying contracts if they're too expensive to use? 259K contracts have an answer.` },
        { label: '💪 Flex', text: () => `259,000 smart contracts deployed with Michelson precision. Code that means what it says.` },
        { label: '🔥 Dunk', text: () => `Smart contracts so smart on Tezos, they check themselves before they wreck themselves. 259K and counting.` },
        { label: '📊 Standard', text: () => `259K contracts deployed where formal verification isn't optional - it's built into the development process.` },
        { label: '💪 Flex', text: () => `From simple transfers to complex DeFi: 259,000 contracts proving Tezos handles every use case.` },
        { label: '📊 Standard', text: () => `259K smart contracts where 'code is law' actually means something because the code is mathematically verified.` },
        { label: '📢 Recruit', text: () => `Why debug in production when you can verify before deployment? 259K contracts show the Tezos way.` },
        { label: '⚔️ Compare', text: () => `Smart contract bugs cost billions elsewhere. On Tezos: 259K contracts and counting, verified first.` },
        { label: '💪 Flex', text: () => `259,000 deployed contracts. Each one a testament to the power of formal verification in practice.` },
        { label: '❓ Question', text: () => `How many smart contracts can you deploy before one drains all user funds? On Tezos: at least 259K.` },
        { label: '📊 Standard', text: () => `259K contracts deployed by developers who understand that 'secure by default' isn't just marketing.` },
        { label: '🔥 Dunk', text: () => `Smart contracts so reliable on Tezos, even the AI doesn't want to audit them. 259K and growing.` },
        { label: '💪 Flex', text: () => `259,000 smart contracts where mathematical proof meets practical application meets affordable deployment.` },
        { label: '📢 Recruit', text: () => `Building the future one verified contract at a time: 259K deployed and ready for real-world use.` },
        { label: '📊 Standard', text: () => `259K smart contracts prove that when you start with solid foundations, innovation builds naturally.` },
    ],
    'tokens': [
        { label: '📊 Standard', text: (v) => `${v} tokens on Tezos.\n\nFA2 standard: multi-asset, composable, and way cleaner than ERC-20.` },
        { label: '📊 Standard', text: (v) => `Tezos token ecosystem: ${v} tokens and counting.\n\nEvery one running on sub-cent transaction fees.` },
        { label: '💪 Flex', text: (v) => `${v} tokens on Tezos using the FA2 standard.\n\nOne standard for fungible, NFTs, and multi-asset. ETH needed ERC-20, ERC-721, AND ERC-1155.` },
        { label: '🔥 Dunk', text: (v) => `${v} tokens on Tezos. The FA2 standard handles fungible, NFTs, and multi-asset in one clean interface.\n\nETH's token standard fragmentation is a feature, apparently.` },
        { label: '❓ Question', text: (v) => `${v} tokens on Tezos with sub-cent transfer fees.\n\nRemember when ETH gas was $50+ per swap? Those days may be over, but Tezos fees have been sub-cent since day one.` },
        // New ecosystem tweets (static)
        { label: '📊 Standard', text: () => `9.27 million tokens on Tezos. FA2 standard making tokenization simple, secure, and scalable.` },
        { label: '💪 Flex', text: () => `9.27M tokens proving that when you design standards right the first time, adoption follows.` },
        { label: '⚔️ Compare', text: () => `While other chains fragment with competing standards, Tezos unifies with FA2: 9.27M tokens and growing.` },
        { label: '📊 Standard', text: () => `From art to utility: 9.27 million tokens covering every conceivable use case on Tezos.` },
        { label: '📢 Recruit', text: () => `Ready to tokenize anything without breaking the bank? 9.27M tokens show the FA2 advantage.` },
        { label: '❓ Question', text: () => `What happens when token standards are designed by mathematicians instead of marketers? 9.27M tokens.` },
        { label: '💪 Flex', text: () => `9.27 million tokens where creators focus on value instead of gas optimization tricks.` },
        { label: '🔥 Dunk', text: () => `Token standards so good on Tezos, even the failed projects work flawlessly. 9.27M and counting.` },
        { label: '📊 Standard', text: () => `FA2 standard enabling 9.27M tokens with efficiency that makes other chains look wasteful.` },
        { label: '💪 Flex', text: () => `9.27M tokens proving tokenization can be accessible, affordable, and architecturally sound.` },
        { label: '📊 Standard', text: () => `From NFTs to DeFi tokens: 9.27M assets showing the power of unified token standards.` },
        { label: '📢 Recruit', text: () => `Why fight fragmented token standards when FA2 handles everything? 9.27M tokens agree.` },
        { label: '⚔️ Compare', text: () => `9.27 million tokens where innovation focuses on utility instead of working around platform limitations.` },
        { label: '💪 Flex', text: () => `Token economy in full bloom: 9.27M assets native to a blockchain that actually supports them.` },
        { label: '🔥 Dunk', text: () => `9.27M tokens managed by smart contracts that won't accidentally burn your entire collection.` },
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
        // New ecosystem tweets (static)
        { label: '📊 Standard', text: () => `14 active Smart Rollups on Tezos. Enshrined L2 scaling without the fragmentation circus.` },
        { label: '⚔️ Compare', text: () => `While Ethereum juggles competing L2s, Tezos delivers unified scaling: 14 Smart Rollups, one ecosystem.` },
        { label: '💪 Flex', text: () => `14 Smart Rollups proving that L2 scaling works best when it's built into the protocol, not bolted on.` },
        { label: '🔥 Dunk', text: () => `Smart Rollups: Tezos scaling that doesn't require a PhD in bridge economics to use safely.` },
        { label: '📊 Standard', text: () => `14 active Smart Rollups where developers can scale without fragmenting the user experience.` },
        { label: '📢 Recruit', text: () => `Ready to scale without sacrificing security or composability? 14 Smart Rollups show the way.` },
        { label: '❓ Question', text: () => `What if L2 scaling actually worked with L1 instead of around it? 14 Smart Rollups provide the answer.` },
        { label: '💪 Flex', text: () => `14 Smart Rollups delivering Web3 scaling without the Web2 complexity of external bridges.` },
        { label: '📊 Standard', text: () => `Enshrined rollups on Tezos: scaling that's secure by design, not secure by accident.` },
        { label: '🔥 Dunk', text: () => `L2 solutions so integrated on Tezos, users don't need to become bridge security experts. 14 rollups strong.` },
        { label: '💪 Flex', text: () => `14 Smart Rollups where scaling means more throughput, not more complexity for users.` },
        { label: '📊 Standard', text: () => `From gaming to DeFi: 14 Smart Rollups proving enshrined L2s serve every use case.` },
        { label: '📢 Recruit', text: () => `Why manage multiple L2 tokens when Smart Rollups scale with native XTZ? 14 active examples.` },
        { label: '⚔️ Compare', text: () => `Smart Rollups: Tezos scaling where the hardest part is choosing which application to build.` },
        { label: '💪 Flex', text: () => `14 Smart Rollups delivering infinite scale with finite complexity. This is how L2 should work.` },
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