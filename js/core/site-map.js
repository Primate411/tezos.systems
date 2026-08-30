const home = {
    id: 'home',
    title: 'Dashboard',
    href: '/',
    paths: ['/landing.html'],
    group: 'Home',
    detail: 'Live Tezos dashboard, command search, topic rooms, widgets, and My Tezos',
    keywords: ['tezos systems', 'dashboard', 'home', 'live stats', 'chambers'],
    sitemap: { changefreq: 'hourly', priority: '1.0' }
};

export const SITE_MAP = [
    home,
    {
        id: 'chambers',
        title: 'Explore Tezos',
        href: '/chambers/',
        hash: '#chambers',
        group: 'Tools',
        detail: 'Choose a question-led topic and browse every focused Tezos room',
        keywords: ['chambers', 'all chambers', 'rooms', 'feature rooms', 'explore tezos', 'topics'],
        sitemap: { changefreq: 'hourly', priority: '0.9' }
    },
    {
        id: 'my-tezos',
        title: 'My Tezos',
        href: '/my/',
        hash: '#my-tezos',
        hashAliases: ['#my-baker'],
        group: 'Tools',
        detail: 'Make a wallet or .tez name the center of a personal Tezos dashboard',
        keywords: ['wallet', 'account', 'portfolio', 'rewards', 'rewards tracker', 'baker', 'baker report card', 'operator health', 'personal brief', 'wallet connect', 'identity', 'my baker'],
        searchIntents: [
            { id: 'my-tezos-portfolio', title: 'My Tezos Portfolio', href: '/my/?view=portfolio', detail: 'Open the browser-local L1 portfolio and exact balance history', keywords: ['my portfolio', 'wallet balances', 'portfolio history'], journeyOnly: true },
            { id: 'my-tezos-transactions', title: 'My Tezos Transactions', href: '/my/?view=transactions', detail: 'Open account transfers, NFT interactions, and changes since the last visit', keywords: ['my transactions', 'wallet activity', 'what changed'], journeyOnly: true },
            { id: 'my-tezos-collection', title: 'My Tezos Collection', href: '/my/?view=collection', detail: 'Open collected and created Tezos art across saved accounts', keywords: ['my collection', 'my nfts', 'created art'], journeyOnly: true },
            { id: 'my-tezos-story', title: 'My Tezos Story', href: '/my/?view=story', detail: 'Open the account dossier and browser-local recent chapter', keywords: ['my story', 'account history', 'personal timeline'], journeyOnly: true },
            { id: 'my-tezos-tezos-x', title: 'My Tezos X', href: '/my/?view=tezos-x', detail: 'Open explicitly linked, device-local Etherlink accounts', keywords: ['my etherlink', 'linked l2', 'my tezos x'], journeyOnly: true }
        ],
        sitemap: { changefreq: 'hourly', priority: '0.9' },
        starter: 1,
        searchChip: { label: 'Wallet or .tez', order: 1 }
    },
    {
        id: 'anthology',
        title: 'Protocol Anthology',
        href: '/anthology/',
        hash: '#protocol-history',
        hashAliases: ['#protocol'],
        group: 'Story Rooms',
        chamberCategory: 'history',
        detail: 'Self-amendment lore, upgrade arc, debates, and the documented amendment record',
        keywords: ['protocol history', 'upgrades', 'self amendment', 'archive', 'lore', 'history'],
        sitemap: { changefreq: 'daily', priority: '0.9' }
    },
    {
        id: 'chamber',
        title: 'Tezos L1 Governance',
        href: '/chamber/',
        hash: '#chamber',
        hashAliases: ['#the-chamber'],
        group: 'Story Rooms',
        chamberCategory: 'governance',
        detail: 'Current vote room, quorum, baker ballots, and governance context',
        keywords: ['governance', 'vote', 'proposal', 'chamber', 'ballot', 'quorum'],
        sitemap: { changefreq: 'hourly', priority: '0.9' }
    },
    {
        id: 'pulse',
        title: 'Network Pulse',
        href: '/pulse/',
        hash: '#pulse',
        hashAliases: ['#network-pulse'],
        group: 'Live Rooms',
        chamberCategory: 'network',
        detail: 'Consensus, economy, market, governance, activity, and ecosystem cards in one live chamber',
        keywords: ['network pulse', 'live stats', 'daily briefing', 'cycle pulse', 'consensus', 'economy', 'activity', 'market', 'what is hot today', "what's hot today", 'hot today', 'network moments'],
        starter: 2,
        searchChip: { label: '/pulse', order: 2 },
        sitemap: { changefreq: 'hourly', priority: '0.9' }
    },
    {
        id: 'capital',
        title: 'Capital Chamber',
        href: '/capital/',
        hash: '#capital',
        group: 'Live Rooms',
        chamberCategory: 'capital',
        detail: 'Cross-layer Tezos and Etherlink activity, markets, ecosystem assets, real-world assets, and art-economy intelligence',
        keywords: ['capital chamber', 'tezos economy', 'capital markets', 'market structure', 'tezos and etherlink', 'l1 l2', 'stablecoins', 'tvl', 'ecosystem tokens', 'protocol tvl', 'real world assets', 'rwa', 'nft market', 'art economy', 'exchange flows', 'cex liquidity', 'network fees', 'transaction fees', 'transaction costs', 'gas fees'],
        searchIntents: [
            { id: 'capital-system', title: 'Tezos + Etherlink: One System', href: '/capital/?view=system', detail: 'Compare layer-native activity, daily average rates, L2 active accounts, current L1 accounts, TVL, and stablecoin signals', keywords: ['one system', 'tezos etherlink activity', 'cross layer activity', 'stablecoin supply', 'daily average tps', 'active accounts'], directory: true },
            { id: 'capital-fees', title: 'Network Fees by Layer', href: '/capital/?view=system&focus=fees', detail: 'Compare Tezos L1 block fee pools with Etherlink L2 transaction fees, average user costs, and gas price history', keywords: ['network fees', 'transaction fees', 'transaction costs', 'cost to transact', 'gas fees', 'gas price', 'l1 fees', 'l2 fees'], directory: true },
            { id: 'capital-markets', title: 'Capital Markets', href: '/capital/?view=markets', detail: 'Inspect XTZ returns, venue quality, liquidity, and the explicit exchange-flow coverage gate', keywords: ['capital markets', 'xtz returns', 'exchange markets', 'cex', 'liquidity', 'market depth', 'exchange net flows'], directory: true },
            { id: 'capital-assets', title: 'Ecosystem Assets + RWA', href: '/capital/?view=assets', detail: 'Inspect protocol TVL, ecosystem assets, and sourced real-world-asset proofbooks', keywords: ['ecosystem assets', 'tokens', 'protocol tvl', 'rwa', 'real world assets', 'xu3o8', 'spiko'], directory: true },
            { id: 'capital-art', title: 'Art Economy', href: '/capital/?view=art', detail: 'Inspect Tezos NFT market activity, participants, mints, collections, and creator economics', keywords: ['art economy', 'nft market', 'marketplace volume', 'mints', 'minters', 'collections', 'creator earnings', 'traders'], directory: true }
        ],
        fresh: true,
        sitemap: { changefreq: 'hourly', priority: '0.9' }
    },
    {
        id: 'minerals',
        title: 'Critical Minerals',
        href: '/minerals/',
        hash: '#minerals',
        hashAliases: ['#critical-minerals', '#strategic-minerals'],
        group: 'Live Rooms',
        chamberCategory: 'capital',
        detail: 'A 60-mineral strategic atlas with source-native supply and market evidence plus bounded xCo, xNi, and RARE Etherlink receipts',
        keywords: ['critical minerals', 'strategic minerals', 'mineral supply', 'mineral markets', 'mineral security', 'supply chains', 'import reliance', 'world production', 'reserves', 'rare earths', 'lithium', 'cobalt', 'nickel', 'copper', 'graphite', 'gallium', 'germanium', 'potash', 'phosphate rock', 'etherlink minerals', 'tokenized minerals', 'xco', 'xni', 'rare token', 'strategic metals basket', 'metals.io'],
        searchIntents: [
            { id: 'minerals-atlas', title: 'Critical Minerals Atlas', href: '/minerals/?view=atlas', detail: 'Explore the canonical 60-mineral U.S. critical-minerals taxonomy without turning group-level evidence into element-level facts', keywords: ['critical minerals atlas', 'critical minerals list', '60 critical minerals', 'strategic mineral taxonomy', 'rare earth elements'], directory: true },
            { id: 'minerals-supply', title: 'Critical Minerals Supply', href: '/minerals/?view=supply', detail: 'Inspect 2021–2025 U.S. and world supply observations while preserving USGS units, qualifiers, groupings, and reporting periods', keywords: ['critical minerals supply', 'world mineral production', 'us mineral production', 'mineral reserves', 'import reliance', 'mineral concentration'], directory: true },
            { id: 'minerals-markets', title: 'Critical Minerals Markets', href: '/minerals/?view=markets', detail: 'Compare only the exact public commodity series covered by the World Bank Pink Sheet, with product, unit, and monthly clocks visible', keywords: ['critical minerals markets', 'mineral prices', 'world bank pink sheet', 'copper price', 'nickel price', 'potash price', 'phosphate rock price'], directory: true },
            { id: 'minerals-etherlink', title: 'Critical Minerals on Etherlink', href: '/minerals/?view=etherlink', detail: 'Inspect bounded xCo, xNi, and RARE product and chain receipts while keeping issuer claims, basket composition, and indexed token state separate', keywords: ['critical minerals etherlink', 'etherlink minerals', 'tokenized minerals', 'xco', 'xni', 'rare token', 'strategic metals basket', 'metals.io', 'onchain mineral receipts'], directory: true },
            { id: 'minerals-proofbook', title: 'Critical Minerals Proofbook', href: '/minerals/?view=proofbook', detail: 'Read the source ledger, natural clocks, raw USGS qualifiers, explicit gaps, and non-inference boundaries behind the atlas', keywords: ['critical minerals proofbook', 'mineral data sources', 'usgs mcs 2026', 'mineral methodology', 'mineral evidence'], directory: true }
        ],
        fresh: true,
        sitemap: { changefreq: 'monthly', priority: '0.9' }
    },
    {
        id: 'uranium',
        title: 'Uranium',
        href: '/uranium/',
        hash: '#uranium',
        hashAliases: ['#xu3o8', '#u3o8', '#uranium-market'],
        group: 'Live Rooms',
        chamberCategory: 'capital',
        detail: 'xU3O8 markets and Etherlink token activity beside separately dated physical-uranium custody and reserve evidence',
        keywords: ['uranium', 'uranium market', 'uranium price', 'physical uranium', 'yellowcake', 'u3o8', 'xu3o8', 'xU3O8', 'tokenized uranium', 'real world asset', 'rwa', 'kraken', 'etherlink', 'archax', 'cameco', 'redstone', 'proof of reserves'],
        searchIntents: [
            { id: 'uranium-overview', title: 'Uranium Overview', href: '/uranium/?view=overview', detail: 'Connect the xU3O8 market to its separately dated physical-uranium claim, sources, and risks', keywords: ['uranium overview', 'xu3o8 overview', 'tokenized uranium overview'], directory: true },
            { id: 'uranium-markets', title: 'xU3O8 Markets', href: '/uranium/?view=markets', detail: 'Inspect Kraken USD and other attributed venue prices, spreads, depth, trades, and freshness', keywords: ['xu3o8 markets', 'kraken xu3o8', 'uranium token price', 'uranium order book', 'uranium liquidity'], directory: true },
            { id: 'uranium-onchain', title: 'xU3O8 On-chain', href: '/uranium/?view=onchain', detail: 'Inspect Etherlink supply, indexed holder addresses, transfers, and current token control state', keywords: ['xu3o8 onchain', 'xu3o8 contract', 'uranium holders', 'uranium transfers', 'etherlink uranium'], directory: true },
            { id: 'uranium-proofbook', title: 'Uranium Proofbook', href: '/uranium/?view=proofbook', detail: 'Read dated Cameco reserve evidence, custody and redemption terms, the indicative oracle, and derived ounces per token', keywords: ['uranium proofbook', 'uranium proof of reserves', 'cameco uranium', 'archax uranium', 'uranium custody', 'uranium redemption'], directory: true }
        ],
        fresh: true,
        sitemap: { changefreq: 'hourly', priority: '0.9' }
    },
    {
        id: 'metals',
        title: 'Precious Metals',
        href: '/metals/',
        hash: '#metals',
        hashAliases: ['#precious-metals', '#metals-market'],
        group: 'Live Rooms',
        chamberCategory: 'capital',
        detail: 'All eight canonical precious metals, source-separated market clocks, and a receipt-bounded VNXAU Tezos and Etherlink lane',
        keywords: ['precious metals', 'metals market', 'gold', 'silver', 'platinum', 'palladium', 'rhodium', 'ruthenium', 'iridium', 'osmium', 'pgm', 'platinum group metals', 'vnx gold', 'vnxau', 'tokenized gold', 'etherlink gold', 'tezos gold'],
        searchIntents: [
            { id: 'metals-assay', title: 'Precious Metals Assay', href: '/metals/?view=assay', detail: 'Compare the canonical eight-metal taxonomy and see which prices have comparable public observations', keywords: ['precious metals assay', 'eight precious metals', 'metal taxonomy'], directory: true },
            { id: 'metals-markets', title: 'Precious Metals Market Ledger', href: '/metals/?view=markets', detail: 'Inspect indicative current quotes and completed-month gold, silver, platinum, and palladium history on separate clocks', keywords: ['gold price', 'silver price', 'platinum price', 'palladium price', 'precious metals history'], directory: true },
            { id: 'metals-vnxau', title: 'VNXAU on Tezos and Etherlink', href: '/metals/?view=vnxau', detail: 'Inspect VNX Gold market, contract, supply, holder-address, transfer, and dated issuer-evidence receipts without a backing inference', keywords: ['vnxau', 'vnx gold', 'etherlink gold', 'tezos gold', 'tokenized gold'], directory: true },
            { id: 'metals-proofbook', title: 'Precious Metals Proofbook', href: '/metals/?view=proofbook', detail: 'Read source clocks, evidence boundaries, unavailable claims, and the Metals.io precious-metal listing status', keywords: ['metals proofbook', 'precious metals sources', 'vnxau evidence', 'metals methodology'], directory: true }
        ],
        fresh: true,
        sitemap: { changefreq: 'hourly', priority: '0.9' }
    },
    {
        id: 'ecosystem',
        title: 'Ecosystem Activity',
        href: '/ecosystem/',
        hash: '#ecosystem',
        group: 'Live Rooms',
        chamberCategory: 'ecosystem',
        detail: 'Network-wide weekly active addresses across Tezos L1 and Etherlink beside complete rankings and history for reviewed dapps',
        keywords: ['ecosystem activity', 'tezos dapps', 'etherlink dapps', 'top dapps', 'popular dapps', 'active users', 'active wallets', 'weekly active wallets', 'dapp rankings', 'dapp history', 'ecosystem stats', 'yoy'],
        searchIntents: [
            { id: 'ecosystem-l1', title: 'Tezos L1 Dapp Activity', href: '/ecosystem/?layer=tezos', detail: 'Compare all transaction-sending Tezos addresses with the reviewed-L1-dapp subset and ranking', keywords: ['tezos l1 apps', 'l1 dapps', 'tezos active wallets'], directory: true },
            { id: 'ecosystem-l2', title: 'Etherlink Dapp Activity', href: '/ecosystem/?layer=etherlink', detail: 'Compare all Etherlink active accounts with reviewed-dapp wallets, interactions, and tracked history', keywords: ['etherlink apps', 'etherlink active wallets', 'l2 dapps'], directory: true },
            { id: 'ecosystem-history', title: 'Dapp Activity History', href: '/ecosystem/?range=all', detail: 'Chart the complete disclosed weekly history with WoW, YoY, retention, and partial-week context', keywords: ['dapp history', 'historical active users', 'active wallet history', 'year over year dapps'], directory: true }
        ],
        fresh: true,
        sitemap: { changefreq: 'daily', priority: '0.9' }
    },
    {
        id: 'staking-chamber',
        title: 'Staking Chamber',
        href: '/stake/',
        hash: '#staking',
        hashAliases: ['#stake'],
        group: 'Live Rooms',
        chamberCategory: 'capital',
        detail: 'Large stake and unstake moves, current staking share, and the complete >10K history',
        keywords: ['staking chamber', 'stake', 'unstake', 'stakers', 'staking ratio', 'large stake', 'staking moves', '/stake'],
        starter: 3,
        searchChip: { label: '/stake', order: 3 },
        fresh: true,
        sitemap: { changefreq: 'hourly', priority: '0.8' }
    },
    {
        id: 'maxis',
        title: 'Tezos Maxis',
        href: '/maxis/',
        hash: '#maxis',
        hashAliases: ['#tezos-maxis'],
        group: 'Live Rooms',
        chamberCategory: 'people',
        detail: 'Canonical Tezos crowns, L1 and L2 governance records, protocol-season races, career Passports, and permanent Champions',
        keywords: ['maxis', 'maxi', 'on-chain crowns', 'all time', 'live', 'protocol season', 'maxi passport', 'passport', 'champions', 'leaderboard', 'art', 'collector', 'mint', 'defi', 'gaming', 'governance', 'l1 governance', 'l2 governance', 'tezos x governance', 'etherlink governance', 'staking', 'unicorn'],
        searchIntents: [
            { id: 'maxis-season', title: 'Tezos Maxis Season', href: '/maxis/?view=season', detail: 'Open the current protocol-season races, moving ranks, cut lines, and honors', keywords: ['maxis season', 'tezos maxis season', 'protocol season'], directory: true },
            { id: 'maxis-passport', title: 'Maxi Passport', href: '/maxis/?view=passport', detail: 'Open address-bound career stamps and current protocol-season progress', keywords: ['maxi passport', 'maxis passport', 'passport'], directory: true },
            { id: 'maxis-champions', title: 'Tezos Maxis Champions', href: '/maxis/?view=champions', detail: 'Open permanent finalized protocol-season winners and frozen receipts', keywords: ['maxis champions', 'maxi champions', 'champions'], directory: true },
            { id: 'maxis-unicorn', title: 'Unicorn Maxi', href: '/maxis/?lane=unicorn', seasonHref: '/maxis/?view=season&lane=unicorn', seasonTitle: 'Unicorn Maxi Season', seasonDetail: 'Open the protocol-season cross-lane Unicorn race', detail: 'Open the cross-lane Unicorn crown board', keywords: ['unicorn maxi', 'unicorn crown', 'unicorn season'] },
            { id: 'maxis-staking', title: 'Staking Maxi', href: '/maxis/?lane=staking', seasonHref: '/maxis/?view=season&lane=staking', seasonTitle: 'Staking Maxi Season', seasonDetail: 'Open the protocol-season Staking Maxi race', detail: 'Open the live Staking Maxi crown board', keywords: ['staking maxi', 'staking crown', 'staking season'] },
            { id: 'maxis-governance', title: 'L1 Governance Maxi', href: '/maxis/?lane=governance', seasonHref: '/maxis/?view=season&lane=governance', seasonTitle: 'L1 Governance Maxi Season', seasonDetail: 'Open the protocol-season L1 Governance Maxi race', detail: 'Open the all-time-active L1 Governance Maxi board', keywords: ['l1 governance maxi', 'governance maxi', 'l1 governance crown', 'governance crown', 'governance season'] },
            { id: 'maxis-l2-governance', title: 'L2 Governance Maxi', href: '/maxis/?lane=l2_governance', detail: 'Open the all-time-active Tezos X Governance Maxi board', keywords: ['l2 governance maxi', 'tezos x governance maxi', 'etherlink governance maxi', 'l2 governance crown'] },
            { id: 'maxis-collector', title: 'Collector Maxi', href: '/maxis/?lane=collector', seasonHref: '/maxis/?view=season&lane=collector', seasonTitle: 'Collector Maxi Season', seasonDetail: 'Open the protocol-season Collector Maxi race', detail: 'Open the Collector Maxi crown board', keywords: ['collector maxi', 'collector crown', 'collector season'] },
            { id: 'maxis-artist', title: 'Art Maxi', href: '/maxis/?lane=artist', seasonHref: '/maxis/?view=season&lane=artist', seasonTitle: 'Art Maxi Season', seasonDetail: 'Open the protocol-season Art Maxi race', detail: 'Open the Art Maxi crown board', keywords: ['art maxi', 'artist maxi', 'art crown', 'art season'] },
            { id: 'maxis-minter', title: 'Mint Maxi', href: '/maxis/?lane=minter', seasonHref: '/maxis/?view=season&lane=minter', seasonTitle: 'Mint Maxi Season', seasonDetail: 'Open the protocol-season Mint Maxi race', detail: 'Open the Mint Maxi crown board', keywords: ['mint maxi', 'minter maxi', 'mint crown', 'mint season'] },
            { id: 'maxis-defi', title: 'DeFi Maxi', href: '/maxis/?lane=defi', seasonHref: '/maxis/?view=season&lane=defi', seasonTitle: 'DeFi Maxi Season', seasonDetail: 'Open the protocol-season DeFi Maxi race', detail: 'Open the DeFi Maxi crown board', keywords: ['defi maxi', 'defi crown', 'defi season'] },
            { id: 'maxis-transaction', title: 'Transaction Maxi', href: '/maxis/?lane=transaction', seasonHref: '/maxis/?view=season&lane=transaction', seasonTitle: 'Transaction Maxi Season', seasonDetail: 'Open the protocol-season Transaction Maxi race', detail: 'Open the all-time Transaction Maxi crown board', keywords: ['transaction maxi', 'transactions maxi', 'transaction crown', 'transaction season'] },
            { id: 'maxis-gaming', title: 'Gaming Maxi', href: '/maxis/?lane=gaming', seasonHref: '/maxis/?view=season&lane=gaming', seasonTitle: 'Gaming Maxi Season', seasonDetail: 'Open the protocol-season Gaming Maxi race', detail: 'Open the Gaming Maxi crown board', keywords: ['gaming maxi', 'gaming crown', 'gaming season'] },
            { id: 'maxis-delegation', title: 'Delegation Maxi Season', href: '/maxis/?view=season&lane=delegation', detail: 'Open the protocol-season Delegation Maxi race', keywords: ['delegation maxi', 'delegation crown', 'delegation season'] },
            { id: 'maxis-liquidity', title: 'Liquidity Maxi Season', href: '/maxis/?view=season&lane=liquidity', detail: 'Open the protocol-season Liquidity Maxi race', keywords: ['liquidity maxi', 'liquidity crown', 'liquidity season'] },
            { id: 'maxis-bridge', title: 'Bridge Maxi Season', href: '/maxis/?view=season&lane=bridge', detail: 'Open the protocol-season Bridge Maxi race', keywords: ['bridge maxi', 'bridge crown', 'bridge season'] },
            { id: 'maxis-builder', title: 'Builder Maxi Season', href: '/maxis/?view=season&lane=builder', detail: 'Open the protocol-season Builder Maxi race', keywords: ['builder maxi', 'builder crown', 'builder season'] }
        ],
        starter: 4,
        searchChip: { label: '/maxis', order: 4 },
        fresh: true,
        sitemap: { changefreq: 'hourly', priority: '0.8' }
    },
    {
        id: 'tezoscrp',
        title: 'TezosCRP Recognition Hall',
        href: '/tezoscrp/',
        hash: '#tezoscrp',
        hashAliases: ['#community-rewards', '#crp'],
        group: 'Culture & Feeds',
        chamberCategory: 'people',
        detail: 'Official Tezos Commons monthly community awards, identity totals, categories, and source-receipted history since October 2020',
        keywords: ['tezoscrp', 'tezos crp', 'community rewards', 'tezos commons rewards', 'crp winners', 'community recognition', 'awards', 'winners'],
        searchIntents: [
            { id: 'tezoscrp-records', title: 'TezosCRP Records', href: '/tezoscrp/?view=records', detail: 'Compare all-time category record holders and selectable calendar-year standings', keywords: ['tezoscrp records', 'most awards by year', 'category record holders', 'crp leaderboard'] },
            { id: 'tezoscrp-latest', title: 'Latest TezosCRP Winners', href: '/tezoscrp/?view=latest', detail: 'Open the latest official Tezos Commons recognition round', keywords: ['latest tezoscrp winners', 'current community rewards', 'new crp winners'] },
            { id: 'tezoscrp-categories', title: 'TezosCRP Categories', href: '/tezoscrp/?view=categories', detail: 'Browse current official award categories and preserved historical names', keywords: ['tezoscrp categories', 'community reward badges', 'official category icons'] },
            { id: 'tezoscrp-archive', title: 'TezosCRP Monthly Archive', href: '/tezoscrp/?view=archive', detail: 'Search every official award receipt by month, category, or identity', keywords: ['tezoscrp archive', 'community rewards history', 'past crp winners'] }
        ],
        fresh: true,
        sitemap: { changefreq: 'weekly', priority: '0.8' }
    },
    {
        id: 'health',
        title: 'Network Health',
        href: '/health/',
        hash: '#health',
        hashAliases: ['#network-health'],
        group: 'Live Rooms',
        chamberCategory: 'network',
        detail: 'Blocks, Nakamoto coefficients, consensus timing, Octez versions, missed rights, and the Teztale lens',
        keywords: ['health', 'blocks', 'finality', 'attestation power', 'missed attestations', 'missed blocks', 'round zero', 'round 0', 'consensus', 'consensus lens', 'pre quorum', 'quorum timing', 'validation delay', 'application delay', 'reception histogram', 'octez', 'octez versions', 'version adoption', 'teztale', 'native explorer', 'operation receipt', 'block receipt', 'block fees', 'operation fees', 'missed rights', 'nakamoto', 'nakamoto coefficient', 'quorum control coefficient', 'decentralization', 'one third', 'two thirds'],
        starter: 5,
        searchChip: { label: '/health', order: 5 },
        sitemap: { changefreq: 'hourly', priority: '0.8' }
    },
    {
        id: 'liquidity-baking',
        title: 'Liquidity Baking',
        href: '/lb/',
        hash: '#lb',
        hashAliases: ['#liquidity-baking', '#lb-tile', '#liquidity-baking-tile'],
        group: 'Live Rooms',
        chamberCategory: 'governance',
        detail: 'LB votes, OFF-vote EMA, subsidy state, and liquidity lore',
        keywords: ['lb', 'liquidity', 'ema', 'subsidy', 'liquidity baking'],
        starter: 6,
        sitemap: { changefreq: 'hourly', priority: '0.8' }
    },
    {
        id: 'tezosx',
        title: 'Tezos X',
        href: '/tezosx/',
        paths: ['/tezlink/'],
        hash: '#tezosx',
        hashAliases: ['#tezlink'],
        group: 'Live Rooms',
        chamberCategory: 'network',
        detail: 'Etherlink TVL, transaction tape, gas oracle, and L2 activity',
        keywords: ['tezos x', 'etherlink', 'l2', 'tezlink', 'gas', 'gas price', 'gas fees', 'l2 fees'],
        sitemap: { changefreq: 'hourly', priority: '0.8' }
    },
    {
        id: 'l2-governance',
        title: 'Tezos X Governance',
        href: '/l2chamber/',
        hash: '#l2chamber',
        hashAliases: ['#etherlink-governance', '#etherlink-gov', '#etherlink'],
        group: 'Live Rooms',
        chamberCategory: 'governance',
        detail: 'Etherlink FAST, SLOW, sequencer, and governance contract tracks',
        keywords: ['etherlink governance', 'l2 governance', 'fast', 'slow', 'sequencer'],
        sitemap: { changefreq: 'hourly', priority: '0.8' }
    },
    {
        id: 'tz4',
        title: 'tz4 Adoption',
        href: '/tz4/',
        hash: '#tz4',
        hashAliases: ['#tz4-adoption'],
        group: 'Live Rooms',
        chamberCategory: 'bakers',
        detail: 'BLS consensus keys, pending switches, adoption power, and holdouts',
        keywords: ['tz4', 'bls', 'consensus keys', 'baker adoption'],
        sitemap: { changefreq: 'hourly', priority: '0.8' }
    },
    {
        id: 'ledger-flow',
        title: 'Ledger Flow',
        href: '/ledger-flow/',
        hash: '#ledger-flow',
        hashAliases: ['#flow'],
        group: 'Account Rooms',
        chamberCategory: 'people',
        detail: 'Bounded sent and received tez paths with all-time receipt context',
        keywords: ['ledger flow', 'transfers', 'account flow', 'graph', 'wallet history'],
        searchChip: { label: '/flow', order: 7 },
        sitemap: { changefreq: 'hourly', priority: '0.8' }
    },
    {
        id: 'domains',
        title: 'Tezos Domains',
        href: '/domains/',
        hash: '#domains',
        hashAliases: ['#tezos-domains'],
        group: 'Account Rooms',
        chamberCategory: 'people',
        detail: '.tez lookup, live registrations, auctions, offers, and expiry pressure',
        keywords: ['domains', '.tez', 'identity', 'names', 'domain lookup'],
        searchChip: { label: '/domains', order: 6 },
        fresh: true,
        sitemap: { changefreq: 'hourly', priority: '0.8' }
    },
    {
        id: 'ctez',
        title: 'ctez Oven Exit',
        href: '/ctez/',
        hash: '#ctez',
        hashAliases: ['#ctez-oven', '#ctez-guide'],
        group: 'Account Rooms',
        detail: 'Find and close legacy ctez ovens safely through wallet-reviewed steps',
        keywords: ['ctez', 'ctez oven exit', 'ctez oven guide', 'ctez end of life', 'oven', 'withdraw', 'legacy recovery'],
        sitemap: { changefreq: 'monthly', priority: '0.7' }
    },
    {
        id: 'price',
        title: 'XTZ Market Watch',
        href: '/#price',
        hash: '#price',
        group: 'Live Signals',
        detail: 'Live XTZ price, market context, predictions, and local alerts',
        keywords: ['price', 'xtz price', 'market cap', 'price intelligence', 'price alerts', 'market watch']
    },
    {
        id: 'whales',
        title: 'Whale Watch',
        href: '/whales/',
        hash: '#whales',
        hashAliases: ['#giants'],
        group: 'Live Rooms',
        chamberCategory: 'capital',
        detail: 'Large tez movement, grouped flow stories, dormant large accounts, and verified awakenings',
        keywords: ['whales', 'whale watch', 'large transfers', 'large tez movement', 'mini whale', 'transfer feed', 'source aliases', 'sleeping giants', 'dormant accounts', 'awakenings'],
        searchIntents: [
            { id: 'whales-live', title: 'Whale Watch Live Tape', href: '/whales/?view=live', detail: 'Inspect the latest large tez operations with amount, operation, and text filters', keywords: ['whale live tape', 'large transfer feed'], directory: true },
            { id: 'whales-flows', title: 'Whale Flow Stories', href: '/whales/?view=flows', detail: 'Collapse related operation-group hops into readable, receipt-backed flow stories', keywords: ['whale flows', 'operation groups', 'transfer stories'], directory: true },
            { id: 'whales-dormant', title: 'Deep Sleep', href: '/whales/?view=dormant', detail: 'Inspect large accounts that have remained inactive for at least one year', keywords: ['sleeping giants', 'dormant accounts', 'deep sleep'], directory: true },
            { id: 'whales-awakenings', title: 'Whale Awakenings', href: '/whales/?view=awakenings', detail: 'Inspect verified post-dormancy operations and their actual moved amounts', keywords: ['giant awakenings', 'dormant account moved'], directory: true }
        ],
        fresh: true,
        sitemap: { changefreq: 'hourly', priority: '0.8' }
    },
    {
        id: 'hot-today',
        title: "What's Hot Today",
        href: '/#hot-today',
        hash: '#hot-today',
        group: 'Live Signals',
        detail: 'The ranked live pulse of unusual Tezos movement, milestones, and Network Moments',
        keywords: ['what is hot today', "what's hot today", 'hot today', 'live pulse', 'daily briefing', 'network moments', 'network milestones', 'milestones']
    },
    {
        id: 'staking',
        title: 'Staking Guide',
        href: '/staking/',
        group: 'Guides',
        detail: 'Delegation, direct staking, reward timing, and APY context',
        keywords: ['staking', 'delegate', 'rewards', 'apy', 'how to stake'],
        sitemap: { changefreq: 'daily', priority: '0.9' }
    },
    {
        id: 'governance-guide',
        title: 'Governance Guide',
        href: '/governance/',
        group: 'Guides',
        detail: 'How Tezos self-amendment works, live voting, and governance RSS',
        keywords: ['governance', 'governance guide', 'voting', 'self-amending', 'how governance works'],
        sitemap: { changefreq: 'daily', priority: '0.9' }
    },
    {
        id: 'bakers-guide',
        title: 'Bakers Directory Guide',
        href: '/bakers/',
        group: 'Guides',
        detail: 'Browse active bakers and learn how to choose a delegation lane',
        keywords: ['bakers', 'validators', 'delegation', 'directory', 'choose baker'],
        sitemap: { changefreq: 'daily', priority: '0.9' }
    },
    {
        id: 'compare',
        title: 'Chain Compare Guide',
        href: '/compare/',
        group: 'Guides',
        detail: 'Tezos compared with Ethereum, Solana, Cardano, and Algorand',
        keywords: ['compare', 'ethereum', 'solana', 'cardano', 'algorand', 'tezos versus', 'tezos vs'],
        searchIntents: [
            { id: 'compare-ethereum', title: 'Tezos vs Ethereum', href: '/compare/tezos-vs-ethereum.html', detail: 'Open the sourced Tezos and Ethereum comparison', keywords: ['tezos vs ethereum', 'tezos versus ethereum', 'ethereum comparison'], sitemap: { changefreq: 'daily', priority: '0.9' } },
            { id: 'compare-solana', title: 'Tezos vs Solana', href: '/compare/tezos-vs-solana.html', detail: 'Open the sourced Tezos and Solana comparison', keywords: ['tezos vs solana', 'tezos versus solana', 'solana comparison'], sitemap: { changefreq: 'daily', priority: '0.9' } },
            { id: 'compare-cardano', title: 'Tezos vs Cardano', href: '/compare/tezos-vs-cardano.html', detail: 'Open the sourced Tezos and Cardano comparison', keywords: ['tezos vs cardano', 'tezos versus cardano', 'cardano comparison'], sitemap: { changefreq: 'daily', priority: '0.9' } },
            { id: 'compare-algorand', title: 'Tezos vs Algorand', href: '/compare/tezos-vs-algorand.html', detail: 'Open the sourced Tezos and Algorand comparison', keywords: ['tezos vs algorand', 'tezos versus algorand', 'algorand comparison'], sitemap: { changefreq: 'daily', priority: '0.9' } }
        ],
        sitemap: { changefreq: 'daily', priority: '0.8' }
    },
    {
        id: 'calculator',
        title: 'Rewards Calculator',
        href: '/#calculator',
        hash: '#calculator',
        group: 'Tools',
        detail: 'Estimate delegation, staking, baker income, and first payout timing',
        keywords: ['calculator', 'rewards calculator', 'staking rewards estimator', 'yield', 'apy', '/calculator']
    },
    {
        id: 'leaderboard',
        title: 'Baker Directory',
        href: '/leaderboard/',
        hash: '#leaderboard',
        hashAliases: ['#baker'],
        group: 'Tools',
        chamberCategory: 'bakers',
        detail: 'Discover active bakers through transparent on-chain capacity, tenure, governance, and tz4 signals',
        keywords: ['leaderboard', 'baker leaderboard', 'baker directory', 'baker', 'validator', 'capacity', 'delegation room', '/leaderboard'],
        searchIntents: [
            { id: 'leaderboard-discover', title: 'Discover a Baker', href: '/leaderboard/?view=discover', detail: 'Find candidates through transparent delegation-lane filters', keywords: ['find baker', 'choose baker', 'delegator match'], directory: true },
            { id: 'leaderboard-directory', title: 'All Active Bakers', href: '/leaderboard/?view=directory', detail: 'Search, filter, and sort the complete funded active-baker directory', keywords: ['all bakers', 'active baker list'], directory: true },
            { id: 'leaderboard-signals', title: 'Baker Signals', href: '/leaderboard/?view=signals', detail: 'Read the factual tenure, governance, capacity, and tz4 signal methodology', keywords: ['baker signals', 'governance streak', 'accepted proposal', 'tz4 baker'], directory: true }
        ],
        fresh: true,
        sitemap: { changefreq: 'hourly', priority: '0.8' }
    },
    {
        id: 'history',
        title: 'Cycle History',
        href: '/history/',
        hash: '#history',
        group: 'Tools',
        chamberCategory: 'history',
        detail: 'Rewind core Tezos metrics across cycles and open historical charts',
        keywords: ['history', 'historical data', 'charts', 'cycles', 'signal history', '/history'],
        searchIntents: [
            { id: 'history-day', title: 'Last 24 Hours', href: '/history/?range=24h', detail: 'Open the latest day of captured Tezos signal history', keywords: ['24 hour history', 'daily charts'], directory: true },
            { id: 'history-month', title: 'Last 30 Days', href: '/history/?range=30d', detail: 'Open the latest month of captured Tezos signal history', keywords: ['30 day history', 'monthly charts'], directory: true },
            { id: 'history-all', title: 'All Captured History', href: '/history/?range=all', detail: 'Open the complete captured multi-domain signal archive', keywords: ['all time history', 'complete charts'], directory: true }
        ],
        sitemap: { changefreq: 'hourly', priority: '0.8' }
    },
    {
        id: 'snapshot',
        title: 'Network Snapshot',
        href: '/#snapshot',
        hash: '#snapshot',
        group: 'Tools',
        detail: 'Generate a shareable State of Tezos weekly network snapshot',
        keywords: ['network snapshot', 'state of tezos', 'weekly snapshot', 'share card']
    },
    {
        id: 'live-compare',
        title: 'Live Chain Comparison',
        href: '/#compare',
        hash: '#compare',
        group: 'Tools',
        detail: 'Compare live Tezos valuation, staking, activity, and cost metrics',
        keywords: ['live compare', 'comparison', 'compare chains', '/compare']
    },
    {
        id: 'widgets',
        title: 'Embed Widgets',
        href: '/widgets/builder.html',
        group: 'Tools',
        detail: 'Build embeddable Tezos Systems stats for another site',
        keywords: ['widgets', 'tezos widgets', 'widget builder', 'embed', 'block height widget', 'price widget', 'staking widget', 'baker widget', 'protocol widget', 'governance widget', 'combo widget'],
        searchIntents: [
            { id: 'widget-baker-count', title: 'Baker Count Widget', href: '/widgets/baker-count.html', detail: 'Open the live active-baker embed', keywords: ['baker count widget', 'active bakers embed'], sitemap: { changefreq: 'daily', priority: '0.5' } },
            { id: 'widget-price', title: 'XTZ Price Widget', href: '/widgets/price.html', detail: 'Open the live XTZ price and 24-hour change embed', keywords: ['price widget', 'xtz price embed'], sitemap: { changefreq: 'hourly', priority: '0.5' } },
            { id: 'widget-block-height', title: 'Block Height Widget', href: '/widgets/block-height.html', detail: 'Open the live Tezos head-block embed', keywords: ['block height widget', 'block ticker embed'], sitemap: { changefreq: 'hourly', priority: '0.5' } },
            { id: 'widget-staking-ratio', title: 'Staking Ratio Widget', href: '/widgets/staking-ratio.html', detail: 'Open the live Tezos staking-ratio embed', keywords: ['staking ratio widget', 'staking gauge embed'], sitemap: { changefreq: 'daily', priority: '0.5' } },
            { id: 'widget-protocol', title: 'Protocol Widget', href: '/widgets/protocol.html', detail: 'Open the current Tezos protocol embed', keywords: ['protocol widget', 'current protocol embed'], sitemap: { changefreq: 'daily', priority: '0.5' } },
            { id: 'widget-governance', title: 'Governance Widget', href: '/widgets/governance.html', detail: 'Open the current Tezos voting-period embed', keywords: ['governance widget', 'voting period embed'], sitemap: { changefreq: 'daily', priority: '0.5' } },
            { id: 'widget-baker-card', title: 'Baker Card Widget', href: '/widgets/baker-card.html', detail: 'Open the address-configurable baker report embed', keywords: ['baker card widget', 'baker report embed'], sitemap: { changefreq: 'daily', priority: '0.5' } },
            { id: 'widget-combo', title: 'Combo Strip Widget', href: '/widgets/combo.html', detail: 'Open the configurable multi-stat Tezos embed', keywords: ['combo widget', 'multi stat embed', 'stats strip'], sitemap: { changefreq: 'daily', priority: '0.5' } }
        ],
        sitemap: { changefreq: 'monthly', priority: '0.6' }
    },
    {
        id: 'hen',
        title: 'HEN Live Feed',
        href: '/hen/',
        paths: ['/hen/', '/hen/index.html'],
        hashAliases: ['#nfts'],
        group: 'Culture & Feeds',
        detail: 'Teia and OBJKT collecting surface with live NFT context',
        keywords: ['hen', 'hen teia collecting', 'hen / teia collecting', 'teia', 'objkt', 'nft', 'art', 'collecting', 'live mints', '/nfts'],
        sitemap: { changefreq: 'daily', priority: '0.7' }
    },
    {
        id: 'feed',
        title: 'Governance RSS',
        href: '/feed.xml',
        group: 'Culture & Feeds',
        detail: 'Generated governance RSS for proposals, periods, and outcomes',
        keywords: ['rss', 'feed', 'governance alerts'],
        sitemap: { changefreq: 'hourly', priority: '0.5' }
    }
];

export const CHAMBER_CATEGORY_META = Object.freeze([
    Object.freeze({
        key: 'ecosystem',
        label: 'Ecosystem',
        question: 'How many addresses are active, and which apps are they using?',
        entryIds: Object.freeze(['ecosystem'])
    }),
    Object.freeze({
        key: 'network',
        label: 'Network',
        question: 'What is the chain doing now?',
        entryIds: Object.freeze(['pulse', 'health', 'tezosx'])
    }),
    Object.freeze({
        key: 'capital',
        label: 'Capital',
        question: 'Where is value sitting and moving?',
        entryIds: Object.freeze(['capital', 'minerals', 'uranium', 'metals', 'whales', 'staking-chamber'])
    }),
    Object.freeze({
        key: 'bakers',
        label: 'Bakers',
        question: 'Who is securing Tezos and upgrading its keys?',
        entryIds: Object.freeze(['leaderboard', 'tz4'])
    }),
    Object.freeze({
        key: 'governance',
        label: 'Governance',
        question: 'What is Tezos deciding?',
        entryIds: Object.freeze(['chamber', 'l2-governance', 'liquidity-baking'])
    }),
    Object.freeze({
        key: 'people',
        label: 'People & Accounts',
        question: 'Who is here, and what have they done?',
        entryIds: Object.freeze(['ledger-flow', 'domains', 'maxis', 'tezoscrp'])
    }),
    Object.freeze({
        key: 'history',
        label: 'History',
        question: 'What happened before now?',
        entryIds: Object.freeze(['anthology', 'history'])
    })
]);

export const SITE_MAP_NAV_GROUPS = [
    'Home',
    'Story Rooms',
    'Live Rooms',
    'Account Rooms',
    'Live Signals',
    'Guides',
    'Tools',
    'Culture & Feeds'
];

export const SITE_MAP_RELATIONS = {
    home: ['chambers', 'pulse', 'ecosystem', 'my-tezos'],
    chambers: ['pulse', 'ecosystem', 'staking-chamber', 'leaderboard'],
    'my-tezos': ['domains', 'ledger-flow', 'maxis', 'calculator'],
    anthology: ['chamber', 'governance-guide', 'health', 'pulse'],
    chamber: ['anthology', 'liquidity-baking', 'l2-governance', 'governance-guide'],
    pulse: ['ecosystem', 'capital', 'health', 'hot-today'],
    capital: ['minerals', 'uranium', 'metals', 'ledger-flow'],
    minerals: ['uranium', 'metals', 'capital', 'tezosx'],
    uranium: ['minerals', 'metals', 'tezosx', 'price'],
    metals: ['minerals', 'uranium', 'tezosx', 'price'],
    ecosystem: ['capital', 'tezosx', 'history', 'maxis'],
    'staking-chamber': ['leaderboard', 'ledger-flow', 'staking', 'calculator'],
    maxis: ['tezoscrp', 'ledger-flow', 'domains', 'hen'],
    tezoscrp: ['maxis', 'anthology', 'hen', 'feed'],
    health: ['pulse', 'tz4', 'leaderboard', 'staking-chamber'],
    'liquidity-baking': ['chamber', 'pulse', 'staking', 'health'],
    tezosx: ['minerals', 'uranium', 'l2-governance', 'pulse'],
    'l2-governance': ['tezosx', 'chamber', 'anthology', 'pulse'],
    tz4: ['health', 'bakers-guide', 'pulse', 'staking-chamber'],
    'ledger-flow': ['my-tezos', 'whales', 'domains', 'ctez'],
    domains: ['my-tezos', 'ledger-flow', 'maxis', 'hen'],
    ctez: ['my-tezos', 'ledger-flow', 'staking', 'pulse'],
    price: ['metals', 'uranium', 'live-compare', 'snapshot'],
    whales: ['uranium', 'ledger-flow', 'capital', 'history'],
    'hot-today': ['pulse', 'health', 'staking-chamber', 'maxis'],
    staking: ['staking-chamber', 'calculator', 'bakers-guide', 'ledger-flow'],
    'governance-guide': ['chamber', 'anthology', 'feed', 'my-tezos'],
    'bakers-guide': ['leaderboard', 'health', 'tz4', 'staking'],
    compare: ['pulse', 'health', 'anthology', 'staking-chamber'],
    calculator: ['staking', 'staking-chamber', 'bakers-guide', 'leaderboard'],
    leaderboard: ['my-tezos', 'staking-chamber', 'health', 'tz4'],
    history: ['pulse', 'anthology', 'health', 'price'],
    snapshot: ['pulse', 'history', 'widgets', 'price'],
    'live-compare': ['compare', 'pulse', 'health', 'price'],
    widgets: ['pulse', 'snapshot', 'price', 'home'],
    hen: ['maxis', 'my-tezos', 'domains', 'ledger-flow'],
    feed: ['chamber', 'governance-guide', 'anthology', 'my-tezos']
};

export function findSiteMapEntry(id) {
    return SITE_MAP.find((entry) => entry.id === id) || null;
}

/**
 * Resolve either a top-level destination or one of its canonical child views.
 * Child destinations inherit their parent's group so every journey consumer
 * can render them without maintaining another navigation catalogue.
 */
export function findSiteMapDestination(id) {
    const entry = findSiteMapEntry(id);
    if (entry) return entry;

    for (const parent of SITE_MAP) {
        const intent = (parent.searchIntents || []).find((candidate) => candidate.id === id);
        if (!intent) continue;
        return {
            ...intent,
            group: intent.group || parent.group,
            parentId: parent.id,
            parentTitle: parent.title
        };
    }
    return null;
}

export function siteMapRoute(entry) {
    return entry?.href || '/';
}

export function siteMapCanonicalRoute(value) {
    if (value && typeof value === 'object') return siteMapRoute(value);
    const route = String(value || '').trim();
    if (!route) return '/';
    if (!route.startsWith('#')) return route;
    if (route.includes('=')) return `/${route}`;
    const hashKey = `#${route.replace(/^#/, '').split('=')[0]}`;
    const entry = SITE_MAP.find((candidate) => (
        candidate.hash === hashKey || (candidate.hashAliases || []).includes(hashKey)
    ));
    return entry ? siteMapRoute(entry) : `/${route}`;
}

function isUnmodifiedDashboardShell() {
    if (typeof document === 'undefined') return false;
    return Boolean(document.getElementById('hero-slot'))
        && !document.documentElement?.hasAttribute('data-chamber-route');
}

/**
 * Navigate to a canonical site-map destination.
 *
 * The root dashboard can move between Chamber routes without reloading while
 * keeping human-facing pretty paths such as /chamber/ and /pulse/. Generated
 * standalone Chamber shells deliberately keep normal page navigation because
 * their route-specific intro and metadata belong to the document that loaded.
 */
export function navigateSiteMapEntry(entryOrId, { replace = false } = {}) {
    const entry = typeof entryOrId === 'string' ? findSiteMapEntry(entryOrId) : entryOrId;
    if (!entry) return false;

    const route = siteMapRoute(entry);
    if (!route || typeof window === 'undefined') return false;

    let destination;
    try {
        destination = new URL(route, window.location.origin);
    } catch {
        return false;
    }

    const sameOrigin = destination.origin === window.location.origin;
    const nextRoute = `${destination.pathname}${destination.search}${destination.hash}`;
    const currentRoute = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (sameOrigin && nextRoute === currentRoute) {
        window.dispatchEvent(new CustomEvent('tezos:routechange', {
            detail: { entryId: entry.id, route: nextRoute, replace, current: true }
        }));
        return true;
    }

    const canRouteInPlace = sameOrigin && Boolean(entry.hash) && isUnmodifiedDashboardShell();
    if (!canRouteInPlace) {
        window.location.assign(destination.href);
        return true;
    }

    const method = replace ? 'replaceState' : 'pushState';
    window.history[method]({ ...(window.history.state || {}), tezosSystemsRoute: entry.id }, '', nextRoute);

    window.dispatchEvent(new CustomEvent('tezos:routechange', {
        detail: { entryId: entry.id, route: nextRoute, replace, current: false }
    }));
    return true;
}

export function siteMapSearchText(entry) {
    return [
        entry.id,
        entry.title,
        entry.detail,
        entry.group,
        entry.href,
        entry.hash,
        ...(entry.hashAliases || []),
        ...(entry.paths || []),
        ...(entry.keywords || [])
    ].filter(Boolean).join(' ').toLowerCase();
}

function normalizedSearchValue(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/^\//, '')
        .replace(/[?#].*$/, '')
        .replace(/[’']/g, '')
        .replace(/[^a-z0-9.%+\s/_-]+/g, ' ')
        .replace(/[-_/]+/g, ' ')
        .replace(/\s+/g, ' ');
}

const SEARCH_STOP_WORDS = new Set([
    'a', 'an', 'and', 'can', 'do', 'find', 'for', 'how', 'i', 'in', 'is',
    'me', 'of', 'on', 'show', 'the', 'to', 'what', 'where'
]);

function searchTokens(value, { keepStopWords = false } = {}) {
    const tokens = normalizedSearchValue(value).split(' ').filter(Boolean);
    if (keepStopWords) return tokens;
    const meaningful = tokens.filter((token) => !SEARCH_STOP_WORDS.has(token));
    return meaningful.length ? meaningful : tokens;
}

function searchTokenMatches(queryToken, candidateToken) {
    if (queryToken === candidateToken) return true;
    if (queryToken.length >= 3 && (
        `${queryToken}s` === candidateToken
        || `${candidateToken}s` === queryToken
    )) return true;
    if (queryToken.length < 4 || candidateToken.length < 4) return false;
    return candidateToken.startsWith(queryToken) || queryToken.startsWith(candidateToken);
}

function coversSearchTokens(queryTokens, candidateTokens) {
    return queryTokens.length > 0 && queryTokens.every((queryToken) => (
        candidateTokens.some((candidateToken) => searchTokenMatches(queryToken, candidateToken))
    ));
}

const searchIndexCache = new WeakMap();
let lastQueryShape = null;

/**
 * Build the query-independent search model for a canonical or catalog entry.
 * Stable entry object identities make this a one-time cost per loaded row.
 */
export function siteMapSearchIndex(entry) {
    const cached = searchIndexCache.get(entry);
    if (cached) return cached;

    const keywords = [...(entry.keywords || []), ...(entry.aliases || [])]
        .map((keyword) => String(keyword).toLowerCase());
    const titleTokens = searchTokens(entry.title, { keepStopWords: true });
    const idTokens = searchTokens(entry.id, { keepStopWords: true });
    const keywordTokens = keywords.flatMap((keyword) => searchTokens(keyword, { keepStopWords: true }));
    const index = {
        href: String(entry.href || '').toLowerCase(),
        hash: String(entry.hash || '').toLowerCase().replace(/^#/, ''),
        rawHref: String(entry.href || '').toLowerCase(),
        rawHash: String(entry.hash || '').toLowerCase(),
        title: normalizedSearchValue(entry.title),
        id: normalizedSearchValue(entry.id),
        normalizedKeywords: keywords.map(normalizedSearchValue),
        titleTokens,
        idTokens,
        keywordTokens,
        titleIdKeywordTokens: [...titleTokens, ...idTokens, ...keywordTokens],
        allTokens: [
            ...titleTokens,
            ...idTokens,
            ...keywordTokens,
            ...searchTokens(entry.detail, { keepStopWords: true }),
            ...searchTokens(entry.group, { keepStopWords: true }),
            ...searchTokens(entry.href, { keepStopWords: true }),
            ...searchTokens(entry.hash, { keepStopWords: true }),
            ...(entry.paths || []).flatMap((path) => searchTokens(path, { keepStopWords: true }))
        ]
    };
    searchIndexCache.set(entry, index);
    return index;
}

/** Shape one query once for every source scored during the same render. */
export function siteMapQueryShape(query) {
    const q = String(query || '').trim().toLowerCase();
    if (lastQueryShape?.q === q) return lastQueryShape;

    const bare = q.replace(/^\//, '');
    const normalized = normalizedSearchValue(q);
    lastQueryShape = { q, bare, normalized, tokens: searchTokens(q) };
    return lastQueryShape;
}

/** Compare already-shaped entry and query models without changing ranking. */
export function siteMapScoreIndexed(index, shape) {
    const { q, bare, normalized, tokens } = shape;
    if (q === index.rawHref || q === index.rawHash) return 120;
    if (q.startsWith('/') && index.hash === bare) return 118;
    if (!normalized) return 0;
    if (normalized === index.title || normalized === index.id || normalized === index.hash) return 115;
    if (index.title.includes(normalized) && index.normalizedKeywords.includes(normalized)) return 113;
    if (normalized.length >= 4 && (index.title.startsWith(normalized) || index.id.startsWith(normalized))) return 112;
    if (index.normalizedKeywords.includes(normalized)) return 110;
    if (index.href === `/${bare}` || index.href === `/${bare}/` || index.href === `/#${bare}`) return 105;
    if (coversSearchTokens(tokens, index.titleTokens)) return 96;
    if (coversSearchTokens(tokens, index.keywordTokens)) return 92;
    if (coversSearchTokens(tokens, index.titleIdKeywordTokens)) return 88;
    if (coversSearchTokens(tokens, index.allTokens)) return 78;
    if (normalized.length >= 4 && index.normalizedKeywords.some((keyword) => keyword.startsWith(normalized))) return 76;
    if (normalized.length >= 4 && (index.title.includes(normalized) || index.id.includes(normalized))) return 74;
    return 0;
}

export function siteMapSearchScore(entry, query) {
    return siteMapScoreIndexed(siteMapSearchIndex(entry), siteMapQueryShape(query));
}

function mergeSearchRanges(ranges) {
    if (ranges.length < 2) return ranges;
    const sorted = ranges.slice().sort((left, right) => left[0] - right[0] || left[1] - right[1]);
    const merged = [sorted[0].slice()];
    for (const [start, end] of sorted.slice(1)) {
        const previous = merged[merged.length - 1];
        if (start <= previous[1]) previous[1] = Math.max(previous[1], end);
        else merged.push([start, end]);
    }
    return merged;
}

/** Character ranges used only to explain a match visually; ranking is separate. */
export function searchMatchRanges(text, query) {
    const source = String(text || '');
    if (!source) return [];
    const tokens = searchTokens(query).filter((token) => token.length >= 2);
    if (!tokens.length) return [];
    const haystack = source.toLowerCase();
    const ranges = [];
    for (const token of tokens) {
        let from = 0;
        for (;;) {
            const at = haystack.indexOf(token, from);
            if (at < 0) break;
            ranges.push([at, at + token.length]);
            from = at + token.length;
        }
    }
    return mergeSearchRanges(ranges);
}

export function searchSiteMap(query) {
    const raw = String(query || '').trim();
    if (!raw) return siteMapStarters();
    return SITE_MAP
        .map((entry, index) => ({ entry, index, score: siteMapSearchScore(entry, raw) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map((item) => item.entry);
}

export function searchSiteMapIntents(query) {
    const raw = String(query || '').trim();
    if (!raw) return [];
    const wantsSeason = /\bseason\b/i.test(raw);
    const queryTokens = searchTokens(raw);
    return SITE_MAP
        .flatMap((entry, parentIndex) => (entry.searchIntents || [])
            .filter((intent) => !intent.journeyOnly)
            .map((intent, intentIndex) => {
            const seasonVariant = wantsSeason && intent.seasonHref;
            return {
                ...intent,
                title: seasonVariant ? (intent.seasonTitle || intent.title) : intent.title,
                detail: seasonVariant ? (intent.seasonDetail || intent.detail) : intent.detail,
                group: intent.group || entry.group,
                parentId: entry.id,
                parentTitle: entry.title,
                href: seasonVariant ? intent.seasonHref : intent.href,
                parentIndex,
                intentIndex
            };
        }))
        .map((intent) => {
            const discriminantTokens = searchTokens(String(intent.id || '').replace(/^[^-]+-/, ''), { keepStopWords: true });
            const intentTokens = [intent.id, intent.title, intent.detail, intent.group, ...(intent.keywords || [])]
                .flatMap((value) => searchTokens(value, { keepStopWords: true }))
                .filter(Boolean);
            const hasSpecificIntent = queryTokens.some((queryToken) => (
                queryToken.length >= 3
                && discriminantTokens.some((token) => searchTokenMatches(queryToken, token))
            ));
            const coversEveryToken = coversSearchTokens(queryTokens, intentTokens);
            const exactKeywordMatch = (intent.keywords || [])
                .some((keyword) => normalizedSearchValue(keyword) === normalizedSearchValue(raw));
            const score = Math.max(siteMapSearchScore(intent, raw), coversEveryToken ? 108 : 0);
            return { intent, score, hasSpecificIntent, coversEveryToken, exactKeywordMatch };
        })
        .filter(({ score, hasSpecificIntent, coversEveryToken, exactKeywordMatch }) => (
            score >= 75 && (hasSpecificIntent || coversEveryToken || exactKeywordMatch)
        ))
        .sort((a, b) => b.score - a.score || a.intent.parentIndex - b.intent.parentIndex || a.intent.intentIndex - b.intent.intentIndex)
        .map(({ intent, score }) => ({ ...intent, searchScore: score }));
}

function boundedEditDistance(left, right, maximum = 2) {
    const a = String(left || '');
    const b = String(right || '');
    if (Math.abs(a.length - b.length) > maximum) return maximum + 1;
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let row = 1; row <= a.length; row += 1) {
        const current = [row];
        let rowMinimum = current[0];
        for (let column = 1; column <= b.length; column += 1) {
            const value = Math.min(
                current[column - 1] + 1,
                previous[column] + 1,
                previous[column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1)
            );
            current[column] = value;
            rowMinimum = Math.min(rowMinimum, value);
        }
        if (rowMinimum > maximum) return maximum + 1;
        previous = current;
    }
    return previous[b.length];
}

function siteMapSuggestionTokens() {
    return [...new Set(SITE_MAP.flatMap((entry) => [
        entry.id,
        entry.title,
        ...(entry.keywords || []),
        ...(entry.searchIntents || []).flatMap((intent) => [
            intent.id,
            intent.title,
            ...(intent.keywords || [])
        ])
    ]).flatMap((value) => searchTokens(value, { keepStopWords: true }))
        .filter((token) => token.length >= 5))];
}

export function suggestSiteMapQuery(query) {
    const raw = String(query || '').trim();
    if (!raw || raw.startsWith('/') || searchSiteMap(raw).length || searchSiteMapIntents(raw).length) return null;
    const tokens = searchTokens(raw, { keepStopWords: true });
    const candidates = siteMapSuggestionTokens();
    let changed = false;
    const correctedTokens = tokens.map((token) => {
        if (token.length < 5 || candidates.includes(token)) return token;
        const match = candidates
            .map((candidate) => ({
                candidate,
                distance: boundedEditDistance(token, candidate, 2)
            }))
            .filter(({ distance }) => distance <= 2)
            .sort((left, right) => left.distance - right.distance
                || Math.abs(left.candidate.length - token.length) - Math.abs(right.candidate.length - token.length)
                || left.candidate.localeCompare(right.candidate))[0];
        if (!match) return token;
        changed = true;
        return match.candidate;
    });
    if (!changed) return null;
    const corrected = correctedTokens.join(' ');
    if (!searchSiteMap(corrected).length && !searchSiteMapIntents(corrected).length) return null;
    return { original: raw, corrected };
}

export function siteMapGroup(label) {
    return SITE_MAP.filter((entry) => entry.group === label);
}

export function siteMapStarters() {
    return SITE_MAP
        .filter((entry) => Number.isFinite(entry.starter))
        .sort((a, b) => a.starter - b.starter);
}

export function siteMapBrowseEntries() {
    return SITE_MAP
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => SITE_MAP_NAV_GROUPS.includes(entry.group))
        .sort((a, b) => (
            SITE_MAP_NAV_GROUPS.indexOf(a.entry.group) - SITE_MAP_NAV_GROUPS.indexOf(b.entry.group)
            || a.index - b.index
        ))
        .map(({ entry }) => entry);
}

export function siteMapDirectoryChildren(entryOrId) {
    const entry = typeof entryOrId === 'string' ? findSiteMapEntry(entryOrId) : entryOrId;
    if (!entry) return [];
    return (entry.searchIntents || [])
        .filter((intent) => intent.directory || intent.sitemap)
        .map((intent) => ({
            ...intent,
            group: intent.group || entry.group,
            parentId: entry.id,
            parentTitle: entry.title
        }));
}

export function siteMapBrowseIntents() {
    return siteMapBrowseEntries().flatMap((entry) => siteMapDirectoryChildren(entry));
}

export function siteMapSitemapEntries() {
    const seen = new Set();
    return SITE_MAP
        .flatMap((entry) => [
            ...(entry.sitemap ? [{
                id: entry.id,
                title: entry.title,
                href: entry.sitemap.href || entry.href,
                changefreq: entry.sitemap.changefreq,
                priority: entry.sitemap.priority
            }] : []),
            ...(entry.searchIntents || [])
                .filter((intent) => intent.sitemap)
                .map((intent) => ({
                    id: intent.id,
                    title: intent.title,
                    href: intent.sitemap.href || intent.href,
                    changefreq: intent.sitemap.changefreq,
                    priority: intent.sitemap.priority,
                    parentId: entry.id
                }))
        ])
        .filter((entry) => {
            if (!entry.href || seen.has(entry.href)) return false;
            seen.add(entry.href);
            return true;
        });
}

export function siteMapSearchChips() {
    return SITE_MAP
        .filter((entry) => entry.searchChip)
        .sort((a, b) => a.searchChip.order - b.searchChip.order)
        .map((entry) => ({
            id: entry.id,
            label: entry.searchChip.label,
            route: siteMapRoute(entry)
        }));
}

export function siteMapRelated(id, limit = 4) {
    const entry = findSiteMapEntry(id) || home;
    const explicit = (SITE_MAP_RELATIONS[entry.id] || [])
        .map(findSiteMapEntry)
        .filter(Boolean);
    const fallback = SITE_MAP.filter((candidate) => (
        candidate.id !== entry.id
        && candidate.group === entry.group
        && !explicit.some((item) => item.id === candidate.id)
    ));
    return [...explicit, ...fallback].slice(0, Math.max(0, limit));
}

function normalizedLocationPath(locationLike) {
    return String(locationLike?.pathname || '/').replace(/\/index\.html$/, '/');
}

function intentRouteMatch(intent, pathname, searchParams) {
    const routes = [{ id: intent.id, href: intent.href }];

    return routes
        .map((route) => {
            const url = new URL(route.href, 'https://tezos.systems');
            if (url.pathname !== pathname) return null;
            const expected = Array.from(url.searchParams.entries());
            if (!expected.every(([key, value]) => searchParams.get(key) === value)) return null;
            return {
                ...route,
                specificity: expected.length
            };
        })
        .filter(Boolean)
        .sort((a, b) => b.specificity - a.specificity)[0] || null;
}

/**
 * Resolve the exact canonical destination represented by a URL.
 *
 * Extra query parameters are intentionally ignored. That keeps address,
 * search, and filter state out of journey memory while still distinguishing
 * canonical child views such as Capital Art and Network Fees.
 */
export function findCurrentSiteMapContext(locationLike = globalThis.location) {
    const pathname = normalizedLocationPath(locationLike);
    const search = String(locationLike?.search || '');
    const searchParams = new URLSearchParams(search);
    const hash = String(locationLike?.hash || '');

    if ((pathname === '/' || pathname === '/index.html') && searchParams.get('hen') === '1') {
        const entry = findSiteMapEntry('hen');
        return { id: entry.id, entry, intent: null, entryId: entry.id, intentId: null, route: entry.href };
    }
    if (pathname === '/' && hash) {
        const hashKey = `#${hash.replace(/^#/, '').split('=')[0]}`;
        const entry = SITE_MAP.find((candidate) => (
            candidate.hash === hashKey || (candidate.hashAliases || []).includes(hashKey)
        ));
        if (entry) return { id: entry.id, entry, intent: null, entryId: entry.id, intentId: null, route: entry.href };
    }

    const childMatches = [];
    SITE_MAP.forEach((entry, parentIndex) => {
        (entry.searchIntents || []).forEach((intent, intentIndex) => {
            const match = intentRouteMatch(intent, pathname, searchParams);
            if (!match) return;
            childMatches.push({
                entry,
                intent: {
                    ...intent,
                    id: match.id,
                    href: match.href,
                    group: intent.group || entry.group,
                    parentId: entry.id,
                    parentTitle: entry.title
                },
                specificity: match.specificity,
                parentIndex,
                intentIndex
            });
        });
    });
    childMatches.sort((a, b) => (
        b.specificity - a.specificity
        || a.parentIndex - b.parentIndex
        || a.intentIndex - b.intentIndex
    ));
    if (childMatches.length) {
        const { entry, intent } = childMatches[0];
        return {
            id: intent.id,
            entry,
            intent,
            entryId: entry.id,
            intentId: intent.id,
            route: intent.href
        };
    }

    const entry = SITE_MAP.find((candidate) => {
        const href = new URL(candidate.href, 'https://tezos.systems');
        return href.pathname === pathname || (candidate.paths || []).includes(pathname);
    }) || home;
    return { id: entry.id, entry, intent: null, entryId: entry.id, intentId: null, route: entry.href };
}

export function findCurrentSiteMapEntry(locationLike = globalThis.location) {
    return findCurrentSiteMapContext(locationLike).entry;
}
