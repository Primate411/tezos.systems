import { STAKING_GUIDE_FAQ } from '../../js/core/staking-guide-content.mjs';

export const CHAMBER_ROUTES = [
  {
    slug: 'chambers',
    hash: '#chambers',
    title: 'Explore Tezos - Live Rooms by Topic',
    shortTitle: 'Explore Tezos',
    description: 'Choose a question-led topic and browse focused Tezos rooms for live network signals, dapp activity, capital, bakers, governance, people, accounts, and history.',
    eyebrow: 'Topic Directory',
    accent: '#45e0c8'
  },
  {
    slug: 'my',
    hash: '#my-tezos',
    title: 'My Tezos - Personal Wallet and Baker Dashboard',
    shortTitle: 'My Tezos',
    description: 'Make a wallet or .tez name the center of a personal Tezos dashboard for rewards, roles, baker health, activity, and account journeys.',
    eyebrow: 'Personal Tezos',
    accent: '#45e0c8'
  },
  {
    slug: 'anthology',
    hash: '#protocol-history',
    title: 'Protocol Anthology - Tezos Self-Amendment Story',
    shortTitle: 'Protocol Anthology',
    description: 'Read the Tezos self-amendment archive: protocol lore, upgrade debates, impact views, and the tracked history of one adopted protocol path.',
    eyebrow: 'Protocol Archive',
    accent: '#45e0c8'
  },
  {
    slug: 'history',
    hash: '#history',
    title: 'Cycle History - Tezos Signal Archive',
    shortTitle: 'Cycle History',
    description: 'Rewind captured Tezos consensus, staking, issuance, market, Network Health, Tezos X, and governance signals across selectable time ranges.',
    eyebrow: 'Measured History',
    accent: '#60a5fa'
  },
  {
    slug: 'chamber',
    hash: '#chamber',
    title: 'Tezos L1 Governance - Tezos Governance Vote Room',
    shortTitle: 'Tezos L1 Governance',
    description: 'Track live Tezos L1 governance votes, quorum, supermajority, baker ballots, and proposal context.',
    eyebrow: 'L1 Governance',
    accent: '#00d4ff'
  },
  {
    slug: 'pulse',
    hash: '#pulse',
    title: 'Network Pulse Chamber - Tezos Live Stats Field',
    shortTitle: 'Network Pulse',
    description: 'Scan Tezos consensus, economy, governance, activity, ecosystem, and adjacent chamber signals in one live card field.',
    eyebrow: 'Live Stats',
    accent: '#38bdf8'
  },
  {
    slug: 'capital',
    hash: '#capital',
    title: 'Capital Chamber - Tezos and Etherlink Economy',
    shortTitle: 'Capital Chamber',
    description: 'Inspect cross-layer Tezos and Etherlink activity, markets, ecosystem assets, real-world assets, and art-economy intelligence with sourced receipts.',
    eyebrow: 'Cross-Layer Economy',
    accent: '#f49ad1'
  },
  {
    slug: 'minerals',
    hash: '#minerals',
    title: 'Critical Minerals - Strategic Supply and Market Atlas',
    shortTitle: 'Critical Minerals',
    description: 'Explore the canonical 60-item 2025 U.S. critical-minerals list with source-native USGS supply and annual-price receipts, a bounded World Bank monthly market subset, and separate xCo, xNi, and RARE Etherlink receipts.',
    eyebrow: 'Strategic Materials Intelligence',
    accent: '#d9895b',
    secondaryAccent: '#3d7ee8'
  },
  {
    slug: 'uranium',
    hash: '#uranium',
    title: 'Uranium - xU3O8 Markets and Dated Physical Evidence',
    shortTitle: 'Uranium',
    description: 'Inspect xU3O8 token markets and Etherlink state alongside issuer-described beneficial co-ownership terms and separately dated Cameco custody-balance evidence for physical U3O8.',
    eyebrow: 'Emerald Market Intelligence',
    accent: '#8cff65',
    secondaryAccent: '#18d97f'
  },
  {
    slug: 'metals',
    hash: '#metals',
    title: 'Precious Metals - Eight-Metal Markets and VNXAU Receipts',
    shortTitle: 'Precious Metals',
    description: 'Compare the canonical eight precious metals on source-separated market clocks, then inspect receipt-bounded VNXAU activity across Tezos and Etherlink without inferring backing from token activity.',
    eyebrow: 'Eight-Metal Intelligence',
    accent: '#f0c96a',
    secondaryAccent: '#9fb4c7'
  },
  {
    slug: 'ecosystem',
    hash: '#ecosystem',
    title: 'Ecosystem Activity - Tezos and Etherlink Active Addresses',
    shortTitle: 'Ecosystem Activity',
    description: 'See all weekly transaction-originating addresses across Tezos L1 and Etherlink, then compare the reviewed-dapp subset, rankings, history, retention, interactions, and contract receipts.',
    eyebrow: 'Network + Dapp Intelligence',
    accent: '#55e2c3'
  },
  {
    slug: 'whales',
    hash: '#whales',
    title: 'Whale Watch - Large Tez Movement and Dormancy',
    shortTitle: 'Whale Watch',
    description: 'Inspect large tez operations, grouped flow stories, dormant large accounts, and verified post-dormancy awakenings with TzKT receipts.',
    eyebrow: 'Large Value Movement',
    accent: '#38bdf8'
  },
  {
    slug: 'stake',
    hash: '#staking',
    title: 'Tezos Staking - Live Stake Moves, Delegation and Direct Staking',
    shortTitle: 'Staking Chamber',
    description: 'Learn how Tezos delegation and direct staking differ, inspect live network rate context, and track every applied stake and unstake move above 10,000 tez.',
    eyebrow: 'Stake / Unstake',
    accent: '#a78bfa',
    faq: STAKING_GUIDE_FAQ
  },
  {
    slug: 'leaderboard',
    hash: '#leaderboard',
    title: 'Baker Directory - Active Tezos Bakers',
    shortTitle: 'Baker Directory',
    description: 'Discover and inspect active Tezos bakers through transparent on-chain capacity, tenure, governance, and tz4 signals without synthetic performance grades.',
    eyebrow: 'Baker Discovery',
    accent: '#f5c451'
  },
  {
    slug: 'maxis',
    hash: '#maxis',
    title: 'Tezos Maxis - On-Chain Crowns, Seasons, and Passports',
    shortTitle: 'Tezos Maxis',
    description: 'Spot Tezos activity leaders on their honest natural clocks, race through protocol seasons, inspect a wallet Maxi Passport, and trace every crown in Ledger Flow.',
    eyebrow: 'On-Chain Crowns',
    accent: '#f5c451'
  },
  {
    slug: 'tezoscrp',
    hash: '#tezoscrp',
    title: 'TezosCRP Recognition Hall - Tezos Community Rewards Archive',
    shortTitle: 'TezosCRP Recognition Hall',
    description: 'Explore every official Tezos Commons Community Rewards recognition since October 2020 by identity, month, category, and source receipt.',
    eyebrow: 'Community Recognition',
    accent: '#8f78ff'
  },
  {
    slug: 'health',
    hash: '#health',
    title: 'Network Health Chamber - Tezos Consensus Status',
    shortTitle: 'Network Health',
    description: 'Watch Tezos consensus power, recent blocks, missed rights, network load, and operator health signals.',
    eyebrow: 'Consensus',
    accent: '#47d18c'
  },
  {
    slug: 'tezosx',
    hash: '#tezosx',
    title: 'Tezos X Chamber - Etherlink Activity Monitor',
    shortTitle: 'Tezos X',
    description: 'Follow Etherlink activity, L1 anchors, gas signals, TVL direction, and L2 token concentration.',
    eyebrow: 'Etherlink L2',
    accent: '#a855f7'
  },
  {
    slug: 'tezlink',
    canonicalSlug: 'tezosx',
    imageSlug: 'tezosx',
    hash: '#tezosx',
    title: 'Tezos X Chamber - Etherlink Activity Monitor',
    shortTitle: 'Tezos X',
    description: 'Follow Etherlink activity, L1 anchors, gas signals, TVL direction, and L2 token concentration.',
    eyebrow: 'Etherlink L2',
    accent: '#a855f7',
    robots: 'noindex, follow'
  },
  {
    slug: 'l2chamber',
    hash: '#l2chamber',
    title: 'Tezos X Governance - Etherlink L2 Governance Monitor',
    shortTitle: 'Tezos X Governance',
    description: 'Track Etherlink L2 governance contracts, track rules, proposal timelines, and quiet-state discovery.',
    eyebrow: 'L2 Governance',
    accent: '#ff9f43'
  },
  {
    slug: 'tz4',
    hash: '#tz4',
    title: 'tz4 Adoption Chamber - Tezos BLS Consensus Keys',
    shortTitle: 'tz4 Adoption',
    description: 'Monitor Tezos bakers moving to tz4/BLS consensus keys, pending queues, power milestones, and switch momentum.',
    eyebrow: 'Consensus Keys',
    accent: '#45e0c8'
  },
  {
    slug: 'lb',
    hash: '#lb',
    title: 'Liquidity Baking Chamber - Tezos LB EMA Monitor',
    shortTitle: 'Liquidity Baking',
    description: 'Watch the Tezos Liquidity Baking OFF-vote EMA, subsidy state, baker vote flow, and threshold risk.',
    eyebrow: 'Liquidity Baking',
    accent: '#f5b84b'
  },
  {
    slug: 'ledger-flow',
    hash: '#ledger-flow',
    title: 'Ledger Flow - Tezos Account Transfer Diagram',
    shortTitle: 'Ledger Flow',
    description: 'Map bounded Tezos account transfer paths with exact or clearly sampled coverage and all-time receipt context.',
    eyebrow: 'Account Flows',
    accent: '#4dd4ff'
  },
  {
    slug: 'domains',
    hash: '#domains',
    title: 'Tezos Domains Chamber - Live .tez Name Market',
    shortTitle: 'Tezos Domains',
    description: 'Track fresh .tez registrations, renewals, expiring names, auctions, offers, and reverse-record identity moves.',
    eyebrow: '.tez Identity',
    accent: '#38e8d3'
  },
  {
    slug: 'ctez',
    hash: '#ctez',
    title: 'ctez Oven Guide - Withdraw Tez From ctez Ovens',
    shortTitle: 'ctez Oven Guide',
    description: 'Find a ctez oven, burn outstanding ctez, and withdraw tez safely through Better Call Dev.',
    eyebrow: 'ctez Exit Guide',
    accent: '#38bdf8'
  }
];

export function routeUrl(route) {
  return `https://tezos.systems/${route.canonicalSlug || route.slug}/`;
}

export function routeImage(route) {
  return `https://tezos.systems/og/${route.imageSlug || route.canonicalSlug || route.slug}.png`;
}
