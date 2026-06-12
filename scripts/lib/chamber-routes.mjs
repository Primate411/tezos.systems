export const CHAMBER_ROUTES = [
  {
    slug: 'chamber',
    hash: '#chamber',
    title: 'The Chamber - Tezos Governance Vote Room',
    shortTitle: 'The Chamber',
    description: 'Track live Tezos governance votes, quorum, supermajority, baker ballots, and proposal context.',
    eyebrow: 'Governance',
    accent: '#00d4ff'
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
    slug: 'tezlink',
    hash: '#tezlink',
    title: 'Tezlink Chamber - Etherlink Activity Monitor',
    shortTitle: 'Tezlink',
    description: 'Follow Etherlink activity, L1 anchors, gas signals, TVL direction, and L2 token concentration.',
    eyebrow: 'Etherlink L2',
    accent: '#a855f7'
  },
  {
    slug: 'l2chamber',
    hash: '#l2chamber',
    title: 'Tezlink Governance Chamber - Etherlink Governance Monitor',
    shortTitle: 'Tezlink Governance',
    description: 'Track Etherlink governance contracts, track rules, proposal timelines, and quiet-state discovery.',
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
  }
];

export function routeUrl(route) {
  return `https://tezos.systems/${route.slug}/`;
}

export function routeImage(route) {
  return `https://tezos.systems/og/${route.slug}.png`;
}
