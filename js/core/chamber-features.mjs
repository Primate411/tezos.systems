// Shared pure feature catalog. Standalone is an explicit, tested opt-in;
// dashboard-only initialization stays owned by app.js until user intent.
export const CHAMBER_FEATURES = Object.freeze({
    pulse: {
        modulePath: '../features/network-pulse.js',
        init: 'initNetworkPulseChamber',
        open: 'openNetworkPulseChamber',
        close: 'closeNetworkPulseChamber'
    },
    tezosx: {
        modulePath: '../features/tezlink.js',
        init: 'initTezlinkChamber',
        open: 'openTezlinkChamber',
        close: 'closeTezlinkChamber'
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
        launchers: ['#whale-toggle']
    },
    'staking-chamber': {
        modulePath: '../features/staking-chamber.js',
        init: 'initStakingChamber',
        open: 'openStakingChamber',
        close: 'closeStakingChamber'
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
        exclusiveLaunchers: true
    },
    tz4: {
        modulePath: '../features/tz4-adoption.js',
        init: 'initTz4AdoptionChamber',
        open: 'openTz4AdoptionChamber',
        close: 'closeTz4AdoptionChamber'
    },
    chamber: {
        modulePath: '../features/chamber.js',
        init: 'initChamber',
        open: 'openChamber',
        close: 'closeChamber'
    },
    'l2-governance': {
        modulePath: '../features/etherlink-governance.js',
        init: 'initEtherlinkGovernanceChamber',
        open: 'openEtherlinkGovernanceChamber',
        close: 'closeEtherlinkGovernanceChamber'
    },
    'liquidity-baking': {
        modulePath: '../features/liquidity-baking.js',
        init: 'initLiquidityBaking',
        open: 'openLiquidityBakingMonitor',
        close: 'closeLiquidityBakingMonitor'
    },
    'ledger-flow': {
        modulePath: '../features/ledger-flow.js',
        init: 'initLedgerFlowChamber',
        open: 'openLedgerFlowChamber',
        close: 'closeLedgerFlowChamber'
    },
    domains: {
        modulePath: '../features/tezos-domains.js',
        init: 'initTezosDomainsChamber',
        open: 'openTezosDomainsChamber',
        close: 'closeTezosDomainsChamber'
    },
    maxis: {
        modulePath: '../features/maxis.js',
        init: 'initMaxisChamber',
        open: 'openMaxisChamber',
        close: 'closeMaxisChamber'
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
        closeFeatureMenu: true
    }
});
