const $ = id => document.getElementById(id);

const HOST_PIN = '1238';
const HOST_PIN_UNLOCK_KEY = 'barflyHostPinUnlocked';

function isHostUnlocked() {
  return localStorage.getItem(HOST_PIN_UNLOCK_KEY) === 'true';
}

function setHostUnlocked(value) {
  if (value) localStorage.setItem(HOST_PIN_UNLOCK_KEY, 'true');
  else localStorage.removeItem(HOST_PIN_UNLOCK_KEY);
}

function showHostPinOverlay(show = true) {
  const overlay = $('hostPinOverlay');
  if (!overlay) return;
  overlay.classList.toggle('hidden', !show);
  document.body.classList.toggle('hostLocked', show);
  if (show) setTimeout(() => $('hostPinInput')?.focus(), 50);
}

function unlockHostDashboard() {
  const input = $('hostPinInput');
  const msg = $('hostPinMessage');
  const value = String(input?.value || '').trim();
  if (value !== HOST_PIN) {
    if (msg) msg.textContent = 'Incorrect host PIN.';
    if (input) {
      input.value = '';
      input.focus();
    }
    return;
  }
  if (msg) msg.textContent = '';
  setHostUnlocked(true);
  showHostPinOverlay(false);
  startHostDashboard();
  hostNotify('Host dashboard unlocked.');
}

function lockHostDashboard() {
  setHostUnlocked(false);
  showHostPinOverlay(true);
  hostNotify('Host dashboard locked.');
}

function bindHostPinLock() {
  $('hostPinUnlockBtn')?.addEventListener('click', unlockHostDashboard);
  $('hostPinInput')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') unlockHostDashboard();
  });
  $('hostLockBtn')?.addEventListener('click', lockHostDashboard);
}

let hostStarted = false;
function startHostDashboard() {
  if (hostStarted) return;
  hostStarted = true;
  loadAll();
  startPolling();
}


let sessions = [];
let packs = [];
let sockets = new Map();
let pollTimer = null;
let activeHostTab = 'upcoming';

$('createBtn').onclick = createSession;
$('refreshBtn').onclick = async () => { await loadAll(); hostNotify('Host dashboard refreshed.'); };
$('saveDemoCodeBtn').onclick = saveDemoCode;
$('resetDemoBtn').onclick = resetDemoSession;
$('deleteDemoBtn').onclick = deleteDemoSessions;
$('eventType').onchange = syncEventTypeFields;
document.addEventListener('click', event => {
  const tab = event.target?.closest?.('[data-host-tab]');
  if (!tab) return;
  activeHostTab = tab.dataset.hostTab || 'upcoming';
  render();
  hostNotify(`Showing ${tab.textContent.trim()}.`);
});
syncEventTypeFields();

function initializeCreateDefaults() {
  if ($('playerCap') && !$('playerCap').value) $('playerCap').value = '25';
  if ($('eventDurationMinutes') && !$('eventDurationMinutes').value) $('eventDurationMinutes').value = '45';
  if ($('eventStatus') && !$('eventStatus').value) $('eventStatus').value = 'open';
  if ($('eventType') && !$('eventType').value) $('eventType').value = 'paid';
  if ($('allowLateCheckIn') && !$('allowLateCheckIn').value) $('allowLateCheckIn').value = '';
  syncEventTypeFields();
}


function api(path, options = {}) {
  return fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  }).then(async res => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  });
}


function hostNotify(message, type = 'good') {
  const el = $('hostToast');
  if (!el) { alert(message); return; }
  el.textContent = message;
  el.className = `hostToast ${type}`;
  clearTimeout(hostNotify._timer);
  hostNotify._timer = setTimeout(() => el.classList.add('hidden'), 3500);
}

function hostConfirm({ title = 'Confirm Action', message = 'Are you sure?', confirmText = 'Confirm', danger = true } = {}) {
  const overlay = $('hostConfirmOverlay');
  const titleEl = $('hostConfirmTitle');
  const messageEl = $('hostConfirmMessage');
  const cancelBtn = $('hostConfirmCancel');
  const okBtn = $('hostConfirmOk');
  if (!overlay || !titleEl || !messageEl || !cancelBtn || !okBtn) return Promise.resolve(window.confirm(message));
  titleEl.textContent = title;
  messageEl.textContent = message;
  okBtn.textContent = confirmText;
  okBtn.className = danger ? 'danger hostConfirmOk' : 'hostConfirmOk';
  overlay.classList.remove('hidden');
  return new Promise(resolve => {
    const close = value => {
      overlay.classList.add('hidden');
      cancelBtn.removeEventListener('click', onCancel);
      okBtn.removeEventListener('click', onOk);
      overlay.removeEventListener('click', onOverlay);
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onCancel = () => close(false);
    const onOk = () => close(true);
    const onOverlay = event => { if (event.target === overlay) close(false); };
    const onKey = event => { if (event.key === 'Escape') close(false); };
    cancelBtn.addEventListener('click', onCancel);
    okBtn.addEventListener('click', onOk);
    overlay.addEventListener('click', onOverlay);
    document.addEventListener('keydown', onKey);
    setTimeout(() => okBtn.focus(), 0);
  });
}

function resetCreateForm() {
  ['tableName','eventDate','eventTime','sharedAccessCode','venueName','venueLogoUrl'].forEach(id => { if ($(id)) $(id).value = ''; });
  if ($('playerCap')) $('playerCap').value = '25';
  if ($('eventDurationMinutes')) $('eventDurationMinutes').value = '45';
  if ($('eventStatus')) $('eventStatus').value = 'open';
  if ($('truthPackSelect')) $('truthPackSelect').value = '';
  if ($('eventType')) $('eventType').value = 'paid';
  if ($('ticketPrice')) $('ticketPrice').value = '';
  if ($('eventStatus')) $('eventStatus').value = 'open';
  if ($('allowLateCheckIn')) $('allowLateCheckIn').value = '';
  syncEventTypeFields();
}

async function loadAll() {
  const settings = await api('/api/settings').catch(() => ({}));
  if ($('demoAccessCode') && settings.demoAccessCode) $('demoAccessCode').value = settings.demoAccessCode;
  packs = await api('/api/truth-packs');
  $('truthPackSelect').innerHTML = '<option value="">Choose game / difficulty</option>' + packs.map(p => `<option value="${p.id}">${escapeHtml(p.gameTitle || 'Barfly Social Mystery')} — ${escapeHtml(p.levelLabel || p.difficulty || p.title)}</option>`).join('');
  sessions = await api('/api/sessions');
  sessions.forEach(s => connectSocket(s.sessionCode));
  initializeCreateDefaults();
  render();
}

async function saveDemoCode() {
  const demoAccessCode = $('demoAccessCode')?.value || '';
  try {
    const settings = await api('/api/settings/demo-access-code', { method: 'POST', body: { demoAccessCode } });
    if ($('demoAccessCode')) $('demoAccessCode').value = settings.demoAccessCode || '';
    hostNotify('Demo access code saved.');
    await loadAll();
  } catch (err) {
    hostNotify(err.message || 'Could not save demo access code.', 'error');
  }
}


async function resetDemoSession() {
  const ok = await hostConfirm({
    title: 'Reset Demo Session?',
    message: 'Reset Demo Mode now? This removes old demo sessions and creates one clean fresh demo session.',
    confirmText: 'Reset Demo',
    danger: true
  });
  if (!ok) return hostNotify('Demo reset canceled.', 'error');
  try {
    const result = await api('/api/demo/reset', { method: 'POST' });
    hostNotify(`Demo reset complete. Fresh demo session: ${result.demoSessionCode || 'created'}.`);
    await loadAll();
  } catch (err) {
    hostNotify(err.message || 'Could not reset demo session.', 'error');
  }
}

async function deleteDemoSessions() {
  const ok = await hostConfirm({
    title: 'Delete Demo Sessions?',
    message: 'Delete all demo sessions from the dashboard and database? The demo access code will remain active.',
    confirmText: 'Delete Demo Sessions',
    danger: true
  });
  if (!ok) return hostNotify('Demo session delete canceled.', 'error');
  try {
    const result = await api('/api/demo/sessions', { method: 'DELETE' });
    hostNotify(`Deleted ${result.deleted || 0} demo session${Number(result.deleted || 0) === 1 ? '' : 's'}.`);
    await loadAll();
  } catch (err) {
    hostNotify(err.message || 'Could not delete demo sessions.', 'error');
  }
}

async function createSession() {
  const tableName = $('tableName').value.trim();
  const truthPackId = $('truthPackSelect').value;
  const playerCapRaw = $('playerCap')?.value || '';
  const eventDate = $('eventDate')?.value || '';
  const venueName = $('venueName')?.value.trim() || '';
  const venueLogoUrl = $('venueLogoUrl')?.value.trim() || '';
  const eventTime = $('eventTime')?.value || '';
  const durationRaw = $('eventDurationMinutes')?.value || '';
  const eventStatus = $('eventStatus')?.value || '';
  const eventType = $('eventType')?.value || '';
  const ticketPrice = $('ticketPrice')?.value || '';
  const allowLateCheckIn = $('allowLateCheckIn')?.value === 'true';
  const sharedAccessCode = $('sharedAccessCode')?.value || '';
  const scheduledStartAt = 0; // Server calculates scheduled start in America/Chicago.
  const autoStartEnabled = true;
  const missing = [];
  if (!tableName) missing.push('Table / Team Name');
  if (!truthPackId) missing.push('Game / Difficulty');
  if (!playerCapRaw) missing.push('Player Spots / Capacity');
  if (!eventDate) missing.push('Event Date');
  if (!eventTime) missing.push('Event Time');
  if (!durationRaw) missing.push('Duration Minutes');
  if (!eventStatus) missing.push('RSVP Status');
  if (!eventType) missing.push('Event Type');
  if (eventType === 'paid' && !ticketPrice) missing.push('Ticket Price');
  if (missing.length) {
    hostNotify(`Create Session needs: ${missing.join(', ')}.`, 'error');
    return;
  }
  const playerCapNumber = Number(playerCapRaw);
  const durationNumber = Number(durationRaw);
  if (!Number.isFinite(playerCapNumber) || playerCapNumber < 1) {
    hostNotify('Player Spots / Capacity must be at least 1.', 'error');
    return;
  }
  if (!Number.isFinite(durationNumber) || durationNumber < 15) {
    hostNotify('Duration Minutes must be at least 15.', 'error');
    return;
  }
  const playerCap = Math.max(1, Math.min(100, playerCapNumber));
  const eventDurationMinutes = Math.max(15, Math.min(240, durationNumber));
  try {
    const state = await api('/api/sessions', { method: 'POST', body: { tableName, truthPackId, playerCap, eventDate, eventTime, eventDurationMinutes, eventStatus, eventType, ticketPrice, sharedAccessCode, allowLateCheckIn, scheduledStartAt, autoStartEnabled, venueName, venueLogoUrl } });
    upsertSession(state);
    connectSocket(state.sessionCode);
    render();
    resetCreateForm();
    hostNotify(`Session has been created. Join code: ${state.sessionCode}`);
  } catch (err) {
    hostNotify(err.message || 'Could not create session.', 'error');
  }
}

function connectSocket(code) {
  if (sockets.has(code)) return;
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${protocol}://${location.host}?code=${encodeURIComponent(code)}`);
  sockets.set(code, ws);
  ws.onmessage = evt => {
    const msg = JSON.parse(evt.data);
    if (msg.type === 'state') {
      upsertSession(msg.state);
      if (!isHostEditingDashboardSponsorAds()) render();
    }
  };
  ws.onclose = () => {
    sockets.delete(code);
    setTimeout(() => connectSocket(code), 3000);
  };
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      sessions = await api('/api/sessions');
      sessions.forEach(s => connectSocket(s.sessionCode));
      if (!isHostEditingDashboardSponsorAds()) render();
    } catch (_err) {}
  }, 5000);
}

function upsertSession(state) {
  const i = sessions.findIndex(s => s.sessionCode === state.sessionCode);
  if (i >= 0) sessions[i] = { ...sessions[i], ...state, accessCodes: state.accessCodes || sessions[i].accessCodes || [] };
  else sessions.unshift(state);
}

function fmt(sec) {
  sec = Math.max(0, Number(sec || 0));
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function phaseLabel(phase) {
  return ({ lobby: 'Lobby', briefing: 'Briefing', investigation: 'Investigation', accusation: 'Accusation Open', accusation_locked: 'Accusation Locked', revealed: 'Revealed' })[phase] || phase;
}
function instagramText(value) {
  return value ? escapeHtml(value) : '<span class="muted">Not provided</span>';
}

function fullPlayerName(item) {
  const first = item.firstName || '';
  const last = item.lastName || '';
  const full = `${first} ${last}`.trim();
  return full || item.fullName || item.playerName || item.name || 'Detective';
}


function setDefaultEventDateTime() {
  const dateEl = $('eventDate');
  const timeEl = $('eventTime');
  if (dateEl && !dateEl.value) {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    dateEl.value = d.toISOString().slice(0, 10);
  }
  if (timeEl && !timeEl.value) timeEl.value = '19:00';
}

function eventLine(s) {
  const date = s.eventDateLabel || s.dateLabel || 'Date TBD';
  const time = s.eventTimeLabel || s.timeLabel || 'Time TBD';
  return `${date} · ${time}`;
}
function sessionTimeValue(s) {
  const raw = s.eventTimestamp || 0;
  const n = Number(raw || 0);
  return Number.isFinite(n) ? n : 0;
}
function sessionBucket(s) {
  if (s.status === 'revealed' || s.revealed || s.eventStatus === 'closed' || s.eventStatus === 'completed') return 'completed';
  if (['briefing','started'].includes(s.status) || ['briefing','investigation','accusation','accusation_locked'].includes(s.phase)) return 'live';
  return 'upcoming';
}
function sessionsForTab() {
  const sorted = [...sessions].sort((a,b) => sessionTimeValue(a) - sessionTimeValue(b));
  const upcoming = sorted.filter(s => sessionBucket(s) === 'upcoming');
  const live = sorted.filter(s => sessionBucket(s) === 'live');
  const completed = sorted.filter(s => sessionBucket(s) === 'completed').sort((a,b) => sessionTimeValue(b) - sessionTimeValue(a));
  const counts = { upcoming: upcoming.length, live: live.length, completed: completed.length };
  if ($('upcomingCount')) $('upcomingCount').textContent = `Upcoming ${counts.upcoming}`;
  if ($('liveCount')) $('liveCount').textContent = `Live ${counts.live}`;
  if ($('completedCount')) $('completedCount').textContent = `Completed ${counts.completed}`;
  document.querySelectorAll('[data-host-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.hostTab === activeHostTab));
  if (activeHostTab === 'all') return [...upcoming, ...live, ...completed];
  if (activeHostTab === 'live') return live;
  if (activeHostTab === 'completed') return completed;
  return upcoming;
}
function hostPrimaryAction(s) {
  if (s.status === 'lobby') return `<button class="good" onclick="startTable('${s.sessionCode}')">Start Briefing Now</button>`;
  if (s.status === 'briefing') return `<button class="good" onclick="skipBriefing('${s.sessionCode}')">Skip Briefing</button>`;
  if (s.status === 'started') return `<button class="danger" onclick="revealCase('${s.sessionCode}')">Trigger Reveal</button>`;
  if (s.status === 'revealed') return `<button class="secondary" onclick="resetTable('${s.sessionCode}')">Reset for Next Group</button>`;
  return `<button class="secondary" onclick="startTable('${s.sessionCode}')">Start Briefing Now</button>`;
}
function syncEventTypeFields() {
  const type = $('eventType')?.value || '';
  const shared = $('sharedAccessCode');
  const price = $('ticketPrice');
  if (shared) {
    shared.disabled = type !== 'free';
    shared.placeholder = type === 'free' ? 'Auto-generate if blank' : 'Used for free events only';
  }
  if (price) {
    price.disabled = type !== 'paid';
    price.placeholder = type === 'paid' ? 'Example: 10.00' : 'Free events do not need a price';
    if (type !== 'paid') price.value = '';
  }
}

function createLocalScheduledStartAt(eventDate, eventTime) {
  if (!eventDate || !eventTime) return 0;
  const ms = new Date(`${eventDate}T${eventTime}:00`).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function eventTypeLabel(s) {
  if ((s.eventType || 'paid') === 'free') return 'Free Event';
  return s.ticketPrice ? `Paid Event · $${s.ticketPrice}` : 'Paid Event';
}

function render() {
  const visible = sessionsForTab();
  const empty = activeHostTab === 'live' ? 'No live games right now.' : activeHostTab === 'completed' ? 'No completed games yet.' : activeHostTab === 'all' ? 'No table sessions yet.' : 'No upcoming games yet.';
  $('tables').innerHTML = visible.length ? visible.map(tableHtml).join('') : `<p class="muted">${empty}</p>`;
}

function resultHtml(results = []) {
  if (!results.length) return '<p class="muted">No graded results yet.</p>';
  return results.slice(0, 6).map(r => `<div class="feedItem"><div class="time">${escapeHtml(r.badge)}</div><h4>${escapeHtml(r.playerName)}</h4><p><b>Score:</b> ${r.score}/${r.total}</p></div>`).join('');
}

function submissionHtml(submissions = [], accusation) {
  const questions = accusation?.questions || [];
  if (!submissions.length) return '<p class="muted">No submissions yet.</p>';
  return submissions.slice(0, 4).map(sub => {
    const lines = questions.map(q => {
      const option = (q.options || []).find(opt => opt.id === sub.answers?.[q.id]);
      return `<b>${escapeHtml(q.prompt)}</b><br>${escapeHtml(option?.label || 'No answer')}`;
    }).join('<br><br>');
    return `<div class="feedItem"><div class="time">${new Date(sub.createdAt).toLocaleTimeString()}</div><h4>${escapeHtml(sub.playerName)}</h4><p>${lines}</p></div>`;
  }).join('');
}



function rsvpHtml(s) {
  const rsvps = s.rsvps || [];
  if (!rsvps.length) return '<p class="muted">No RSVPs yet. Players can RSVP from the public player page without the host dashboard being open.</p>';
  const rows = rsvps.map(item => {
    const code = item.accessCode || '';
    const checked = item.checkedIn ? 'Checked In' : 'Not Checked In';
    const checkedClass = item.checkedIn ? 'pill good' : 'pill';
    const isFree = (s.eventType || 'paid') === 'free';
    const paidText = isFree ? 'Free' : (item.paid ? 'Paid' : 'Unpaid');
    const codeCell = isFree
      ? `<button class="secondary codeButton" onclick="copyText('${escapeHtml(s.sharedAccessCode || code || '')}')">${escapeHtml(s.sharedAccessCode || code || 'Shared Code')}</button>`
      : (item.paid && code ? `<button class="secondary codeButton" onclick="copyText('${escapeHtml(code)}')">${escapeHtml(code)}</button>` : '<span class="muted">Hidden until paid</span>');
    const paidCell = isFree ? '<span class="pill good">Free</span>' : `<button class="secondary compact" onclick="toggleRsvpPaid('${s.sessionCode}','${escapeHtml(item.id)}',${item.paid ? 'false' : 'true'})">${item.paid ? 'Paid / Activated' : 'Mark Paid / Activate Code'}</button>`;
    const actionCell = isFree ? '<span class="muted">Shared code</span>' : (item.paid && code ? `<button class="secondary compact" onclick="copyText('${escapeHtml(code)}')">Copy Code</button>` : `<button class="secondary compact" onclick="assignRsvpCode('${s.sessionCode}','${escapeHtml(item.id)}')">Mark Paid / Activate Code</button>`);
    const checkInCell = `<button class="${item.checkedIn ? 'secondary' : 'good'} compact" onclick="manualRsvpCheckIn('${s.sessionCode}','${escapeHtml(item.id)}',${item.checkedIn ? 'false' : 'true'})">${item.checkedIn ? 'Undo Check-In' : 'Check In'}</button>`;
    const deleteCell = `<button class="danger compact" onclick="deleteRsvp('${s.sessionCode}','${escapeHtml(item.id)}')">Delete RSVP</button>`;
    return `<tr>
      <td>${escapeHtml(item.firstName || '—')}</td>
      <td>${instagramText(item.instagram || item.socialMedia || '')}</td>
      <td>${escapeHtml(item.contact || '—')}</td>
      <td><span class="${checkedClass}">${escapeHtml(checked)}</span></td>
      <td>${codeCell}</td>
      <td>${paidCell}</td>
      <td>${checkInCell}</td>
      <td>${actionCell}</td>
      <td>${deleteCell}</td>
    </tr>`;
  }).join('');
  return `<div class="tableScroll"><table class="codeTable"><thead><tr><th>First</th><th>Social</th><th>Phone</th><th>Status</th><th>Code</th><th>Payment</th><th>Host Check-In</th><th>Code Action</th><th>Delete</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function accessCodeHtml(s) {
  if ((s.eventType || 'paid') === 'free') {
    return `<div class="feedItem"><div class="time">Free Event</div><h4>Shared Access Code</h4><p><button class="secondary codeButton" onclick="copyText('${escapeHtml(s.sharedAccessCode || '')}')">${escapeHtml(s.sharedAccessCode || 'Not Set')}</button></p><p class="mini">Everyone uses this same code. Capacity is still limited by the player spots for this session.</p></div>`;
  }
  const codes = s.accessCodes || [];
  if (!codes.length) return '<p class="muted">No access codes generated for this session.</p>';
  const rows = codes.map(item => {
    const status = item.claimed ? 'Claimed' : 'Unused';
    const paidText = item.paid ? 'Paid' : 'Unpaid';
    const firstName = item.firstName || '';
    const lastName = item.lastName || '';
    return `<tr>
      <td><button class="secondary codeButton" onclick="copyText('${escapeHtml(item.code)}')">${escapeHtml(item.code)}</button></td>
      <td>${escapeHtml(status)}</td>
      <td>${escapeHtml(firstName || '—')}</td>
      <td>${escapeHtml(lastName || '—')}</td>
      <td>${instagramText(item.instagram || '')}</td>
      <td><button class="secondary compact" onclick="togglePaid('${s.sessionCode}','${escapeHtml(item.code)}',${item.paid ? 'false' : 'true'})">${paidText}</button></td>
    </tr>`;
  }).join('');
  return `<div class="codeTools"><button class="secondary" onclick="copyAllCodes('${s.sessionCode}')">Copy All Codes</button></div><div class="tableScroll"><table class="codeTable"><thead><tr><th>Access Code</th><th>Status</th><th>First</th><th>Last</th><th>Instagram</th><th>Paid</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}




function isHostEditingDashboardSponsorAds() {
  const active = document.activeElement;
  return Boolean(active && active.id && active.id.startsWith('dashAd'));
}

function dashboardSponsorAdHtml(s) {
  const ads = s.dashboardSponsorAds || {};
  const slots = [
    ['round_1', 'Round 1'],
    ['round_2', 'Round 2'],
    ['round_3', 'Round 3'],
    ['round_4', 'Round 4'],
    ['round_5', 'Round 5'],
    ['final', 'Final / Case Closed']
  ];
  return `<div class="dashboardAdManagerBox">
    <p class="mini">Static sponsor strips appear under the player’s Detective Dashboard. Keep copy short so the logo and coupon fit without forcing scroll.</p>
    <div class="dashboardAdSlots">
      ${slots.map(([slot,label]) => {
        const ad = ads[slot] || {};
        return `<div class="dashboardAdSlot">
          <h4>${label} Sponsor Strip</h4>
          <label>Logo URL</label>
          <input id="dashAdLogo-${s.sessionCode}-${slot}" value="${escapeHtml(ad.logoUrl || '')}" placeholder="https://example.com/logo.png" />
          <label>Title</label>
          <input id="dashAdTitle-${s.sessionCode}-${slot}" value="${escapeHtml(ad.title || '')}" placeholder="Tonight’s Special" />
          <label>Message</label>
          <input id="dashAdMessage-${s.sessionCode}-${slot}" value="${escapeHtml(ad.message || '')}" placeholder="$5 House Margaritas" />
          <label>Coupon / Redeem Text</label>
          <input id="dashAdCoupon-${s.sessionCode}-${slot}" value="${escapeHtml(ad.coupon || '')}" placeholder="Show this screen to redeem." />
        </div>`;
      }).join('')}
    </div>
    <div class="actions compactButtons" style="margin-top:10px">
      <button class="secondary" onclick="saveDashboardAds('${s.sessionCode}')">Save Dashboard Sponsor Strips</button>
    </div>
  </div>`;
}

function hostSummaryPanel(s) {
  const submitted = Array.isArray(s.submissions) ? s.submissions.length : 0;
  const results = Array.isArray(s.results) ? s.results.length : 0;
  const checkedIn = Number(s.rsvp?.checkedIn || s.players?.length || 0);
  return `<div class="card compactHostSummary" style="box-shadow:none">
    <h3>Final Status</h3>
    <div class="statusPills">
      <span class="pill">Submitted ${submitted}/${checkedIn}</span>
      <span class="pill">Graded ${results}</span>
      <span class="pill">${s.revealed ? 'Revealed' : 'Not Revealed'}</span>
    </div>
    <p class="mini">Detailed player results stay on the player side. The host only sees a compact progress summary here.</p>
  </div>`;
}

function sponsorAdHtml(s) {
  const ads = s.sponsorAds || [];
  const options = [
    ['waiting_room', 'Waiting Room / Before Briefing'],
    ['after_round_2', 'After Round 2 Deduction'],
    ['after_round_4', 'After Round 4 Deduction'],
    ['before_final', 'Before Final Accusation'],
    ['case_closed', 'Case Closed Screen']
  ];
  const optionHtml = options.map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
  const rows = ads.length ? ads.map(ad => `<tr>
    <td>${escapeHtml(ad.title)}</td>
    <td>${escapeHtml(options.find(o => o[0] === ad.timing)?.[1] || ad.timing)}</td>
    <td>${ad.enabled ? '<span class="pill good">Enabled</span>' : '<span class="pill">Disabled</span>'}</td>
    <td class="compactButtons">
      <button class="secondary compact" onclick="toggleSponsorAd('${s.sessionCode}','${escapeHtml(ad.id)}',${ad.enabled ? 'false' : 'true'})">${ad.enabled ? 'Disable' : 'Enable'}</button>
      <button class="danger compact" onclick="deleteSponsorAd('${s.sessionCode}','${escapeHtml(ad.id)}')">Delete</button>
    </td>
  </tr>`).join('') : '<tr><td colspan="4"><span class="muted">No sponsor popups yet.</span></td></tr>';
  return `<div class="adManagerBox">
    <p class="mini">Automated sponsor popups appear at natural breaks and are dismissible. They will not interrupt active deduction answering.</p>
    <div class="row">
      <div><label>Ad Title</label><input id="adTitle-${s.sessionCode}" placeholder="Tonight’s Sponsor" /></div>
      <div><label>Ad Timing</label><select id="adTiming-${s.sessionCode}">${optionHtml}</select></div>
    </div>
    <label>Ad Message</label>
    <textarea id="adMessage-${s.sessionCode}" rows="3" placeholder="Try tonight’s food or drink special at the bar."></textarea>
    <div class="actions compactButtons" style="margin-top:10px">
      <button class="secondary" onclick="addSponsorAd('${s.sessionCode}')">Add Sponsor Popup</button>
    </div>
    <div class="tableScroll" style="margin-top:12px"><table class="codeTable"><thead><tr><th>Title</th><th>Timing</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div>
  </div>`;
}


function checkInHtml(s) {
  const link = `${location.origin}/checkin/?session=${encodeURIComponent(s.sessionCode)}`;
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=10&data=${encodeURIComponent(link)}`;
  return `<div class="checkinBox">
    <div>
      <h4>Venue Check-In QR</h4>
      <p class="mini">Post this QR code at the event. Players scan it, enter their name and access code, and are marked Checked In on the RSVP list. This does not start the game.</p>
      <input readonly value="${escapeHtml(link)}" onclick="this.select();navigator.clipboard?.writeText(this.value)" />
      <div class="actions compactButtons" style="margin-top:10px">
        <button class="secondary" onclick="copyText('${escapeHtml(link)}')">Copy Check-In Link</button>
        <button class="secondary" onclick="openCheckInPage('${escapeHtml(link)}')">Open Check-In Page</button>
      </div>
    </div>
    <div class="qrCodeBox smallQr"><img src="${qr}" alt="Check-in QR code for ${escapeHtml(s.tableName)}" /></div>
  </div>`;
}

function tableHtml(s) {
  const playerList = s.players.length ? `<div class="detectiveChipRow">${s.players.map(p => `<span class="pill detectiveChip ${p.connected ? 'good' : ''}">${escapeHtml(fullPlayerName(p))}${p.instagram ? ` · ${escapeHtml(p.instagram)}` : ''} ${p.connected ? '●' : '○'}</span>`).join('')}</div>` : '<span class="muted">No players connected.</span>';
  const playerUrl = `${location.origin}/player/`;
  const roundHtml = (s.rounds || []).map(r => {
    const cls = s.currentRound?.id === r.id ? 'roundNode active' : (s.elapsedSec >= r.endSec ? 'roundNode done' : 'roundNode');
    return `<div class="${cls}"><b>${escapeHtml(r.shortTitle || r.title)}</b><small>${fmt(r.startSec)} - ${fmt(r.endSec)}</small></div>`;
  }).join('');
  const currentScript = s.currentRound?.dialogue || 'Start the game to begin the hosted narration flow.';
  const openingScript = s.openingNarration || 'No opening narration loaded.';
  const revealScript = s.revealScript || 'No reveal script loaded.';
  return `
    <article class="tableCard">
      <div class="row">
        <div>
          <h3>${escapeHtml(eventLine(s))} — ${escapeHtml(s.tableName)} · ${escapeHtml(s.sessionCode)}</h3>
          <p class="mini">${escapeHtml(s.truthPackTitle)} · ${escapeHtml(s.difficultyLabel || s.difficulty || '')} · ${escapeHtml(eventLine(s))} · ${escapeHtml(eventTypeLabel(s))} · Detective Mode · Unified Evidence</p>
        </div>
        <div class="statusPills">
          <span class="pill">${phaseLabel(s.phase)}</span>
          <span class="pill">${sessionBucket(s) === 'upcoming' ? 'RSVP Visible' : sessionBucket(s) === 'live' ? 'RSVP Hidden' : 'Completed'}</span>
          <span class="pill">${s.currentRound ? escapeHtml(s.currentRound.title) : 'No Round Yet'}</span>
          <span class="pill good">Left ${fmt(s.remainingSec)}</span>
          <span class="pill">Elapsed ${fmt(s.elapsedSec)}</span>
          <span class="pill">${s.players.length} Detectives</span>
          <span class="pill">${escapeHtml(eventTypeLabel(s))}</span>
          <span class="pill">Codes ${s.access?.used || 0}/${s.access?.playerCap || s.playerCap || 25}</span>
          <span class="pill">RSVP ${s.rsvp?.total || 0}</span>
          <span class="pill">Late Check-In ${s.allowLateCheckIn ? 'On' : 'Off'}</span>
          <span class="pill">Auto-Start ${s.autoStartEnabled === false ? 'Off' : 'Scheduled'}</span>
        </div>
      </div>
      <label>Player Join URL</label>
      <input readonly value="${playerUrl}" onclick="this.select();navigator.clipboard?.writeText(this.value)" />
      <div class="hostPrimaryAction">${hostPrimaryAction(s)}</div>
      <p class="mini">Auto-start uses the scheduled server/session time${s.scheduledStartLabel ? `: <b>${escapeHtml(s.scheduledStartLabel)}</b>` : ''}. The manual button is only a backup and does not require every player to be connected.</p>
      <div class="actions" style="margin-top:12px">
        <button class="good" onclick="startTable('${s.sessionCode}')">Start Briefing Now</button>
        <button class="good" onclick="skipBriefing('${s.sessionCode}')">Skip Briefing</button>
        <button class="secondary" onclick="sendOpeningNarration('${s.sessionCode}')">Opening Popup</button>
        <button class="secondary" onclick="sendRoundDialogue('${s.sessionCode}')">Round Popup</button>
        <button class="secondary" onclick="sendHostMessage('${s.sessionCode}')">Custom Popup</button>
        <button class="danger" onclick="revealCase('${s.sessionCode}')">Reveal Case</button>
        <button class="secondary" onclick="resetTable('${s.sessionCode}')">Reset Session</button>
        <button class="danger" onclick="deleteSession('${s.sessionCode}')">Delete Session</button>
      </div>
      <div class="card" style="box-shadow:none"><h3>Check-In QR</h3>${checkInHtml(s)}<p class="mini">Late check-in after start is <b>${s.allowLateCheckIn ? 'allowed' : 'closed'}</b> for this session.</p></div>
      <div class="card" style="box-shadow:none">
        <h3>Testing Controls</h3>
        <div class="actions compactButtons">
          <button class="secondary" onclick="jumpToRound('${s.sessionCode}', 1)">Body</button>
          <button class="secondary" onclick="jumpToRound('${s.sessionCode}', 2)">Timeline</button>
          <button class="secondary" onclick="jumpToRound('${s.sessionCode}', 3)">Digital</button>
          <button class="secondary" onclick="jumpToRound('${s.sessionCode}', 4)">Money</button>
          <button class="secondary" onclick="jumpToRound('${s.sessionCode}', 5)">Cover-Up</button>
          <button class="secondary" onclick="jumpToRound('${s.sessionCode}', 6)">Final</button>
          <button class="secondary" onclick="shiftTime('${s.sessionCode}', -60)">-1m</button>
          <button class="secondary" onclick="shiftTime('${s.sessionCode}', 60)">+1m</button>
          <button class="secondary" onclick="shiftTime('${s.sessionCode}', 300)">+5m</button>
        </div>
      </div>
      <div class="card connectedDetectivesCard" style="box-shadow:none">
        <h3>Connected Detectives</h3>
        ${playerList}
      </div>
      <div class="card" style="box-shadow:none"><h3>Dashboard Sponsor Strips</h3>${dashboardSponsorAdHtml(s)}</div>
      <div class="card" style="box-shadow:none"><h3>RSVP List</h3><p class="mini">Each RSVP equals one player spot. Paid event codes stay hidden until the host marks the RSVP paid/activated.</p>${rsvpHtml(s)}</div>
      <div class="card" style="box-shadow:none"><h3>${(s.eventType || 'paid') === 'free' ? 'Free Event Shared Access Code' : 'Paid Player Access Codes'}</h3><p class="mini">${(s.eventType || 'paid') === 'free' ? 'Everyone uses the same code for this free session.' : 'Give one unique code to each paid player. Each code can be claimed once.'}</p>${accessCodeHtml(s)}</div>
      ${hostSummaryPanel(s)}
    </article>`;
}


window.saveDashboardAds = async code => {
  const slots = ['round_1','round_2','round_3','round_4','round_5','final'];
  const ads = {};
  slots.forEach(slot => {
    const logoUrl = $(`dashAdLogo-${code}-${slot}`)?.value.trim() || '';
    const title = $(`dashAdTitle-${code}-${slot}`)?.value.trim() || '';
    const message = $(`dashAdMessage-${code}-${slot}`)?.value.trim() || '';
    const coupon = $(`dashAdCoupon-${code}-${slot}`)?.value.trim() || '';
    if (logoUrl || title || message || coupon) ads[slot] = { logoUrl, title, message, coupon, enabled: true };
  });
  try {
    if (document.activeElement && document.activeElement.id && document.activeElement.id.startsWith('dashAd')) {
      document.activeElement.blur();
    }
    const state = await api(`/api/sessions/${code}/dashboard-ads`, { method: 'POST', body: { ads } });
    upsertSession(state);
    render();
    hostNotify('Dashboard sponsor strips saved.');
  } catch (err) {
    hostNotify(err.message || 'Could not save dashboard sponsor strips.', 'error');
  }
};

window.startTable = async code => {
  try {
    const state = await api(`/api/sessions/${code}/start`, { method: 'POST' });
    upsertSession(state);
    render();
    hostNotify('Briefing has started. Players move forward automatically without a popup.');
  } catch (err) { hostNotify(err.message || 'Could not start game.', 'error'); }
};

window.skipBriefing = async code => {
  try {
    const state = await api(`/api/sessions/${code}/skip-briefing`, { method: 'POST' });
    upsertSession(state);
    render();
    hostNotify('Briefing skipped. Players are now in the investigation.');
  } catch (err) { hostNotify(err.message || 'Could not skip briefing.', 'error'); }
};
window.resetTable = async code => {
  const ok = await hostConfirm({
    title: 'Reset Session?',
    message: 'Reset this session? This clears players, answers, messages, results, timer state, and activity.',
    confirmText: 'Reset Session',
    danger: true
  });
  if (!ok) return hostNotify('Session reset canceled.', 'error');
  try {
    const state = await api(`/api/sessions/${code}/reset`, { method: 'POST' });
    upsertSession(state);
    render();
    hostNotify('Session has been reset.');
  }
  catch (err) { hostNotify(err.message || 'Could not reset session.', 'error'); }
};
window.deleteSession = async code => {
  const session = sessions.find(s => s.sessionCode === code);
  const label = session ? `${session.tableName || session.gameTitle || 'this session'} (${code})` : code;
  const ok = await hostConfirm({
    title: 'Delete Session?',
    message: `Delete ${label} permanently? This removes the join code, players, RSVPs, answers, results, sponsor popups, and saved activity.`,
    confirmText: 'Delete Session',
    danger: true
  });
  if (!ok) return hostNotify('Session delete canceled.', 'error');
  try {
    const result = await api(`/api/sessions/${code}`, { method: 'DELETE' });
    sessions = sessions.filter(s => s.sessionCode !== code);
    render();
    hostNotify(`Session ${result.deleted || code} deleted.`);
    await loadAll();
  } catch (err) {
    await loadAll().catch(() => {});
    hostNotify(err.message || 'Could not delete session.', 'error');
  }
};
window.revealCase = async code => {
  const ok = await hostConfirm({
    title: 'Reveal Case?',
    message: 'Trigger the case reveal/results now for this session?',
    confirmText: 'Reveal Case',
    danger: true
  });
  if (!ok) return hostNotify('Reveal canceled.', 'error');
  try {
    const state = await api(`/api/sessions/${code}/reveal`, { method: 'POST' });
    upsertSession(state);
    render();
    hostNotify('Reveal has been triggered.');
  } catch (err) { hostNotify(err.message || 'Could not reveal case.', 'error'); }
};
window.sendHostMessage = async code => {
  const text = prompt('Host dialogue popup text:');
  if (!text) return hostNotify('Custom popup canceled.', 'error');
  const title = prompt('Popup title:', 'Host Update');
  try {
    await api(`/api/sessions/${code}/message`, { method: 'POST', body: { title: title || 'Host Update', text, kind: 'dialog' } });
    hostNotify('Host popup sent.');
  } catch (err) { hostNotify(err.message || 'Could not send host popup.', 'error'); }
};
window.sendRoundDialogue = async code => {
  const session = sessions.find(s => s.sessionCode === code);
  if (!session?.currentRound) return hostNotify('No active round is available yet. Start the game first.', 'error');
  try {
    await api(`/api/sessions/${code}/message`, {
      method: 'POST',
      body: { title: session.currentRound.title, text: session.currentRound.dialogue || session.currentRound.objective || 'Review the newly unlocked evidence.', kind: 'dialog' }
    });
    hostNotify('Round popup sent.');
  } catch (err) { hostNotify(err.message || 'Could not send round popup.', 'error'); }
};
window.sendOpeningNarration = async code => {
  const session = sessions.find(s => s.sessionCode === code);
  try {
    await api(`/api/sessions/${code}/message`, {
      method: 'POST',
      body: { title: 'Opening Briefing', text: session?.openingNarration || 'Detectives, the case is beginning.', kind: 'opening' }
    });
    hostNotify('Opening popup sent.');
  } catch (err) { hostNotify(err.message || 'Could not send opening popup.', 'error'); }
};
window.jumpToRound = async (code, n) => {
  const session = sessions.find(s => s.sessionCode === code);
  const round = session?.rounds?.[n - 1];
  if (!round) return hostNotify('Round not available.', 'error');
  try {
    await api(`/api/sessions/${code}/set-elapsed`, { method: 'POST', body: { elapsedSec: round.startSec, pushRoundPopup: true } });
    hostNotify(`Jumped to ${round.title}.`);
  } catch (err) { hostNotify(err.message || 'Could not jump to round.', 'error'); }
};
window.shiftTime = async (code, delta) => {
  const session = sessions.find(s => s.sessionCode === code);
  if (!session) return hostNotify('Session not found.', 'error');
  const elapsed = Math.max(0, Math.min(session.totalSec, Number(session.elapsedSec || 0) + Number(delta || 0)));
  try {
    await api(`/api/sessions/${code}/set-elapsed`, { method: 'POST', body: { elapsedSec: elapsed } });
    hostNotify('Game time updated.');
  } catch (err) { hostNotify(err.message || 'Could not update game time.', 'error'); }
};


window.addSponsorAd = async code => {
  const title = document.getElementById(`adTitle-${code}`)?.value || 'Sponsor Break';
  const message = document.getElementById(`adMessage-${code}`)?.value || '';
  const timing = document.getElementById(`adTiming-${code}`)?.value || 'after_round_2';
  if (!message.trim()) return hostNotify('Enter an ad message first.', 'error');
  try {
    const state = await api(`/api/sessions/${code}/ads`, { method: 'POST', body: { title, message, timing, enabled: true } });
    upsertSession(state);
    render();
    hostNotify('Sponsor popup has been added.');
  } catch (err) { hostNotify(err.message || 'Could not add sponsor popup.', 'error'); }
};

window.toggleSponsorAd = async (code, adId, enabled) => {
  try {
    const state = await api(`/api/sessions/${code}/ads/${adId}/toggle`, { method: 'POST', body: { enabled } });
    upsertSession(state);
    render();
    hostNotify(enabled ? 'Sponsor popup enabled.' : 'Sponsor popup disabled.');
  } catch (err) { hostNotify(err.message || 'Could not update sponsor popup.', 'error'); }
};

window.deleteSponsorAd = async (code, adId) => {
  const ok = await hostConfirm({
    title: 'Delete Sponsor Popup?',
    message: 'Delete this sponsor popup from the session?',
    confirmText: 'Delete Sponsor Popup',
    danger: true
  });
  if (!ok) return hostNotify('Sponsor popup delete canceled.', 'error');
  try {
    const state = await api(`/api/sessions/${code}/ads/${adId}`, { method: 'DELETE' });
    upsertSession(state);
    render();
    hostNotify('Sponsor popup has been deleted.');
  } catch (err) { hostNotify(err.message || 'Could not delete sponsor popup.', 'error'); }
};



window.openCheckInPage = link => {
  window.open(link, '_blank');
  hostNotify('Check-in page opened.');
};

window.copyText = async text => {
  try { await navigator.clipboard.writeText(text); hostNotify('Code copied.'); } catch (_err) { hostNotify('Copy failed. Select and copy the code manually.', 'error'); }
};
window.copyAllCodes = async code => {
  const session = sessions.find(s => s.sessionCode === code);
  const lines = (session?.accessCodes || []).map(item => `${item.code}${item.paid ? ' - Paid' : ' - Unpaid'}${item.claimed ? ` - ${fullPlayerName(item)}${item.instagram ? ` - ${item.instagram}` : ''}` : ''}`);
  try { await navigator.clipboard.writeText(lines.join('\n')); hostNotify('Access codes copied.'); } catch (_err) { hostNotify('Copy failed. Select and copy the codes manually.', 'error'); }
};
window.togglePaid = async (sessionCode, accessCode, paid) => {
  try {
    const state = await api(`/api/sessions/${sessionCode}/access-codes/${accessCode}/paid`, { method: 'POST', body: { paid } });
    upsertSession(state);
    render();
    hostNotify(paid ? 'Access code marked paid.' : 'Access code marked unpaid.');
  } catch (err) { hostNotify(err.message || 'Could not update access code.', 'error'); }
};


window.toggleRsvpPaid = async (sessionCode, rsvpId, paid) => {
  try {
    const state = await api(`/api/sessions/${sessionCode}/rsvps/${rsvpId}/paid`, { method: 'POST', body: { paid } });
    upsertSession(state);
    render();
    hostNotify(paid ? 'RSVP marked paid.' : 'RSVP marked unpaid.');
  } catch (err) { hostNotify(err.message || 'Could not update RSVP paid status.', 'error'); }
};

window.manualRsvpCheckIn = async (sessionCode, rsvpId, checkedIn) => {
  try {
    const state = await api(`/api/sessions/${sessionCode}/rsvps/${rsvpId}/check-in`, { method: 'POST', body: { checkedIn } });
    upsertSession(state);
    render();
    hostNotify(checkedIn ? 'Player has been checked in.' : 'Check-in has been undone.');
  } catch (err) { hostNotify(err.message || 'Could not update check-in.', 'error'); }
};

window.assignRsvpCode = async (sessionCode, rsvpId) => {
  try {
    const state = await api(`/api/sessions/${sessionCode}/rsvps/${rsvpId}/assign-code`, { method: 'POST', body: {} });
    upsertSession(state);
    render();
    hostNotify('Access code assigned.');
  } catch (err) { hostNotify(err.message || 'Could not assign access code.', 'error'); }
};


window.deleteRsvp = async (sessionCode, rsvpId) => {
  const ok = await hostConfirm({
    title: 'Delete RSVP?',
    message: 'Delete this RSVP? This frees the RSVP spot and unassigns that access code.',
    confirmText: 'Delete RSVP',
    danger: true
  });
  if (!ok) return hostNotify('RSVP delete canceled.', 'error');
  try {
    const state = await api(`/api/sessions/${sessionCode}/rsvps/${rsvpId}`, { method: 'DELETE' });
    upsertSession(state);
    render();
    hostNotify('RSVP has been deleted.');
  } catch (err) { hostNotify(err.message || 'Could not delete RSVP.', 'error'); }
};

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

initializeCreateDefaults();
bindHostPinLock();
if (isHostUnlocked()) { showHostPinOverlay(false); startHostDashboard(); }
else { showHostPinOverlay(true); }
