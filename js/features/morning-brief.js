/**
 * Morning Brief — Daily push notification with personalized Tezos summary
 * 
 * - Browser push notification via service worker
 * - Content: XTZ price delta, rewards, one narrative bullet
 * - Opt-in modal after 2nd visit
 * - Configurable time (default 7:00 AM)
 * - No backend — local scheduling
 */

const KEYS = {
  enabled:    'tezos-systems-morning-brief',
  time:       'tezos-systems-morning-brief-time',
  lastSent:   'tezos-systems-morning-brief-last',
  prompted:   'tezos-systems-morning-brief-prompted',
  visitCount: 'tezos-systems-visit-count',
};

const DEFAULT_HOUR = 7;
const DEFAULT_MIN  = 0;

// ─── Visit counter ───

function bumpVisitCount() {
  const today = new Date().toDateString();
  const stored = JSON.parse(localStorage.getItem(KEYS.visitCount) || '{"count":0,"lastDay":""}');
  if (stored.lastDay !== today) {
    stored.count++;
    stored.lastDay = today;
    localStorage.setItem(KEYS.visitCount, JSON.stringify(stored));
  }
  return stored.count;
}

function shouldPrompt() {
  if (localStorage.getItem(KEYS.prompted)) return false;
  if (localStorage.getItem(KEYS.enabled)) return false;
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'denied') return false;
  return bumpVisitCount() >= 2;
}

// ─── Opt-in Modal ───

function showOptInModal() {
  localStorage.setItem(KEYS.prompted, 'true');

  const overlay = document.createElement('div');
  overlay.id = 'morning-brief-modal';
  const hours = Array.from({length: 24}, (_, i) =>
    '<option value="' + i + '"' + (i === 7 ? ' selected' : '') + '>' + String(i).padStart(2, '0') + '</option>'
  ).join('');

  overlay.innerHTML = '<style>' +
    '#morning-brief-modal{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.7);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;animation:mbFadeIn .3s ease}' +
    '@keyframes mbFadeIn{from{opacity:0}to{opacity:1}}' +
    '.mb-card{background:var(--bg-card,#1a1a2e);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:32px;max-width:380px;width:90%;text-align:center;color:var(--text-primary,#e0e0e0);box-shadow:0 20px 60px rgba(0,0,0,0.5)}' +
    '.mb-card h3{margin:0 0 8px;font-family:Orbitron,monospace;font-size:1.1rem;color:var(--accent,#00d4ff)}' +
    '.mb-card p{font-size:.85rem;opacity:.7;margin:0 0 20px;line-height:1.5}' +
    '.mb-preview{background:rgba(0,0,0,0.3);border-radius:8px;padding:12px;margin:0 0 20px;font-size:.8rem;text-align:left;line-height:1.6;color:var(--text-secondary,#a0a0a0)}' +
    '.mb-preview strong{color:var(--text-primary,#e0e0e0)}' +
    '.mb-btns{display:flex;gap:10px;justify-content:center}' +
    '.mb-btns button{padding:10px 20px;border-radius:8px;border:none;cursor:pointer;font-family:Orbitron,monospace;font-size:.8rem;transition:all .2s}' +
    '.mb-enable{background:var(--accent,#00d4ff);color:#000;font-weight:700}' +
    '.mb-enable:hover{transform:scale(1.05);box-shadow:0 0 15px var(--accent,#00d4ff)}' +
    '.mb-skip{background:rgba(255,255,255,0.1);color:var(--text-secondary,#a0a0a0)}' +
    '.mb-skip:hover{background:rgba(255,255,255,0.15)}' +
    '.mb-time-row{display:flex;align-items:center;justify-content:center;gap:8px;margin:0 0 16px;font-size:.8rem;color:var(--text-secondary)}' +
    '.mb-time-row select{background:rgba(0,0,0,0.3);color:var(--text-primary,#e0e0e0);border:1px solid rgba(255,255,255,0.15);border-radius:6px;padding:4px 8px;font-size:.8rem}' +
    '</style>' +
    '<div class="mb-card">' +
    '<h3>☀️ Morning Brief</h3>' +
    '<p>Get a daily notification with your personalized Tezos summary</p>' +
    '<div class="mb-preview"><strong>Example:</strong><br>' +
    'XTZ $0.41 (+4.2%) · ~2.3 XTZ earned this cycle · Network hit 28% staked</div>' +
    '<div class="mb-time-row"><span>Deliver at</span>' +
    '<select id="mb-hour">' + hours + '</select>' +
    '<span>:</span>' +
    '<select id="mb-min"><option value="0" selected>00</option><option value="15">15</option><option value="30">30</option><option value="45">45</option></select>' +
    '</div>' +
    '<div class="mb-btns">' +
    '<button class="mb-skip" id="mb-skip">Not now</button>' +
    '<button class="mb-enable" id="mb-enable">Enable ☀️</button>' +
    '</div></div>';

  document.body.appendChild(overlay);

  overlay.querySelector('#mb-skip').addEventListener('click', function() { overlay.remove(); });
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#mb-enable').addEventListener('click', async function() {
    var hour = parseInt(overlay.querySelector('#mb-hour').value);
    var min  = parseInt(overlay.querySelector('#mb-min').value);
    var granted = await requestPermission();
    if (granted) {
      localStorage.setItem(KEYS.enabled, 'true');
      localStorage.setItem(KEYS.time, JSON.stringify({ hour: hour, min: min }));
      startScheduler();
      overlay.remove();
    } else {
      overlay.querySelector('.mb-card p').textContent = 'Notifications blocked by browser. Check your settings.';
    }
  });
}

// ─── Permission ───

async function requestPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  var result = await Notification.requestPermission();
  return result === 'granted';
}

// ─── Brief Content Generator ───

function generateBrief() {
  var parts = [];

  // Price
  var priceEl = document.querySelector('.price-value');
  var changeEl = document.querySelector('.price-change');
  if (priceEl) {
    parts.push('XTZ ' + priceEl.textContent.trim() + ' (' + (changeEl ? changeEl.textContent.trim() : '') + ')');
  }

  // Rewards
  var addr = localStorage.getItem('tezos-systems-my-baker-address');
  if (addr) {
    var rewardsCache = localStorage.getItem('tezos-systems-rewards-v2-' + addr);
    if (rewardsCache) {
      try {
        var data = JSON.parse(rewardsCache);
        if (data && data.data && data.data.thisRewards) {
          parts.push('~' + (data.data.thisRewards / 1e6).toFixed(1) + ' XTZ earned this cycle');
        }
      } catch(e) {}
    }
  }

  // Network narrative from briefing
  var briefCache = localStorage.getItem('tezos-systems-briefing-cache');
  if (briefCache) {
    try {
      var brief = JSON.parse(briefCache);
      if (brief && brief.bullets && brief.bullets.length) {
        var bullet = brief.bullets[Math.floor(Math.random() * brief.bullets.length)];
        var text = bullet.replace(/<[^>]+>/g, '').replace(/&[^;]+;/g, '').trim();
        if (text.length < 120) parts.push(text);
      }
    } catch(e) {}
  }

  return parts.join(' · ') || 'Your Tezos morning update is ready.';
}

// ─── Scheduler ───

var schedulerInterval = null;

function startScheduler() {
  if (schedulerInterval) return;

  schedulerInterval = setInterval(function() {
    if (localStorage.getItem(KEYS.enabled) !== 'true') return;

    var now = new Date();
    var today = now.toDateString();
    if (localStorage.getItem(KEYS.lastSent) === today) return;

    var timePref = JSON.parse(localStorage.getItem(KEYS.time) || '{"hour":' + DEFAULT_HOUR + ',"min":' + DEFAULT_MIN + '}');

    if (now.getHours() === timePref.hour && now.getMinutes() >= timePref.min) {
      sendBrief();
      localStorage.setItem(KEYS.lastSent, today);
    }
  }, 60000);
}

function sendBrief() {
  if (Notification.permission !== 'granted') return;

  var body = generateBrief();

  if (navigator.serviceWorker && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'MORNING_BRIEF',
      title: '☀️ Tezos Morning Brief',
      body: body,
      url: '/?my-tezos=1'
    });
  } else {
    new Notification('☀️ Tezos Morning Brief', {
      body: body,
      icon: '/favicon-48.png',
      badge: '/favicon-48.png',
      tag: 'morning-brief',
      data: { url: '/?my-tezos=1' }
    });
  }
}

// ─── Settings toggle in gear dropdown ───

function injectSettingsButton() {
  var dropdown = document.getElementById('settings-dropdown');
  if (!dropdown) return;

  var enabled = localStorage.getItem(KEYS.enabled) === 'true';
  var btn = document.createElement('button');
  btn.id = 'morning-brief-toggle';
  btn.className = 'glass-button';
  btn.setAttribute('aria-label', 'Toggle Morning Brief');
  btn.title = 'Morning Brief: ' + (enabled ? 'ON' : 'OFF');
  btn.innerHTML = '<span>☀️</span> <span class="dropdown-label">Morning Brief</span>' +
    '<span class="dropdown-hint">Daily push notification summary</span>';

  if (enabled) btn.classList.add('active');

  btn.addEventListener('click', async function() {
    var isOn = localStorage.getItem(KEYS.enabled) === 'true';
    if (isOn) {
      localStorage.removeItem(KEYS.enabled);
      btn.classList.remove('active');
      btn.title = 'Morning Brief: OFF';
      if (schedulerInterval) { clearInterval(schedulerInterval); schedulerInterval = null; }
    } else {
      var granted = await requestPermission();
      if (granted) {
        localStorage.setItem(KEYS.enabled, 'true');
        btn.classList.add('active');
        btn.title = 'Morning Brief: ON';
        startScheduler();
      }
    }
  });

  var changelog = document.getElementById('changelog-btn');
  if (changelog) {
    dropdown.insertBefore(btn, changelog);
  } else {
    dropdown.appendChild(btn);
  }
}

// ─── Init ───

export function initMorningBrief() {
  bumpVisitCount();
  injectSettingsButton();

  if (localStorage.getItem(KEYS.enabled) === 'true') {
    startScheduler();
  }

  // Show opt-in after 5s on 2nd+ visit
  setTimeout(function() {
    if (shouldPrompt()) showOptInModal();
  }, 5000);
}
