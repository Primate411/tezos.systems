/**
 * Watch Center — local alert and watchlist settings.
 */

import { escapeHtml } from '../core/utils.js';

const VISIBLE_KEY = 'tezos-systems-watch-center-visible';
const SETTINGS_KEY = 'tezos-systems-watch-center-settings';
const MY_TEZOS_KEY = 'tezos-systems-my-baker-address';
const HEN_WATCH_KEY = 'tezos-systems-hen-watch-artists';

const DEFAULT_SETTINGS = {
  protocol: true,
  baker: true,
  tz4: true,
  lb: true,
  tezosx: false,
  largeMoves: false,
  hen: false
};

let callbacks = {};
let latestStats = {};
let latestPrice = 0;

function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function fmt(value, digits = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { maximumFractionDigits: digits });
}

function fmtCompact(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'Checking';
  return Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

function readWatchedArtists() {
  try {
    const artists = JSON.parse(localStorage.getItem(HEN_WATCH_KEY));
    return Array.isArray(artists) ? artists.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function getMyTezosStatus() {
  const address = localStorage.getItem(MY_TEZOS_KEY) || '';
  const data = window._myTezosData || null;
  if (!address) {
    return {
      value: 'Setup needed',
      detail: 'Add My Tezos to watch baker health, capacity, rewards, and governance exposure.',
      tone: 'watch',
      setupNeeded: true
    };
  }

  const baker = data?.bakerName || data?.bakerAddress || data?.baker || '';
  const warnings = [];
  if (data?.capacity?.status && data.capacity.status !== 'ok') warnings.push(data.capacity.label || 'capacity');
  if (data?.bakerHealth?.live?.state && data.bakerHealth.live.state !== 'ok') warnings.push(data.bakerHealth.live.value || 'health');
  if (data?.missedAttestations > 0) warnings.push(`${data.missedAttestations} missed slots`);

  return {
    value: baker ? `Watching ${baker}` : 'Watching address',
    detail: warnings.length ? warnings.join(' · ') : `${address.slice(0, 8)}… is saved locally for personal checks.`,
    tone: warnings.length ? 'alert' : 'good'
  };
}

function buildRows(stats) {
  const settings = loadSettings();
  const watchedArtists = readWatchedArtists();
  const myTezos = getMyTezosStatus();
  const tz4Pct = Number(stats.tz4Percentage);
  const tz4Gap = Number.isFinite(tz4Pct) ? Math.max(0, 50 - tz4Pct) : null;
  const lbDisabled = Boolean(stats.lbSubsidyDisabled);
  const protocolValue = stats.proposal || stats.votingPeriod || 'Quiet';

  return [
    {
      key: 'protocol',
      label: 'Protocol activation',
      value: protocolValue,
      detail: stats.proposal ? 'Active governance needs attention.' : 'Watch for period changes, ballots, and activation timing.',
      trigger: 'proposal, period, or activation state changes',
      tone: stats.proposal ? 'alert' : 'good',
      enabled: settings.protocol
    },
    {
      key: 'baker',
      label: 'My baker',
      value: myTezos.value,
      detail: myTezos.detail,
      trigger: 'capacity, health, vote, or reward warning',
      tone: myTezos.tone,
      setupNeeded: Boolean(myTezos.setupNeeded),
      enabled: settings.baker && !myTezos.setupNeeded
    },
    {
      key: 'tz4',
      label: 'tz4 threshold',
      value: tz4Gap === null ? 'Checking' : `${fmt(tz4Gap)}pp to 50%`,
      detail: tz4Gap === null ? 'Waiting for tz4 adoption data; Network Stats can also load it.' : `${fmt(tz4Pct)}% adoption; alert when the community is close to target.`,
      trigger: 'within 5pp of 50% or crosses target',
      tone: tz4Gap !== null && tz4Gap <= 5 ? 'alert' : 'watch',
      enabled: settings.tz4
    },
    {
      key: 'lb',
      label: 'Liquidity Baking',
      value: lbDisabled ? 'Subsidy disabled' : 'Subsidy active',
      detail: lbDisabled ? 'Watch for ON pressure or EMA direction changes.' : 'Watch for OFF pressure returning.',
      trigger: 'subsidy state or EMA pressure changes',
      tone: lbDisabled ? 'watch' : 'alert',
      enabled: settings.lb
    },
    {
      key: 'tezosx',
      label: 'Tezos X activity',
      value: `${fmtCompact(stats.contractCalls24h)} calls`,
      detail: latestPrice ? `Use with XTZ $${fmt(latestPrice, 3)} and Tezos X chamber context.` : 'Watch contract calls and Etherlink chamber signals together.',
      trigger: 'contract calls or chamber signal anomaly',
      tone: 'watch',
      enabled: settings.tezosx
    },
    {
      key: 'largeMoves',
      label: 'Large movements',
      value: 'Whales + giants',
      detail: 'Open Mini Whale or Sleeping Giants to poll live movement feeds.',
      trigger: '>1,000 XTZ move or dormant 1M+ wallet wakes',
      tone: 'watch',
      enabled: settings.largeMoves
    },
    {
      key: 'hen',
      label: 'HEN artists',
      value: watchedArtists.length ? `${watchedArtists.length} watched` : 'None watched',
      detail: watchedArtists.length ? watchedArtists.slice(0, 3).join(' · ') : 'Open HEN mode and watch artists from an expanded token.',
      trigger: 'new mint from a watched artist',
      tone: watchedArtists.length ? 'good' : 'watch',
      enabled: settings.hen
    }
  ];
}

function render() {
  const grid = document.getElementById('watch-center-grid');
  if (!grid) return;

  const rows = buildRows(latestStats || {});
  grid.innerHTML = rows.map((row) => `
    <article class="watch-card ${row.enabled ? 'armed' : ''}" data-watch-key="${escapeHtml(row.key)}" data-tone="${escapeHtml(row.tone)}">
      <div class="watch-card-main">
        <span class="watch-label">${escapeHtml(row.label)}</span>
        <strong>${escapeHtml(row.value)}</strong>
        <p>${escapeHtml(row.detail)}</p>
        <small class="watch-trigger">Trigger: ${escapeHtml(row.trigger)}</small>
      </div>
      <button class="watch-toggle" type="button" aria-pressed="${row.enabled ? 'true' : 'false'}">${row.setupNeeded ? 'Setup' : row.enabled ? 'Armed' : 'Off'}</button>
    </article>
  `).join('');

  grid.querySelectorAll('.watch-toggle').forEach((button) => {
    button.addEventListener('click', (event) => {
      const card = event.currentTarget.closest('[data-watch-key]');
      const key = card?.dataset.watchKey;
      if (!key) return;
      if (key === 'baker' && card?.querySelector('.watch-toggle')?.textContent === 'Setup') {
        document.getElementById('my-tezos-btn')?.click();
        return;
      }
      const settings = loadSettings();
      settings[key] = !settings[key];
      saveSettings(settings);
      render();
    });
  });
}

function updateVisibility(isVisible) {
  const section = document.getElementById('watch-center');
  const toggleBtn = document.getElementById('watch-center-toggle');
  if (section) section.classList.toggle('visible', isVisible);
  if (toggleBtn) {
    toggleBtn.classList.toggle('active', isVisible);
    toggleBtn.title = `Watch Center: ${isVisible ? 'ON' : 'OFF'}`;
    const status = toggleBtn.querySelector('.feature-status');
    if (status) status.textContent = isVisible ? 'Pinned' : 'Tool';
  }
}

function requestNotifications() {
  const button = document.getElementById('watch-notifications-btn');
  if (!('Notification' in window)) {
    if (button) button.textContent = 'Alerts unavailable';
    return;
  }
  Notification.requestPermission().then((permission) => {
    if (button) button.textContent = permission === 'granted' ? 'Browser alerts enabled' : 'Alerts not enabled';
  });
}

export function initWatchCenter(options = {}) {
  callbacks = options;
  latestStats = options.getStats?.() || {};

  document.getElementById('watch-center-toggle')?.addEventListener('click', () => {
    const next = localStorage.getItem(VISIBLE_KEY) !== 'true';
    localStorage.setItem(VISIBLE_KEY, String(next));
    updateVisibility(next);
    if (next) {
      document.getElementById('watch-center')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const stats = callbacks.getStats?.();
      if (stats && Object.keys(stats).length) latestStats = stats;
      render();
    }
  });

  document.getElementById('watch-notifications-btn')?.addEventListener('click', requestNotifications);
  document.getElementById('watch-center-open-my-tezos')?.addEventListener('click', () => {
    document.getElementById('my-tezos-btn')?.click();
  });

  window.addEventListener('my-tezos-data-ready', render);
  window.addEventListener('storage', (event) => {
    if ([HEN_WATCH_KEY, MY_TEZOS_KEY, SETTINGS_KEY].includes(event.key)) render();
  });

  const isVisible = localStorage.getItem(VISIBLE_KEY) === 'true';
  updateVisibility(isVisible);
  render();
}

export function updateWatchCenter(stats = {}, xtzPrice = 0) {
  if (stats && Object.keys(stats).length) latestStats = stats;
  latestPrice = xtzPrice || latestPrice;
  if (document.getElementById('watch-center')?.classList.contains('visible')) render();
}
