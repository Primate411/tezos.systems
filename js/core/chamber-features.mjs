// Shared pure feature catalog. Standalone is an explicit, tested opt-in;
// dashboard-only initialization stays owned by app.js until user intent.
export const CHAMBER_FEATURES = Object.freeze({
    pulse: {
        modulePath: '../features/network-pulse.js',
        init: 'initNetworkPulseChamber',
        open: 'openNetworkPulseChamber',
        close: 'closeNetworkPulseChamber',
        standalone: { route: 'pulse', overlayId: 'network-pulse-modal', dialogSelector: '.network-pulse-content', launcher: '#network-pulse-entry-card', queryKeys: [] }
    },
    tezosx: {
        modulePath: '../features/tezlink.js',
        init: 'initTezlinkChamber',
        open: 'openTezlinkChamber',
        close: 'closeTezlinkChamber',
        standalone: { route: 'tezosx', aliases: ['tezlink'], overlayId: 'tezlink-modal', dialogSelector: '.tezlink-content', launcher: '#tezlink-entry-card', queryKeys: [] }
    },
    capital: {
        modulePath: '../features/capital-chamber.js',
        init: 'initCapitalChamber',
        open: 'openCapitalChamber',
        close: 'closeCapitalChamber',
        standalone: {
            route: 'capital', overlayId: 'capital-modal', dialogSelector: '.capital-content',
            launcher: '#capital-entry-card', queryKeys: ['view', 'focus']
        }
    },
    minerals: {
        modulePath: '../features/minerals-chamber.js',
        init: 'initMineralsChamber',
        open: 'openMineralsChamber',
        close: 'closeMineralsChamber',
        standalone: {
            route: 'minerals', overlayId: 'minerals-modal', dialogSelector: '.minerals-content',
            launcher: '#minerals-entry-card', queryKeys: ['view', 'series', 'range']
        }
    },
    uranium: {
        modulePath: '../features/uranium-chamber.js',
        init: 'initUraniumChamber',
        open: 'openUraniumChamber',
        close: 'closeUraniumChamber',
        standalone: {
            route: 'uranium', overlayId: 'uranium-modal', dialogSelector: '.uranium-content',
            launcher: '#uranium-entry-card', queryKeys: ['view', 'range']
        }
    },
    metals: {
        modulePath: '../features/metals-chamber.js',
        init: 'initMetalsChamber',
        open: 'openMetalsChamber',
        close: 'closeMetalsChamber',
        standalone: {
            route: 'metals', overlayId: 'metals-modal', dialogSelector: '.metals-content',
            launcher: '#metals-entry-card', queryKeys: ['view', 'metal']
        }
    },
    whales: {
        modulePath: '../features/whale-chamber.js',
        init: 'initWhaleChamber',
        open: 'openWhaleChamber',
        close: 'closeWhaleChamber',
        closeArgs: [{ preserveRoute: true }],
        launchers: ['#whale-toggle'],
        standalone: { route: 'whales', overlayId: 'whale-watch-modal', dialogSelector: '.whale-watch-content', launcher: '#whale-watch-entry-card', queryKeys: ['view', 'min', 'type', 'q'], positional: true }
    },
    'staking-chamber': {
        modulePath: '../features/staking-chamber.js',
        init: 'initStakingChamber',
        open: 'openStakingChamber',
        close: 'closeStakingChamber',
        standalone: { route: 'stake', overlayId: 'staking-chamber-modal', dialogSelector: '.staking-chamber-content', launcher: '#staking-entry-card', queryKeys: ['view'] }
    },
    ecosystem: {
        modulePath: '../features/ecosystem-chamber.js',
        init: 'initEcosystemChamber',
        open: 'openEcosystemChamber',
        close: 'closeEcosystemChamber',
        standalone: {
            route: 'ecosystem', overlayId: 'ecosystem-activity-modal', dialogSelector: '.ecosystem-content',
            launcher: '#ecosystem-entry-card', queryKeys: ['layer', 'range', 'category', 'app']
        }
    },
    leaderboard: {
        modulePath: '../features/leaderboard.js',
        init: 'initBakerDirectoryChamber',
        open: 'openBakerDirectoryChamber',
        close: 'closeBakerDirectoryChamber',
        closeArgs: [{ preserveRoute: true }],
        launchers: ['#leaderboard-toggle'],
        exclusiveLaunchers: true,
        standalone: { route: 'leaderboard', overlayId: 'baker-directory-modal', dialogSelector: '.baker-directory-content', launcher: '#baker-directory-entry-card', queryKeys: ['view', 'q', 'baker', 'sort', 'open', 'fee', 'capacity', 'min', 'size'] }
    },
    tz4: {
        modulePath: '../features/tz4-adoption.js',
        init: 'initTz4AdoptionChamber',
        open: 'openTz4AdoptionChamber',
        close: 'closeTz4AdoptionChamber',
        standalone: { route: 'tz4', overlayId: 'tz4-adoption-modal', dialogSelector: '.tz4-content', launcher: '[data-stat="tz4-adoption"]', queryKeys: [] }
    },
    chamber: {
        modulePath: '../features/chamber.js',
        init: 'initChamber',
        open: 'openChamber',
        close: 'closeChamber',
        standalone: { route: 'chamber', overlayId: 'chamber-modal', dialogSelector: '.chamber-content', launcher: '#chamber-entry-card', queryKeys: [] }
    },
    'l2-governance': {
        modulePath: '../features/etherlink-governance.js',
        init: 'initEtherlinkGovernanceChamber',
        open: 'openEtherlinkGovernanceChamber',
        close: 'closeEtherlinkGovernanceChamber',
        standalone: { route: 'l2chamber', overlayId: 'etherlink-governance-modal', dialogSelector: '.etherlink-gov-content', launcher: '#etherlink-governance-entry-card', queryKeys: [], positional: true }
    },
    'liquidity-baking': {
        modulePath: '../features/liquidity-baking.js',
        init: 'initLiquidityBaking',
        open: 'openLiquidityBakingMonitor',
        close: 'closeLiquidityBakingMonitor',
        standalone: { route: 'lb', overlayId: 'liquidity-baking-modal', dialogSelector: '.lb-content', launcher: '#lb-entry-card', queryKeys: [] }
    },
    'ledger-flow': {
        modulePath: '../features/ledger-flow.js',
        init: 'initLedgerFlowChamber',
        open: 'openLedgerFlowChamber',
        close: 'closeLedgerFlowChamber',
        standalone: { route: 'ledger-flow', overlayId: 'ledger-flow-modal', dialogSelector: '.ledger-flow-content', launcher: '#ledger-flow-entry-card', queryKeys: [], positional: true }
    },
    domains: {
        modulePath: '../features/tezos-domains.js',
        init: 'initTezosDomainsChamber',
        open: 'openTezosDomainsChamber',
        close: 'closeTezosDomainsChamber',
        standalone: { route: 'domains', overlayId: 'tezos-domains-modal', dialogSelector: '.tezos-domains-content', launcher: '#tezos-domains-entry-card', queryKeys: [], positional: true }
    },
    maxis: {
        modulePath: '../features/maxis.js',
        init: 'initMaxisChamber',
        open: 'openMaxisChamber',
        close: 'closeMaxisChamber',
        standalone: { route: 'maxis', overlayId: 'maxis-modal', dialogSelector: '.maxis-content', launcher: '#maxis-entry-card', queryKeys: ['view', 'season', 'lane', 'address'] }
    },
    tezoscrp: {
        modulePath: '../features/tezoscrp.js',
        init: 'initTezosCrpChamber',
        open: 'openTezosCrpChamber',
        close: 'closeTezosCrpChamber',
        standalone: {
            route: 'tezoscrp', overlayId: 'tezoscrp-modal', dialogSelector: '.tezoscrp-content',
            launcher: '#tezoscrp-entry-card', queryKeys: ['view', 'year', 'period', 'category', 'q']
        }
    },
    ctez: {
        modulePath: '../features/ctez.js',
        init: 'initCtezChamber',
        open: 'openCtezChamber',
        close: 'closeCtezChamber',
        launchers: ['#ctez-launcher', '#ctez-feature-btn'],
        exclusiveLaunchers: true,
        closeFeatureMenu: true,
        standalone: { route: 'ctez', overlayId: 'ctez-modal', dialogSelector: '.ctez-content', launcher: '#ctez-launcher', queryKeys: [] }
    },
    health: {
        modulePath: '../features/network-health.js', init: 'initNetworkHealth',
        open: 'openNetworkHealthChamber', close: 'closeNetworkHealthChamber',
        standalone: { route: 'health', overlayId: 'network-health-modal', dialogSelector: '.health-content', launcher: '[data-stat="network-health"]', queryKeys: [] }
    },
    history: {
        modulePath: '../features/history.js', init: 'initHistoryModal',
        open: 'openCycleHistoryChamber', close: 'closeCycleHistoryChamber', closeArgs: [{ preserveRoute: true }],
        standalone: { route: 'history', overlayId: 'history-modal', dialogSelector: '.cycle-history-content', launcher: '#cycle-history-entry-card', queryKeys: ['range', 'metric'], fragments: ['history-modal'] }
    },
    my: {
        modulePath: '../features/my-tezos.js', init: 'initMyTezos',
        open: 'openMyTezosChamber', close: 'closeMyTezosChamber',
        standalone: { route: 'my', overlayId: 'my-tezos-drawer', dialogSelector: ':scope', launcher: '#my-tezos-btn', queryKeys: ['view', 'scope'], controller: 'my', fragments: ['my-tezos-drawer-scrim', 'my-tezos-drawer', 'my-tezos-btn'] }
    },
    anthology: {
        modulePath: './app.js', open: 'openStandaloneAnthology', close: 'closeProtocolHistoryChamber',
        standalone: { route: 'anthology', children: true, overlayId: 'protocol-history-chamber-modal', dialogSelector: '.protocol-history-content', launcher: '#protocol-history-entry-card', queryKeys: ['view', 'protocol'], controller: 'anthology' }
    },
    chambers: {
        modulePath: './app.js', open: 'openStandaloneDirectory', close: 'closeStandaloneDirectory',
        standalone: { route: 'chambers', overlayId: 'chambers-section', dialogSelector: ':scope', launcher: '#chambers-toggle', queryKeys: ['topic', 'room'], controller: 'chambers', fragments: ['chambers-section', 'home-layout-modal', 'customize-home-btn'], fragmentStats: ['network-health', 'tz4-adoption'] }
    }
});

export function standaloneFeatureForRoute(slug) {
    return Object.entries(CHAMBER_FEATURES).find(([, { standalone }]) => standalone && (
        standalone.route === slug || standalone.aliases?.includes(slug)
        || (standalone.children && slug.startsWith(`${standalone.route}/`))
    ))?.[0] || '';
}
