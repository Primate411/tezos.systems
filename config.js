// Supabase configuration
// Note: The anon key is safe to expose in client-side code
// It only allows operations permitted by Row Level Security policies

export const SUPABASE_CONFIG = {
  url: 'https://iijpfczftroespicmufb.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpanBmY3pmdHJvZXNwaWNtdWZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NDg4NjIsImV4cCI6MjA4NjEyNDg2Mn0.tbW5cum-xT-k4riiv3ysLK5D3am_3-DaBO1YO8HpaO0'
};

// API base URLs
export const API_URLS = {
  tzkt: 'https://api.tzkt.io/v1',
  octez: 'https://eu.rpc.tez.capital'
};

// Refresh intervals (milliseconds)
export const REFRESH_INTERVALS = {
  main: 7200000,        // 2 hours
  sparkline: 600000,    // 10 minutes
  price: 60000          // 60 seconds
};

// Cache TTLs (milliseconds)
export const CACHE_TTLS = {
  memory: 60000,         // 1 minute (in-memory API cache)
  storage: 14400000      // 4 hours (localStorage)
};

// Fetch limits
export const FETCH_LIMITS = {
  bakers: 10000,
  consensusOps: 2000
};

// Whale/giant thresholds (in mutez)
export const THRESHOLDS = {
  whaleMinAmount: 1000 * 1e6,       // 1,000 XTZ
  giantMinBalance: 1000000 * 1e6    // 1,000,000 XTZ (1M)
};

// Staking target percentage
export const STAKING_TARGET = 50;

// Mainnet launch date
export const MAINNET_LAUNCH = '2018-06-30T00:00:00Z';

// History data start date
export const HISTORY_START = '2024-01-01';

// Static comparison data for other chains (updated periodically)
export const CHAIN_COMPARISON = {
    lastUpdated: '2026-02-10',
    ethereum: {
        name: 'Ethereum',
        symbol: 'ETH',
        blockTime: '~12s',
        finality: '~13 min',
        finalityNote: '2 epochs',
        validators: '~1,100,000',
        stakingPct: '~28%',
        annualIssuance: '~0.5%',
        selfAmendments: 0,
        selfAmendmentsNote: 'Hard forks only',
        hardForks: '14+',
        energyPerTx: '~0.003 kWh',
        energyPerTxNote: 'Post-Merge',
        avgTxFee: '~$1–5',
    },
    solana: {
        name: 'Solana',
        symbol: 'SOL',
        blockTime: '~0.4s',
        finality: '~6.4s',
        finalityNote: 'Confirmed',
        validators: '~1,300',
        stakingPct: '~65%',
        annualIssuance: '~5.4%',
        selfAmendments: 0,
        selfAmendmentsNote: 'No on-chain governance',
        hardForks: 'Multiple outages',
        energyPerTx: '~0.00051 kWh',
        energyPerTxNote: '',
        avgTxFee: '~$0.005',
    },
    tezosStatic: {
        // Fallback values when live data isn't available yet
        blockTime: '~6s',
        finality: '~6s',
        finalityNote: '1 block',
        hardForks: '0',
        energyPerTx: '<0.001 kWh',
        energyPerTxNote: '',
        avgTxFee: '~$0.01',
    }
};
