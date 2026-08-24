import { quietlySyncHtml } from '../core/quiet-refresh.js';
import { escapeHtml } from '../core/utils.js';

const DESKTOP_SPEED_PX_PER_SEC = 42;
const MOBILE_SPEED_PX_PER_SEC = 34;
const POINTER_LEAVE_GRACE_MS = 180;
const RESIZE_DEBOUNCE_MS = 150;
const COARSE_SCROLL_RELEASE_PX = 48;
const PULSE_ITEM_SELECTOR = '[data-hot-signal-id], [data-pulse-echo-of]';

let mounted = false;
let signals = [];
let heldSignalId = '';
let heldAnchorRun = 'live';
let lastPhase = 0;
let runFitsViewport = false;
let sectionIsIntersecting = true;
let leaveTimer = null;
let resizeTimer = null;
let durationFrame = null;
let coarseHoldScrollY = 0;
let intersectionObserver = null;
let bodyClassObserver = null;

const reducedMotionQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : null;
const mobileQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia('(max-width: 720px)')
  : null;
const hoverQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia('(hover: hover) and (pointer: fine)')
  : null;

export function pulseTickerElement() {
  return typeof document === 'undefined' ? null : document.getElementById('pulse-ticker-strip');
}

function pulseTickerHidden(section = pulseTickerElement()) {
  if (!section || section.hidden) return true;
  const root = document.documentElement;
  if (root.getAttribute('data-home-layout-preview') === 'all') return false;
  return String(root.getAttribute('data-home-hidden') || '').split(/\s+/).includes('live-pulse');
}

function speedPxPerSecond() {
  return mobileQuery?.matches ? MOBILE_SPEED_PX_PER_SEC : DESKTOP_SPEED_PX_PER_SEC;
}

function measureDuration(track) {
  const run = track?.querySelector('[data-pulse-run="live"]');
  const width = run ? run.getBoundingClientRect().width : 0;
  return width > 0 ? width / speedPxPerSecond() : 0;
}

function capturePhase(track) {
  const animation = track?.getAnimations?.()[0];
  if (!animation) return lastPhase;
  const duration = Number(animation.effect?.getTiming?.().duration);
  const time = Number(animation.currentTime) || 0;
  if (!Number.isFinite(duration) || duration <= 0) return lastPhase;
  lastPhase = (time % duration) / duration;
  return lastPhase;
}

function restorePhase(track, phase) {
  const animation = track?.getAnimations?.()[0];
  const duration = Number(animation?.effect?.getTiming?.().duration);
  if (!animation || !Number.isFinite(duration) || duration <= 0) return;
  animation.currentTime = phase * duration;
  lastPhase = phase;
}

function updateMotionMode() {
  const section = pulseTickerElement();
  if (!section) return;
  const hasLiveRun = ['ready', 'stale'].includes(section.dataset.pulseState);
  const staticMotion = reducedMotionQuery?.matches || runFitsViewport || !hasLiveRun;
  const paused = heldSignalId
    || !sectionIsIntersecting
    || document.visibilityState !== 'visible'
    || document.body.classList.contains('hero-search-mode')
    || pulseTickerHidden(section);
  section.setAttribute('data-pulse-motion', staticMotion ? 'static' : paused ? 'paused' : 'running');
}

function escapedSignalId(value) {
  const text = String(value || '');
  return globalThis.CSS?.escape ? CSS.escape(text) : text.replace(/(["\\])/g, '\\$1');
}

function applyDuration(phase = lastPhase) {
  const section = pulseTickerElement();
  const viewport = section?.querySelector('#pulse-ticker-viewport');
  const track = viewport?.querySelector('[data-pulse-track]');
  const run = track?.querySelector('[data-pulse-run="live"]');
  if (!section || !viewport || !track || !run) return;
  const seconds = measureDuration(track);
  const restoreStartedAt = performance.now();
  const runWidth = run.getBoundingClientRect().width;
  runFitsViewport = runWidth <= viewport.clientWidth + 1;
  if (seconds > 0) section.style.setProperty('--pulse-ticker-duration', `${seconds}s`);
  updateMotionMode();
  restorePhase(track, phase);
  if (durationFrame !== null) window.cancelAnimationFrame(durationFrame);
  durationFrame = window.requestAnimationFrame(() => {
    durationFrame = null;
    if (!track.isConnected) return;
    const elapsedPhase = section.dataset.pulseMotion === 'running' && seconds > 0
      ? (performance.now() - restoreStartedAt) / (seconds * 1000)
      : 0;
    restorePhase(track, (phase + elapsedPhase) % 1);
  });
}

function truncateAtWord(value, limit = 72) {
  const text = String(value || '').trim();
  if (text.length <= limit) return text;
  const slice = text.slice(0, limit - 1);
  const boundary = slice.lastIndexOf(' ');
  return `${slice.slice(0, boundary >= Math.floor(limit * 0.58) ? boundary : slice.length).trim()}…`;
}

function pulseWeight(signal) {
  if (signal?.milestoneStatus === 'crossed') return 'milestone';
  if (signal?.breaking === true) return 'event';
  if (['headliner', 'peacock', 'historic'].includes(signal?.spectacle)) return 'priority';
  return 'state';
}

function weightMeta(weight) {
  if (weight === 'milestone') return { mark: '◎', word: 'MILESTONE' };
  if (weight === 'event') return { mark: '▲', word: 'BREAKING' };
  if (weight === 'priority') return { mark: '', word: 'PRIORITY' };
  return { mark: '', word: '' };
}

function ageMarkup(signal) {
  return `<span class="hot-today-age" data-hot-age data-hot-created-at="${escapeHtml(String(signal.createdAt || ''))}" data-hot-observed-at="${escapeHtml(String(signal.observedAt || ''))}" data-hot-started-at="${escapeHtml(String(signal.startedAt || ''))}" data-hot-kind="${escapeHtml(signal.kind || 'state')}">${escapeHtml(signal.ageLabel || 'Live')}</span>`;
}

function releaseTickerValue(signal) {
  const radar = signal?.releaseRadar;
  const main = radar?.candidates?.find(candidate => candidate.id === radar.mainCandidateId)
    || radar?.candidates?.[0];
  if (!main) return truncateAtWord(signal?.text);
  return [main.label, main.horizon || 'Horizon pending', main.confidence ? `${main.confidence} confidence` : '']
    .filter(Boolean)
    .join(' · ');
}

function buildItem(signal, { echo = false, index = 0 } = {}) {
  const id = String(signal?.id || `signal-${index}`);
  const route = String(signal?.tickerRoute || signal?.route || '#pulse');
  const weight = pulseWeight(signal);
  const meta = weightMeta(weight);
  const category = String(signal?.categoryLabel || signal?.category || 'Network');
  const title = signal?.releaseRadar ? 'Release Radar' : String(signal?.title || category);
  const value = signal?.releaseRadar ? releaseTickerValue(signal) : truncateAtWord(signal?.text);
  const quietKey = echo ? `pulse-echo-${id}` : `pulse-item-${id}`;
  const echoAttributes = echo
    ? ` data-pulse-echo-of="${escapeHtml(id)}" aria-hidden="true" tabindex="-1"`
    : ` data-hot-signal-id="${escapeHtml(id)}" data-hot-signal-index="${index}"`;
  const personalAttribute = signal?.personalRibbon ? ' data-hot-personal="1"' : '';
  const curioAttribute = signal?.curio ? ' data-hot-curio="1"' : '';
  const milestoneAttributes = signal?.milestoneStatus
    ? ` data-milestone-status="${escapeHtml(signal.milestoneStatus)}"`
    : '';
  const arrivalClass = signal?.isArriving ? ' is-arriving' : '';
  const markClass = meta.mark ? ' has-mark' : '';
  const markMarkup = meta.mark ? `<span class="pulse-ticker-mark" aria-hidden="true">${meta.mark}</span>` : '';
  const weightWord = meta.word ? `<span class="pulse-ticker-weight">${meta.word}</span>` : '';
  const ariaPrefix = signal?.personalRibbon ? `${signal.personalRibbon}. ` : '';
  const ariaWeight = meta.word ? `${meta.word}. ` : '';
  const ariaLabel = `${ariaPrefix}${ariaWeight}${category}: ${title} — ${String(signal?.text || value)}`;
  return `
    <a class="pulse-ticker-item is-weight-${weight}${markClass}${arrivalClass}" href="${escapeHtml(route)}"
       data-network-route="${escapeHtml(route)}" data-pulse-item="${escapeHtml(id)}"
       data-quiet-key="${escapeHtml(quietKey)}" data-pulse-weight="${weight}"
       data-hot-score="${Number(signal?.score) || 0}"
       data-hot-visual="${escapeHtml(signal?.visual || signal?.category || 'network')}"
       data-hot-spectacle="${escapeHtml(signal?.spectacle || 'quiet')}"${echoAttributes}${personalAttribute}${curioAttribute}${milestoneAttributes}
       aria-label="${escapeHtml(ariaLabel)}">
      ${markMarkup}
      <span class="pulse-ticker-copy">
        <small class="pulse-ticker-eyebrow">${weightWord}<span>${escapeHtml(category)}</span>${ageMarkup(signal)}</small>
        <span class="pulse-ticker-line-copy"><strong class="pulse-ticker-title">${escapeHtml(title)}</strong><span class="pulse-ticker-value">${escapeHtml(value)}</span></span>
      </span>
    </a>`;
}

function deltaMarkup(delta) {
  if (!delta) return '';
  const direction = ['up', 'down', 'flat'].includes(delta.dir) ? delta.dir : 'flat';
  const arrow = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '→';
  return `<span class="hot-today-delta hot-today-delta-${direction}"><span aria-hidden="true">${arrow}</span>${escapeHtml(delta.value || '')}</span>`;
}

function shelfWeightLabel(signal) {
  const meta = weightMeta(pulseWeight(signal));
  return meta.word || 'LIVE STATE';
}

function pulseItemSignalId(item) {
  return String(item?.dataset.hotSignalId || item?.dataset.pulseEchoOf || '');
}

function findPulseItem(section, signalId, runName = 'live') {
  const escapedId = escapedSignalId(signalId);
  return runName === 'echo'
    ? section?.querySelector(`[data-pulse-run="echo"] [data-pulse-echo-of="${escapedId}"]`)
    : section?.querySelector(`[data-pulse-run="live"] [data-hot-signal-id="${escapedId}"]`);
}

function renderShelf(signal, anchorItem = null) {
  const section = pulseTickerElement();
  const shelf = section?.querySelector('#pulse-ticker-shelf');
  const liveItem = findPulseItem(section, signal.id, 'live');
  const retainedAnchor = anchorItem?.isConnected && pulseItemSignalId(anchorItem) === signal.id
    ? anchorItem
    : findPulseItem(section, signal.id, heldAnchorRun);
  const item = retainedAnchor || liveItem;
  if (!section || !shelf || !liveItem || !item) return;
  section.querySelectorAll('[data-hot-signal-id][aria-describedby="pulse-ticker-shelf"]').forEach(element => {
    element.removeAttribute('aria-describedby');
  });
  liveItem.setAttribute('aria-describedby', 'pulse-ticker-shelf');
  const route = String(signal.tickerRoute || signal.route || '#pulse');
  const category = String(signal.categoryLabel || signal.category || 'Network');
  const actionLabel = String(signal.actionLabel || signal.title || 'Open live signal');
  const openLabel = /^(?:Open|Enter)\b/i.test(actionLabel) ? actionLabel : `Open ${actionLabel}`;
  const context = signal.context ? `<p class="pulse-ticker-shelf-context">${escapeHtml(signal.context)}</p>` : '';
  const personal = signal.personalRibbon ? `<span class="hot-today-you">${escapeHtml(signal.personalRibbon)}</span>` : '';
  const releaseAction = signal.releaseRadar
    ? `<button class="release-radar-open" type="button" data-quiet-key="pulse-release-action" data-release-radar-open="${escapeHtml(signal.id)}" aria-haspopup="dialog" aria-controls="release-radar-overlay">Full radar <span aria-hidden="true">↗</span></button>`
    : '';
  const shareAction = signal.milestoneStatus === 'crossed'
    ? `<button class="hot-today-milestone-share" type="button" data-hot-milestone-share="${Number(signal.tickerIndex) || 0}" aria-label="${escapeHtml(`Share ${signal.title} milestone`)}"><span aria-hidden="true">↗</span><span>Share</span></button>`
    : '';
  const shelfHtml = `
    <span class="pulse-ticker-shelf-caret" aria-hidden="true"></span>
    <div class="pulse-ticker-shelf-head">
      <span class="pulse-ticker-shelf-weight">${shelfWeightLabel(signal)}</span>
      <span class="pulse-ticker-shelf-category">${escapeHtml(category)}</span>
      ${ageMarkup(signal)}
    </div>
    <div class="pulse-ticker-shelf-title-row">
      <strong class="pulse-ticker-shelf-title">${escapeHtml(signal.releaseRadar ? 'Release Radar' : signal.title)}</strong>
      ${personal}${deltaMarkup(signal.delta)}
    </div>
    <p class="pulse-ticker-shelf-text">${escapeHtml(signal.text)}</p>
    ${context}
    <div class="pulse-ticker-shelf-actions">
      <a class="pulse-ticker-shelf-open" href="${escapeHtml(route)}" data-quiet-key="pulse-primary-action" data-network-route="${escapeHtml(route)}">${escapeHtml(openLabel)} <span aria-hidden="true">↗</span></a>
      ${releaseAction}${shareAction}
    </div>`;
  quietlySyncHtml(shelf, shelfHtml);
  shelf.hidden = false;

  const sectionRect = section.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();
  const center = Math.max(24, Math.min(sectionRect.width - 24, itemRect.left - sectionRect.left + (itemRect.width / 2)));
  section.style.setProperty('--pulse-shelf-caret', `${center}px`);
  const shelfWidth = Math.min(560, Math.max(0, sectionRect.width - 64));
  const shelfLeft = Math.max(0, Math.min(sectionRect.width - 64 - shelfWidth, center - 32 - (shelfWidth / 2)));
  section.style.setProperty('--pulse-shelf-offset', `${shelfLeft}px`);
}

function setHeldSignal(signalId, { position = false, anchorItem = null } = {}) {
  const section = pulseTickerElement();
  const signal = signals.find(candidate => candidate.id === signalId);
  if (!section || !signal) return false;
  if (leaveTimer) {
    window.clearTimeout(leaveTimer);
    leaveTimer = null;
  }
  heldSignalId = signal.id;
  heldAnchorRun = anchorItem?.hasAttribute('data-pulse-echo-of') ? 'echo' : 'live';
  if (position) {
    const track = section.querySelector('[data-pulse-track]');
    const run = track?.querySelector('[data-pulse-run="live"]');
    const item = run?.querySelector(`[data-hot-signal-id="${escapedSignalId(signal.id)}"]`);
    const animation = track?.getAnimations?.()[0];
    const duration = Number(animation?.effect?.getTiming?.().duration);
    const runWidth = run?.getBoundingClientRect().width || 0;
    if (item && animation && Number.isFinite(duration) && duration > 0 && runWidth > 0) {
      const phase = Math.max(0, Math.min(0.999999, (item.offsetLeft - 24) / runWidth));
      animation.currentTime = phase * duration;
      lastPhase = phase;
    }
  }
  coarseHoldScrollY = window.scrollY;
  updateMotionMode();
  renderShelf(signal, anchorItem);
  return true;
}

export function holdPulseTickerSignal(signalId) {
  return setHeldSignal(String(signalId || ''), { position: true });
}

export function releasePulseTicker() {
  const section = pulseTickerElement();
  if (!section) return;
  if (leaveTimer) {
    window.clearTimeout(leaveTimer);
    leaveTimer = null;
  }
  heldSignalId = '';
  heldAnchorRun = 'live';
  section.querySelectorAll('[aria-describedby="pulse-ticker-shelf"]').forEach(element => {
    element.removeAttribute('aria-describedby');
  });
  const shelf = section.querySelector('#pulse-ticker-shelf');
  if (shelf) shelf.hidden = true;
  updateMotionMode();
}

function scheduleRelease() {
  if (leaveTimer) window.clearTimeout(leaveTimer);
  leaveTimer = window.setTimeout(() => {
    leaveTimer = null;
    releasePulseTicker();
  }, POINTER_LEAVE_GRACE_MS);
}

function wireMediaChange(query, handler) {
  if (!query) return;
  if (typeof query.addEventListener === 'function') query.addEventListener('change', handler);
  else query.addListener?.(handler);
}

export function mountPulseTicker() {
  const section = pulseTickerElement();
  if (!section || mounted) return section;
  mounted = true;

  section.addEventListener('pointerover', event => {
    if (!hoverQuery?.matches) return;
    const item = event.target.closest(PULSE_ITEM_SELECTOR);
    if (item && section.contains(item)) setHeldSignal(pulseItemSignalId(item), { anchorItem: item });
  });
  section.addEventListener('pointerout', event => {
    if (!hoverQuery?.matches || !heldSignalId) return;
    if (event.relatedTarget && section.contains(event.relatedTarget)) return;
    scheduleRelease();
  });
  section.addEventListener('pointerover', () => {
    if (leaveTimer) {
      window.clearTimeout(leaveTimer);
      leaveTimer = null;
    }
  });
  section.addEventListener('focusin', event => {
    const item = event.target.closest('[data-hot-signal-id]');
    if (item && section.contains(item)) setHeldSignal(item.dataset.hotSignalId);
  });
  section.addEventListener('focusout', event => {
    if (!heldSignalId || (event.relatedTarget && section.contains(event.relatedTarget))) return;
    scheduleRelease();
  });
  section.addEventListener('keydown', event => {
    if (event.key === 'Escape' && heldSignalId) releasePulseTicker();
  });
  section.addEventListener('click', event => {
    const item = event.target.closest(PULSE_ITEM_SELECTOR);
    if (!item || !section.contains(item)) return;
    const signalId = pulseItemSignalId(item);
    if (heldSignalId === signalId) return;
    event.preventDefault();
    setHeldSignal(signalId, { anchorItem: item });
  });

  window.addEventListener('scroll', () => {
    if (!heldSignalId || hoverQuery?.matches) return;
    if (Math.abs(window.scrollY - coarseHoldScrollY) >= COARSE_SCROLL_RELEASE_PX) releasePulseTicker();
  }, { passive: true });
  document.addEventListener('visibilitychange', updateMotionMode);
  window.addEventListener('tezos:home-layout-change', event => {
    if (event.detail?.id !== 'live-pulse') return;
    if (pulseTickerHidden(section)) releasePulseTicker();
    else updateMotionMode();
  });
  window.addEventListener('tezos:home-layout-preview', updateMotionMode);

  intersectionObserver = new IntersectionObserver(entries => {
    const entry = entries.find(candidate => candidate.target === section);
    if (!entry) return;
    sectionIsIntersecting = entry.isIntersecting;
    if (!sectionIsIntersecting && heldSignalId) releasePulseTicker();
    else updateMotionMode();
  }, { threshold: 0 });
  intersectionObserver.observe(section);

  bodyClassObserver = new MutationObserver(updateMotionMode);
  bodyClassObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  const remeasure = () => {
    if (resizeTimer) window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      resizeTimer = null;
      const track = section.querySelector('[data-pulse-track]');
      const phase = capturePhase(track);
      applyDuration(phase);
      if (heldSignalId) {
        const held = signals.find(signal => signal.id === heldSignalId);
        if (held) renderShelf(held);
      }
    }, RESIZE_DEBOUNCE_MS);
  };
  window.addEventListener('resize', remeasure, { passive: true });
  wireMediaChange(reducedMotionQuery, remeasure);
  wireMediaChange(mobileQuery, remeasure);
  wireMediaChange(hoverQuery, () => {
    if (heldSignalId) coarseHoldScrollY = window.scrollY;
  });
  updateMotionMode();
  return section;
}

export function renderPulseTicker(nextSignals, { hasRendered = false } = {}) {
  const section = pulseTickerElement();
  const viewport = section?.querySelector('#pulse-ticker-viewport');
  if (!section || !viewport || pulseTickerHidden(section)) return;
  mountPulseTicker();
  const cleanSignals = Array.isArray(nextSignals) ? nextSignals.filter(signal => signal?.text) : [];
  if (!cleanSignals.length) return;
  const previousTrack = viewport.querySelector('[data-pulse-track]');
  const phase = capturePhase(previousTrack);
  signals = cleanSignals;
  const liveHtml = signals.map((signal, index) => buildItem(signal, { index })).join('');
  const echoHtml = signals.map((signal, index) => buildItem(signal, { echo: true, index })).join('');
  const tickerHtml = `
    <div class="pulse-ticker-track" data-pulse-track data-quiet-key="pulse-track">
      <div class="pulse-ticker-run" data-pulse-run="live" data-quiet-key="pulse-live">${liveHtml}</div>
      <div class="pulse-ticker-run pulse-ticker-run-echo" data-pulse-run="echo" data-quiet-key="pulse-echo" aria-hidden="true">${echoHtml}</div>
    </div>`;
  if (hasRendered && viewport.childElementCount) quietlySyncHtml(viewport, tickerHtml);
  else viewport.innerHTML = tickerHtml;
  section.hidden = false;
  section.dataset.pulseState = 'ready';
  section.setAttribute('aria-busy', 'false');
  section.setAttribute('aria-live', hasRendered ? 'off' : 'polite');
  applyDuration(phase);
  if (heldSignalId) {
    const held = signals.find(signal => signal.id === heldSignalId);
    if (held) renderShelf(held);
    else releasePulseTicker();
  }
}

export function renderPulseTickerState(state, copy = {}) {
  const section = pulseTickerElement();
  const viewport = section?.querySelector('#pulse-ticker-viewport');
  if (!section || !viewport || pulseTickerHidden(section)) return;
  mountPulseTicker();
  releasePulseTicker();
  signals = [];
  const loading = state === 'loading';
  const glyph = state === 'quiet' ? '○' : '◇';
  const route = String(copy.route || '#pulse');
  const stateHtml = loading
    ? `<div class="pulse-ticker-track" data-pulse-track data-quiet-key="pulse-track"><div class="pulse-ticker-run" data-pulse-run="live" data-quiet-key="pulse-live">${Array.from({ length: 3 }, (_, index) => `<span class="pulse-ticker-item pulse-ticker-item-placeholder" data-quiet-key="pulse-placeholder-${index}" aria-hidden="true"><i></i><b></b><span></span></span>`).join('')}</div></div>`
    : `<div class="pulse-ticker-track" data-pulse-track data-quiet-key="pulse-track"><div class="pulse-ticker-run" data-pulse-run="live" data-quiet-key="pulse-live"><a class="pulse-ticker-item pulse-ticker-item-state" href="${escapeHtml(route)}" data-network-route="${escapeHtml(route)}" data-quiet-key="pulse-state-${escapeHtml(state)}"><span class="pulse-ticker-mark" aria-hidden="true">${glyph}</span><span class="pulse-ticker-copy"><small class="pulse-ticker-eyebrow">${escapeHtml(copy.title || 'Live Pulse')}</small><span class="pulse-ticker-line-copy"><strong class="pulse-ticker-title">${escapeHtml(copy.title || 'Live Pulse')}</strong><span class="pulse-ticker-value">${escapeHtml(copy.text || '')}</span></span></span></a></div></div>`;
  if (viewport.childElementCount) quietlySyncHtml(viewport, stateHtml);
  else viewport.innerHTML = stateHtml;
  section.hidden = false;
  section.dataset.pulseState = state;
  section.dataset.pulseMotion = 'static';
  section.setAttribute('aria-busy', loading ? 'true' : 'false');
  section.setAttribute('aria-live', loading ? 'off' : 'polite');
}
