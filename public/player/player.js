const APP_META = {
  forensics: ['🧪','Forensics'],
  interrogation: ['🎙️','Interrogation'],
  timeline: ['🕒','Timeline'],
  deduction: ['🧠','Deduction']
};
const LEGACY_FORENSIC_APPS = ['phone','messages','maps','bank','photos','social','notes','files','browser','forensics','evidence'];
const INTERROGATION_APP_KEYS = ['contacts','interrogation','witnesses','suspects'];
const TIMELINE_APP_KEYS = ['timeline'];
const $ = id => document.getElementById(id);

let state = null;
let playerId = localStorage.getItem('detectivePlayerId') || '';
let currentApp = null;
let ws = null;
let pollTimer = null;
let previousCounts = {};
let previousHostMessageCount = 0;
let dialogQueue = [];
let dialogOpen = false;
let activeSessionKey = '';
let imageCache = {};
let lastBadgeKey = '';
let answerReviewOpen = false;
let caseLogicOpen = false;
let activeDialogAction = null;
let toastQueue = [];
let toastOpen = false;
let revealAutoHomeTimer = null;
let rsvpSessions = [];
let selectedRsvpSessionCode = '';
let rsvpPreviewSessionCode = '';
const TERMS_STORAGE_KEY = 'barflyMysteryTermsAccepted_v1';
let pendingTermsAction = null;
let pendingTermsOptions = { force: false, persist: true };
let termsAcceptedForCurrentAction = false;
let currentAccessPreviewIsDemo = false;
let currentAccessPreviewCode = '';
let lastStoryBriefingKey = '';
let serverClockOffsetMs = 0;
let lobbyCountdownTimer = null;
let lobbyTutorialAcknowledged = false;
let deductionPopupQuestionId = '';
let deductionPopupDismissed = {};
let deductionPopupSelected = '';
let deductionPopupSelections = {};
let deductionPopupIsSubmitting = false;
let interrogationViewed = {};
const HOST_ISSUE_MAILTO = 'mailto:INFO@BARFLY.SOCIAL?subject=Mystery%20Game%20Issue';

const params = new URLSearchParams(location.search);
if (params.get('access')) $('accessCode').value = params.get('access').toUpperCase();
else $('accessCode').value = '';

if ($('rsvpFirstName') && localStorage.getItem('detectiveFirstName')) $('rsvpFirstName').value = localStorage.getItem('detectiveFirstName');
if ($('rsvpInstagram') && localStorage.getItem('detectiveInstagram')) $('rsvpInstagram').value = localStorage.getItem('detectiveInstagram');
if ($('rsvpContact') && localStorage.getItem('detectiveContact')) $('rsvpContact').value = localStorage.getItem('detectiveContact');

$('joinBtn').onclick = async () => {
  const isDemo = await isCurrentAccessDemo();
  requireTermsAcceptance(join, { force: isDemo, persist: !isDemo });
};
$('rsvpBtn').onclick = () => requireTermsAcceptance(() => { setIntroStage('rsvp'); loadRsvpSessions(); });
if ($('myRsvpBtn')) $('myRsvpBtn').onclick = () => setIntroStage('myRsvp');
if ($('myRsvpBackBtn')) $('myRsvpBackBtn').onclick = () => setIntroStage('title');
if ($('findMyRsvpBtn')) $('findMyRsvpBtn').onclick = findMyRsvp;
$('rsvpBackBtn').onclick = () => setIntroStage('title');
if ($('rsvpDateBackBtn')) $('rsvpDateBackBtn').onclick = () => setIntroStage('title');
$('submitRsvpBtn').onclick = () => requireTermsAcceptance(submitRsvp);
$('rsvpChangeSessionBtn').onclick = showRsvpBrowser;
if ($('rsvpPreviewCloseBottomBtn')) $('rsvpPreviewCloseBottomBtn').onclick = closeRsvpPreview;
if ($('rsvpPreviewCloseBackdrop')) $('rsvpPreviewCloseBackdrop').onclick = closeRsvpPreview;
if ($('rsvpPreviewReserveBtn')) $('rsvpPreviewReserveBtn').onclick = () => reserveFromRsvpPreview();
document.addEventListener('click', event => {
  const copyBtn = event.target?.closest?.('[data-copy-code]');
  if (copyBtn) {
    copyRsvpCode(copyBtn.getAttribute('data-copy-code'));
    return;
  }
  const checkInBtn = event.target?.closest?.('[data-rsvp-checkin-code]');
  if (checkInBtn) {
    checkInNowFromRsvp(checkInBtn.getAttribute('data-rsvp-checkin-code'));
  }
});
['rsvpDateFilter'].forEach(id => { if ($(id)) $(id).addEventListener('change', renderRsvpBrowser); });
if ($('lobbyTutorialGotItBtn')) $('lobbyTutorialGotItBtn').onclick = acknowledgeLobbyTutorial;
if ($('lobbyTutorialReviewBtn')) $('lobbyTutorialReviewBtn').onclick = reviewLobbyTutorial;
if ($('deductionPopupClose')) $('deductionPopupClose').onclick = closeDeductionPopup;
if ($('deductionPopupSubmit')) $('deductionPopupSubmit').onclick = submitDeductionPopup;
$('submitAccuseBtn').onclick = submitAccusation;
$('dialogOkBtn').onclick = dismissDialog;
$('dialogViewBtn').onclick = () => { const action = activeDialogAction; dismissDialog(); if (typeof action === 'function') action(); };
if ($('enterInvestigationBtn')) $('enterInvestigationBtn').onclick = () => requireTermsAcceptance(() => setIntroStage('join'));
if ($('shareGameBtn')) $('shareGameBtn').onclick = openShareLinkModal;
if ($('closeShareLinkBtn')) $('closeShareLinkBtn').onclick = closeShareLinkModal;
if ($('copyShareLinkBtn')) $('copyShareLinkBtn').onclick = copyShareLink;
if ($('nativeShareBtn')) $('nativeShareBtn').onclick = nativeShareGameLink;
$('backToTitleBtn').onclick = () => setIntroStage('title');
$('detailHomeBtn').onclick = goHomeDashboard;
if ($('deductionHomeBtn')) $('deductionHomeBtn').onclick = goHomeDashboard;
if ($('playerSkipBriefingBtn')) $('playerSkipBriefingBtn').onclick = skipDemoBriefing;
if ($('playerSkipRoundBtn')) $('playerSkipRoundBtn').onclick = skipDemoRound;
if ($('playerSkipToFinalBtn')) $('playerSkipToFinalBtn').onclick = skipDemoToFinal;
if ($('playerSkipDeductionBtn')) $('playerSkipDeductionBtn').onclick = skipDemoDeduction;
$('findNewGameBtn').onclick = findNewGame;
if ($('reviewAnswersBtn')) $('reviewAnswersBtn').onclick = toggleAnswerReview;
if ($('reviewCaseLogicBtn')) $('reviewCaseLogicBtn').onclick = toggleCaseLogic;
$('shareBadgeBtn').onclick = shareBadge;
$('downloadBadgeBtn').onclick = downloadBadge;
if ($('termsAgreeBtn')) $('termsAgreeBtn').onclick = acceptTermsAndContinue;
if ($('termsCancelBtn')) $('termsCancelBtn').onclick = closeTermsOverlay;
$('accessCode').addEventListener('blur', () => { const code = $('accessCode').value.trim().toUpperCase(); if (code.length >= 5) loadAccessPreview(code); });
$('accessCode').addEventListener('input', () => { const code = $('accessCode').value.trim().toUpperCase(); if (code.length >= 5) loadAccessPreview(code); else updateLevelLabels(null); });
document.addEventListener('click', event => {
  const option = event.target?.closest?.('.choiceOption');
  if (!option) return;
  const input = option.querySelector('input[type="radio"]');
  if (!input || input.disabled) return;

  // Make the entire answer card reliably selectable on phones and desktop.
  // Prevent the label's default click behavior from fighting the manual selection.
  event.preventDefault();
  input.checked = true;

  if (option.classList.contains('deductionPopupChoice')) {
    deductionPopupSelected = input.value;
    rememberDeductionPopupSelection(deductionPopupQuestionId, input.value);
    syncDeductionPopupSelection();
    return;
  }

  syncChoiceHighlights();
  saveQuestionAnswer(input).catch(() => {
    if ($('accuseResult')) $('accuseResult').textContent = 'Answer selected, but it could not be saved. Check your connection and try again.';
  });
});
document.addEventListener('change', event => {
  const name = String(event.target?.name || '');
  if (name.startsWith('deduction-popup-')) {
    deductionPopupSelected = event.target.value;
    const qid = name.replace('deduction-popup-', '') || deductionPopupQuestionId;
    rememberDeductionPopupSelection(qid, event.target.value);
    syncDeductionPopupSelection();
    return;
  }
  if (name.startsWith('accuse-')) {
    syncChoiceHighlights();
    saveQuestionAnswer(event.target).catch(() => {
      if ($('accuseResult')) $('accuseResult').textContent = 'Answer selected, but it could not be saved. Check your connection and try again.';
    });
  }
});


setInterval(() => {
  if (state?.phase === 'briefing') {
    render();
    if (briefingRemainingFromEndMs() <= 0) requestBriefingAutoAdvance();
  } else if (state && currentApp === 'forensics') {
    render();
  }
}, 1000);



function getGameShareUrl() {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  return url.toString();
}

function openShareLinkModal() {
  const shareUrl = getGameShareUrl();
  if ($('shareLinkInput')) $('shareLinkInput').value = shareUrl;
  if ($('shareLinkMessage')) $('shareLinkMessage').textContent = 'Scan or share this link so players can open the game.';
  if ($('shareQrImg')) {
    $('shareQrImg').src = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=12&data=${encodeURIComponent(shareUrl)}`;
  }
  $('shareLinkOverlay')?.classList.remove('hidden');
}

function closeShareLinkModal() {
  $('shareLinkOverlay')?.classList.add('hidden');
}

async function copyShareLink() {
  const shareUrl = getGameShareUrl();
  try {
    await navigator.clipboard.writeText(shareUrl);
    if ($('shareLinkMessage')) $('shareLinkMessage').textContent = 'Link copied.';
  } catch (_err) {
    if ($('shareLinkInput')) {
      $('shareLinkInput').focus();
      $('shareLinkInput').select();
    }
    if ($('shareLinkMessage')) $('shareLinkMessage').textContent = 'Copy the highlighted link manually.';
  }
}

async function nativeShareGameLink() {
  const shareUrl = getGameShareUrl();
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Barfly Social Mystery',
        text: 'RSVP or join Barfly Social Mystery: A Live Detective Mystery Experience.',
        url: shareUrl
      });
      if ($('shareLinkMessage')) $('shareLinkMessage').textContent = 'Share sheet opened.';
      return;
    } catch (_err) {}
  }
  await copyShareLink();
}

function hasAcceptedTerms() {
  return termsAcceptedForCurrentAction || localStorage.getItem(TERMS_STORAGE_KEY) === 'yes';
}

async function isCurrentAccessDemo() {
  const code = $('accessCode')?.value?.trim?.().toUpperCase() || '';
  if (!code) return false;
  if (currentAccessPreviewCode === code) return Boolean(currentAccessPreviewIsDemo);
  try {
    const preview = await api(`/api/access/${encodeURIComponent(code)}/preview`);
    currentAccessPreviewCode = code;
    currentAccessPreviewIsDemo = Boolean(preview.demoMode);
    updateLevelLabels(preview);
    return currentAccessPreviewIsDemo;
  } catch (_err) {
    currentAccessPreviewCode = code;
    currentAccessPreviewIsDemo = false;
    return false;
  }
}

function requireTermsAcceptance(nextAction, options = {}) {
  const opts = { force: false, persist: true, ...options };
  if (!opts.force && hasAcceptedTerms()) {
    if (typeof nextAction === 'function') nextAction();
    return;
  }
  pendingTermsAction = nextAction;
  pendingTermsOptions = opts;
  if ($('termsAcceptCheck')) $('termsAcceptCheck').checked = false;
  if ($('termsError')) $('termsError').textContent = '';
  $('termsOverlay').classList.remove('hidden');
}

function acceptTermsAndContinue() {
  if (!$('termsAcceptCheck')?.checked) {
    $('termsError').textContent = 'You must check the acknowledgment box before continuing.';
    return;
  }
  const opts = pendingTermsOptions || { force: false, persist: true };
  if (opts.persist) localStorage.setItem(TERMS_STORAGE_KEY, 'yes');
  termsAcceptedForCurrentAction = true;
  $('termsOverlay')?.classList.add('hidden');
  const next = pendingTermsAction;
  pendingTermsAction = null;
  pendingTermsOptions = { force: false, persist: true };
  if (typeof next === 'function') {
    Promise.resolve(next()).finally(() => { termsAcceptedForCurrentAction = false; });
  } else {
    termsAcceptedForCurrentAction = false;
  }
}

function closeTermsOverlay() {
  $('termsOverlay')?.classList.add('hidden');
  pendingTermsAction = null;
  pendingTermsOptions = { force: false, persist: true };
  termsAcceptedForCurrentAction = false;
}

startIntro();
if (params.get('access')) loadAccessPreview(params.get('access').toUpperCase());

function startIntro() {
  setIntroStage('title');
}

function getSharedMysteryGraphic() {
  return '/assets/barfly-social-mystery-fullscreen-bg.png';
}

function customMysterySubtitle(title) {
  const name = String(title || 'this mystery').trim();
  return `A Barfly Social case file for ${name}: follow the clues, question every detail, and tap to continue when you are ready to reserve your spot.`;
}

function setIntroStage(stage) {
  toggleScreen('titleScreen', stage === 'title');
  toggleScreen('rsvpScreen', stage === 'rsvp');
  toggleScreen('myRsvpScreen', stage === 'myRsvp');
  toggleScreen('joinScreen', stage === 'join');
}

function toggleScreen(id, yes) {
  const el = $(id);
  if (!el) return;
  el.classList.toggle('hidden', !yes);
  el.classList.toggle('visible', yes);
}

function goHomeDashboard() {
  currentApp = null;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}


function clearRevealAutoHomeTimer() {
  if (revealAutoHomeTimer) {
    clearTimeout(revealAutoHomeTimer);
    revealAutoHomeTimer = null;
  }
}

function clearCurrentPlayerRun() {
  const sessionCode = state?.sessionCode || localStorage.getItem('detectiveAccessCode') || '';
  try { if (ws) ws.close(); } catch (_err) {}
  ws = null;
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  clearRevealAutoHomeTimer();
  currentApp = null;
  dialogQueue = [];
  dialogOpen = false;
  toastQueue = [];
  toastOpen = false;
  activeDialogAction = null;
  answerReviewOpen = false;
  caseLogicOpen = false;
  deductionPopupQuestionId = '';
  deductionPopupSelected = '';
  deductionPopupIsSubmitting = false;
  interrogationViewed = {};
  if (sessionCode) {
    ['interrogationViewed'].forEach(suffix => {
      try { localStorage.removeItem(`narrative:${sessionCode}:${playerId || 'player'}:${suffix}`); } catch (_err) {}
    });
  }
  try { localStorage.removeItem('detectiveAccessCode'); } catch (_err) {}
  if ($('accessCode')) $('accessCode').value = '';
  state = null;
  activeSessionKey = '';
}

function resetPlayerToHome() {
  clearCurrentPlayerRun();
  ['dialogOverlay','countdownOverlay','deductionOverlay','rsvpPreviewOverlay','shareLinkOverlay'].forEach(id => {
    const el = $(id);
    if (el) {
      el.classList.add('hidden');
      if (id === 'rsvpPreviewOverlay') el.setAttribute('aria-hidden', 'true');
    }
  });
  if ($('toastStack')) $('toastStack').innerHTML = '';
  $('appTopbar')?.classList.add('hidden');
  $('appMain')?.classList.add('hidden');
  $('introRoot')?.classList.remove('hidden');
  setIntroStage('title');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function findNewGame() {
  resetPlayerToHome();
}

function updateLevelLabels(s = state) {
  const label = s?.difficultyLabel || s?.levelLabel || 'DIFFICULTY SET BY HOST';
  const diff = s?.levelLabel || s?.difficulty || '';
  if ($('titleDifficultyBadge')) $('titleDifficultyBadge').textContent = label;
  if ($('topbarSubtitle')) $('topbarSubtitle').textContent = `Barfly Social Presents · Venue${diff ? ` · ${diff}` : ''}`;
}

async function loadAccessPreview(code) {
  try {
    const normalizedCode = String(code || '').trim().toUpperCase();
    const preview = await api(`/api/access/${encodeURIComponent(normalizedCode)}/preview`);
    currentAccessPreviewCode = normalizedCode;
    currentAccessPreviewIsDemo = Boolean(preview.demoMode);
    updateLevelLabels(preview);
  } catch (_err) {
    currentAccessPreviewCode = String(code || '').trim().toUpperCase();
    currentAccessPreviewIsDemo = false;
  }
}


async function loadRsvpSessions() {
  const msg = $('rsvpMessage');
  msg.textContent = 'Loading available investigations...';
  selectedRsvpSessionCode = '';
  if ($('rsvpSession')) $('rsvpSession').value = '';
  showRsvpBrowser();
  try {
    rsvpSessions = await api('/api/rsvp-sessions');
    buildRsvpFilters();
    renderRsvpBrowser();
  } catch (err) {
    rsvpSessions = [];
    $('rsvpShowtimeList').innerHTML = '<p class="muted">Unable to load available investigations.</p>';
    msg.textContent = err.message || 'Unable to load RSVP sessions.';
  }
}

function buildRsvpFilters() {
  fillFilter('rsvpDateFilter', rsvpSessions.map(s => s.dateLabel || 'Date TBD'), 'Choose Date');
  const dateEl = $('rsvpDateFilter');
  if (dateEl && !dateEl.value && dateEl.options.length > 1) {
    dateEl.selectedIndex = 1;
  }
}

function fillFilter(id, values, allLabel) {
  const el = $(id);
  if (!el) return;
  const unique = [...new Set(values.filter(Boolean))];
  el.innerHTML = `<option value="">${escapeHtml(allLabel)}</option>` + unique.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
}

function renderRsvpBrowser() {
  const msg = $('rsvpMessage');
  const list = $('rsvpShowtimeList');
  const date = $('rsvpDateFilter')?.value || '';
  if (!rsvpSessions.length) {
    list.innerHTML = '<p class="muted">No RSVP dates are available yet. Check back after the host creates upcoming sessions.</p>';
    msg.textContent = 'No RSVP sessions are available yet.';
    return;
  }
  if (!date) {
    list.innerHTML = '<p class="muted">Choose a date to see available sessions.</p>';
    msg.textContent = 'Choose a date first.';
    return;
  }
  const filtered = rsvpSessions.filter(item => item.dateLabel === date);
  if (!filtered.length) {
    list.innerHTML = '<p class="muted">No sessions are available on this date. Choose another date.</p>';
    msg.textContent = 'No sessions are available for the selected date.';
    return;
  }
  const openCount = filtered.filter(item => item.status !== 'soldout' && Number(item.seatsAvailable ?? item.spotsAvailable ?? 0) > 0).length;
  list.innerHTML = `
    <div class="showtimeDateGroup activeDateGroup">
      <h3>${escapeHtml(date)}</h3>
      <p class="dateAvailabilitySummary">${openCount} available session${openCount === 1 ? '' : 's'} on this date</p>
      ${filtered.map(showtimeCardHtml).join('')}
    </div>`;
  msg.textContent = 'Tap a game to preview it, then continue to RSVP.';
  list.querySelectorAll('[data-session-code]').forEach(btn => {
    btn.addEventListener('click', () => selectRsvpSession(btn.dataset.sessionCode));
  });
  list.querySelectorAll('[data-preview-code]').forEach(btn => {
    btn.addEventListener('click', () => openRsvpPreview(btn.dataset.previewCode));
  });
}

function groupBy(items, fn) {
  return items.reduce((acc, item) => {
    const key = fn(item);
    (acc[key] = acc[key] || []).push(item);
    return acc;
  }, {});
}

function formatRsvpEventType(item) {
  return item.eventType === 'free' ? 'Free' : (item.ticketPrice ? `Paid · $${item.ticketPrice}` : 'Paid');
}

function showtimeCardHtml(item) {
  const left = Number(item.seatsAvailable ?? item.spotsAvailable ?? 0);
  const soldOut = item.status === 'soldout' || left <= 0;
  const seatsLabel = soldOut ? 'Sold Out' : `${left} seats left`;
  const buttonLabel = soldOut ? 'Sold Out' : 'Tap to Continue';
  const disabled = soldOut ? 'disabled' : '';
  const eventType = formatRsvpEventType(item);
  const title = item.mysteryTitle || item.mystery || item.title || 'Mystery Game';
  const difficulty = item.levelLabel || item.difficultyLabel || item.difficulty || 'Difficulty TBD';
  const excerpt = item.rsvpExcerpt || item.customSubtitle || item.subtitle || item.description || 'A live mystery is waiting. Search the scene, question witnesses, and uncover the truth before the final accusation.';
  const venueLogo = item.venueLogoUrl || '';
  const venueName = item.venue || item.venueName || 'Venue TBD';
  const titleGraphic = item.titleGraphic || item.previewImage || '';
  const previewArtHtml = titleGraphic
    ? `<button type="button" class="gamePreviewArtButton" data-preview-code="${escapeHtml(item.sessionCode)}" aria-label="Preview ${escapeHtml(title)}"><img class="gamePreviewArt" src="${escapeHtml(titleGraphic)}" alt="${escapeHtml(title)} title preview" loading="lazy" onerror="this.closest('.gamePreviewArtButton').remove()" /></button>`
    : '';
  const venueLogoHtml = venueLogo
    ? `<button type="button" class="venueLogoPreviewButton" data-preview-code="${escapeHtml(item.sessionCode)}" aria-label="Preview ${escapeHtml(title)} at ${escapeHtml(venueName)}"><img src="${escapeHtml(venueLogo)}" alt="${escapeHtml(venueName)} logo" loading="lazy" onerror="this.closest('.venueLogoPreviewButton').classList.add('hidden')" /></button>`
    : `<button type="button" class="venueLogoPreviewButton venueLogoPreviewFallback" data-preview-code="${escapeHtml(item.sessionCode)}" aria-label="Preview ${escapeHtml(title)}"><span>${escapeHtml((venueName || 'Venue').slice(0,1).toUpperCase())}</span></button>`;
  return `<article class="showtimeCard enhancedShowtimeCard venueFirstShowtimeCard">
    ${previewArtHtml || venueLogoHtml}
    <div class="showtimeCardBody">
      <h4 class="rsvpGameTitleLine">${escapeHtml(title)}</h4>
      <p class="rsvpDifficultyLine">${escapeHtml(difficulty)}</p>
      <p class="rsvpExcerpt">${escapeHtml(excerpt)}</p>
      <div class="statusPills rsvpCardPills">
        <span class="pill">${escapeHtml(item.timeLabel || 'Time TBD')}</span>
        <span class="pill ${soldOut ? '' : 'good'}">${escapeHtml(seatsLabel)}</span>
        <span class="pill">${escapeHtml(eventType)}</span>
        <span class="pill">${escapeHtml(String(item.eventDurationMinutes || 45))} min</span>
      </div>
    </div>
    <button type="button" class="showtimeBtn" data-session-code="${escapeHtml(item.sessionCode)}" ${disabled}>${buttonLabel}</button>
  </article>`;
}

function openRsvpPreview(code) {
  const item = rsvpSessions.find(s => s.sessionCode === code);
  if (!item || !$('rsvpPreviewOverlay')) return;
  rsvpPreviewSessionCode = code;
  const title = item.mysteryTitle || item.mystery || item.title || 'Mystery Game';
  const difficulty = item.levelLabel || item.difficultyLabel || item.difficulty || 'Difficulty TBD';
  const excerpt = item.rsvpExcerpt || item.customSubtitle || item.subtitle || item.description || 'A live mystery is waiting. Search the scene, question witnesses, and uncover the truth before the final accusation.';
  const eventType = formatRsvpEventType(item);
  const left = Number(item.seatsAvailable ?? item.spotsAvailable ?? 0);
  const soldOut = item.status === 'soldout' || left <= 0;
  const seatsLabel = soldOut ? 'Sold Out' : `${left} seats left`;
  const venueLogoUrl = item.venueLogoUrl || '';
  const venueName = item.venue || item.venueName || 'Venue TBD';
  const titleGraphic = item.titleGraphic || item.previewImage || '';
  const previewArtWrap = $('rsvpPreviewGraphicWrap');
  const previewArtImg = $('rsvpPreviewGraphic');
  if (previewArtWrap && previewArtImg) {
    if (titleGraphic) {
      previewArtImg.src = titleGraphic;
      previewArtImg.alt = `${title} title graphic`;
      previewArtImg.onerror = () => previewArtWrap.classList.add('hidden');
      previewArtWrap.classList.remove('hidden');
    } else {
      previewArtImg.removeAttribute('src');
      previewArtWrap.classList.add('hidden');
    }
  }
  const venueLogoWrap = $('rsvpPreviewVenueLogoWrap');
  const venueLogoImg = $('rsvpPreviewVenueLogo');
  if (venueLogoWrap && venueLogoImg) {
    if (venueLogoUrl) {
      venueLogoImg.src = venueLogoUrl;
      venueLogoImg.alt = `${venueName} logo`;
      venueLogoImg.onerror = () => venueLogoWrap.classList.add('hidden');
      venueLogoWrap.classList.remove('hidden');
    } else {
      venueLogoImg.removeAttribute('src');
      venueLogoWrap.classList.add('hidden');
    }
  }
  $('rsvpPreviewTitle').textContent = title;
  if ($('rsvpPreviewDifficulty')) $('rsvpPreviewDifficulty').textContent = difficulty;
  $('rsvpPreviewVenue').textContent = venueName;
  $('rsvpPreviewExcerpt').textContent = excerpt;
  $('rsvpPreviewPills').innerHTML = `<span class="pill">${escapeHtml(item.timeLabel || 'Time TBD')}</span><span class="pill ${soldOut ? '' : 'good'}">${escapeHtml(seatsLabel)}</span><span class="pill">${escapeHtml(eventType)}</span><span class="pill">${escapeHtml(String(item.eventDurationMinutes || 45))} min</span>`;
  $('rsvpPreviewOverlay').classList.remove('hidden');
  $('rsvpPreviewOverlay').setAttribute('aria-hidden', 'false');
}

function closeRsvpPreview() {
  if (!$('rsvpPreviewOverlay')) return;
  $('rsvpPreviewOverlay').classList.add('hidden');
  $('rsvpPreviewOverlay').setAttribute('aria-hidden', 'true');
}

function reserveFromRsvpPreview() {
  const code = rsvpPreviewSessionCode;
  closeRsvpPreview();
  if (code) selectRsvpSession(code);
}


function selectRsvpSession(code) {
  const item = rsvpSessions.find(s => s.sessionCode === code);
  if (!item) return;
  selectedRsvpSessionCode = code;
  $('rsvpSession').value = code;
  const selectedVenueLogo = item.venueLogoUrl ? `<img class="selectedVenueLogo" src="${escapeHtml(item.venueLogoUrl)}" alt="${escapeHtml(item.venue || item.venueName || 'Venue')} logo" onerror="this.remove()" />` : '';
  const selectedTitleGraphic = item.titleGraphic || item.previewImage || '';
  const selectedTitle = item.mysteryTitle || item.mystery || item.title || 'Mystery Game';
  const selectedDifficulty = item.levelLabel || item.difficultyLabel || item.difficulty || 'Skill Level TBD';
  const selectedEventType = formatRsvpEventType(item);
  $('selectedSessionCard').innerHTML = `<div class="selectedSessionWithArt">
      ${selectedTitleGraphic ? `<img class="selectedSessionArt" src="${escapeHtml(selectedTitleGraphic)}" alt="${escapeHtml(selectedTitle)} title graphic" onerror="this.remove()" />` : ''}
      <div class="selectedSessionVenueOnly">
        ${selectedVenueLogo}
        <div class="time">Selected Showtime</div>
        <h3>${escapeHtml(selectedTitle)}</h3>
        <p class="rsvpDifficultyLine">${escapeHtml(selectedDifficulty)}</p>
        <p>${escapeHtml(item.customSubtitle || item.subtitle || item.rsvpExcerpt || item.description || 'Search the scene, question witnesses, and uncover the truth before the final accusation.')}</p>
        <div class="statusPills rsvpCardPills"><span class="pill">${escapeHtml(item.timeLabel || 'Time TBD')}</span><span class="pill good">${escapeHtml(String(item.seatsAvailable ?? item.spotsAvailable ?? 0))} seats left</span><span class="pill">${escapeHtml(selectedEventType)}</span><span class="pill">${escapeHtml(String(item.eventDurationMinutes || 45))} min</span></div>
        <p class="mini">${escapeHtml(item.venue || item.venueName || 'Venue TBD')}</p>
      </div>
    </div>`;
  $('rsvpBrowserPanel').classList.add('hidden');
  $('rsvpReservePanel').classList.remove('hidden');
  $('rsvpMessage').textContent = 'Enter your RSVP information. Instagram is optional.';
  setTimeout(() => $('rsvpFirstName')?.focus(), 80);
}

function showRsvpBrowser() {
  selectedRsvpSessionCode = '';
  if ($('rsvpSession')) $('rsvpSession').value = '';
  $('rsvpBrowserPanel').classList.remove('hidden');
  $('rsvpReservePanel').classList.add('hidden');
  $('rsvpMessage').textContent = 'Choose a date and select an available investigation.';
}

async function submitRsvp() {
  const msg = $('rsvpMessage');
  if (msg) msg.textContent = '';
  const sessionCode = selectedRsvpSessionCode || $('rsvpSession')?.value || '';
  const firstName = $('rsvpFirstName').value.trim();
  const contactRaw = $('rsvpContact').value.trim();
  const phone = normalizePhoneInput(contactRaw);
  const instagram = $('rsvpInstagram').value.trim();
  if (!sessionCode) { if (msg) msg.textContent = 'Choose a showtime before reserving.'; return; }
  if (!firstName || phone.length !== 10) { if (msg) msg.textContent = 'Enter your first name and a valid 10-digit phone number.'; return; }
  try {
    const data = await api('/api/rsvps', { method: 'POST', body: { sessionCode, firstName, phone, contact: phone, socialMedia: instagram, instagram, termsAccepted: hasAcceptedTerms() } });
    localStorage.setItem('detectiveFirstName', firstName);
    localStorage.setItem('detectiveContact', phone);
    localStorage.setItem('detectiveInstagram', instagram);
    const code = data.rsvp?.accessCode || data.sharedAccessCode || '';
    renderRsvpCodeBox(code, data.eventType, data.ticketPrice, data.paymentPending);
    if (data.paymentPending) {
      msg.innerHTML = `✅ RSVP saved. Your detective spot is reserved.<br><b>${escapeHtml(data.ticketPrice ? `Paid Event · $${data.ticketPrice}` : 'Paid Event')}</b><br>Please see the host to complete payment and receive your check-in code.`;
    } else if (code) {
      msg.innerHTML = `✅ RSVP saved. Your detective spot is reserved.<br><b>${escapeHtml(data.eventType === 'free' ? 'Free Event' : 'Paid Event')}</b>`;
    } else {
      msg.innerHTML = '✅ RSVP saved. Your detective spot is reserved. Please see the host for your check-in code.';
    }
  } catch (err) {
    if (msg) msg.textContent = err.message;
  }
}

function normalizePhoneInput(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits.slice(0, 10);
}


function renderRsvpCodeBox(code, eventType = 'paid', ticketPrice = '', paymentPending = false) {
  const box = $('rsvpCodeBox');
  if (!box) return;
  box.classList.remove('hidden');
  if (paymentPending) {
    box.innerHTML = `
      <div class="time">RESERVATION SAVED</div>
      <h3>Paid Event${ticketPrice ? ` · $${escapeHtml(ticketPrice)}` : ''}</h3>
      <p class="notice">Your spot is reserved. Please see the host to complete payment and receive your 5-digit check-in code.</p>
    `;
    return;
  }
  if (!code) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }
  box.innerHTML = `
    <div class="time">${eventType === 'free' ? 'FREE EVENT' : 'YOUR CHECK-IN CODE'}</div>
    <div class="bigRsvpCode">${escapeHtml(code)}</div>
    <div class="row" style="justify-content:center; gap:10px; flex-wrap:wrap;">
      <button class="secondary" type="button" data-copy-code="${escapeHtml(code)}">Copy Code</button>
      <button type="button" data-rsvp-checkin-code="${escapeHtml(code)}">Play Now</button>
    </div>
    <p class="mini">Tap Play Now to use this reservation automatically, or copy your 5-digit code and enter it later from My RSVP.</p>
  `;
}

async function copyRsvpCode(code) {
  const msg = $('rsvpMessage');
  try {
    await navigator.clipboard.writeText(code || '');
    if (msg) msg.textContent = 'Code copied.';
  } catch (_err) {
    if (msg) msg.textContent = 'Copy failed. Press and hold the code to copy it manually.';
  }
}

async function findMyRsvp() {
  const msg = $('myRsvpMessage');
  const result = $('myRsvpResult');
  const lookup = $('myRsvpLookup')?.value?.trim() || '';
  if (msg) msg.textContent = '';
  if (result) { result.classList.add('hidden'); result.innerHTML = ''; }
  if (!lookup) { if (msg) msg.textContent = 'Enter your phone number or check-in code.'; return; }
  try {
    const data = await api('/api/rsvps/lookup', { method: 'POST', body: { lookup } });
    const code = data.accessCode || data.rsvp?.accessCode || '';
    const session = data.session || {};
    const pending = Boolean(data.paymentPending);
    if (result) {
      result.classList.remove('hidden');
      result.innerHTML = `
        <div class="time">RSVP FOUND</div>
        <h3>${escapeHtml(data.rsvp?.displayName || data.rsvp?.firstName || 'Detective')}</h3>
        <p><b>Session:</b> ${escapeHtml(session.tableName || session.truthPackTitle || 'Barfly Social Mystery')}</p>
        <p><b>Game Time:</b> ${escapeHtml([session.eventDateLabel, session.eventTimeLabel].filter(Boolean).join(' · ') || 'Time TBD')}</p>
        <p><b>Event:</b> ${escapeHtml(session.eventPriceLabel || (session.eventType === 'free' ? 'Free Event' : 'Paid Event'))}</p>
        <p><b>Status:</b> ${escapeHtml(data.rsvp?.status || 'RSVP’d')}</p>
        ${pending ? '<p class="notice">Payment is pending. Please see the host to complete payment and receive your 5-digit check-in code.</p>' : (code ? `<div class="time">YOUR CHECK-IN CODE</div><div class="bigRsvpCode">${escapeHtml(code)}</div>` : '<p class="notice">No check-in code is available yet. Please see the host.</p>')}
        <div class="row" style="justify-content:center; gap:10px; flex-wrap:wrap;">
          ${(!pending && code) ? `<button class="secondary" type="button" data-copy-code="${escapeHtml(code)}">Copy Code</button><button type="button" data-rsvp-checkin-code="${escapeHtml(code)}">Play Now</button>` : ''}
        </div>
      `;
    }
  } catch (err) {
    if (msg) msg.textContent = err.message;
  }
}

async function checkInNowFromRsvp(code) {
  const rsvpVisible = !$('rsvpScreen')?.classList.contains('hidden');
  const myRsvpVisible = !$('myRsvpScreen')?.classList.contains('hidden');
  const msg = myRsvpVisible ? $('myRsvpMessage') : (rsvpVisible ? $('rsvpMessage') : $('joinError'));
  const cleanCode = String(code || '').trim().toUpperCase();
  if (!cleanCode) {
    if (msg) msg.textContent = 'No check-in code is available yet.';
    return;
  }
  if ($('accessCode')) $('accessCode').value = cleanCode;
  const openGame = async () => {
    if (msg) msg.textContent = 'Opening your game...';
    await join(cleanCode, msg);
  };
  requireTermsAcceptance(openGame);
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

async function join(accessCodeOverride = '', messageEl = null) {
  const errorTarget = messageEl || $('joinError');
  if (errorTarget) errorTarget.textContent = '';
  if ($('joinError') && messageEl !== $('joinError')) $('joinError').textContent = '';
  const accessCode = String(accessCodeOverride || $('accessCode').value || '').trim().toUpperCase();
  if (!accessCode) {
    if (errorTarget) errorTarget.textContent = 'Enter your phone number or check-in code.';
    return;
  }
  try {
    const data = await api('/api/access/join', { method: 'POST', body: { accessCode, playerId, termsAccepted: hasAcceptedTerms() } });
    playerId = data.playerId;
    localStorage.setItem('detectivePlayerId', playerId);
    localStorage.setItem('detectiveAccessCode', accessCode);
    if (data.player?.firstName) localStorage.setItem('detectiveFirstName', data.player.firstName);
    if (data.player?.lastName) localStorage.setItem('detectiveLastName', data.player.lastName);
    if (data.player?.instagram) localStorage.setItem('detectiveInstagram', data.player.instagram);
    state = data.state;
    syncServerClock(state);
    updateLevelLabels(state);
    activeSessionKey = `detectiveAck:${state.sessionCode}`;
    connectSocket(data.sessionCode || state.sessionCode);
    startPolling(data.sessionCode || state.sessionCode);
    detectNotifications(state, true);
    $('introRoot').classList.add('hidden');
    $('appTopbar').classList.remove('hidden');
    $('appMain').classList.remove('hidden');
    render();
    inspectDialogTriggers(state, true);
    inspectCountdown(state);
  } catch (err) {
    if (errorTarget) errorTarget.textContent = err.message;
  }
}

function connectSocket(code) {
  if (ws) ws.close();
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${protocol}://${location.host}?code=${encodeURIComponent(code)}&playerId=${encodeURIComponent(playerId)}`);
  ws.onmessage = evt => {
    const msg = JSON.parse(evt.data);
    if (msg.type === 'state') receiveState(msg.state);
  };
  ws.onclose = () => setTimeout(() => state && connectSocket(state.sessionCode), 2500);
}

function startPolling(code) {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      const next = await api(`/api/sessions/${code}`);
      receiveState(next, true);
    } catch (_err) {}
  }, 4000);
}


let briefingAutoAdvanceRequested = false;
async function requestBriefingAutoAdvance() {
  if (!state || state.phase !== 'briefing' || briefingAutoAdvanceRequested) return;
  if (briefingRemainingFromEndMs() > 0) return;
  briefingAutoAdvanceRequested = true;
  try {
    const next = await api(`/api/sessions/${state.sessionCode}/skip-briefing`, { method: 'POST', body: { playerAutoAdvance: true } });
    receiveState(next, true);
  } catch (_err) {
    try {
      const next = await api(`/api/sessions/${state.sessionCode}`);
      receiveState(next, true);
    } catch (__err) {}
  } finally {
    setTimeout(() => { briefingAutoAdvanceRequested = false; }, 1500);
  }
}

function receiveState(next, fromPoll = false) {
  activeSessionKey = `detectiveAck:${next.sessionCode}`;
  detectNotifications(next, fromPoll);
  state = next;
  if (next?.phase !== 'revealed') clearRevealAutoHomeTimer();
  syncServerClock(state);
  updateLevelLabels(state);
  render();
  inspectCountdown(next);
  inspectDialogTriggers(next, fromPoll);
  if (next?.phase === 'briefing' && briefingRemainingFromEndMs(next) <= 0) requestBriefingAutoAdvance();
}


function detectNotifications(next, silent) {
  // First state load should establish the baseline only.
  // After that, polling is allowed to trigger clue notifications because
  // timed clue unlocks usually arrive through polling, not only WebSocket pushes.
  if (!state) {
    previousHostMessageCount = next.hostMessages?.length || 0;
    previousCounts = clueCounts(next);
    return;
  }

  const newClues = findNewClues(state, next);
  const newHostMessage = (next.hostMessages?.length || 0) > previousHostMessageCount;

  if (newClues.length) {
    notify('New evidence unlocked');
    enqueueClueDialogs(newClues, next.sessionCode);
  }
  // Host messages can stay quiet during silent polling, but clue unlocks should not.
  if (newHostMessage && !silent) notify('Host message');

  previousCounts = clueCounts(next);
  previousHostMessageCount = next.hostMessages?.length || 0;
}

function allVisibleClues(s) {
  const clues = [];
  const addClue = (appKey, clue, labelOverride = '') => {
    if (!clue || isInternalSystemClue(clue)) return;
    const key = String(appKey || '').toLowerCase();
    const label = labelOverride || APP_META[key]?.[1] || narrativeEvidenceSourceLabel(key);
    clues.push({ ...clue, appKey: key, appLabel: label });
  };
  for (const c of (s.publicClues || [])) addClue('caseUpdate', c, 'Case Update');

  // Prefer the new four dashboard buckets for notifications, but also read the
  // legacy apps object so older / already-open sessions still receive evidence.
  for (const key of ['forensics','interrogation','timeline']) {
    const direct = s.dashboardEvidence?.[key];
    if (Array.isArray(direct)) direct.forEach(c => addClue(key, c));
  }
  for (const [appKey, appClues] of Object.entries(s.apps || {})) {
    for (const c of (appClues || [])) addClue(appKey, c);
  }

  const seen = new Set();
  return clues.filter(clue => {
    const id = clue.id || `${clue.appKey}:${clue.title || ''}:${clue.text || ''}:${clue.unlockSec || ''}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function liveSceneFeedItems(s) {
  if (!s || !Array.isArray(s.rounds)) return [];
  const phase = s.phase || 'lobby';
  if (phase === 'lobby' || phase === 'briefing') return [];
  const elapsed = Number(s.elapsedSec || 0);
  const showAll = phase === 'revealed';
  return (s.rounds || [])
    .filter(round => round && round.liveActionDialogue)
    .map((round, index) => {
      const unlockSec = Number(round.liveActionSec || (Number(round.startSec || 0) + 115));
      return {
        id: `live-scene-feed:${round.id || index}`,
        type: 'liveScene',
        title: round.liveActionTitle || 'The room reacts.',
        text: round.liveActionDialogue,
        unlockSec,
        appKey: 'caseUpdate',
        appLabel: 'Case Update',
        roundTitle: round.title || `Round ${index + 1}`
      };
    })
    .filter(item => showAll || elapsed >= item.unlockSec)
    .sort((a, b) => Number(a.unlockSec || 0) - Number(b.unlockSec || 0));
}

function roundNarrativeFeedItems(s) {
  if (!s || !Array.isArray(s.rounds)) return [];
  const phase = s.phase || 'lobby';
  if (phase === 'lobby' || phase === 'briefing') return [];
  const elapsed = Number(s.elapsedSec || 0);
  const showAll = phase === 'revealed';
  const submission = getMySubmission();
  const saved = submission?.answers || {};
  const deductionQuestions = (s.accusation?.questions || []).filter(q => isRoundDeductionQuestion(q));
  const items = [];
  (s.rounds || []).forEach((round, index) => {
    if (!round) return;
    const startSec = Number(round.startSec || 0);
    const title = round.title || `Round ${index + 1}`;
    if (showAll || elapsed >= startSec) {
      items.push({
        id: `round-opening-feed:${round.id || index}`,
        type: 'roundOpening',
        title,
        text: round.openingDialogue || round.dialogue || round.objective || 'A new part of the investigation is now open.',
        unlockSec: startSec,
        appKey: 'caseUpdate',
        appLabel: 'Case Update',
        roundTitle: title
      });
    }
  });
  return items.sort((a, b) => Number(a.unlockSec || 0) - Number(b.unlockSec || 0));
}

function isInternalSystemClue(item) {
  const label = `${item?.title || ''} ${item?.text || ''}`.toLowerCase();
  return /case difficulty loaded|difficulty loaded|chapter\s+\d+\s+(opened|open)|chapter\s+\d+\s+is\s+open|round data loaded|session synced|app unlocked/.test(label);
}

function isInternalPlayerMessage(title = '', text = '') {
  const label = `${title || ''} ${text || ''}`.toLowerCase();
  return /case difficulty loaded|difficulty loaded|chapter\s+\d+\s+(opened|open)|chapter\s+\d+\s+is\s+open|round data loaded|session synced|app unlocked/.test(label);
}

function isRoundDeductionQuestion(question) {
  const stage = String(question?.stage || '').toLowerCase();
  return stage === 'deduction' || stage === 'checkpoint';
}


function dashboardBucketForClue(clue) {
  if (!clue || isInternalSystemClue(clue)) return '';
  const key = String(clue.appKey || '').toLowerCase();
  const type = String(clue.type || '').toLowerCase();
  if (key === 'forensics' || type === 'forensics') return 'Forensics';
  if (key === 'interrogation' || type === 'interrogation' || type === 'statement') return 'Interrogation';
  if (key === 'timeline' || type === 'timeline') return 'Timeline';
  if (type === 'deduction' || type === 'checkpoint') return 'Deduction';
  // Do not toast or badge clues that do not map to a visible dashboard section.
  return '';
}

function caseFeedItems(s) {
  const publicItems = (s?.publicClues || [])
    .filter(c => !isInternalSystemClue(c))
    .map(c => ({ ...c, appKey: 'caseUpdate', appLabel: 'Case Update' }));
  return [...publicItems, ...roundNarrativeFeedItems(s), ...liveSceneFeedItems(s)].sort((a, b) => Number(a.unlockSec || 0) - Number(b.unlockSec || 0));
}

function findNewClues(oldState, newState) {
  // When the three-minute briefing ends, the first wave of clues may already be
  // visible at unlockSec 0. Treat the briefing → investigation transition as a
  // new evidence event so players still get the quiet toast notifications.
  const briefingJustEnded = oldState?.phase === 'briefing' && newState?.phase !== 'briefing';
  const oldIds = briefingJustEnded ? new Set() : new Set(allVisibleClues(oldState || {}).map(c => c.id));
  const ack = getAckForSession(newState.sessionCode);
  return allVisibleClues(newState)
    .filter(c => c.id && !oldIds.has(c.id) && !ack.clues.includes(c.id))
    .sort((a, b) => Number(a.unlockSec || 0) - Number(b.unlockSec || 0));
}

function enqueueClueDialogs(clues, sessionCode) {
  // Quiet evidence updates: no modal interruption. Only toast when the clue maps to
  // one of the visible four dashboard sections.
  const clean = (clues || []).filter(clue => clue?.id && dashboardBucketForClue(clue));
  if (!clean.length) return;
  const appLabels = Array.from(new Set(clean.map(clue => dashboardBucketForClue(clue)).filter(Boolean)));
  if (!appLabels.length) return;
  const labelText = appLabels.length === 1 ? appLabels[0] : `${appLabels.slice(0, 3).join(', ')}${appLabels.length > 3 ? ' +' + (appLabels.length - 3) : ''}`;
  clean.forEach(clue => rememberAck('clue', clue.id));
  showToast(appLabels.length === 1 ? `${labelText} updated` : 'Investigation updated', `New evidence unlocked in ${labelText}.`, 'evidence');
}

function countDirectVisibleItems(s, key) {
  if (!s || ['lobby','briefing'].includes(s.phase)) return 0;
  const direct = Array.isArray(s.dashboardEvidence?.[key]) ? s.dashboardEvidence[key] : [];
  const appBucket = Array.isArray(s.apps?.[key]) ? s.apps[key] : [];
  const seen = new Set();
  return [...direct, ...appBucket].filter(item => {
    if (!item || isInternalSystemClue(item)) return false;
    const id = item.id || `${key}:${item.title || ''}:${item.text || ''}:${item.unlockSec || ''}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  }).length;
}

function clueCounts(s) {
  const target = s || state;
  const deductionQuestions = ((target)?.accusation?.questions || []).filter(q => isRoundDeductionQuestion(q));
  let unanswered = deductionQuestions.length;
  try {
    const saved = getMySubmission()?.answers || {};
    unanswered = deductionQuestions.filter(q => !saved[q.id]).length;
  } catch (_err) {}
  return {
    forensics: countDirectVisibleItems(target, 'forensics'),
    interrogation: countDirectVisibleItems(target, 'interrogation'),
    timeline: countDirectVisibleItems(target, 'timeline'),
    deduction: Math.max(0, unanswered)
  };
}

function notify(text) {
  if (navigator.vibrate) navigator.vibrate(80);
  const oldTitle = document.title;
  document.title = `• ${text}`;
  setTimeout(() => { document.title = oldTitle; }, 1800);
}

function isAnyModalOpen() {
  return ['dialogOverlay','deductionOverlay','countdownOverlay','termsOverlay','shareLinkOverlay','rsvpPreviewOverlay'].some(id => {
    const el = $(id);
    return el && !el.classList.contains('hidden');
  });
}

function showToast(title, text = '', type = 'info') {
  if (isInternalPlayerMessage(title, text)) return;
  toastQueue.push({ title, text, type });
  processToastQueue();
}

function processToastQueue() {
  const stack = $('toastStack');
  if (!stack || toastOpen || !toastQueue.length || isAnyModalOpen()) return;
  toastOpen = true;
  const { title, text, type } = toastQueue.shift();
  const toast = document.createElement('div');
  toast.className = `toastNotice toast-${type || 'info'}`;
  toast.innerHTML = `<b>${escapeHtml(title || 'Update')}</b>${text ? `<span>${escapeHtml(text)}</span>` : ''}`;
  stack.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.remove();
      toastOpen = false;
      renderDeductionPopup();
      renderDialog();
      processToastQueue();
    }, 260);
  }, 4200);
}

function fmt(sec) {
  sec = Math.max(0, Number(sec || 0));
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}


const STORY_BRIEFINGS = {
  easy: [
    ['0:00–0:45','The Night Goes Quiet','A live mystery preview was supposed to be music, drinks, clues, and a staged crime for guests to solve. Then Lena Broussard collapsed during the event, and the room realized this was not part of the show.','This Easy briefing gives the clearest path: focus on Lena, the drink system, and who had access to the service rail.'],
    ['0:45–1:30','The Victim: Lena Broussard','Lena was the event lead helping Barfly Social test the first Barfly Social Mystery experience. She knew the staff layout, the clue schedule, and the sponsor money behind the event.','She also knew secrets. Several people needed Lena quiet before the launch became public.'],
    ['1:30–2:15','The First Problem','Lena had a known allergy protocol. Her safe drink should have carried a visible marker and her emergency injector should have been nearby. After she collapsed, the marker was missing and the injector was not where witnesses expected it to be.','Easy difficulty starts with the simplest question: who could touch the drink and the marker without looking suspicious?'],
    ['2:15–2:40','People Under Pressure','Tessa Marchand feared losing her lead bartender role. Owen Landry had sponsor money problems. Brielle Hart had online exposure to hide. Cole Vinet controlled sound and effects. Marisol Vega understood staff access better than anyone.','Motive alone is not enough. Match motive to access.'],
    ['2:40–2:55','Evidence Path','Forensics will return recovered phone, message, financial, document, browser, photo, and security results as the investigation progresses. Interrogation and Timeline help test those results.','Read the difficulty label carefully. Each difficulty has its own culprit and evidence trail.'],
    ['2:55–3:00','Your Mission','You are the detective team. Follow the clues as they unlock, answer each deduction question, and save your final accusation for the end.','When the timer starts, do not chase the loudest suspect. Follow the evidence that survives comparison.']
  ],
  medium: [
    ['0:00–0:45','A Game Becomes a Case','Barfly Social Mystery was designed to blur fiction and nightlife. Guests expected staged evidence, dramatic clues, and a fictional victim. Instead, Lena Broussard became the real emergency.','Medium difficulty gives you enough guidance to connect the drink, the timeline, and the missing injector.'],
    ['0:45–1:30','Lena Knew Too Much','Lena was reviewing sponsor records and event procedures before the preview. She had noticed missing money, unusual camera gaps, and inconsistencies in the staff movement log.','Someone did not just want Lena embarrassed. Someone needed her stopped before she talked.'],
    ['1:30–2:15','The Drink and the Corridor','The key early question is not only what Lena drank, but where the drink moved before it reached her. A short corridor overlap and a camera export gap create the first serious contradiction.','If the record was edited, the editor matters as much as the person near the glass.'],
    ['2:15–2:40','Suspects With Motives','Tessa had role pressure. Owen had sponsor-money pressure. Brielle had reputation pressure. Cole had control over the sound booth. Marisol had access to staff systems.','At Medium difficulty, the solution is built from money, access, and a deliberate cover-up.'],
    ['2:40–2:55','What to Compare','Compare the office log, safe access, camera export, fake invoices, and witness timing. A single clue may look weak alone, but together they form a chain.','The right answer should explain both the murder method and the evidence manipulation.'],
    ['2:55–3:00','Your Mission','Use Deduction as each round closes. Your final accusation will ask who did it, how, why, what proves it, and which statement collapses.','Do not submit based on suspicion. Submit based on the chain.']
  ],
  junior: [
    ['0:00–0:45','The Social Trail','At Medium difficulty, the case expands beyond the drink path. Lena had been reviewing livestream material and private messages tied to a staged charity promotion.','The killer used public noise to hide private movement.'],
    ['0:45–1:30','A Public Alibi','One suspect appears visible online at the exact moment suspicion should be highest. But raw cache files can tell a different story than posted content.','When digital proof looks too clean, ask whether it was performed for an audience.'],
    ['1:30–2:15','The Allergy Trigger','The method depends on switching what Lena was exposed to and making it look like a service mistake. A garnish bottle photo, deleted messages, and livestream timing all matter.','Medium difficulty asks you to compare social evidence with physical evidence.'],
    ['2:15–2:40','The Red Herrings','Tessa’s bar access still matters. Owen still looks financially suspicious. Cole still controls technical systems. Marisol still knows staff credentials.','But one suspect’s online story creates the strongest contradiction when matched to the physical clue.'],
    ['2:40–2:55','What to Prove','Look for the evidence that connects motive, location, and method. The right final answer is not just who had a reason; it is who had the reason and the staged visibility.','A good alibi can be a clue if it was built too carefully.'],
    ['2:55–3:00','Your Mission','Build the timeline twice: once from what people claimed, and once from what the records actually show.','The difference between those timelines is where the killer stands.']
  ],
  detective: [
    ['0:00–0:45','Effects, Timing, and Control','At Medium difficulty, Barfly Social Mystery leans into technical control: sound cues, fog effects, booth automation, and a missing rescue item.','The killer used the event environment as a mechanism, not just a backdrop.'],
    ['0:45–1:30','A Cue That Was Not Innocent','During the event, a sound cue and fog effect created confusion at the exact moment Lena needed help. That timing was not random.','A performer could panic the room. A technician could shape the moment.'],
    ['1:30–2:15','The Hidden Preparation','A fog-fluid receipt, booth automation log, and locker photo create a path that is easy to overlook if you only focus on the bar.','Medium difficulty rewards players who leave the obvious drink path and inspect the production system.'],
    ['2:15–2:40','Suspect Pressure','Cole Vinet had access to sound and timing. Owen and Tessa still carry obvious heat. Brielle has digital motive. Marisol understands credentials.','This difficulty asks who could create a controlled window and make a medical emergency look like chaos.'],
    ['2:40–2:55','What to Compare','Compare the sound booth record, purchase trail, and access photo against each suspect’s statement. Small technical facts matter.','If the clue explains timing, preparation, and opportunity, it belongs near the solution.'],
    ['2:55–3:00','Your Mission','Do not solve the case like a simple drink swap. Treat the venue itself as part of the weapon.','The killer did not only act in the room. The killer controlled the room.']
  ],
  senior: [
    ['0:00–0:45','A Frame Inside the Frame','Hard difficulty assumes the killer knows investigators will follow obvious records. Some evidence was not just hidden; it was arranged to blame someone else.','This level is about the frame job as much as the murder.'],
    ['0:45–1:30','Credential Logic','A duplicate staff badge, a staged login, and an emergency kit moved out of place create a deeper pattern than a single suspect’s motive.','Access records can lie when the wrong person has the right credential.'],
    ['1:30–2:15','Money Behind the Curtain','Event deposits, shell vendors, and rerouted payments give one suspect a reason to silence Lena and redirect suspicion toward Owen.','Hard difficulty makes the financial path harder because a false path also exists.'],
    ['2:15–2:40','Noise and Misdirection','Tessa, Owen, Brielle, and Cole each have reasons to look bad. That does not mean their clues are useless. Some are useful because the killer expected you to follow them.','Ask which suspect benefits from another suspect looking guilty.'],
    ['2:40–2:55','What to Prove','The strongest solution must explain the moved emergency kit, the duplicate badge, the shell vendor ledger, and the staged login metadata.','One answer should connect all four without needing coincidence.'],
    ['2:55–3:00','Your Mission','Attack every easy conclusion. If a clue points too directly, ask who had the power to place it there.','Hard cases are solved by finding the person who controlled the evidence after the crime.']
  ],
  master: []
};
STORY_BRIEFINGS.training = STORY_BRIEFINGS.easy;
STORY_BRIEFINGS.rookie = STORY_BRIEFINGS.medium;
STORY_BRIEFINGS.hard = STORY_BRIEFINGS.senior;
STORY_BRIEFINGS.master = STORY_BRIEFINGS.hard;
function storyBriefingKey(s = state) {
  const raw = String(s?.levelId || s?.difficulty || s?.difficultyLabel || '').toLowerCase();
  if (raw.includes('easy') || raw.includes('training')) return 'easy';
  if (raw.includes('hard') || raw.includes('senior') || raw.includes('master')) return 'hard';
  if (raw.includes('medium') || raw.includes('rookie') || raw.includes('junior') || raw.includes('detective')) return 'medium';
  return 'medium';
}

function renderStoryBriefingContent() {
  const wrap = $('storyBackstory');
  if (!wrap || !state) return;
  const key = storyBriefingKey(state);
  const renderKey = `${state.sessionCode || ''}:${key}`;
  if (lastStoryBriefingKey === renderKey) return;
  lastStoryBriefingKey = renderKey;
  const beats = STORY_BRIEFINGS[key] || STORY_BRIEFINGS.medium;
  const ranges = [[0,30],[30,60],[60,90],[90,125],[125,155],[155,180]];
  wrap.innerHTML = beats.map((beat, index) => {
    const [label, title, ...paras] = beat;
    const [start, end] = ranges[index] || [index * 45, (index + 1) * 45];
    return `<article class="storyBeat" data-start="${start}" data-end="${end}">
      <div class="beatTime">Case Briefing</div>
      <h3>${escapeHtml(title)}</h3>
      ${paras.map(p => `<p>${escapeHtml(p).replace(/“([^”]+)”/g, '<b>“$1”</b>')}</p>`).join('')}
    </article>`;
  }).join('');
}


function syncServerClock(s = state) {
  if (s && Number(s.serverTime)) {
    serverClockOffsetMs = Number(s.serverTime) - Date.now();
  }
}

function serverNowMs() {
  return Date.now() + (Number(serverClockOffsetMs) || 0);
}

function briefingRemainingFromEndMs(s = state) {
  if (!s || s.phase !== 'briefing') return 0;
  const endsAt = Number(s.briefingEndsAt || 0);
  if (endsAt) return Math.max(0, endsAt - serverNowMs());
  return Math.max(0, Number(s.briefingRemainingSec || 0) * 1000);
}

function briefingRemainingSecLocal(s = state) {
  return Math.max(0, Math.ceil(briefingRemainingFromEndMs(s) / 1000));
}

function fmtLobbyCountdown(ms) {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;
  if (hours > 0) return `${String(hours).padStart(2,'0')}:${String(mins).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
  return `${String(mins).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
}

function renderLobbyCountdown() {
  const box = $('lobbyCountdownBox');
  const timer = $('lobbyCountdown');
  const note = $('lobbyCountdownNote');
  const status = $('lobbyStatusText');
  if (!box || !timer || !state || state.phase !== 'lobby') return;

  const scheduled = Number(state.scheduledStartAt || 0);
  if (!scheduled || state.autoStartEnabled === false) {
    box.classList.add('hidden');
    if (status) status.textContent = 'Waiting for scheduled briefing';
    return;
  }

  box.classList.remove('hidden');
  const remaining = scheduled - serverNowMs();
  if (remaining > 0) {
    timer.textContent = fmtLobbyCountdown(remaining);
    if (status) status.textContent = 'Waiting for scheduled start';
    if (note) note.textContent = state.scheduledStartLabel
      ? `Scheduled start: ${state.scheduledStartLabel}`
      : 'Countdown uses the session/server time.';
  } else {
    timer.textContent = '00:00';
    if (status) status.textContent = 'Starting now';
    if (note) note.textContent = 'The investigation is starting. Keep this page open.';
  }
}

function lobbyTutorialKey(s = state) {
  const sessionPart = s?.sessionCode || activeSessionKey || 'session';
  const playerPart = playerId || localStorage.getItem('detectiveAccessCode') || 'player';
  return `ptmLobbyTutorialSeen:${sessionPart}:${playerPart}`;
}

function loadLobbyTutorialState() {
  lobbyTutorialAcknowledged = localStorage.getItem(lobbyTutorialKey()) === '1';
}

function acknowledgeLobbyTutorial() {
  lobbyTutorialAcknowledged = true;
  try { localStorage.setItem(lobbyTutorialKey(), '1'); } catch (err) {}
  renderLobbyTutorial();
}

function reviewLobbyTutorial() {
  lobbyTutorialAcknowledged = false;
  try { localStorage.removeItem(lobbyTutorialKey()); } catch (err) {}
  renderLobbyTutorial();
}

function renderLobbyTutorial() {
  const tutorial = $('lobbyTutorialBox');
  const ready = $('lobbyTutorialReady');
  if (!tutorial || !ready || !state || state.phase !== 'lobby') return;
  tutorial.classList.toggle('hidden', Boolean(lobbyTutorialAcknowledged));
  ready.classList.toggle('hidden', !lobbyTutorialAcknowledged);
}

function ensureLobbyCountdownTimer() {
  if (lobbyCountdownTimer) return;
  lobbyCountdownTimer = setInterval(() => {
    renderLobbyCountdown();
  }, 1000);
}

function phaseLabel(phase) {
  return ({ lobby: 'Lobby', briefing: 'Case Setup', investigation: 'Investigation', accusation: 'Deduction Open', accusation_locked: 'Deduction Locked', revealed: 'Case Closed' })[phase] || phase;
}

function show(id, yes) {
  const el = $(id);
  if (!el) return;
  el.classList.toggle('hidden', !yes);
  if (!yes) setTimeout(processToastQueue, 80);
}

function render() {
  const joined = Boolean(state);
  $('appTopbar').classList.toggle('hidden', !joined);
  $('appMain').classList.toggle('hidden', !joined);
  $('phasePill').textContent = state ? phaseLabel(state.phase) : 'Lobby';
  $('timerPill').textContent = state ? fmt(state.phase === 'briefing' ? briefingRemainingSecLocal() : state.remainingSec) : '30:00';

  if (!state) return;
  const isLobby = state.phase === 'lobby';
  const isBriefing = state.phase === 'briefing';
  const isRevealed = state.phase === 'revealed';
  const isAccusationPhase = state.phase === 'accusation' || state.phase === 'accusation_locked';
  if (isAccusationPhase) { currentApp = 'deduction'; }
  const inGame = !isLobby && !isBriefing && !isRevealed;
  if (!isRevealed) {
    answerReviewOpen = false;
    caseLogicOpen = false;
  }

  show('lobbyCard', isLobby);
  show('briefingCard', isBriefing);
  if (isBriefing) {
    $('storyCountdown').textContent = fmt(briefingRemainingSecLocal());
    renderStoryBriefingContent();
    updateStoryBriefing();
    renderStoryTimerBar();
  }
  renderDemoControls();
  show('progressCard', inGame && Boolean(state.currentRound));
  show('homeCard', inGame && !currentApp && !isAccusationPhase);
  show('appDetailCard', inGame && currentApp && currentApp !== 'deduction' && !isAccusationPhase);
  show('accuseCard', inGame && (currentApp === 'deduction' || isAccusationPhase));
  show('revealCard', isRevealed);
  if (isRevealed) scheduleRevealAutoHome();
  show('roundPill', inGame && Boolean(state.currentRound));

  $('lobbyCode').textContent = state.sessionCode;
  const me = (state.players || []).find(p => p.id === playerId) || {};
  if ($('lobbyWelcome')) $('lobbyWelcome').textContent = `Welcome${me.firstName ? ', ' + me.firstName : ''}. Waiting for the investigation to begin.`;
  if ($('lobbyGameTitle')) $('lobbyGameTitle').textContent = state.gameTitle || 'Barfly Social Mystery';
  if ($('lobbyVenue')) $('lobbyVenue').textContent = state.venue || state.venueName || 'Venue';
  if ($('lobbySeriesLine')) {
    const chapter = state.seriesArc?.chapter || state.levelLabel || '';
    const arc = state.seriesArc?.arcTitle ? `: ${state.seriesArc.arcTitle}` : '';
    $('lobbySeriesLine').textContent = `${state.seriesTitle || 'Mystery Series'}${chapter ? ' — ' + chapter + arc : ''}`;
  }
  if ($('lobbyBackstory')) {
    $('lobbyBackstory').textContent = state.lobbyBackstory || 'A private event has turned into a case. Forensics is processing recovered evidence, suspects are waiting to be questioned, and every statement needs to be tested against the timeline.';
  }
  if ($('lobbyLevel')) $('lobbyLevel').textContent = state.difficultyLabel || state.difficulty || 'Detective Case';
  if ($('lobbyAccessCode')) $('lobbyAccessCode').textContent = localStorage.getItem('detectiveAccessCode') || me.accessCode || '—';
  $('lobbyPlayers').textContent = (state.rsvp?.checkedIn || state.players.length || 0);
  loadLobbyTutorialState();
  renderLobbyTutorial();
  renderLobbyCountdown();
  $('roundPill').textContent = state.currentRound ? state.currentRound.shortTitle || state.currentRound.title : '';

  renderProgressBar();
  if ($('topbarSubtitle')) $('topbarSubtitle').textContent = state.gameTitle || 'Live Detective Mystery Experience';
  if ($('storyBriefingTitle')) $('storyBriefingTitle').textContent = state.gameTitle || 'Mystery Case Briefing';
  if (currentApp && currentApp !== 'deduction' && !isAccusationPhase) {
    try { renderAppDetail(); }
    catch (err) {
      console.error('App detail render failed', err);
      const [emoji, label] = sectionMeta(currentApp);
      if ($('appTitle')) $('appTitle').textContent = `${emoji} ${label}`;
      if ($('appEvidence')) $('appEvidence').innerHTML = '<p class="muted">This section could not load yet. Return Home and open it again.</p>';
    }
  }
  try { renderApps(); renderDashboardSponsorStrip(); }
  catch (err) { console.error('Dashboard render failed', err); }
  renderAccuse();
  renderDeductionPopup();
  renderReveal();
}


function updateStoryBriefing() {
  if (!state || state.phase !== 'briefing') return;
  const total = Number(state.briefingTotalSec || 180);
  const remaining = briefingRemainingSecLocal();
  const elapsed = Math.max(0, total - remaining);
  document.querySelectorAll('.storyBeat').forEach((beat) => {
    const start = Number(beat.dataset.start || 0);
    const end = Number(beat.dataset.end || start + 45);
    const active = elapsed >= start && elapsed < end;
    beat.classList.toggle('activeStoryBeat', active);
    if (active && !beat.dataset.seenActive) {
      beat.dataset.seenActive = '1';
      beat.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });
}

function renderStoryTimerBar() {
  if (!state || state.phase !== 'briefing') return;
  const fill = document.getElementById('storyTimerFill');
  const label = document.getElementById('storyTimerLabel');
  if (!fill) return;
  const total = Math.max(1, Number(state.briefingTotalSec || 180));
  const remaining = briefingRemainingSecLocal();
  const elapsed = Math.max(0, total - remaining);
  const pct = Math.max(0, Math.min(100, (elapsed / total) * 100));
  fill.style.width = `${pct}%`;
  if (label) label.textContent = 'Case briefing in progress';
}

function renderProgressBar() {
  if (!state?.currentRound) return;
  const r = state.currentRound;
  const total = Math.max(1, Number(state.totalSec || 1));
  const pct = Math.max(0, Math.min(100, (Number(state.elapsedSec || 0) / total) * 100));
  $('progressRound').textContent = r.title || 'Current Round';
  $('progressTime').textContent = `${fmt(state.remainingSec)} left`;
  $('progressFill').style.width = `${pct}%`;
  $('progressObjective').textContent = r.objective || 'Review the evidence and connect the clues.';
  renderCaseBoardStats();
}

function renderCaseBoardStats() {
  // The old four stat boxes were removed from the UI.
  // Keep this no-op so older render calls cannot throw errors.
}

function queuedUpdateCount() {
  let count = dialogQueue.length;
  try { if (nextUnansweredDeductionQuestion()) count += 1; } catch (_err) {}
  return count;
}

function renderApps() {
  loadNarrativeInvestigationState();
  $('appGrid').innerHTML = Object.entries(APP_META).map(([key,[emoji,label]]) => {
    let count = 0;
    let mini = 'Open';
    if (key === 'interrogation') { count = clueCounts(state).interrogation; mini = `${count} available`; }
    else if (key === 'forensics') { count = clueCounts(state).forensics; mini = `${count} reports`; }
    else if (key === 'timeline') { count = clueCounts(state).timeline; mini = `${count} case events`; }
    else if (key === 'deduction') {
      const questions = getVisibleQuestions();
      const saved = getMySubmission()?.answers || {};
      const answered = questions.filter(q => saved[q.id]).length;
      count = Math.max(0, questions.length - answered);
      mini = questions.length ? `${answered}/${questions.length} answered` : 'Unlocks by round';
    }
    return `<button class="appIcon" onclick="openApp('${key}')"><span class="badge">${count}</span><span class="emoji">${emoji}</span><b>${label}</b><small>${mini}</small></button>`;
  }).join('');
}



function currentSponsorSlot() {
  if (!state) return 'round_1';
  if (state.phase === 'accusation' || state.phase === 'accusation_locked' || state.phase === 'revealed') return 'final';

  const rounds = Array.isArray(state.rounds) ? state.rounds : [];
  const current = state.currentRound || {};
  let index = rounds.findIndex(r => String(r.id) === String(current.id));

  if (index < 0 && Number.isFinite(Number(state.elapsedSec))) {
    const elapsed = Number(state.elapsedSec || 0);
    index = rounds.findIndex(r => elapsed >= Number(r.startSec || 0) && elapsed < Number(r.endSec || 0));
  }

  if (index < 0) {
    const n = Number(current.round || current.number || current.index || 1);
    index = Number.isFinite(n) ? Math.max(0, n - 1) : 0;
  }

  if (index >= 4) return 'round_5';
  if (index === 3) return 'round_4';
  if (index === 2) return 'round_3';
  if (index === 1) return 'round_2';
  return 'round_1';
}

function renderDashboardSponsorStrip() {
  const el = $('dashboardSponsorStrip');
  if (!el) return;
  const ads = state?.dashboardSponsorAds || {};
  const ad = ads[currentSponsorSlot()] || {};
  const hasAd = Boolean(ad && (ad.title || ad.message || ad.coupon || ad.logoUrl));
  el.classList.toggle('hidden', !hasAd);
  if (!hasAd) {
    el.innerHTML = '';
    return;
  }
  const logo = ad.logoUrl ? `<img class="dashboardSponsorLogo" src="${escapeHtml(ad.logoUrl)}" alt="${escapeHtml(ad.title || 'Sponsor')} logo" onerror="this.remove()" />` : '';
  el.innerHTML = `<div class="dashboardSponsorInner">
    ${logo}
    <div class="dashboardSponsorText">
      <div class="time">${escapeHtml(ad.title || 'Tonight’s Special')}</div>
      <strong>${escapeHtml(ad.message || 'Sponsor special available now.')}</strong>
      ${ad.coupon ? `<span>${escapeHtml(ad.coupon)}</span>` : ''}
    </div>
  </div>`;
}

function sectionMeta(key) {
  return APP_META[key] || ['🔎','Investigation'];
}

function setAppDetailShell(key) {
  const [emoji, label] = sectionMeta(key);
  if ($('appTitle')) $('appTitle').textContent = `${emoji} ${label}`;
  if ($('appEvidence')) $('appEvidence').innerHTML = '<p class="muted">Loading...</p>';
}

window.openApp = key => {
  currentApp = String(key || '').toLowerCase();
  if (currentApp && currentApp !== 'deduction') setAppDetailShell(currentApp);
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.closeDetectiveNotes = () => { currentApp = null; render(); };

function renderAppDetail() {
  if (!currentApp || currentApp === 'deduction') return;
  setAppDetailShell(currentApp);
  if (currentApp === 'interrogation') { renderInterrogation(); return; }
  if (currentApp === 'forensics') { renderForensics(); return; }
  if (currentApp === 'timeline') { renderTimeline(); return; }
  const [emoji,label] = sectionMeta(currentApp);
  $('appTitle').textContent = `${emoji} ${label}`;
  const clues = (state.apps?.[currentApp] || []);
  $('appEvidence').innerHTML = clues.length ? clues.map(clueHtml).join('') : '<p class="muted">No evidence has unlocked in this section yet.</p>';
}

function narrativeStorageKey(suffix) {
  return `narrative:${state?.sessionCode || 'session'}:${playerId || 'player'}:${suffix}`;
}

function loadNarrativeInvestigationState() {
  try { interrogationViewed = JSON.parse(localStorage.getItem(narrativeStorageKey('interrogationViewed')) || '{}'); } catch (_err) { interrogationViewed = {}; }
  if (!interrogationViewed || typeof interrogationViewed !== 'object') interrogationViewed = {};
}

function saveNarrativeInvestigationState() {
  try { localStorage.setItem(narrativeStorageKey('interrogationViewed'), JSON.stringify(interrogationViewed)); } catch (_err) {}
}

function narrativeEvidenceSourceLabel(appKey) {
  const labels = {
    phone: 'Recovered Phone Analysis', messages: 'Message Extraction Report', maps: 'Location Analysis', bank: 'Financial Records Review',
    photos: 'Photo / Video Review', social: 'Social Media Review', contacts: 'Interrogation', notes: 'Physical Evidence Report',
    files: 'Document / Metadata Review', browser: 'Browser History Review', forensics: 'Forensics Report', evidence: 'Physical Evidence Report', interrogation: 'Interrogation', timeline: 'Timeline', caseUpdate: 'Scene Report'
  };
  return labels[appKey] || 'Physical Evidence';
}

function dashboardEvidenceItems(key) {
  const normalizedKey = String(key || '').toLowerCase();
  const direct = state?.dashboardEvidence?.[normalizedKey];
  const appItems = state?.apps?.[normalizedKey];
  const directItems = Array.isArray(direct) ? direct : [];
  const appBucketItems = Array.isArray(appItems) ? appItems : [];
  // Merge instead of returning the direct bucket only. Some active browser sessions
  // may receive a state object where dashboardEvidence exists but a bucket is empty
  // while apps.<bucket> still contains the visible clue list. Returning only the empty
  // direct bucket made Forensics / Interrogation / Timeline look blank even though
  // the toast system could see unlocked evidence.
  const merged = [...directItems, ...appBucketItems];
  const seen = new Set();
  return merged.filter(item => {
    if (!item) return false;
    const id = item.id || `${normalizedKey}:${item.title || ''}:${item.text || ''}:${item.unlockSec || ''}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}


function isInterrogationLikeItem(c) {
  const type = String(c?.type || '').toLowerCase();
  const combined = `${c?.title || ''} ${c?.text || ''}`;
  return type === 'statement' || /suspect statement|witness statement|interrogation|alibi|witness/i.test(combined);
}

function isCleanDashboardItem(c) {
  return c && !isInternalSystemClue(c);
}

function getVisibleForensicsEvidenceItems() {
  const phase = state?.phase || 'lobby';
  if (!state || phase === 'lobby' || phase === 'briefing') return [];
  const items = [];

  // Direct four-button truth packs: every unlocked apps/dashboardEvidence.forensics
  // item is a Forensics report. Do not run old Phone/Bank/Browser filters here.
  for (const c of dashboardEvidenceItems('forensics')) {
    if (!isCleanDashboardItem(c)) continue;
    items.push({ ...c, appKey: 'forensics', appLabel: c.source || 'Forensics' });
  }

  const seen = new Set();
  return items.filter(item => {
    const key = item.id || `${item.title}:${item.text}:${item.unlockSec}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a,b) => Number(b.unlockSec || 0) - Number(a.unlockSec || 0));
}

function forensicAnalysisText(item) {
  const source = narrativeEvidenceSourceLabel(item.appKey);
  const storyTime = item.evidenceTime || item.claimTime || '';
  const natural = String(item.text || '').trim();
  const title = item.title || 'the submitted evidence';
  if (item.appKey === 'messages') return `The message extraction is final. It places ${title} into the case record${storyTime ? ` around ${storyTime}` : ''}. The wording and timing can now be compared against Interrogation.`;
  if (item.appKey === 'bank') return `The financial review is final. ${title} is now tied to the money trail, and the timing can be compared against who had access and motive.`;
  if (item.appKey === 'maps') return `The location review is final. The movement record helps confirm who could realistically be near the scene when the critical action happened.`;
  if (item.appKey === 'photos') return `The image review is final. The photo preserves what was visible at the scene${storyTime ? ` at ${storyTime}` : ''}; compare it against Interrogation and the developing Timeline.`;
  if (item.appKey === 'phone') return `The phone review is final. Call activity and device timing can now be compared against the suspect's claimed location.`;
  return `The ${source.toLowerCase()} analysis is final. ${natural || `Forensics completed its review of ${title}.`} Compare this result against the timeline and any alibi connected to the same window.`;
}

function getForensicsResults() {
  return getVisibleForensicsEvidenceItems().map(item => ({
    ...item,
    ready: true,
    remainingSec: 0,
    analysisText: forensicAnalysisText(item)
  }));
}

function getVisibleInterrogationItems() {
  if (!state || ['lobby','briefing'].includes(state.phase)) return [];
  const items = [];
  for (const c of dashboardEvidenceItems('interrogation')) {
    items.push({ ...c, appKey: 'interrogation', appLabel: 'Interrogation' });
  }
  // Backward compatibility only: older packs may still keep statements in contacts.
  for (const c of (state.apps?.contacts || [])) {
    items.push({ ...c, appKey: 'interrogation', appLabel: 'Interrogation' });
  }
  const seen = new Set();
  return items.filter(item => {
    const key = item.id || `${item.appKey}:${item.title}:${item.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a,b) => Number(a.unlockSec || 0) - Number(b.unlockSec || 0));
}

function interrogationName(item) {
  return String(item.title || 'Witness Statement').replace(/^Suspect Statement:\s*/i, '').replace(/^Witness Statement:\s*/i, '').trim();
}

window.askInterrogationPrompt = function askInterrogationPrompt(id, promptKey) {
  loadNarrativeInvestigationState();
  interrogationViewed[`${id}:${promptKey}`] = true;
  saveNarrativeInvestigationState();
  render();
};

function interrogationAnswer(item, promptKey) {
  return item.text || 'No statement is available yet.';
}

function renderInterrogation() {
  const [emoji,label] = APP_META.interrogation;
  $('appTitle').textContent = `${emoji} ${label}`;
  loadNarrativeInvestigationState();
  const items = getVisibleInterrogationItems();
  $('appEvidence').innerHTML = `<div class="narrativePanel"><div class="time">Witnesses & Suspects</div><h3>Interrogation Statements</h3><p>Read what each person said.</p></div>` + (items.length ? items.map(item => {
    const name = interrogationName(item);
    const prompts = [
      ['alibi','Alibi'],
      ['timeline','Timing'],
      ['motive','What They Noticed']
    ];
    return `<div class="feedItem interrogationCard"><div class="time">Interrogation${item.claimTime ? ' · Claimed Time: ' + escapeHtml(item.claimTime) : ''}</div><h4>${escapeHtml(name || 'Witness')}</h4><div class="promptList">${prompts.map(([key,label]) => {
      const seen = interrogationViewed[`${item.id}:${key}`];
      return `<button class="secondary compact" type="button" onclick="askInterrogationPrompt('${escapeHtml(item.id)}','${key}')">${escapeHtml(label)}</button>${seen ? `<p class="interviewAnswer"><b>${escapeHtml(label)}:</b> ${escapeHtml(interrogationAnswer(item,key))}</p>` : ''}`;
    }).join('')}</div></div>`;
  }).join('') : '<p class="muted">No interviews are available yet. Case updates will open new witness and suspect statements.</p>');
}

function renderForensics() {
  const [emoji,label] = APP_META.forensics;
  $('appTitle').textContent = `${emoji} ${label}`;
  const labs = getForensicsResults();
  $('appEvidence').innerHTML = labs.length ? labs.map(item => {
    return `<div class="feedItem labReady"><div class="time">${escapeHtml(item.appLabel || 'Forensics')}${item.evidenceTime ? ' · Story Time: ' + escapeHtml(item.evidenceTime) : ''}</div><h4>${escapeHtml(item.title || 'Forensic Result')}</h4><p>${escapeHtml(item.analysisText)}</p></div>`;
  }).join('') : '<p class="muted">No forensic results have returned yet.</p>';
}

function parseStoryMinute(timeText) {
  const m = String(timeText || '').match(/(\d{1,2}):(\d{2})/);
  if (!m) return 9999;
  return Number(m[1]) * 60 + Number(m[2]);
}

function buildTimelineItems() {
  // Timeline is a verified case record, not a transcript of every claim.
  // New truth packs place confirmed events directly under apps.timeline.
  if (!state || ['lobby','briefing'].includes(state.phase)) return [];
  const items = [];
  for (const item of dashboardEvidenceItems('timeline')) {
    items.push({
      id: `timeline-${item.id || item.title}`,
      time: item.evidenceTime || item.time || 'Time unknown',
      title: item.title || 'Verified Timeline Event',
      text: item.text || item.description || 'Verified timeline event recorded.',
      source: item.source || 'Verified timeline entry'
    });
  }
  const seen = new Set();
  return items.filter(item => {
    const key = `${item.time}:${item.title}:${item.text}`;
    if (seen.has(key)) return false; seen.add(key); return true;
  }).sort((a,b) => parseStoryMinute(b.time) - parseStoryMinute(a.time));
}

function renderTimeline() {
  const [emoji,label] = APP_META.timeline;
  $('appTitle').textContent = `${emoji} ${label}`;
  const items = buildTimelineItems();
  const timelineHtml = items.length
    ? `<div class="timelineList">${items.map(item => `<div class="timelineItem"><b>${escapeHtml(item.time || 'Time unknown')}</b><div><h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.text)}</p>${item.source ? `<p class="muted"><b>Source:</b> ${escapeHtml(item.source)}</p>` : ''}</div></div>`).join('')}</div>`
    : '<p class="muted">No timeline events have unlocked yet.</p>';
  $('appEvidence').innerHTML = timelineHtml;
}


function isDetectiveNotesOpen() { return false; }
function updateDetectiveNotesStatus() {}

function getVisibleQuestionsForState(s) {
  if (!s?.accusation?.questions) return [];
  const elapsed = Number(s.elapsedSec || 0);
  const phase = s.phase || 'lobby';
  return (s.accusation.questions || []).filter(q => {
    const unlockSec = Number(q.unlockSec || 0);
    if (phase === 'accusation' || phase === 'accusation_locked') return true;
    if (isRoundDeductionQuestion(q)) return elapsed >= unlockSec;
    return false;
  });
}

function getVisibleQuestions() {
  return getVisibleQuestionsForState(state);
}

function questionStageLabel(question) {
  return question.stage === 'final' ? 'Final Accusation' : 'Round Deduction';
}

function getMySubmission() {
  return (state?.submissions || []).find(s => s.playerId === playerId) || null;
}

function getMyResult() {
  return (state?.results || []).find(r => r.playerId === playerId) || null;
}

function renderAccuse() {
  const open = state.phase === 'accusation';
  const locked = state.phase === 'accusation_locked';
  const config = state.accusation || { questions: [] };
  const visibleQuestions = getVisibleQuestions();
  const submission = getMySubmission();
  const saved = submission?.answers || {};
  const answeredVisible = visibleQuestions.filter(q => saved[q.id]).length;

  if ($('finalDramaBox')) $('finalDramaBox').classList.toggle('hidden', !open);
  if (open) $('accuseStatus').textContent = `Final accusation is open. Complete all ${config.questions.length} mystery questions before submitting.`;
  else if (locked) $('accuseStatus').textContent = 'The accusation window is now closed.';
  else $('accuseStatus').textContent = `${answeredVisible}/${visibleQuestions.length} unlocked questions answered. Final questions open in ${fmt(state.remainingToAccusationSec)}.`;

  show('accuseFormWrap', Boolean(visibleQuestions.length));
  $('submitAccuseBtn').disabled = !open;
  $('submitAccuseBtn').classList.toggle('hidden', !open);
  $('submitAccuseBtn').textContent = 'Lock In Final Accusation';

  $('accuseQuestions').innerHTML = visibleQuestions.length ? visibleQuestions.map(question => {
    const selected = saved[question.id] || '';
    return `<div class="questionCard"><div class="time">${escapeHtml(questionStageLabel(question))}</div><h3>${escapeHtml(question.prompt)}</h3>${isRoundDeductionQuestion(question) && !selected ? `<div class="actions"><button class="secondary compact" type="button" onclick="openDeductionQuestion('${escapeHtml(question.id)}')">Open Deduction Question</button></div>` : ''}<div class="choiceList">${(question.options || []).map(opt => `
      <label class="choiceOption ${selected === opt.id ? 'selected' : ''}">
        <input type="radio" name="accuse-${escapeHtml(question.id)}" data-question-id="${escapeHtml(question.id)}" value="${escapeHtml(opt.id)}" ${selected === opt.id ? 'checked' : ''} ${locked ? 'disabled' : ''} />
        <span>${escapeHtml(opt.label)}</span>
      </label>`).join('')}</div></div>`;
  }).join('') : '<p class="muted">No deduction questions have unlocked yet. Keep investigating.</p>';

  const total = config.questions?.length || 10;
  const answeredTotal = (config.questions || []).filter(q => saved[q.id]).length;
  const submittedText = submission?.finalSubmittedAt
    ? `Final mystery submitted at ${new Date(submission.finalSubmittedAt).toLocaleTimeString()}.`
    : `${answeredTotal}/${total} total mystery questions answered.`;
  $('accuseResult').textContent = submittedText;
  setTimeout(syncChoiceHighlights, 0);
}

function syncChoiceHighlights() {
  document.querySelectorAll('.choiceOption').forEach(label => label.classList.toggle('selected', Boolean(label.querySelector('input:checked'))));
}

function syncDeductionPopupSelection() {
  const selectedInput = document.querySelector('#deductionPopupChoices input[type="radio"]:checked');
  deductionPopupSelected = selectedInput?.value || deductionPopupSelected || '';
  if (deductionPopupQuestionId && deductionPopupSelected) rememberDeductionPopupSelection(deductionPopupQuestionId, deductionPopupSelected);
  document.querySelectorAll('.deductionPopupChoice').forEach(label => {
    label.classList.toggle('selected', Boolean(label.querySelector('input:checked')));
  });
  if ($('deductionPopupSubmit')) $('deductionPopupSubmit').disabled = !deductionPopupSelected;
  if (deductionPopupSelected && $('deductionPopupStatus')) {
    $('deductionPopupStatus').textContent = 'Answer selected. Submit when ready.';
  }
}

async function saveQuestionAnswer(input) {
  if (!state || !input?.dataset?.questionId || !input.value) return;
  const answers = { [input.dataset.questionId]: input.value };
  try {
    deductionPopupIsSubmitting = true;
    if ($('deductionPopupSubmit')) $('deductionPopupSubmit').disabled = true;
    if ($('deductionPopupStatus')) $('deductionPopupStatus').textContent = 'Submitting deduction answer...';
    const data = await api(`/api/sessions/${state.sessionCode}/answer`, {
      method: 'POST',
      body: { playerId, answers }
    });
    state = data.state;
    const submission = getMySubmission();
    const total = state.accusation?.questions?.length || 10;
    const answeredTotal = (state.accusation?.questions || []).filter(q => submission?.answers?.[q.id]).length;
    $('accuseResult').textContent = `Saved. ${answeredTotal}/${total} total mystery questions answered.`;
  } catch (err) {
    $('accuseResult').textContent = err.message;
  }
}

async function submitAccusation() {
  try {
    const config = state.accusation || { questions: [] };
    const submission = getMySubmission();
    const answers = { ...(submission?.answers || {}) };
    const missing = [];
    for (const question of config.questions || []) {
      const selected = document.querySelector(`input[name="accuse-${question.id}"]:checked`);
      if (selected) answers[question.id] = selected.value;
      if (!answers[question.id]) missing.push(question.prompt || question.id);
    }
    if (missing.length) {
      $('accuseResult').textContent = `Please answer all ${config.questions.length} mystery questions before submitting.`;
      return;
    }
    const data = await api(`/api/sessions/${state.sessionCode}/accuse`, {
      method: 'POST',
      body: { playerId, answers }
    });
    $('accuseResult').textContent = 'Final accusation submitted.';
    state = data.state;
    render();
  } catch (err) {
    $('accuseResult').textContent = err.message;
  }
}

function openHostIssuePopup() {}
function closeHostIssuePopup() {}

async function requestHelp(text = '') {
  openHostIssuePopup();
}


function deductionPopupKey(questionId) {
  return `${state?.sessionCode || 'session'}:${playerId || 'player'}:${questionId}`;
}

function rememberDeductionPopupSelection(questionId, value) {
  if (!questionId || !value) return;
  deductionPopupSelections[deductionPopupKey(questionId)] = value;
}

function getRememberedDeductionPopupSelection(questionId) {
  if (!questionId) return '';
  return deductionPopupSelections[deductionPopupKey(questionId)] || '';
}

function nextUnansweredDeductionQuestion() {
  if (!state || !playerId || !['investigation','accusation'].includes(state.phase)) return null;
  const submission = getMySubmission();
  const saved = submission?.answers || {};
  const elapsed = Number(state.elapsedSec || 0);
  return (state.accusation?.questions || [])
    .filter(q => isRoundDeductionQuestion(q) && elapsed >= Number(q.unlockSec || 0) && !saved[q.id])
    .sort((a,b) => Number(a.unlockSec || 0) - Number(b.unlockSec || 0))[0] || null;
}

function renderDeductionPopup(forceQuestion = null) {
  if (!forceQuestion && toastOpen) return;
  const q = forceQuestion || nextUnansweredDeductionQuestion();
  if (!q) {
    if ($('deductionOverlay')) show('deductionOverlay', false);
    deductionPopupQuestionId = '';
    deductionPopupSelected = '';
    deductionPopupIsSubmitting = false;
    return;
  }

  const savedAnswer = getMySubmission()?.answers?.[q.id] || '';
  if (savedAnswer && !forceQuestion) {
    if ($('deductionOverlay')) show('deductionOverlay', false);
    deductionPopupQuestionId = '';
    deductionPopupSelected = '';
    return;
  }

  const key = deductionPopupKey(q.id);
  if (!forceQuestion && deductionPopupDismissed[key]) return;

  const overlayIsOpen = $('deductionOverlay') && !$('deductionOverlay').classList.contains('hidden');
  const sameQuestionOpen = overlayIsOpen && deductionPopupQuestionId === q.id && $('deductionPopupChoices')?.children?.length;
  const preservedSelection = getRememberedDeductionPopupSelection(q.id) || (deductionPopupQuestionId === q.id ? deductionPopupSelected : '') || '';

  deductionPopupQuestionId = q.id;
  deductionPopupSelected = preservedSelection;

  // Do not rebuild the popup while a player is actively answering it. Polling can refresh the
  // session state every few seconds, and a full rebuild would clear the selected answer before
  // the player can press Submit.
  if (sameQuestionOpen && !forceQuestion) {
    const selectedInput = deductionPopupSelected
      ? document.querySelector(`#deductionPopupChoices input[value="${CSS.escape(deductionPopupSelected)}"]`)
      : null;
    if (selectedInput) selectedInput.checked = true;
    syncDeductionPopupSelection();
    return;
  }

  const deductionQuestions = (state.accusation?.questions || []).filter(x => isRoundDeductionQuestion(x));
  const roundNumber = (deductionQuestions.findIndex(x => x.id === q.id) + 1) || '';
  if ($('deductionPopupMeta')) $('deductionPopupMeta').textContent = `Deduction ${roundNumber}`;
  if ($('deductionPopupTitle')) $('deductionPopupTitle').textContent = 'Round Decision Moment';
  if ($('deductionPopupPrompt')) $('deductionPopupPrompt').textContent = q.prompt || 'Submit your deduction answer.';
  if ($('deductionPopupStatus')) $('deductionPopupStatus').textContent = deductionPopupSelected
    ? 'Answer selected. Submit when ready.'
    : 'Use only the evidence and suspect statements from this round.';
  if ($('deductionPopupSubmit')) $('deductionPopupSubmit').disabled = !deductionPopupSelected;
  if ($('deductionPopupChoices')) $('deductionPopupChoices').innerHTML = ((q.options || q.choices) || []).map(choice => {
    const checked = deductionPopupSelected === choice.id;
    return `<label class="choiceOption deductionPopupChoice ${checked ? 'selected' : ''}" tabindex="0" role="radio" aria-checked="${checked ? 'true' : 'false'}">
      <input type="radio" name="deduction-popup-${escapeHtml(q.id)}" value="${escapeHtml(choice.id)}" ${checked ? 'checked' : ''} />
      <span>${escapeHtml(choice.label)}</span>
    </label>`;
  }).join('');
  document.querySelectorAll('.deductionPopupChoice').forEach(label => {
    label.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      const input = label.querySelector('input[type="radio"]');
      if (!input) return;
      input.checked = true;
      deductionPopupSelected = input.value;
      rememberDeductionPopupSelection(deductionPopupQuestionId, input.value);
      syncDeductionPopupSelection();
    });
  });
  syncDeductionPopupSelection();
  show('deductionOverlay', true);
}

function closeDeductionPopup() {
  if (deductionPopupQuestionId) deductionPopupDismissed[deductionPopupKey(deductionPopupQuestionId)] = true;
  show('deductionOverlay', false);
  renderDialog();
  processToastQueue();
}

async function submitDeductionPopup() {
  if (deductionPopupIsSubmitting) return;
  const qid = deductionPopupQuestionId;
  const checkedInput = Array.from(document.querySelectorAll('#deductionPopupChoices input[type="radio"]')).find(input => input.checked);
  const selected = deductionPopupSelected || checkedInput?.value || '';
  if (!qid || !selected) {
    if ($('deductionPopupStatus')) $('deductionPopupStatus').textContent = 'Choose an answer before submitting.';
    return;
  }
  try {
    deductionPopupIsSubmitting = true;
    if ($('deductionPopupSubmit')) $('deductionPopupSubmit').disabled = true;
    if ($('deductionPopupStatus')) $('deductionPopupStatus').textContent = 'Submitting deduction answer...';
    const data = await api(`/api/sessions/${state.sessionCode}/answer`, {
      method: 'POST',
      body: { playerId, answers: { [qid]: selected } }
    });
    state = data.state;
    deductionPopupDismissed[deductionPopupKey(qid)] = true;
    delete deductionPopupSelections[deductionPopupKey(qid)];
    deductionPopupSelected = '';
    deductionPopupIsSubmitting = false;
    show('deductionOverlay', false);
    processToastQueue();
    notify('Deduction answer submitted');
    render();
    renderDialog();
  } catch (err) {
    deductionPopupIsSubmitting = false;
    if ($('deductionPopupSubmit')) $('deductionPopupSubmit').disabled = !deductionPopupSelected;
    if ($('deductionPopupStatus')) $('deductionPopupStatus').textContent = err.message;
  }
}


function isPlayerDemoMode() {
  return Boolean(state?.demoMode);
}

function renderDemoControls() {
  const demo = isPlayerDemoMode();
  const phase = state?.phase || '';
  const inBriefing = demo && phase === 'briefing';
  const inInvestigation = demo && phase === 'investigation';
  const inDeductionView = demo && currentApp === 'deduction' && phase === 'investigation';
  const showRoundSkip = inInvestigation && !inDeductionView;
  const showDeductionSkip = inDeductionView;
  if ($('briefingDemoControls')) $('briefingDemoControls').classList.toggle('hidden', !inBriefing);
  if ($('roundDemoControls')) $('roundDemoControls').classList.toggle('hidden', !showRoundSkip);
  if ($('deductionDemoControls')) $('deductionDemoControls').classList.toggle('hidden', !showDeductionSkip);
  if ($('playerSkipRoundBtn')) $('playerSkipRoundBtn').textContent = 'Skip Round';
  if ($('playerSkipToFinalBtn')) $('playerSkipToFinalBtn').classList.toggle('hidden', !showRoundSkip);
}

async function skipDemoBriefing() {
  if (!isPlayerDemoMode() || !state?.sessionCode) return;
  try {
    const data = await api(`/api/sessions/${state.sessionCode}/skip-briefing`, { method: 'POST', body: { playerId, demoPlayerSkip: true } });
    state = data;
    currentApp = null;
    notify('Briefing skipped');
    render();
  } catch (err) {
    showToast('Demo skip failed', err.message || 'Could not skip briefing.', 'warning');
  }
}

function nextDemoRoundStart() {
  const elapsed = Number(state?.elapsedSec || 0);
  const rounds = Array.isArray(state?.rounds) ? state.rounds : [];
  const next = rounds.find(r => Number(r.startSec || 0) > elapsed + 2);
  if (next) return Number(next.startSec || 0);
  return Number(state?.accusationOpenSec || 1440);
}

async function autoAnswerVisibleDemoDeductions() {
  if (!isPlayerDemoMode() || !state?.sessionCode || !playerId) return;
  const submission = getMySubmission();
  const saved = submission?.answers || {};
  const answers = {};
  for (const q of getVisibleQuestions()) {
    if (!isRoundDeductionQuestion(q) || saved[q.id]) continue;
    const first = (q.options || q.choices || [])[0];
    if (first?.id) answers[q.id] = first.id;
  }
  if (!Object.keys(answers).length) return;
  try {
    const data = await api(`/api/sessions/${state.sessionCode}/answer`, { method: 'POST', body: { playerId, answers } });
    state = data.state;
  } catch (_err) {
    // Demo skip should still advance even if there is no valid deduction currently unlocked.
  }
}

async function setDemoElapsed(elapsedSec) {
  if (!isPlayerDemoMode() || !state?.sessionCode) return;
  const data = await api(`/api/sessions/${state.sessionCode}/set-elapsed`, {
    method: 'POST',
    body: { elapsedSec, pushRoundPopup: false, demoPlayerSkip: true }
  });
  state = data;
}

async function skipDemoRound() {
  if (!isPlayerDemoMode()) return;
  try {
    const target = nextDemoRoundStart();
    await setDemoElapsed(target);
    // After advancing, answer any round-deduction that just unlocked so the demo can keep moving.
    await autoAnswerVisibleDemoDeductions();
    currentApp = null;
    deductionPopupDismissed = {};
    show('deductionOverlay', false);
    notify('Round skipped');
    render();
  } catch (err) {
    showToast('Demo skip failed', err.message || 'Could not skip round.', 'warning');
  }
}

async function skipDemoDeduction() {
  if (!isPlayerDemoMode()) return;
  try {
    await autoAnswerVisibleDemoDeductions();
    show('deductionOverlay', false);
    currentApp = null;
    notify('Deduction skipped');
    render();
  } catch (err) {
    showToast('Demo skip failed', err.message || 'Could not skip deduction.', 'warning');
  }
}

async function skipDemoToFinal() {
  if (!isPlayerDemoMode()) return;
  try {
    await autoAnswerVisibleDemoDeductions();
    await setDemoElapsed(Number(state?.accusationOpenSec || 1440));
    currentApp = 'deduction';
    show('deductionOverlay', false);
    notify('Final accusation opened');
    render();
  } catch (err) {
    showToast('Demo skip failed', err.message || 'Could not skip to final accusation.', 'warning');
  }
}

window.openDeductionQuestion = function(questionId) {
  const q = (state?.accusation?.questions || []).find(item => item.id === questionId);
  if (q) renderDeductionPopup(q);
};

function scheduleRevealAutoHome() {
  if (!state || state.phase !== 'revealed' || revealAutoHomeTimer) return;
  revealAutoHomeTimer = setTimeout(() => {
    if (state?.phase === 'revealed') resetPlayerToHome();
  }, 60000);
}

function renderReveal() {
  if (state.phase !== 'revealed') return;
  const result = getMyResult();
  const answer = state.answerKey || {};
  const culprit = answer.culprit || answer.killer || 'Unknown';
  const method = answer.method || answer.weapon || '';
  const motive = answer.motive || '';
  const keyEvidence = answer.keyEvidence || '';
  const explanation = answer.explanation || '';

  if (result) {
    $('resultSummary').innerHTML = `
      <div class="resultBanner caseRevealBanner">
        <div>
          <div class="time">The Reveal</div>
          <h3>Culprit: ${escapeHtml(culprit)}</h3>
          ${motive ? `<p><b>Motive:</b> ${escapeHtml(motive)}</p>` : ''}
          ${method ? `<p><b>Method:</b> ${escapeHtml(method)}</p>` : ''}
          ${keyEvidence ? `<p><b>Key Evidence:</b> ${escapeHtml(keyEvidence)}</p>` : ''}
          <p class="mini"><b>Your Rating:</b> ${escapeHtml(result.badge)} · <b>Score:</b> ${result.score} / ${result.total} · <b>Difficulty:</b> ${escapeHtml(state.difficultyLabel || 'ROOKIE DETECTIVE CASE')}</p>
        </div>
      </div>`;
    $('answerReviewPanel').innerHTML = `<div class="feedItem"><h4>Review My Answers</h4>${result.breakdown.map(item => `<p><b>${escapeHtml(item.prompt)}</b><br>Your answer: ${escapeHtml(item.selectedLabel)}${item.correct ? ' ✅' : ` ❌<br>Correct answer: ${escapeHtml(item.correctLabel)}`}</p>`).join('')}</div>`;
    $('caseLogicPanel').innerHTML = `
      <div class="feedItem"><h4>Full Case Logic</h4>
        ${culprit ? `<p><b>Killer:</b> ${escapeHtml(culprit)}</p>` : ''}
        ${method ? `<p><b>Method:</b> ${escapeHtml(method)}</p>` : ''}
        ${motive ? `<p><b>Motive:</b> ${escapeHtml(motive)}</p>` : ''}
        ${keyEvidence ? `<p><b>Key Evidence:</b> ${escapeHtml(keyEvidence)}</p>` : ''}
        ${explanation ? `<p><b>Explanation:</b> ${escapeHtml(explanation)}</p>` : ''}
      </div>`;
    $('shareCardWrap').classList.remove('hidden');
    renderBadgeCanvas(result);
  } else {
    $('resultSummary').innerHTML = `
      <div class="resultBanner caseRevealBanner">
        <div>
          <div class="time">The Reveal</div>
          <h3>Culprit: ${escapeHtml(culprit)}</h3>
          ${motive ? `<p><b>Motive:</b> ${escapeHtml(motive)}</p>` : ''}
          ${keyEvidence ? `<p><b>Key Evidence:</b> ${escapeHtml(keyEvidence)}</p>` : ''}
        </div>
      </div>`;
    $('answerReviewPanel').innerHTML = '<div class="feedItem"><h4>Review My Answers</h4><p class="muted">No player result is available on this device.</p></div>';
    $('caseLogicPanel').innerHTML = `<div class="feedItem"><h4>Full Case Logic</h4>${explanation ? `<p>${escapeHtml(explanation)}</p>` : '<p class="muted">Full case logic is not available yet.</p>'}</div>`;
    $('shareCardWrap').classList.add('hidden');
  }
  $('answerReviewPanel')?.classList.toggle('hidden', !answerReviewOpen);
  $('caseLogicPanel')?.classList.toggle('hidden', !caseLogicOpen);
  if ($('reviewAnswersBtn')) $('reviewAnswersBtn').textContent = answerReviewOpen ? 'Hide My Answers' : 'Review My Answers';
  if ($('reviewCaseLogicBtn')) $('reviewCaseLogicBtn').textContent = caseLogicOpen ? 'Hide Full Case Logic' : 'Review Full Case Logic';
  $('answerKey').innerHTML = '';
}

function toggleAnswerReview() {
  const panel = $('answerReviewPanel');
  if (!panel) return;
  answerReviewOpen = !answerReviewOpen;
  panel.classList.toggle('hidden', !answerReviewOpen);
  if ($('reviewAnswersBtn')) $('reviewAnswersBtn').textContent = answerReviewOpen ? 'Hide My Answers' : 'Review My Answers';
}

function toggleCaseLogic() {
  const panel = $('caseLogicPanel');
  if (!panel) return;
  caseLogicOpen = !caseLogicOpen;
  panel.classList.toggle('hidden', !caseLogicOpen);
  if ($('reviewCaseLogicBtn')) $('reviewCaseLogicBtn').textContent = caseLogicOpen ? 'Hide Full Case Logic' : 'Review Full Case Logic';
}

function inspectDialogTriggers(next, silent = false) {
  if (!next) return;
  if (!activeSessionKey) activeSessionKey = `detectiveAck:${next.sessionCode}`;

  const ack = getAck();
  const messages = next.hostMessages || [];
  const unseenMessages = messages.filter(m => !ack.messages.includes(m.id) && !isInternalPlayerMessage(m.title, m.text));
  if (!silent) {
    unseenMessages.forEach(m => enqueueDialog({
      key: `msg:${m.id}`,
      meta: m.kind === 'opening' ? 'Opening Briefing' : (m.kind === 'reveal' ? 'Case Closed' : 'Host Dialogue'),
      title: m.title || 'Host',
      text: m.text,
      ackType: 'message',
      ackValue: m.id
    }));
  }

  const round = next.currentRound;
  if (round && !ack.rounds.includes(round.id) && !['lobby','briefing','revealed'].includes(next.phase)) {
    enqueueDialog({
      key: `round:${round.id}`,
      meta: 'Round Opening Dialogue',
      title: round.title,
      text: round.openingDialogue || round.dialogue || round.objective || 'Review the newly unlocked evidence.',
      ackType: 'round',
      ackValue: round.id
    });
  }

  enqueueExcitementDialogues(next, ack);
  enqueueSponsorAds(next, ack);

  const myResult = (next.results || []).find(r => r.playerId === playerId);
  const resultKey = myResult ? `${myResult.playerId}:${myResult.updatedAt}` : '';
  if (myResult && next.phase === 'revealed' && !ack.results.includes(resultKey)) {
    enqueueDialog({
      key: `result:${resultKey}`,
      meta: 'Detective Results',
      title: myResult.badge,
      text: `${myResult.playerName}, you scored ${myResult.score}/${myResult.total}. Your rating is ${myResult.badge}.`,
      ackType: 'result',
      ackValue: resultKey
    });
  }

  renderDialog();
}

function enqueueExcitementDialogues(next, ack) {
  if (!next || ['lobby','briefing','revealed'].includes(next.phase)) return;
  const elapsed = Number(next.elapsedSec || 0);
  const round = next.currentRound;

  // Non-essential case flavor should not interrupt players with modals.
  // It is delivered as a toast while the Case Updates and app badges carry the detail.
  if (round && elapsed >= Number(round.startSec || 0) + 20) {
    const id = `breaking:${next.sessionCode}:${round.id}`;
    if (!ack.messages.includes(id)) {
      const roundNum = (next.rounds || []).findIndex(r => r.id === round.id) + 1;
      rememberAck('message', id);
      const updateTitle = roundNum > 1 ? `Round ${roundNum} evidence updated` : 'Investigation is live';
      const updateText = round.breakingUpdate || 'Review the latest evidence when ready.';
      if (!isInternalPlayerMessage(updateTitle, updateText)) showToast(updateTitle, updateText, 'round');
    }
  }
  if (round && round.liveActionDialogue) {
    const liveAt = Number(round.liveActionSec || (Number(round.startSec || 0) + 115));
    const liveId = `live-action:${next.sessionCode}:${round.id}`;
    if (elapsed >= liveAt && !ack.messages.includes(liveId)) {
      rememberAck('message', liveId);
      showToast(round.liveActionTitle || 'Live scene update', round.liveActionDialogue, 'scene');
    }
  }

  const warnAt = Math.floor((Number(next.totalSec || 1800) || 1800) * 0.42);
  const warningId = `redherring:${next.sessionCode}`;
  if (elapsed >= warnAt && !ack.messages.includes(warningId)) {
    rememberAck('message', warningId);
    showToast('Careful, Detectives', 'Not every suspicious detail points to the killer.', 'tip');
  }
  const lockId = `final-lock:${next.sessionCode}`;
  if (next.phase === 'accusation' && !ack.messages.includes(lockId)) {
    enqueueDialog({
      key: lockId,
      meta: 'Final Accusation Lock-In',
      title: 'The room goes quiet.',
      text: 'The evidence board is nearly complete. Choose carefully: once your final accusation is submitted, it cannot be changed.',
      ackType: 'message',
      ackValue: lockId
    });
  }
}

function sponsorAdTimingIsActive(ad, next) {
  const timing = String(ad?.timing || 'after_round_2');
  const elapsed = Number(next?.elapsedSec || 0);
  const total = Number(next?.totalSec || 1800) || 1800;
  if (timing === 'waiting_room') return ['lobby','briefing'].includes(next?.phase);
  if (timing === 'after_round_2') return next?.phase === 'investigation' && elapsed >= 10 * 60;
  if (timing === 'after_round_4') return next?.phase === 'investigation' && elapsed >= 20 * 60;
  if (timing === 'before_final') return ['investigation','accusation'].includes(next?.phase) && elapsed >= Math.max(0, Number(next?.accusationOpenSec || total) - 60);
  if (timing === 'case_closed') return next?.phase === 'revealed';
  return false;
}

function enqueueSponsorAds(next, ack) {
  const ads = (next?.sponsorAds || []).filter(ad => ad && ad.enabled !== false && ad.message);
  if (!ads.length) return;
  for (const ad of ads) {
    const id = `sponsor:${next.sessionCode}:${ad.id}:${ad.timing}`;
    if (ack.messages.includes(id)) continue;
    if (!sponsorAdTimingIsActive(ad, next)) continue;
    enqueueDialog({
      key: id,
      meta: 'Sponsor Break',
      title: ad.title || 'Tonight’s Sponsor',
      text: ad.message,
      ackType: 'message',
      ackValue: id
    });
  }
}


function inspectCountdown(next) {
  if (!next || !Array.isArray(next.rounds) || ['lobby','briefing','revealed'].includes(next.phase)) {
    show('countdownOverlay', false);
    return;
  }

  const elapsed = Number(next.elapsedSec || 0);
  const deduction = (next.accusation?.questions || [])
    .filter(q => isRoundDeductionQuestion(q))
    .map(q => ({ ...q, unlockSec: Number(q.unlockSec || 0) }))
    .filter(q => q.unlockSec > elapsed && q.unlockSec - elapsed <= 30)
    .sort((a,b) => a.unlockSec - b.unlockSec)[0];
  if (deduction) {
    const secsUntilDeduction = Math.ceil(deduction.unlockSec - elapsed);
    $('countdownMeta').textContent = 'Deduction Countdown';
    $('countdownTitle').textContent = 'Deduction opens soon';
    $('countdownReview').textContent = 'Review the evidence and suspect statements from this round only. The deduction will test what this round revealed.';
    $('countdownNumber').textContent = secsUntilDeduction;
    $('countdownNext').textContent = deduction.prompt || 'Prepare to submit your round answer.';
    show('countdownOverlay', true);
    return;
  }
  const currentIndex = next.rounds.findIndex(r => r.id === next.currentRound?.id);
  const upcoming = currentIndex >= 0 ? next.rounds[currentIndex + 1] : null;
  if (!upcoming) {
    show('countdownOverlay', false);
    return;
  }

  const secsUntil = Number(upcoming.startSec || 0) - elapsed;
  if (secsUntil > 0 && secsUntil <= 10) {
    $('countdownMeta').textContent = 'Inter-Round Countdown';
    $('countdownTitle').textContent = `Next: ${upcoming.title}`;
    $('countdownReview').textContent = next.currentRound?.countdownReview || next.currentRound?.objective || 'Review what you know so far and get ready for the next wave of evidence.';
    $('countdownNumber').textContent = secsUntil;
    $('countdownNext').textContent = `${upcoming.dialogue || upcoming.objective || 'A new round is about to begin.'}`;
    show('countdownOverlay', true);
  } else {
    show('countdownOverlay', false);
  }
}

function enqueueDialog(item) {
  if (dialogQueue.some(d => d.key === item.key)) return;
  dialogQueue.push(item);
}

function renderDialog() {
  if ($('deductionOverlay') && !$('deductionOverlay').classList.contains('hidden')) return;
  if (dialogOpen || toastOpen || !dialogQueue.length) return;
  dialogOpen = true;
  const current = dialogQueue[0];
  $('dialogMeta').textContent = current.meta || 'Host Dialogue';
  $('dialogTitle').textContent = current.title || 'Message';
  $('dialogText').textContent = current.text || '';
  activeDialogAction = current.viewAction || null;
  $('dialogViewBtn').textContent = current.viewLabel || 'View';
  $('dialogViewBtn').classList.toggle('hidden', !activeDialogAction);
  show('dialogOverlay', true);
}

function dismissDialog() {
  const current = dialogQueue.shift();
  if (current?.ackType === 'clues' && Array.isArray(current.ackValues)) {
    current.ackValues.forEach(id => rememberAck('clue', id));
  } else if (current?.ackType && current?.ackValue) {
    rememberAck(current.ackType, current.ackValue);
  }
  dialogOpen = false;
  activeDialogAction = null;
  show('dialogOverlay', false);
  if (dialogQueue.length) renderDialog();
  processToastQueue();
}

function getAckForSession(sessionCode) {
  const key = `detectiveAck:${sessionCode}`;
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : {};
    return { messages: parsed.messages || [], rounds: parsed.rounds || [], results: parsed.results || [], clues: parsed.clues || [] };
  } catch {
    return { messages: [], rounds: [], results: [], clues: [] };
  }
}

function getAck() {
  return getAckForSession((state && state.sessionCode) || activeSessionKey.replace('detectiveAck:', ''));
}

function rememberAck(type, value) {
  const ack = getAck();
  if (type === 'message' && !ack.messages.includes(value)) ack.messages.push(value);
  if (type === 'round' && !ack.rounds.includes(value)) ack.rounds.push(value);
  if (type === 'result' && !ack.results.includes(value)) ack.results.push(value);
  if (type === 'clue' && !ack.clues.includes(value)) ack.clues.push(value);
  localStorage.setItem(activeSessionKey, JSON.stringify(ack));
}

async function renderBadgeCanvas(result) {
  if (!result) return;
  const renderKey = `cleanBadgeV3:${result.playerId}:${result.updatedAt}:${result.badge}:${result.score}:${state?.difficultyLabel || ''}`;
  if (renderKey === lastBadgeKey) return;
  lastBadgeKey = renderKey;
  const canvas = $('badgeCanvas');
  const ctx = canvas.getContext('2d');
  const bg = await loadImage('/assets/barfly-social-mystery-fullscreen-bg.png');
  const logo = await loadImage('/assets/barfly-social-logo.png').catch(() => null);

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.filter = 'blur(5px)';
  drawCoverImage(ctx, bg, canvas.width, canvas.height);
  ctx.restore();

  const bgShade = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bgShade.addColorStop(0, 'rgba(3,5,12,0.76)');
  bgShade.addColorStop(0.48, 'rgba(3,5,12,0.62)');
  bgShade.addColorStop(1, 'rgba(3,5,12,0.88)');
  ctx.fillStyle = bgShade;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(37,211,255,0.30)';
  ctx.lineWidth = 8;
  roundedRect(ctx, 44, 44, canvas.width - 88, canvas.height - 88, 34);
  ctx.stroke();

  if (logo) {
    const maxW = 210;
    const ratio = Math.min(maxW / logo.width, 86 / logo.height);
    const w = logo.width * ratio;
    const h = logo.height * ratio;
    ctx.globalAlpha = 0.86;
    ctx.drawImage(logo, 74, 76, w, h);
    ctx.globalAlpha = 1;
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#25d3ff';
  ctx.font = '800 34px Arial';
  ctx.fillText('CASE CLOSED', canvas.width / 2, 230);

  const centerX = canvas.width / 2;
  const emblemY = 520;
  const grd = ctx.createRadialGradient(centerX, emblemY, 60, centerX, emblemY, 260);
  grd.addColorStop(0, 'rgba(255,255,255,0.18)');
  grd.addColorStop(0.58, 'rgba(255,57,185,0.20)');
  grd.addColorStop(1, 'rgba(37,211,255,0.10)');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(centerX, emblemY, 250, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.20)';
  ctx.lineWidth = 5;
  ctx.stroke();

  ctx.fillStyle = '#ffd166';
  ctx.font = '900 170px Arial';
  ctx.fillText('★', centerX, 585);

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 62px Arial';
  wrapCenteredText(ctx, result.playerName || 'Detective', centerX, 830, canvas.width - 250, 70);

  ctx.fillStyle = '#ffd166';
  ctx.font = '900 74px Arial';
  wrapCenteredText(ctx, result.badge || 'Detective', centerX, 1000, canvas.width - 220, 82);

  ctx.fillStyle = '#f8fbff';
  ctx.font = '800 48px Arial';
  ctx.fillText(`${result.score} / ${result.total} Correct`, centerX, 1190);

  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  roundedRect(ctx, 116, 1305, canvas.width - 232, 250, 34);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,57,185,0.26)';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 54px Arial';
  ctx.fillText('Barfly Social Mystery', centerX, 1398);
  ctx.fillStyle = '#ffd7f4';
  ctx.font = '700 31px Arial';
  ctx.fillText(state?.gameTitle || 'Barfly Social Mystery', centerX, 1454);
  ctx.fillStyle = '#dbe7ff';
  ctx.font = '700 28px Arial';
  ctx.fillText(state?.difficultyLabel || 'Detective Mystery', centerX, 1506);

  ctx.fillStyle = 'rgba(255,255,255,0.86)';
  ctx.font = '700 26px Arial';
  ctx.fillText('Share your badge and challenge your friends.', centerX, 1690);
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapCenteredText(ctx, text, centerX, startY, maxWidth, lineHeight) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  let line = '';
  let y = startY;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, centerX, y);
      line = word;
      y += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, centerX, y);
}

function drawCoverImage(ctx, img, w, h) {
  const ir = img.width / img.height;
  const tr = w / h;
  let dw, dh, dx, dy;
  if (ir > tr) {
    dh = h;
    dw = h * ir;
    dx = (w - dw) / 2;
    dy = 0;
  } else {
    dw = w;
    dh = w / ir;
    dx = 0;
    dy = (h - dh) / 2;
  }
  ctx.drawImage(img, dx, dy, dw, dh);
}

function loadImage(src) {
  if (imageCache[src]) return imageCache[src];
  imageCache[src] = new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
  return imageCache[src];
}

async function canvasBlob() {
  const canvas = $('badgeCanvas');
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

async function shareBadge() {
  const result = getMyResult();
  if (!result) return;
  await renderBadgeCanvas(result);
  const blob = await canvasBlob();
  if (!blob) return;
  const safeName = (result.playerName || 'detective').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'detective';
  const file = new File([blob], `barfly-mystery-template-${safeName}.png`, { type: 'image/png' });
  try {
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      await navigator.share({ title: 'Barfly Social Mystery', text: `${result.playerName} earned the ${result.badge} badge.`, files: [file] });
    } else {
      await downloadBadge();
    }
  } catch (_err) {}
}

async function downloadBadge() {
  const result = getMyResult();
  if (!result) return;
  await renderBadgeCanvas(result);
  const canvas = $('badgeCanvas');
  const safeName = (result.playerName || 'detective').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'detective';
  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = `barfly-mystery-template-${safeName}.png`;
  link.click();
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

// Build marker: rsvp-title-preview-excerpt-template-001

ensureLobbyCountdownTimer();
