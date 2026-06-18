/**
 * Developer Intelligence — compact builder ops surface.
 */

import { API_URLS } from '../core/config.js';
import { escapeHtml } from '../core/utils.js';

const VISIBLE_KEY = 'tezos-systems-developer-intel-visible';

let callbacks = {};
let latestStats = {};
let latestRpcHead = null;
let latestRpcCheckedAt = null;
let refreshInFlight = false;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fmtCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'Checking';
  return n.toLocaleString('en-US');
}

function fmtCompact(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'Checking';
  return Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

function fmtAge(iso) {
  if (!iso) return '—';
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return '—';
  const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (seconds < 90) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

function hasUsefulStats(stats) {
  return stats && Object.keys(stats).some((key) => stats[key] !== undefined && stats[key] !== null);
}

function setStatus(text, tone = '') {
  const status = document.getElementById('developer-intel-status');
  if (!status) return;
  status.textContent = text;
  status.dataset.tone = tone;
}

function metric(label, value, note, tone = '') {
  return `
    <div class="developer-intel-card" data-tone="${escapeHtml(tone)}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <p>${escapeHtml(note)}</p>
    </div>
  `;
}

function render() {
  const grid = document.getElementById('developer-intel-grid');
  if (!grid) return;

  const stats = latestStats || {};
  const statsReady = hasUsefulStats(stats);
  const liveStatsNote = statsReady
    ? 'From the loaded TzKT network snapshot.'
    : 'Checking full TzKT stats; Network Stats can also load this.';
  const headAge = latestRpcHead?.timestamp ? fmtAge(latestRpcHead.timestamp) : 'not checked';
  const rpcTone = latestRpcHead?.level ? 'good' : 'watch';
  const rpcLabel = latestRpcHead?.level ? `Head ${fmtCount(latestRpcHead.level)}` : 'RPC pending';
  const rpcNote = latestRpcHead?.timestamp
    ? `Octez RPC responded; block timestamp ${headAge}.`
    : 'Open or refresh this surface to check the Tezos RPC head.';

  grid.innerHTML = [
    metric('RPC head', rpcLabel, rpcNote, rpcTone),
    metric('Contract calls', fmtCompact(stats.contractCalls24h), statsReady ? 'Entrypoint calls in the last 24h from TzKT.' : liveStatsNote, stats.contractCalls24h > 100000 ? 'good' : 'watch'),
    metric('Active contracts', fmtCompact(stats.activeContracts24h), statsReady ? 'Contracts with recent on-chain activity.' : liveStatsNote, stats.activeContracts24h > 1000 ? 'good' : 'watch'),
    metric('Smart contracts', fmtCompact(stats.smartContracts), statsReady ? 'Total originated smart contracts known to TzKT.' : liveStatsNote, statsReady ? '' : 'watch'),
    metric('Smart rollups', fmtCount(stats.rollups), statsReady ? 'Mainnet rollup count from the live ecosystem stats.' : liveStatsNote, statsReady ? '' : 'watch'),
    metric('New accounts', fmtCompact(stats.newAccounts24h), statsReady ? 'Freshly funded accounts in the last 24h.' : liveStatsNote, statsReady ? '' : 'watch'),
    metric('Tezos X', 'Open chamber', 'Etherlink RPC, TVL, gas, active-account, and rollup anchor data live in the Tezos X chamber.', 'link'),
    metric('Protocol runway', stats.proposal || stats.votingPeriod || 'No active proposal', 'Activation and governance timing should be checked before production deploys.')
  ].join('');

  setStatus(
    latestRpcCheckedAt
      ? `Builder surface refreshed ${fmtAge(latestRpcCheckedAt)}.`
      : 'Builder surface ready; refresh to check RPC head.',
    hasUsefulStats(stats) ? 'good' : 'watch'
  );

  grid.querySelector('[data-tone="link"]')?.addEventListener('click', () => {
    window.location.hash = '#tezosx';
  });
}

async function fetchRpcHead() {
  try {
    const response = await fetch(`${API_URLS.octez}/chains/main/blocks/head/header`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`RPC ${response.status}`);
    latestRpcHead = await response.json();
    latestRpcCheckedAt = new Date().toISOString();
  } catch (error) {
    latestRpcCheckedAt = new Date().toISOString();
    latestRpcHead = null;
    setStatus(`RPC check failed: ${error.message}`, 'watch');
  }
}

async function refresh() {
  if (refreshInFlight) return;
  refreshInFlight = true;
  const refreshBtn = document.getElementById('developer-intel-refresh');
  if (refreshBtn) refreshBtn.disabled = true;
  try {
    let stats = callbacks.getStats?.() || latestStats || {};
    const rpcPromise = fetchRpcHead();
    let statsPromise = Promise.resolve(stats);
    if (!hasUsefulStats(stats) && callbacks.loadStats) {
      setStatus('Loading full network stats for builder view...', 'watch');
      statsPromise = callbacks.loadStats()
        .then((loadedStats) => {
          latestStats = loadedStats || latestStats || {};
          return latestStats;
        })
        .catch((error) => {
          console.warn('[developer-intel] stats load failed:', error);
          return null;
        });
      const loadedWithinBudget = await Promise.race([
        statsPromise,
        wait(3500).then(() => null)
      ]);
      if (loadedWithinBudget) {
        stats = loadedWithinBudget;
      } else {
        setStatus('RPC is live; full stats are still loading.', 'watch');
        statsPromise.then((lateStats) => {
          if (lateStats) {
            latestStats = lateStats;
            render();
          }
        });
      }
    }
    latestStats = stats || latestStats || {};
    await rpcPromise;
    render();
  } finally {
    refreshInFlight = false;
    if (refreshBtn) refreshBtn.disabled = false;
  }
}

function updateVisibility(isVisible) {
  const section = document.getElementById('developer-intelligence');
  const toggleBtn = document.getElementById('developer-intel-toggle');
  if (section) section.classList.toggle('visible', isVisible);
  if (toggleBtn) {
    toggleBtn.classList.toggle('active', isVisible);
    toggleBtn.title = `Developer Intelligence: ${isVisible ? 'ON' : 'OFF'}`;
    const status = toggleBtn.querySelector('.feature-status');
    if (status) status.textContent = isVisible ? 'Pinned' : 'Tool';
  }
}

export function initDeveloperIntelligence(options = {}) {
  callbacks = options;
  latestStats = options.getStats?.() || {};

  const toggleBtn = document.getElementById('developer-intel-toggle');
  const refreshBtn = document.getElementById('developer-intel-refresh');

  toggleBtn?.addEventListener('click', () => {
    const next = localStorage.getItem(VISIBLE_KEY) !== 'true';
    localStorage.setItem(VISIBLE_KEY, String(next));
    updateVisibility(next);
    if (next) {
      document.getElementById('developer-intelligence')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      refresh();
    }
  });

  refreshBtn?.addEventListener('click', refresh);

  const isVisible = localStorage.getItem(VISIBLE_KEY) === 'true';
  updateVisibility(isVisible);
  render();
  if (isVisible) setTimeout(refresh, 600);
}

export function updateDeveloperIntelligence(stats = {}) {
  if (hasUsefulStats(stats)) latestStats = stats;
  if (document.getElementById('developer-intelligence')?.classList.contains('visible')) {
    render();
  }
}
