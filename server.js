const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { WebSocketServer } = require('ws');
const { createDatabase } = require('./database');

const PORT = process.env.PORT || 3000;
const GAME_TOTAL_SEC = 30 * 60;
const BRIEFING_TOTAL_SEC = 3 * 60;
const ACCUSATION_OPEN_SEC = 24 * 60;
const ACCUSATION_LOCK_SEC = 28 * 60;

function nanoid(size = 12) {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let id = '';
  for (let i = 0; i < size; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function makeAccessCode(existingCodes = new Set()) {
  let code = '';
  do {
    code = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
  } while (existingCodes.has(code) || isDemoAccessCode(code));
  existingCodes.add(code);
  return code;
}

function normalizeAccessCode(value) {
  const cleaned = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('PTMFREE')) return `PTM-FREE-${cleaned.slice(7)}`.slice(0, 24);
  if (cleaned.startsWith('PTM')) return `PTM-${cleaned.slice(3)}`.slice(0, 24);
  return cleaned;
}

function normalizePhoneNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits.slice(0, 10);
}

function isValidPhoneNumber(value) {
  return normalizePhoneNumber(value).length === 10;
}

const DEFAULT_DEMO_ACCESS_CODE = 'PELICAN';
const DEMO_SESSION_CODE = 'DEMO';
let demoAccessCode = normalizeDemoCode(process.env.DEMO_ACCESS_CODE || DEFAULT_DEMO_ACCESS_CODE);

function normalizeDemoCode(value) {
  const cleaned = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 32);
  return cleaned || DEFAULT_DEMO_ACCESS_CODE;
}

function isDemoAccessCode(value) {
  return normalizeDemoCode(value) === demoAccessCode;
}

function demoSettings() {
  return { demoAccessCode };
}

function normalizeEventType(value) {
  return String(value || 'paid').toLowerCase() === 'free' ? 'free' : 'paid';
}

function sanitizeUrl(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) return '';
  return url.slice(0, 500);
}

function normalizeTicketPrice(value) {
  const raw = String(value ?? '').replace(/[^0-9.]/g, '');
  if (!raw) return '';
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0) return '';
  return num.toFixed(2).replace(/\.00$/, '');
}

function eventPriceLabel(session) {
  if (normalizeEventType(session.eventType) === 'free') return 'Free Event';
  const price = normalizeTicketPrice(session.ticketPrice || session.eventPrice || '');
  return price ? `Paid Event · $${price}` : 'Paid Event';
}

function makeSharedAccessCode(sessionCode = '') {
  // Shared/free-event player codes follow the same player-code rule: 5 numeric digits.
  return String(Math.floor(Math.random() * 100000)).padStart(5, '0');
}

function normalizeSharedAccessCode(value, sessionCode = '') {
  const raw = String(value || '').trim();
  if (!raw) return makeSharedAccessCode(sessionCode);
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 5) return digits.slice(0, 5);
  return makeSharedAccessCode(sessionCode);
}
function normalizeInstagram(value) {
  const cleaned = String(value || '').trim().replace(/^@+/, '').replace(/[^A-Za-z0-9._]/g, '').slice(0, 40);
  return cleaned ? `@${cleaned}` : '';
}

function normalizeContact(value) {
  const phone = normalizePhoneNumber(value);
  return phone || String(value || '').trim().slice(0, 120);
}


const AD_TIMINGS = new Set(['waiting_room','after_round_2','after_round_4','before_final','case_closed']);
function normalizeSponsorAd(ad = {}) {
  const timing = AD_TIMINGS.has(String(ad.timing || 'after_round_2')) ? String(ad.timing || 'after_round_2') : 'after_round_2';
  return {
    id: String(ad.id || nanoid(8)),
    title: String(ad.title || 'Sponsor Break').trim().slice(0, 80) || 'Sponsor Break',
    message: String(ad.message || '').trim().slice(0, 500),
    timing,
    enabled: ad.enabled !== false,
    createdAt: Number(ad.createdAt || Date.now())
  };
}
function normalizeSponsorAds(session) {
  session.sponsorAds = Array.isArray(session.sponsorAds) ? session.sponsorAds.map(normalizeSponsorAd).filter(ad => ad.message) : [];
  return session.sponsorAds;
}

const DASHBOARD_AD_SLOTS = ['round_1','round_2','round_3','round_4','round_5','final'];
function normalizeDashboardSponsorAd(ad = {}) {
  return {
    title: String(ad.title || '').trim().slice(0, 80),
    message: String(ad.message || '').trim().slice(0, 140),
    coupon: String(ad.coupon || '').trim().slice(0, 120),
    logoUrl: sanitizeUrl(ad.logoUrl || ''),
    enabled: ad.enabled !== false
  };
}
function normalizeDashboardSponsorAds(session) {
  const source = (session && typeof session.dashboardSponsorAds === 'object' && session.dashboardSponsorAds) ? session.dashboardSponsorAds : {};
  const out = {};
  DASHBOARD_AD_SLOTS.forEach(slot => {
    const normalized = normalizeDashboardSponsorAd(source[slot] || {});
    if (normalized.title || normalized.message || normalized.coupon || normalized.logoUrl) out[slot] = normalized;
  });
  session.dashboardSponsorAds = out;
  return out;
}

function normalizeGuestCount(value) {
  const n = Number(value || 1);
  return Math.max(1, Math.min(10, Number.isFinite(n) ? Math.floor(n) : 1));
}

function makeDisplayName(firstName, lastName, fallback = 'Detective') {
  const first = String(firstName || '').trim();
  const last = String(lastName || '').trim();
  if (first && last) return `${first} ${last.charAt(0).toUpperCase()}.`;
  if (first) return first;
  const fb = String(fallback || '').trim();
  return fb || 'Detective';
}

function fullName(firstName, lastName, fallback = 'Detective') {
  const name = `${String(firstName || '').trim()} ${String(lastName || '').trim()}`.trim();
  return name || String(fallback || '').trim() || 'Detective';
}


function makeAccessCodes(count = 25) {
  const cap = Math.max(1, Math.min(100, Number(count || 25)));
  const used = new Set();
  return Array.from({ length: cap }, () => ({
    code: makeAccessCode(used),
    paid: false,
    claimed: false,
    playerId: '',
    playerName: '',
    firstName: '',
    lastName: '',
    instagram: '',
    socialMedia: '',
    contact: '',
    phone: '',
    displayName: '',
    claimedAt: null,
    checkedIn: false,
    checkedInAt: null
  }));
}

const APP_BUCKETS = [
  'phone', 'messages', 'maps', 'bank', 'photos', 'social',
  'contacts', 'notes', 'files', 'browser',
  'forensics', 'evidence', 'interrogation', 'timeline', 'deduction'
];

function makeEmptyApps() {
  return APP_BUCKETS.reduce((obj, key) => {
    obj[key] = [];
    return obj;
  }, {});
}

function normalizeBucket(bucket) {
  const b = String(bucket || 'notes').toLowerCase().trim();
  return APP_BUCKETS.includes(b) ? b : 'notes';
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const database = createDatabase();

app.use(express.json({ limit: '1mb' }));

function currentOrigin(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  return `${proto}://${host}`;
}

function escapeMeta(value) {
  return String(value || '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

function servePlayerWithRichPreview(req, res) {
  const file = path.join(__dirname, 'public', 'player', 'index.html');
  const origin = currentOrigin(req);
  const playerUrl = `${origin}/player/`;
  const imageUrl = `${origin}/assets/barfly-social-mystery-fullscreen-bg.png`;
  let html = fs.readFileSync(file, 'utf8');
  const richMeta = `
  <meta property="og:url" content="${escapeMeta(playerUrl)}" />
  <meta property="og:image" content="${escapeMeta(imageUrl)}" />
  <meta property="og:image:secure_url" content="${escapeMeta(imageUrl)}" />
  <meta name="twitter:image" content="${escapeMeta(imageUrl)}" />`;
  html = html.replace('</head>', `${richMeta}
</head>`);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}

app.get(['/player', '/player/'], servePlayerWithRichPreview);
app.use(express.static(path.join(__dirname, 'public')));

const truthPacks = loadTruthPacks();
const sessions = new Map();
const socketsBySession = new Map();

function loadTruthPacks() {
  const dir = path.join(__dirname, 'truth-packs');
  const packs = {};
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    const raw = fs.readFileSync(path.join(dir, file), 'utf8');
    const pack = JSON.parse(raw);
    packs[pack.id] = pack;
  }
  return packs;
}

function getPack(sessionOrId) {
  const id = typeof sessionOrId === 'string' ? sessionOrId : sessionOrId?.truthPackId;
  return truthPacks[id] || truthPacks['sample-episode-01-medium'] || truthPacks['sample-episode-01-easy'] || truthPacks['sample-episode-04-hard'];
}

function aggregateTruthPack(pack) {
  const publicClues = [];
  const appClues = [];

  if (Array.isArray(pack.publicClues)) {
    for (const clue of pack.publicClues) publicClues.push({ ...clue, bucket: 'public' });
  }

  if (pack.apps && typeof pack.apps === 'object') {
    for (const [bucket, clues] of Object.entries(pack.apps)) {
      if (!Array.isArray(clues)) continue;
      for (const clue of clues) appClues.push({ ...clue, bucket: normalizeBucket(bucket) });
    }
  }

  if (pack.roles && typeof pack.roles === 'object') {
    for (const role of Object.values(pack.roles)) {
      if (!role || !Array.isArray(role.clues)) continue;
      for (const clue of role.clues) {
        appClues.push({ ...clue, bucket: normalizeBucket(clue.bucket || clue.app || 'notes') });
      }
    }
  }

  return { publicClues, appClues };
}

function computeElapsedSec(session) {
  if (session.status === 'briefing') return 0;
  if (!session.startedAt) return session.elapsedAtPause || 0;
  return Math.min(GAME_TOTAL_SEC, Math.max(0, Math.floor((Date.now() - session.startedAt) / 1000)));
}

function computeBriefingEndsAt(session) {
  if (!session || !session.briefingStartedAt) return null;
  return Number(session.briefingEndsAt || (Number(session.briefingStartedAt) + BRIEFING_TOTAL_SEC * 1000));
}

function computeBriefingElapsedSec(session) {
  if (!session || session.status !== 'briefing' || !session.briefingStartedAt) return 0;
  return Math.max(0, Math.floor((Date.now() - Number(session.briefingStartedAt)) / 1000));
}

function computeBriefingRemainingSec(session) {
  if (!session || session.status !== 'briefing' || !session.briefingStartedAt) return 0;
  const endsAt = computeBriefingEndsAt(session);
  if (!endsAt) return 0;
  return Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
}

function computePhase(session) {
  if (session.status === 'lobby') return 'lobby';
  if (session.status === 'briefing') return 'briefing';
  if (session.status === 'revealed') return 'revealed';

  const elapsedSec = computeElapsedSec(session);
  if (elapsedSec >= GAME_TOTAL_SEC || elapsedSec >= ACCUSATION_LOCK_SEC) return 'accusation_locked';
  if (elapsedSec >= ACCUSATION_OPEN_SEC) return 'accusation';
  return 'investigation';
}

function normalizeRounds(pack) {
  const provided = Array.isArray(pack?.rounds) ? pack.rounds : [];
  const fallback = [
    { id: 'r1', title: 'Round 1: The Body', shortTitle: 'Body', startSec: 0, endSec: 5 * 60, objective: 'Review the scene.', dialogue: 'The case begins now.' },
    { id: 'r2', title: 'Round 2: The Timeline', shortTitle: 'Timeline', startSec: 5 * 60, endSec: 10 * 60, objective: 'Rebuild the timeline.', dialogue: 'Track movement.' },
    { id: 'r3', title: 'Round 3: The Digital Trail', shortTitle: 'Digital', startSec: 10 * 60, endSec: 15 * 60, objective: 'Review altered digital records.', dialogue: 'Follow the digital trail.' },
    { id: 'r4', title: 'Round 4: The Money', shortTitle: 'Money', startSec: 15 * 60, endSec: 20 * 60, objective: 'Follow the money.', dialogue: 'The motive sharpens.' },
    { id: 'r5', title: 'Round 5: The Cover-Up', shortTitle: 'Cover-Up', startSec: 20 * 60, endSec: ACCUSATION_OPEN_SEC, objective: 'Connect the cover-up.', dialogue: 'The cover-up breaks.' },
    { id: 'r6', title: 'Final Accusation', shortTitle: 'Final', startSec: ACCUSATION_OPEN_SEC, endSec: ACCUSATION_LOCK_SEC, objective: 'Submit your final answers.', dialogue: 'Choose carefully.' }
  ];

  return (provided.length ? provided : fallback)
    .map((r, idx) => ({
      id: r.id || `round-${idx + 1}`,
      title: r.title || `Round ${idx + 1}`,
      shortTitle: r.shortTitle || r.title || `Round ${idx + 1}`,
      startSec: Number(r.startSec || 0),
      endSec: Number(r.endSec || GAME_TOTAL_SEC),
      objective: r.objective || '',
      dialogue: r.dialogue || '',
      countdownReview: r.countdownReview || ''
    }))
    .sort((a, b) => a.startSec - b.startSec);
}

function currentRoundFor(session, pack) {
  const rounds = normalizeRounds(pack);
  const elapsedSec = computeElapsedSec(session);
  const phase = computePhase(session);
  let current = rounds.find(r => elapsedSec >= r.startSec && elapsedSec < r.endSec);

  if (!current) {
    if (phase === 'lobby') current = rounds[0] || null;
    else current = rounds[rounds.length - 1] || null;
  }

  return { rounds, current };
}

function visibleEvidence(session) {
  const pack = getPack(session);
  const aggregated = aggregateTruthPack(pack);
  const elapsedSec = computeElapsedSec(session);
  const publicClues = aggregated.publicClues
    .filter(c => Number(c.unlockSec || 0) <= elapsedSec)
    .sort((a, b) => Number(a.unlockSec || 0) - Number(b.unlockSec || 0));

  const apps = makeEmptyApps();
  for (const clue of aggregated.appClues) {
    if (Number(clue.unlockSec || 0) <= elapsedSec) apps[normalizeBucket(clue.bucket)].push(clue);
  }
  for (const bucket of Object.keys(apps)) {
    apps[bucket].sort((a, b) => Number(a.unlockSec || 0) - Number(b.unlockSec || 0));
  }

  const dashboardEvidence = {
    forensics: Array.isArray(apps.forensics) ? apps.forensics : [],
    interrogation: Array.isArray(apps.interrogation) ? apps.interrogation : [],
    timeline: Array.isArray(apps.timeline) ? apps.timeline : [],
    deduction: Array.isArray(apps.deduction) ? apps.deduction : []
  };
  return { publicClues, apps, dashboardEvidence };
}


function normalizePlayerNameParts(firstName = '', lastName = '', fallback = 'Detective') {
  const first = String(firstName || '').trim().slice(0, 30);
  const last = String(lastName || '').trim().slice(0, 30);
  const displayName = makeDisplayName(first, last, fallback);
  const legalName = fullName(first, last, fallback);
  return { firstName: first, lastName: last, displayName, legalName };
}

function updatePlayerDisplayName(session, playerId, firstName, lastName) {
  const player = session.players?.get?.(playerId);
  if (!player) return null;
  const parts = normalizePlayerNameParts(firstName, lastName, player.name || 'Detective');
  if (!parts.firstName) return null;

  player.firstName = parts.firstName;
  player.lastName = parts.lastName;
  player.name = parts.displayName;
  player.fullName = parts.legalName;
  player.updatedAt = Date.now();
  session.players.set(playerId, player);

  for (const access of normalizeAccessCodes(session)) {
    if (access.playerId === playerId || access.code === player.accessCode) {
      access.firstName = parts.firstName;
      access.lastName = parts.lastName;
      access.displayName = parts.displayName;
      access.playerName = parts.displayName;
    }
  }

  for (const rsvp of normalizeRsvps(session)) {
    if (rsvp.playerId === playerId || (player.accessCode && rsvp.accessCode === player.accessCode)) {
      rsvp.firstName = parts.firstName;
      rsvp.lastName = parts.lastName;
      rsvp.fullName = parts.legalName;
      rsvp.displayName = parts.displayName;
      rsvp.updatedAt = Date.now();
    }
  }

  for (const submission of (session.submissions || [])) {
    if (submission.playerId === playerId) submission.playerName = parts.displayName;
  }
  for (const result of (session.results || [])) {
    if (result.playerId === playerId) result.playerName = parts.displayName;
  }

  return player;
}

function publicPlayer(player) {
  return {
    id: player.id,
    name: player.name,
    firstName: player.firstName || '',
    lastName: player.lastName || '',
    instagram: player.instagram || '',
    fullName: player.fullName || fullName(player.firstName, player.lastName, player.name),
    joinedAt: player.joinedAt,
    connected: Boolean(player.connected),
    lastSeen: player.lastSeen
  };
}

function getBadge(score, total) {
  if (score >= total) return 'Perfect Solve';
  if (score >= 8) return 'Case Closed';
  if (score >= 6) return 'Strong Lead';
  if (score >= 4) return 'Needs Review';
  return 'Keep Investigating';
}

function normalizeResults(results) {
  return Array.isArray(results) ? results : [];
}


function normalizeRsvps(session) {
  const rsvps = Array.isArray(session.rsvps) ? session.rsvps : [];
  session.rsvps = rsvps.map(item => ({
    id: item.id || nanoid(8),
    firstName: String(item.firstName || '').trim().slice(0, 30),
    lastName: String(item.lastName || '').trim().slice(0, 30),
    fullName: fullName(item.firstName, item.lastName, item.name),
    displayName: makeDisplayName(item.firstName, item.lastName, item.name),
    instagram: normalizeInstagram(item.instagram || item.socialMedia || ''),
    socialMedia: normalizeInstagram(item.socialMedia || item.instagram || ''),
    contact: normalizeContact(item.contact || item.phone || ''),
    phone: normalizePhoneNumber(item.phone || item.contact || ''),
    guestCount: normalizeGuestCount(item.guestCount || item.guests || 1),
    teamName: String(item.teamName || '').trim().slice(0, 50),
    status: item.status || 'rsvped',
    paid: Boolean(item.paid),
    accessCode: item.accessCode ? normalizeAccessCode(item.accessCode) : '',
    checkedIn: Boolean(item.checkedIn),
    checkedInAt: item.checkedInAt || null,
    playerId: item.playerId || '',
    createdAt: item.createdAt || Date.now(),
    updatedAt: item.updatedAt || item.createdAt || Date.now()
  })).filter(item => item.firstName && (item.phone || item.contact));
  return session.rsvps;
}

function rsvpSummary(session) {
  const rsvps = normalizeRsvps(session);
  const access = accessSummary(session);
  const reserved = rsvps.length;
  return {
    total: reserved,
    paid: rsvps.filter(r => r.paid).length,
    assigned: rsvps.filter(r => r.accessCode).length,
    checkedIn: rsvps.filter(r => r.checkedIn).length,
    reservedSpots: reserved,
    seatsAvailable: Math.max(0, access.playerCap - reserved)
  };
}

function formatDateLabel(value) {
  if (!value) return 'Date TBD';
  const d = new Date(`${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return 'Date TBD';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatTimeLabel(value) {
  if (!value) return 'Time TBD';
  const [hh, mm = '00'] = String(value).split(':');
  let h = Number(hh);
  if (!Number.isFinite(h)) return value;
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(mm).padStart(2, '0')} ${suffix}`;
}

const EVENT_TIME_ZONE = 'America/Chicago';

function partsInTimeZone(ms, timeZone = EVENT_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).formatToParts(new Date(ms));
  const out = {};
  for (const part of parts) {
    if (part.type !== 'literal') out[part.type] = part.value;
  }
  return out;
}

function offsetMsForTimeZone(ms, timeZone = EVENT_TIME_ZONE) {
  const p = partsInTimeZone(ms, timeZone);
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return asUtc - ms;
}

function centralDateTimeToMs(eventDate, eventTime = '19:00') {
  if (!eventDate) return 0;
  const [year, month, day] = String(eventDate).split('-').map(Number);
  const [hour = 19, minute = 0] = String(eventTime || '19:00').split(':').map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite)) return 0;
  const targetLocalAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = targetLocalAsUtc - offsetMsForTimeZone(targetLocalAsUtc, EVENT_TIME_ZONE);
  // Re-check once to handle daylight-saving boundaries.
  guess = targetLocalAsUtc - offsetMsForTimeZone(guess, EVENT_TIME_ZONE);
  return Number.isFinite(guess) ? guess : 0;
}

function scheduledStartMs(session) {
  // The event is run in Louisiana, so the host-entered date/time is treated as Central Time.
  // Recompute from eventDate/eventTime instead of trusting a browser-local timestamp.
  const fromEventTime = centralDateTimeToMs(session?.eventDate, session?.eventTime || '19:00');
  if (fromEventTime) return fromEventTime;
  const stored = Number(session?.scheduledStartAt || 0);
  if (Number.isFinite(stored) && stored > 0) return stored;
  return 0;
}

function eventTimestamp(session) {
  const scheduled = scheduledStartMs(session);
  return scheduled || Number(session.createdAt || 0);
}

function scheduledStartLabel(session) {
  const ms = scheduledStartMs(session);
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleString('en-US', {
      timeZone: EVENT_TIME_ZONE,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  } catch (_err) {
    return '';
  }
}
function isSessionStarted(session) {
  return ['briefing','started','revealed'].includes(session?.status) || Boolean(session?.startedAt || session?.briefingStartedAt || session?.revealed);
}
function isPublicRsvpVisible(session) {
  if (!session || isDemoSession(session)) return false;
  const status = session.eventStatus || 'open';
  if (status === 'private' || status === 'closed' || status === 'completed') return false;
  if (isSessionStarted(session)) return false;
  return true;
}

function normalizeDurationMinutes(value) {
  const n = Number(value || 45);
  if (!Number.isFinite(n)) return 45;
  return Math.max(15, Math.min(240, Math.round(n)));
}

function eventWindow(session) {
  const start = scheduledStartMs(session);
  if (!start) return null;
  const durationMinutes = normalizeDurationMinutes(session.eventDurationMinutes);
  return {
    start,
    end: start + durationMinutes * 60 * 1000,
    durationMinutes
  };
}

function windowsOverlap(a, b) {
  if (!a || !b) return false;
  return a.start < b.end && b.start < a.end;
}

function findOverlappingRsvp({ targetSession, contact, firstName, lastName }) {
  const targetWindow = eventWindow(targetSession);
  if (!targetWindow || !contact) return null;
  const normalizedContact = normalizeContact(contact).toLowerCase();
  const normalizedFirst = String(firstName || '').trim().toLowerCase();
  const normalizedLast = String(lastName || '').trim().toLowerCase();
  for (const session of sessions.values()) {
    if (session.code === targetSession.code) continue;
    const sessionWindow = eventWindow(session);
    if (!windowsOverlap(targetWindow, sessionWindow)) continue;
    const hit = normalizeRsvps(session).find(r => {
      const sameContact = r.contact && r.contact.toLowerCase() === normalizedContact;
      const sameName = normalizedFirst && normalizedLast && r.firstName.toLowerCase() === normalizedFirst && r.lastName.toLowerCase() === normalizedLast;
      return sameContact || sameName;
    });
    if (hit) {
      return { session, rsvp: hit, window: sessionWindow };
    }
  }
  return null;
}

function normalizeSessionTiming(session) {
  session.eventDurationMinutes = normalizeDurationMinutes(session.eventDurationMinutes);
  return session.eventDurationMinutes;
}

function normalizeAccessCodes(session) {
  const codes = Array.isArray(session.accessCodes) ? session.accessCodes : [];
  session.playerCap = Math.max(1, Math.min(100, Number(session.playerCap || codes.length || 25)));
  session.accessCodes = codes.map(item => ({
    code: normalizeAccessCode(item.code),
    paid: Boolean(item.paid),
    claimed: Boolean(item.claimed || item.playerId),
    playerId: item.playerId || '',
    firstName: item.firstName || '',
    lastName: item.lastName || '',
    instagram: normalizeInstagram(item.instagram || item.socialMedia || ''),
    socialMedia: normalizeInstagram(item.socialMedia || item.instagram || ''),
    contact: normalizeContact(item.contact || item.phone || ''),
    phone: normalizePhoneNumber(item.phone || item.contact || ''),
    displayName: item.displayName || makeDisplayName(item.firstName, item.lastName, item.playerName),
    playerName: item.playerName || makeDisplayName(item.firstName, item.lastName, item.playerName),
    claimedAt: item.claimedAt || null,
    checkedIn: Boolean(item.checkedIn),
    checkedInAt: item.checkedInAt || null
  })).filter(item => item.code);
  if (!session.accessCodes.length) session.accessCodes = makeAccessCodes(session.playerCap);
  session.playerCap = session.accessCodes.length;
  return session.accessCodes;
}

function findSessionByAccessCode(accessCode) {
  const normalized = normalizeAccessCode(accessCode);
  for (const session of sessions.values()) {
    session.eventType = normalizeEventType(session.eventType);
    session.sharedAccessCode = normalizeSharedAccessCode(session.sharedAccessCode, session.code);
    if (session.eventType === 'free' && normalizeAccessCode(session.sharedAccessCode) === normalized) {
      return { session, access: { code: session.sharedAccessCode, shared: true, paid: true, claimed: false } };
    }
    const found = normalizeAccessCodes(session).find(item => item.code === normalized);
    if (found) return { session, access: found };
  }
  return { session: null, access: null };
}

function findSessionByPhoneOrCode(value) {
  const phone = normalizePhoneNumber(value);
  if (phone.length === 10) {
    const matches = [];
    for (const session of sessions.values()) {
      const found = normalizeRsvps(session).find(r => normalizePhoneNumber(r.phone || r.contact) === phone);
      if (found) matches.push({ session, rsvp: found, access: found.accessCode ? normalizeAccessCodes(session).find(a => a.code === normalizeAccessCode(found.accessCode)) : null });
    }
    matches.sort((a,b) => eventTimestamp(a.session) - eventTimestamp(b.session));
    // Prefer a player's already checked-in live/current session so My RSVP -> Play Now
    // returns them to the game instead of blocking them as a late new check-in.
    const active =
      matches.find(m => m.rsvp?.checkedIn && isSessionStarted(m.session) && !m.session.revealed) ||
      matches.find(m => m.rsvp?.checkedIn && !m.session.revealed) ||
      matches.find(m => !isSessionStarted(m.session)) ||
      matches[0];
    if (active) return { session: active.session, access: active.access, rsvp: active.rsvp, lookupType: 'phone', matches };
  }
  const byCode = findSessionByAccessCode(value);
  if (byCode.session) {
    const code = normalizeAccessCode(value);
    const rsvp = normalizeRsvps(byCode.session).find(r => r.accessCode && normalizeAccessCode(r.accessCode) === code);
    return { ...byCode, rsvp, lookupType: 'code', matches: [] };
  }
  return { session: null, access: null, rsvp: null, lookupType: '', matches: [] };
}

function accessSummary(session) {
  session.eventType = normalizeEventType(session.eventType);
  const cap = Math.max(1, Math.min(100, Number(session.playerCap || 25)));
  if (session.eventType === 'free') {
    const used = session.players instanceof Map ? session.players.size : 0;
    return {
      playerCap: cap,
      used,
      available: Math.max(0, cap - used),
      paid: 0,
      unpaid: 0,
      shared: true
    };
  }
  const codes = normalizeAccessCodes(session);
  const used = codes.filter(c => c.claimed || c.playerId).length;
  const paid = codes.filter(c => c.paid).length;
  return {
    playerCap: codes.length,
    used,
    available: Math.max(0, codes.length - used),
    paid,
    unpaid: Math.max(0, codes.length - paid),
    shared: false
  };
}

function sanitizeAccusation(accusation) {
  if (!accusation) return null;
  return {
    ...accusation,
    questions: (accusation.questions || []).map(q => {
      const { correctOptionId, ...safeQuestion } = q;
      return safeQuestion;
    })
  };
}

function clientState(session) {
  const evidence = visibleEvidence(session);
  const elapsedSec = computeElapsedSec(session);
  const phase = computePhase(session);
  const pack = getPack(session);
  const { rounds, current } = currentRoundFor(session, pack);
  const remainingSec = Math.max(0, GAME_TOTAL_SEC - elapsedSec);
  const briefingElapsedSec = computeBriefingElapsedSec(session);
  const briefingEndsAt = computeBriefingEndsAt(session);
  const briefingRemainingSec = computeBriefingRemainingSec(session);
  const remainingToAccusationSec = Math.max(0, ACCUSATION_OPEN_SEC - elapsedSec);

  return {
    sessionCode: session.code,
    demoMode: isDemoSession(session),
    tableName: session.tableName,
    eventDate: session.eventDate || '',
    eventTime: session.eventTime || '',
    eventDurationMinutes: normalizeSessionTiming(session),
    scheduledStartAt: scheduledStartMs(session),
    scheduledStartLabel: scheduledStartLabel(session),
    autoStartEnabled: session.autoStartEnabled !== false,
    eventStatus: session.eventStatus || 'open',
    allowLateCheckIn: Boolean(session.allowLateCheckIn),
    eventType: normalizeEventType(session.eventType),
    ticketPrice: normalizeTicketPrice(session.ticketPrice || session.eventPrice || ''),
    eventPriceLabel: eventPriceLabel(session),
    eventDateLabel: formatDateLabel(session.eventDate),
    eventTimeLabel: formatTimeLabel(session.eventTime),
    truthPackId: session.truthPackId,
    truthPackTitle: pack.title,
    gameTitle: pack.gameTitle || 'Barfly Social Mystery',
    venue: session.venueName || pack.venue || pack.venueName || 'Venue',
    venueName: session.venueName || pack.venueName || pack.venue || 'Venue',
    venueLogoUrl: session.venueLogoUrl || pack.venueLogoUrl || '',
    seriesTitle: pack.seriesTitle || '',
    seriesArc: pack.seriesArc || null,
    levelLabel: pack.levelLabel || '',
    lobbyBackstory: pack.lobbyBackstory || '',
    difficulty: pack.difficulty || 'Medium',
    difficultyLabel: pack.difficultyLabel || 'Medium',
    openingNarration: pack.openingNarration || '',
    revealScript: pack.revealScript || '',
    accusation: sanitizeAccusation(pack.accusation),
    mode: 'Detective Mode',
    evidenceModel: 'Unified Evidence',
    phase,
    status: session.status,
    elapsedSec,
    remainingSec,
    briefingElapsedSec,
    briefingRemainingSec,
    briefingTotalSec: BRIEFING_TOTAL_SEC,
    briefingStartedAt: session.briefingStartedAt || null,
    briefingEndsAt: briefingEndsAt || null,
    remainingToAccusationSec,
    totalSec: GAME_TOTAL_SEC,
    accusationOpenSec: ACCUSATION_OPEN_SEC,
    accusationLockSec: ACCUSATION_LOCK_SEC,
    rounds,
    currentRound: current,
    players: Array.from(session.players.values()).map(publicPlayer),
    access: accessSummary(session),
    rsvp: rsvpSummary(session),
    hostMessages: session.hostMessages || [],
    sponsorAds: normalizeSponsorAds(session).filter(ad => ad.enabled),
    dashboardSponsorAds: normalizeDashboardSponsorAds(session),
    submissions: session.submissions || [],
    results: normalizeResults(session.results),
    revealed: session.revealed,
    answerKey: session.revealed ? pack.answerKey : null,
    publicClues: evidence.publicClues,
    apps: evidence.apps,
    dashboardEvidence: evidence.dashboardEvidence || { forensics: [], interrogation: [], timeline: [], deduction: [] },
    serverTime: Date.now()
  };
}

function hostState(session) {
  session.eventType = normalizeEventType(session.eventType);
  session.sharedAccessCode = normalizeSharedAccessCode(session.sharedAccessCode, session.code);
  return {
    ...clientState(session),
    sharedAccessCode: session.sharedAccessCode,
    accessCodes: normalizeAccessCodes(session),
    sponsorAds: normalizeSponsorAds(session),
    rsvps: normalizeRsvps(session)
  };
}

function createSession({ tableName = 'Table 1', truthPackId = 'sample-episode-01-medium', playerCap = 25, eventDate = '', eventTime = '', eventDurationMinutes = 45, eventStatus = 'open', eventType = 'paid', ticketPrice = '', eventPrice = '', sharedAccessCode = '', allowLateCheckIn = false, scheduledStartAt = 0, autoStartEnabled = true, venueName = '', venueLogoUrl = '' } = {}) {
  let code = makeCode();
  while (sessions.has(code)) code = makeCode();
  const session = {
    id: nanoid(10),
    code,
    tableName,
    venueName: String(venueName || '').slice(0, 80),
    venueLogoUrl: sanitizeUrl(venueLogoUrl),
    truthPackId: truthPacks[truthPackId] ? truthPackId : 'sample-episode-01-medium',
    eventDate: String(eventDate || '').slice(0, 10),
    eventTime: String(eventTime || '').slice(0, 5),
    eventDurationMinutes: normalizeDurationMinutes(eventDurationMinutes),
    scheduledStartAt: centralDateTimeToMs(eventDate, eventTime || '19:00') || Number(scheduledStartAt || 0) || 0,
    autoStartEnabled: autoStartEnabled !== false,
    eventStatus: ['open','private','soldout'].includes(eventStatus) ? eventStatus : 'open',
    eventType: normalizeEventType(eventType),
    ticketPrice: normalizeEventType(eventType) === 'paid' ? normalizeTicketPrice(ticketPrice || eventPrice || '') : '',
    sharedAccessCode: '',
    allowLateCheckIn: Boolean(allowLateCheckIn),
    playerCap: Math.max(1, Math.min(100, Number(playerCap || 25))),
    accessCodes: makeAccessCodes(playerCap || 25),
    status: 'lobby',
    startedAt: null,
    briefingStartedAt: null,
    elapsedAtPause: 0,
    createdAt: Date.now(),
    players: new Map(),
    hostMessages: [],
    sponsorAds: [],
    dashboardSponsorAds: {},
    rsvps: [],
    submissions: [],
    results: [],
    revealed: false
  };
  session.sharedAccessCode = normalizeSharedAccessCode(sharedAccessCode, code);
  sessions.set(code, session);
  return session;
}

function prepareDemoSession(session) {
  session.demoMode = true;
  session.demoAccessCode = demoAccessCode;
  session.tableName = session.tableName || 'Easy — Venue';
  session.truthPackId = 'sample-episode-01-easy';
  session.playerCap = Math.max(Number(session.playerCap || 0), 100);
  session.eventStatus = 'private';
  session.eventType = 'free';
  session.sharedAccessCode = demoAccessCode;
  session.accessCodes = [{ code: demoAccessCode, paid: true, claimed: false, shared: true }];
  if (!Array.isArray(session.hostMessages)) session.hostMessages = [];
  if (!session.hostMessages.length) {
    const pack = getPack(session);
    addHostMessage(session, {
      title: 'Easy Mystery Started',
      text: pack.openingNarration || 'Barfly Social Mystery is live. Review the evidence as it unlocks and submit your accusation before time runs out.',
      kind: 'opening'
    });
  }
  return session;
}

function getOrCreateDemoSession() {
  let session = sessions.get(DEMO_SESSION_CODE) || Array.from(sessions.values()).find(s => s.code === DEMO_SESSION_CODE || s.demoAccessCode === demoAccessCode);
  if (!session) {
    session = createSession({
      tableName: 'Easy — Venue',
      truthPackId: 'sample-episode-01-easy',
      playerCap: 100,
      eventStatus: 'private',
      eventDurationMinutes: 45,
      eventType: 'free',
      sharedAccessCode: demoAccessCode
    });
    sessions.delete(session.code);
    session.code = DEMO_SESSION_CODE;
    sessions.set(DEMO_SESSION_CODE, session);
  }
  prepareDemoSession(session);
  if (!['briefing','started'].includes(session.status) || session.revealed || computeElapsedSec(session) >= GAME_TOTAL_SEC) {
    session.status = 'briefing';
    session.briefingStartedAt = Date.now();
    session.startedAt = null;
    session.elapsedAtPause = 0;
    session.revealed = false;
    session.results = [];
    session.hostMessages = [];
    prepareDemoSession(session);
  }
  return session;
}

function createFreshDemoSession() {
  let code = `DEMO-${makeCode()}`;
  while (sessions.has(code)) code = `DEMO-${makeCode()}`;
  const session = createSession({
    tableName: 'Easy — Venue',
    truthPackId: 'sample-episode-01-easy',
    playerCap: 100,
    eventStatus: 'private',
    eventDurationMinutes: 45,
    eventType: 'free',
    sharedAccessCode: demoAccessCode
  });
  sessions.delete(session.code);
  session.code = code;
  session.id = nanoid(10);
  session.status = 'briefing';
  session.briefingStartedAt = Date.now();
  session.startedAt = null;
  session.elapsedAtPause = 0;
  session.revealed = false;
  session.results = [];
  session.players = new Map();
  session.hostMessages = [];
  sessions.set(code, session);
  return prepareDemoSession(session);
}


function isDemoSession(session) {
  const code = String(session?.code || '').toUpperCase();
  return Boolean(session?.demoMode) || code === DEMO_SESSION_CODE || code.startsWith('DEMO-');
}

async function removeDemoSessions() {
  const codes = Array.from(sessions.values())
    .filter(isDemoSession)
    .map(session => String(session.code || '').toUpperCase());
  for (const code of codes) {
    sessions.delete(code);
    try {
      await database.deleteSession(code);
    } catch (err) {
      console.error('Database delete failed:', err);
    }
  }
  return codes;
}

async function saveSession(session) {
  try {
    await database.saveSession(session);
  } catch (err) {
    console.error('Database save failed:', err);
  }
}

async function loadSessionsFromDatabase() {
  const savedSessions = await database.listSessions();
  for (const session of savedSessions) {
    if (!Array.isArray(session.hostMessages)) session.hostMessages = [];
    normalizeSponsorAds(session);
    normalizeDashboardSponsorAds(session);
    if (!Array.isArray(session.submissions)) session.submissions = [];
    if (!Array.isArray(session.results)) session.results = [];
    normalizeAccessCodes(session);
    normalizeRsvps(session);
    session.eventDate = String(session.eventDate || '').slice(0, 10);
    session.eventTime = String(session.eventTime || '').slice(0, 5);
    session.venueName = String(session.venueName || '').slice(0, 80);
    session.venueLogoUrl = sanitizeUrl(session.venueLogoUrl || '');
    session.scheduledStartAt = centralDateTimeToMs(session.eventDate, session.eventTime || '19:00') || Number(session.scheduledStartAt || 0) || 0;
    if (typeof session.autoStartEnabled === 'undefined') session.autoStartEnabled = true;
    session.eventStatus = ['open','private','soldout'].includes(session.eventStatus) ? session.eventStatus : 'open';
    session.eventType = normalizeEventType(session.eventType);
    if (session.demoMode || session.code === DEMO_SESSION_CODE) {
      demoAccessCode = normalizeDemoCode(session.demoAccessCode || session.sharedAccessCode || demoAccessCode);
      session.demoAccessCode = demoAccessCode;
      session.sharedAccessCode = demoAccessCode;
    } else {
      session.sharedAccessCode = normalizeSharedAccessCode(session.sharedAccessCode, session.code);
    }
    sessions.set(session.code, session);
  }
  return savedSessions.length;
}

function getSessionOr404(code, res) {
  const session = sessions.get(String(code || '').toUpperCase());
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return null;
  }
  return session;
}

function broadcast(code) {
  const session = sessions.get(code);
  if (!session) return;
  const payload = JSON.stringify({ type: 'state', state: clientState(session) });
  const set = socketsBySession.get(code);
  if (!set) return;
  for (const ws of set) {
    if (ws.readyState === ws.OPEN) ws.send(payload);
  }
}

function broadcastAll() {
  for (const code of sessions.keys()) broadcast(code);
}

function upsertSubmission(session, submission) {
  session.submissions = session.submissions || [];
  return mergeSubmission(session, submission);
}

function findQuestion(pack, id) {
  return (pack?.accusation?.questions || []).find(q => q.id === id);
}

function getQuestionUnlockSec(question) {
  return Number(question.unlockSec || 0);
}

function mergeSubmission(session, submission) {
  const existing = (session.submissions || []).find(s => s.playerId === submission.playerId);
  if (existing) {
    existing.answers = { ...(existing.answers || {}), ...(submission.answers || {}) };
    existing.updatedAt = Date.now();
    existing.playerName = submission.playerName || existing.playerName;
    existing.createdAt = existing.createdAt || Date.now();
    return existing;
  }
  session.submissions.unshift(submission);
  return submission;
}

function gradeSubmission(pack, player, submission) {
  const questions = pack?.accusation?.questions || [];
  const answers = submission?.answers || {};
  const breakdown = questions.map(q => {
    const selectedId = answers[q.id] || '';
    const selectedOption = (q.options || []).find(o => o.id === selectedId);
    const correctOption = (q.options || []).find(o => o.id === q.correctOptionId);
    const correct = selectedId === q.correctOptionId;
    return {
      id: q.id,
      prompt: q.prompt,
      selectedOptionId: selectedId,
      selectedLabel: selectedOption?.label || 'No answer submitted',
      correctOptionId: q.correctOptionId,
      correctLabel: correctOption?.label || '',
      correct
    };
  });
  const score = breakdown.filter(item => item.correct).length;
  const total = questions.length || 10;
  return {
    id: nanoid(8),
    playerId: player.id,
    playerName: player.name,
    firstName: player.firstName || '',
    lastName: player.lastName || '',
    instagram: player.instagram || '',
    fullName: player.fullName || fullName(player.firstName, player.lastName, player.name),
    score,
    total,
    badge: getBadge(score, total),
    breakdown,
    updatedAt: Date.now(),
    submitted: Boolean(submission),
    submittedAt: submission?.createdAt || null
  };
}

function gradeAllPlayers(session) {
  const pack = getPack(session);
  const submissionByPlayer = new Map((session.submissions || []).map(s => [s.playerId, s]));
  const results = [];
  for (const player of session.players.values()) {
    const submission = submissionByPlayer.get(player.id) || null;
    results.push(gradeSubmission(pack, player, submission));
  }
  return results.sort((a, b) => b.score - a.score || a.playerName.localeCompare(b.playerName));
}

function addHostMessage(session, { title, text, kind = 'dialog' }) {
  session.hostMessages = session.hostMessages || [];
  session.hostMessages.push({ id: nanoid(8), title, text, kind, createdAt: Date.now(), from: 'Host' });
}

function revealSession(session, reason = 'auto') {
  if (!session || session.status === 'revealed') return false;
  const pack = getPack(session);
  session.results = gradeAllPlayers(session);
  session.status = 'revealed';
  session.revealed = true;
  session.elapsedAtPause = computeElapsedSec(session);
  session.startedAt = null;
  session.briefingStartedAt = null;
  session.briefingEndsAt = null;
  session.revealedAt = Date.now();
  session.revealReason = reason;

  const alreadyHasReveal = (session.hostMessages || []).some(m => m.kind === 'reveal');
  if (!alreadyHasReveal) {
    addHostMessage(session, {
      title: 'Case Closed',
      text: pack.revealScript || 'Detectives, the case is closed.',
      kind: 'reveal'
    });
  }
  return true;
}

function startBriefing(session, briefingStartedAt = Date.now(), reason = 'manual') {
  if (!session || !['lobby','briefing'].includes(session.status)) return false;
  session.status = 'briefing';
  session.revealed = false;
  session.results = [];
  session.startedAt = null;
  session.briefingStartedAt = Number(briefingStartedAt);
  session.briefingEndsAt = Number(briefingStartedAt) + BRIEFING_TOTAL_SEC * 1000;
  session.elapsedAtPause = 0;
  // No player-facing host dialog is created here. Lobby-to-briefing should feel automatic.
  return true;
}

function startGameFromBriefing(session, startedAt = Date.now()) {
  if (!session || session.status !== 'briefing') return false;
  session.status = 'started';
  session.startedAt = startedAt;
  session.briefingStartedAt = null;
  session.briefingEndsAt = null;
  session.elapsedAtPause = 0;
  // No automatic popup is created when briefing moves into investigation.
  return true;
}

async function maybeAutoStartScheduledSession(session) {
  if (!session || session.status !== 'lobby' || session.revealed || isDemoSession(session)) return false;
  if (session.autoStartEnabled === false) return false;
  const scheduled = scheduledStartMs(session);
  if (!scheduled) return false;
  const now = Date.now();
  if (now < scheduled) return false;
  const windowEnd = scheduled + normalizeDurationMinutes(session.eventDurationMinutes) * 60 * 1000;
  if (now > windowEnd) return false;

  let changed = false;
  const investigationStart = scheduled + BRIEFING_TOTAL_SEC * 1000;
  if (now >= investigationStart) {
    startBriefing(session, scheduled, 'scheduled');
    changed = startGameFromBriefing(session, investigationStart);
  } else {
    changed = startBriefing(session, scheduled, 'scheduled');
  }
  if (changed) await saveSession(session);
  return changed;
}

async function maybeAutoStartGame(session) {
  if (!session || session.status !== 'briefing') return false;
  const investigationStart = computeBriefingEndsAt(session);
  if (!investigationStart || Date.now() < investigationStart) return false;
  const changed = startGameFromBriefing(session, investigationStart);
  if (changed) await saveSession(session);
  return changed;
}

async function maybeAutoReveal(session) {
  if (!session || session.status !== 'started') return false;
  if (computeElapsedSec(session) < GAME_TOTAL_SEC) return false;
  const changed = revealSession(session, 'timer_complete');
  if (changed) await saveSession(session);
  return changed;
}


async function advanceSessionIfNeeded(session) {
  if (!session) return false;
  let changed = false;
  changed = (await maybeAutoStartScheduledSession(session)) || changed;
  changed = (await maybeAutoStartGame(session)) || changed;
  changed = (await maybeAutoReveal(session)) || changed;
  return changed;
}

setInterval(async () => {
  let changedAny = false;
  for (const session of sessions.values()) {
    const scheduledStarted = await maybeAutoStartScheduledSession(session);
    const started = await maybeAutoStartGame(session);
    const revealed = await maybeAutoReveal(session);
    changedAny = changedAny || scheduledStarted || started || revealed;
  }
  broadcastAll();
}, 1000);

app.get('/', (_req, res) => res.redirect('/player/'));
app.get('/host', (_req, res) => res.redirect('/host/'));
app.get('/checkin', (_req, res) => res.redirect('/checkin/'));
app.get('/api/health', (_req, res) => res.json({ ok: true, sessions: sessions.size, time: Date.now() }));
app.get('/api/settings', (_req, res) => {
  res.json(demoSettings());
});

app.post('/api/settings/demo-access-code', async (req, res) => {
  const nextCode = normalizeDemoCode(req.body?.demoAccessCode);
  demoAccessCode = nextCode;
  const session = getOrCreateDemoSession();
  session.demoAccessCode = demoAccessCode;
  session.sharedAccessCode = demoAccessCode;
  session.accessCodes = [{ code: demoAccessCode, paid: true, claimed: false, shared: true }];
  await saveSession(session);
  res.json(demoSettings());
  broadcast(session.code);
});


app.post('/api/demo/reset', async (_req, res) => {
  const removedCodes = await removeDemoSessions();
  const session = createFreshDemoSession();
  await saveSession(session);
  res.json({
    ok: true,
    action: 'reset',
    deleted: removedCodes.length,
    demoSessionCode: session.code,
    demoAccessCode
  });
  broadcastAll();
});

app.delete('/api/demo/sessions', async (_req, res) => {
  const removedCodes = await removeDemoSessions();
  res.json({
    ok: true,
    action: 'delete',
    deleted: removedCodes.length,
    demoAccessCode
  });
  broadcastAll();
});

app.get('/api/truth-packs', (_req, res) => {
  const order = ['easy', 'medium', 'hard'];
  const packs = Object.values(truthPacks)
    .filter(p => p.gameId === 'barfly-mystery-template' && p.id !== 'barfly-mystery-template')
    .sort((a, b) => {
      const ai = order.indexOf(a.levelId);
      const bi = order.indexOf(b.levelId);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || String(a.title || '').localeCompare(String(b.title || ''));
    });
  res.json(packs.map(p => ({
    id: p.id,
    gameId: p.gameId || 'barfly-mystery-template',
    gameTitle: p.gameTitle || 'Barfly Social Mystery',
    levelId: p.levelId || '',
    levelName: p.levelName || '',
    levelLabel: p.levelLabel || p.difficulty || '',
    difficulty: p.difficulty || '',
    difficultyLabel: p.difficultyLabel || '',
    title: p.title,
    venue: p.venue || p.venueName || '',
    venueName: p.venueName || p.venue || '',
    venueLogoUrl: p.venueLogoUrl || '',
    description: p.description || ''
  })));
});

app.post('/api/sessions', async (req, res) => {
  const session = createSession(req.body || {});
  await saveSession(session);
  res.json(hostState(session));
  broadcast(session.code);
});

app.get('/api/sessions', (_req, res) => {
  res.json(Array.from(sessions.values()).map(hostState));
});



app.get('/api/rsvp-sessions', (_req, res) => {
  const items = Array.from(sessions.values())
    .filter(session => isPublicRsvpVisible(session))
    .map(session => {
      const pack = getPack(session);
      const access = accessSummary(session);
      const rsvp = rsvpSummary(session);
      const soldOut = (session.eventStatus || 'open') === 'soldout' || rsvp.seatsAvailable <= 0;
      return {
        sessionCode: session.code,
        tableName: session.tableName,
        mystery: pack.gameTitle || 'Barfly Social Mystery',
        mysteryTitle: pack.title || pack.gameTitle || 'Barfly Social Mystery',
        venue: session.venueName || pack.venue || pack.venueName || 'Venue',
        venueName: session.venueName || pack.venueName || pack.venue || 'Venue',
        venueLogoUrl: session.venueLogoUrl || pack.venueLogoUrl || '',
        levelId: pack.levelId || '',
        levelName: pack.levelName || '',
        levelLabel: pack.levelLabel || pack.difficultyLabel || pack.difficulty || '',
        truthPackTitle: pack.title,
        difficulty: pack.difficulty || '',
        difficultyLabel: pack.difficultyLabel || '',
        eventDate: session.eventDate || '',
        eventTime: session.eventTime || '',
        eventDurationMinutes: normalizeSessionTiming(session),
        scheduledStartAt: scheduledStartMs(session),
        scheduledStartLabel: scheduledStartLabel(session),
        eventType: normalizeEventType(session.eventType),
        ticketPrice: normalizeTicketPrice(session.ticketPrice || session.eventPrice || ''),
        eventPriceLabel: eventPriceLabel(session),
        titleGraphic: pack.titleGraphic || pack.titleImage || pack.coverImage || '/assets/barfly-social-mystery-fullscreen-bg.png',
        rsvpExcerpt: pack.rsvpExcerpt || pack.hook || pack.bookingExcerpt || pack.description || 'Step into a live mystery where every reservation starts a new investigation. Search the scene, question witnesses, and uncover the truth before the final accusation.',
        dateLabel: formatDateLabel(session.eventDate),
        timeLabel: formatTimeLabel(session.eventTime),
        playerCap: access.playerCap,
        spotsClaimed: access.used,
        spotsAvailable: access.available,
        rsvpTotal: rsvp.total,
        reservedSpots: rsvp.reservedSpots,
        seatsAvailable: rsvp.seatsAvailable,
        status: soldOut ? 'soldout' : (session.eventStatus || 'open'),
        phase: session.status,
        eventTimestamp: eventTimestamp(session),
        createdAt: session.createdAt || Date.now()
      };
    }).sort((a,b) => Number(a.eventTimestamp || 0) - Number(b.eventTimestamp || 0));
  res.json(items);
});

function termsAcceptedFromBody(req) {
  return req.body && req.body.termsAccepted === true;
}

app.post('/api/rsvps', async (req, res) => {
  if (!termsAcceptedFromBody(req)) return res.status(400).json({ error: 'You must acknowledge the Terms & Conditions before RSVPing.' });
  const session = getSessionOr404(req.body.sessionCode, res);
  if (!session) return;
  if (!isPublicRsvpVisible(session)) return res.status(409).json({ error: 'RSVP is closed for this session because the game has already started.' });
  const firstName = String(req.body.firstName || '').trim().slice(0, 30);
  const lastName = '';
  const phone = normalizePhoneNumber(req.body.phone || req.body.contact || '');
  const contact = phone;
  const instagram = normalizeInstagram(req.body.instagram || req.body.socialMedia || '');
  const guestCount = 1;
  const teamName = '';
  if (!firstName || phone.length !== 10) return res.status(400).json({ error: 'First name and a valid 10-digit phone number are required. Social media name is optional.' });
  const rsvps = normalizeRsvps(session);
  const summary = rsvpSummary(session);
  if (summary.seatsAvailable <= 0) return res.status(409).json({ error: 'This showtime is sold out.' });
  const existing = rsvps.find(r => normalizePhoneNumber(r.phone || r.contact) === phone && r.firstName.toLowerCase() === firstName.toLowerCase());

  const overlap = findOverlappingRsvp({ targetSession: session, contact, firstName, lastName });
  if (!existing && overlap) {
    return res.status(409).json({
      error: `You already have an RSVP that overlaps this showtime: ${formatDateLabel(overlap.session.eventDate)} at ${formatTimeLabel(overlap.session.eventTime)}. Choose a non-overlapping time or ask the host for help.`
    });
  }

  const data = {
    firstName,
    lastName,
    fullName: fullName(firstName, lastName),
    displayName: makeDisplayName(firstName, lastName),
    instagram,
    socialMedia: instagram,
    contact,
    phone,
    guestCount,
    teamName,
    termsAccepted: true,
    termsAcceptedAt: Date.now(),
    updatedAt: Date.now()
  };
  let rsvp;
  if (existing) {
    Object.assign(existing, data);
    rsvp = existing;
  } else {
    rsvp = { id: nanoid(8), ...data, status: 'rsvped', paid: false, accessCode: '', checkedIn: false, playerId: '', createdAt: Date.now() };
    rsvps.unshift(rsvp);
    session.rsvps = rsvps;
  }
  const isFree = normalizeEventType(session.eventType) === 'free';
  if (isFree) {
    session.sharedAccessCode = normalizeSharedAccessCode(session.sharedAccessCode, session.code);
    rsvp.accessCode = session.sharedAccessCode;
    rsvp.paid = false;
  } else if (!rsvp.accessCode) {
    const codes = normalizeAccessCodes(session);
    const currentRsvps = normalizeRsvps(session);
    rsvp = currentRsvps.find(r => r.id === rsvp.id) || rsvp;
    const access = codes.find(item => !item.claimed && !currentRsvps.some(r => r.id !== rsvp.id && r.accessCode === item.code));
    if (access) {
      rsvp.accessCode = access.code;
      rsvp.paid = false;
      access.paid = false;
      access.firstName = firstName;
      access.lastName = lastName;
      access.instagram = instagram;
      access.socialMedia = instagram;
      access.contact = contact;
      access.phone = phone;
      access.displayName = makeDisplayName(firstName, lastName);
      access.playerName = makeDisplayName(firstName, lastName);
    }
  }
  await saveSession(session);
  const eventType = normalizeEventType(session.eventType);
  const publicRsvp = { ...rsvp };
  if (eventType === 'paid' && !rsvp.paid) publicRsvp.accessCode = '';
  res.json({
    ok: true,
    message: isFree ? `RSVP saved. This is a free event. Your check-in code is ${session.sharedAccessCode}.` : 'RSVP saved. Your spot is reserved. Please see the host to complete payment and receive your check-in code.',
    eventType,
    ticketPrice: normalizeTicketPrice(session.ticketPrice || session.eventPrice || ''),
    eventPriceLabel: eventPriceLabel(session),
    paymentPending: eventType === 'paid' && !rsvp.paid,
    sharedAccessCode: isFree ? session.sharedAccessCode : '',
    rsvp: publicRsvp,
    state: clientState(session)
  });
  broadcast(session.code);
});


app.delete('/api/sessions/:code/rsvps/:id', async (req, res) => {
  const session = getSessionOr404(req.params.code, res);
  if (!session) return;
  const rsvps = normalizeRsvps(session);
  const index = rsvps.findIndex(item => item.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: 'RSVP not found' });

  const [removed] = rsvps.splice(index, 1);
  session.rsvps = rsvps;

  if (removed?.accessCode) {
    const code = normalizeAccessCode(removed.accessCode);
    const access = normalizeAccessCodes(session).find(item => item.code === code);
    if (access) {
      access.paid = false;
      access.checkedIn = false;
      access.checkedInAt = null;
      access.claimed = false;
      access.playerId = '';
      access.firstName = '';
      access.lastName = '';
      access.instagram = '';
      access.displayName = '';
      access.playerName = '';
      access.claimedAt = null;
    }
  }

  if (removed?.playerId && session.players instanceof Map) {
    session.players.delete(removed.playerId);
  }

  await saveSession(session);
  res.json(hostState(session));
  broadcast(session.code);
});


app.post('/api/sessions/:code/rsvps/:id/check-in', async (req, res) => {
  const session = getSessionOr404(req.params.code, res);
  if (!session) return;
  const rsvps = normalizeRsvps(session);
  const rsvp = rsvps.find(item => item.id === req.params.id);
  if (!rsvp) return res.status(404).json({ error: 'RSVP not found' });

  const checkedIn = req.body.checkedIn === undefined ? true : Boolean(req.body.checkedIn);
  rsvp.checkedIn = checkedIn;
  rsvp.checkedInAt = checkedIn ? Date.now() : null;
  rsvp.status = checkedIn ? 'checked-in-by-host' : 'rsvped';
  rsvp.updatedAt = Date.now();

  if (rsvp.accessCode) {
    const code = normalizeAccessCode(rsvp.accessCode);
    const access = normalizeAccessCodes(session).find(item => item.code === code);
    if (access) {
      access.checkedIn = checkedIn;
      access.checkedInAt = checkedIn ? Date.now() : null;
      access.firstName = access.firstName || rsvp.firstName || '';
      access.lastName = access.lastName || rsvp.lastName || '';
      access.instagram = access.instagram || rsvp.instagram || '';
    }
  }

  await saveSession(session);
  res.json(hostState(session));
  broadcast(session.code);
});

app.post('/api/sessions/:code/rsvps/:id/paid', async (req, res) => {
  const session = getSessionOr404(req.params.code, res);
  if (!session) return;
  const rsvp = normalizeRsvps(session).find(item => item.id === req.params.id);
  if (!rsvp) return res.status(404).json({ error: 'RSVP not found' });
  rsvp.paid = Boolean(req.body.paid);
  rsvp.updatedAt = Date.now();
  if (rsvp.accessCode) {
    const access = normalizeAccessCodes(session).find(item => item.code === rsvp.accessCode);
    if (access) access.paid = rsvp.paid;
  }
  await saveSession(session);
  res.json(hostState(session));
  broadcast(session.code);
});

app.post('/api/sessions/:code/rsvps/:id/assign-code', async (req, res) => {
  const session = getSessionOr404(req.params.code, res);
  if (!session) return;
  if (normalizeEventType(session.eventType) === 'free') {
    session.sharedAccessCode = normalizeSharedAccessCode(session.sharedAccessCode, session.code);
    const rsvp = normalizeRsvps(session).find(item => item.id === req.params.id);
    if (!rsvp) return res.status(404).json({ error: 'RSVP not found' });
    rsvp.accessCode = session.sharedAccessCode;
    rsvp.updatedAt = Date.now();
    await saveSession(session);
    res.json(hostState(session));
    broadcast(session.code);
    return;
  }
  const rsvps = normalizeRsvps(session);
  const rsvp = rsvps.find(item => item.id === req.params.id);
  if (!rsvp) return res.status(404).json({ error: 'RSVP not found' });
  const codes = normalizeAccessCodes(session);
  let access = rsvp.accessCode ? codes.find(item => item.code === rsvp.accessCode) : null;
  if (!access) access = codes.find(item => !item.claimed && !rsvps.some(r => r.accessCode === item.code));
  if (!access) return res.status(409).json({ error: 'No unassigned access codes are available.' });
  access.paid = true;
  rsvp.paid = true;
  rsvp.accessCode = access.code;
  rsvp.updatedAt = Date.now();
  await saveSession(session);
  res.json(hostState(session));
  broadcast(session.code);
});


function publicCheckinSession(session) {
  const access = accessSummary(session);
  const rsvp = rsvpSummary(session);
  return {
    sessionCode: session.code,
    tableName: session.tableName,
    eventDate: session.eventDate || '',
    eventTime: session.eventTime || '',
    eventDateLabel: formatDateLabel(session.eventDate),
    eventTimeLabel: formatTimeLabel(session.eventTime),
    eventType: normalizeEventType(session.eventType),
    ticketPrice: normalizeTicketPrice(session.ticketPrice || session.eventPrice || ''),
    eventPriceLabel: eventPriceLabel(session),
    sharedAccessCode: normalizeEventType(session.eventType) === 'free' ? normalizeSharedAccessCode(session.sharedAccessCode, session.code) : '',
    truthPackTitle: getPack(session).title,
    difficultyLabel: getPack(session).difficultyLabel || getPack(session).difficulty || '',
    capacity: access.playerCap,
    checkedIn: rsvp.checkedIn,
    reserved: rsvp.total,
    seatsAvailable: rsvp.seatsAvailable
  };
}

app.get('/api/sessions/:code/checkin-info', (req, res) => {
  const session = getSessionOr404(req.params.code, res);
  if (!session) return;
  res.json(publicCheckinSession(session));
});


app.post('/api/rsvps/lookup', async (req, res) => {
  const value = String(req.body.lookup || '').trim();
  if (!value) return res.status(400).json({ error: 'Enter your 10-digit phone number or 5-digit check-in code.' });
  const demo = isDemoAccessCode(value);
  if (demo) {
    const session = getOrCreateDemoSession();
    return res.json({ ok: true, demoMode: true, session: publicCheckinSession(session), rsvp: { firstName: 'Demo', displayName: 'Demo Detective', accessCode: demoAccessCode, status: 'Demo' }, accessCode: demoAccessCode });
  }
  const lookup = findSessionByPhoneOrCode(value);
  if (!lookup.session || !lookup.rsvp) return res.status(404).json({ error: 'No RSVP found for that phone number or code.' });
  const rsvp = lookup.rsvp;
  const eventType = normalizeEventType(lookup.session.eventType);
  const canSeeCode = eventType === 'free' || Boolean(rsvp.paid);
  await advanceSessionIfNeeded(lookup.session);
  res.json({
    ok: true,
    session: publicCheckinSession(lookup.session),
    paymentPending: eventType === 'paid' && !rsvp.paid,
    rsvp: {
      id: rsvp.id,
      firstName: rsvp.firstName,
      displayName: rsvp.displayName || makeDisplayName(rsvp.firstName, rsvp.lastName),
      socialMedia: rsvp.socialMedia || rsvp.instagram || '',
      status: rsvp.checkedIn ? 'Checked In' : (eventType === 'paid' && !rsvp.paid ? 'Pending Payment' : 'RSVP’d'),
      accessCode: canSeeCode ? (rsvp.accessCode || '') : '',
      checkedIn: Boolean(rsvp.checkedIn),
      paid: Boolean(rsvp.paid)
    },
    accessCode: canSeeCode ? (rsvp.accessCode || '') : ''
  });
});

app.post('/api/checkins', async (req, res) => {
  const session = getSessionOr404(req.body.sessionCode, res);
  if (!session) return;
  const lookupValue = String(req.body.accessCode || req.body.lookup || '').trim();
  let accessCode = normalizeAccessCode(lookupValue);
  if (!lookupValue) return res.status(400).json({ error: 'Phone number or check-in code is required.' });

  session.eventType = normalizeEventType(session.eventType);
  const isFreeEvent = session.eventType === 'free';
  session.sharedAccessCode = normalizeSharedAccessCode(session.sharedAccessCode, session.code);
  let access = null;

  const phoneLookup = normalizePhoneNumber(lookupValue);
  let phoneRsvp = null;
  if (phoneLookup.length === 10) {
    phoneRsvp = normalizeRsvps(session).find(r => normalizePhoneNumber(r.phone || r.contact) === phoneLookup);
    if (phoneRsvp?.accessCode) accessCode = normalizeAccessCode(phoneRsvp.accessCode);
  }
  if (isFreeEvent && normalizeAccessCode(session.sharedAccessCode) === accessCode) {
    access = { code: session.sharedAccessCode, shared: true, paid: true, claimed: false };
  } else {
    access = normalizeAccessCodes(session).find(item => item.code === accessCode);
  }
  if (!access) return res.status(404).json({ error: 'That phone number or check-in code is not valid for this session.' });
  if (!isFreeEvent && !access.paid) return res.status(403).json({ error: 'This check-in code has not been activated by the host yet.' });

  const rsvps = normalizeRsvps(session);
  let rsvp = phoneRsvp || rsvps.find(r => r.accessCode && normalizeAccessCode(r.accessCode) === accessCode);
  const alreadyCheckedIn = Boolean(rsvp?.checkedIn || access?.checkedIn || (access?.playerId && session.players?.has?.(access.playerId)));
  if (isSessionStarted(session) && !session.allowLateCheckIn && !alreadyCheckedIn && !rsvp) {
    return res.status(409).json({ error: 'The investigation has already started. Please see the host.' });
  }
  if (!rsvp && !isFreeEvent) return res.status(404).json({ error: 'This code is not assigned to an RSVP. Please see the host.' });
  if (!rsvp && isFreeEvent) {
    rsvp = {
      id: nanoid(8), firstName: 'Guest', lastName: 'Detective', instagram: '', contact: '', status: 'checked-in-walkup', paid: false,
      accessCode, checkedIn: false, playerId: '', createdAt: Date.now(), updatedAt: Date.now()
    };
    rsvps.unshift(rsvp);
    session.rsvps = rsvps;
  }

  rsvp.checkedIn = true;
  rsvp.checkedInAt = Date.now();
  rsvp.updatedAt = Date.now();
  if (!isFreeEvent) {
    access.checkedIn = true;
    access.checkedInAt = Date.now();
    access.firstName = access.firstName || rsvp.firstName;
    access.lastName = access.lastName || rsvp.lastName;
    access.instagram = access.instagram || rsvp.instagram;
  }

  await saveSession(session);
  await advanceSessionIfNeeded(session);
  broadcast(session.code);
  res.json({
    ok: true,
    message: `Checked in. Next step: enter the waiting room with your check-in code.`,
    playerUrl: `/player/?access=${encodeURIComponent(accessCode)}`,
    session: publicCheckinSession(session),
    rsvp
  });
});

app.get('/api/access/:accessCode/preview', async (req, res) => {
  if (isDemoAccessCode(req.params.accessCode)) {
    const demoSession = getOrCreateDemoSession();
    await saveSession(demoSession);
    return res.json(clientState(demoSession));
  }
  const { session } = findSessionByAccessCode(req.params.accessCode);
  if (!session) return res.status(404).json({ error: 'Invalid access code' });
  await advanceSessionIfNeeded(session);
  res.json(clientState(session));
});

app.post('/api/access/join', async (req, res) => {
  if (!termsAcceptedFromBody(req)) return res.status(400).json({ error: 'You must acknowledge the Terms & Conditions before entering the game.' });
  const lookupValue = String(req.body.accessCode || '').trim();
  let accessCode = normalizeAccessCode(lookupValue);
  const incomingPlayerId = req.body.playerId && String(req.body.playerId).length > 5 ? String(req.body.playerId) : '';
  const requestFirstName = String(req.body.firstName || '').trim().slice(0, 30);
  const requestLastName = String(req.body.lastName || '').trim().slice(0, 30);
  const requestInstagram = normalizeInstagram(req.body.instagram || '');

  if (isDemoAccessCode(lookupValue || accessCode)) {
    const firstName = requestFirstName || 'Demo';
    const lastName = requestLastName || 'Detective';
    const instagram = requestInstagram;
    const displayName = makeDisplayName(firstName, lastName, 'Demo Detective');
    const legalName = fullName(firstName, lastName, 'Demo Detective');
    const session = createFreshDemoSession();
    const playerId = incomingPlayerId || nanoid(12);
    session.players.set(playerId, {
      id: playerId, name: displayName, firstName, lastName, fullName: legalName, instagram,
      accessCode: demoAccessCode, demoMode: true, joinedAt: Date.now(), lastSeen: Date.now(), connected: true
    });
    await saveSession(session);
    const state = clientState(session);
    res.json({ playerId, sessionCode: session.code, accessCode: demoAccessCode, demoMode: true, player: session.players.get(playerId), state });
    broadcast(session.code);
    return;
  }

  const lookup = findSessionByPhoneOrCode(lookupValue || accessCode);
  const session = lookup.session;
  let access = lookup.access;
  let matchingRsvp = lookup.rsvp;
  if (matchingRsvp?.accessCode) accessCode = normalizeAccessCode(matchingRsvp.accessCode);
  if (!session || (!access && !matchingRsvp)) return res.status(404).json({ error: 'Invalid phone number or check-in code.' });
  if (!access && matchingRsvp?.accessCode) {
    accessCode = normalizeAccessCode(matchingRsvp.accessCode);
    access = normalizeAccessCodes(session).find(item => item.code === accessCode);
  }

  const alreadyCheckedInForJoin = Boolean(matchingRsvp?.checkedIn || access?.checkedIn || (access?.playerId && session.players?.has?.(access.playerId)));
  if (isSessionStarted(session) && !session.allowLateCheckIn && !alreadyCheckedInForJoin && !matchingRsvp) {
    return res.status(409).json({ error: 'The investigation has already started. Please see the host.' });
  }

  const isFreeEvent = normalizeEventType(session.eventType) === 'free' && access && access.shared;
  if (!access && !isFreeEvent) return res.status(404).json({ error: 'This RSVP does not have a check-in code yet. Please see the host.' });
  let firstName = requestFirstName;
  let lastName = requestLastName;
  let instagram = requestInstagram;
  if (!matchingRsvp) matchingRsvp = normalizeRsvps(session).find(r => r.accessCode && normalizeAccessCode(r.accessCode) === accessCode);

  if (!isFreeEvent) {
    if (normalizeEventType(session.eventType) === 'paid' && !access.paid) {
      return res.status(403).json({ error: 'This check-in code has not been activated by the host yet.' });
    }
    if (!matchingRsvp) return res.status(404).json({ error: 'This code is not assigned to an RSVP. Please see the host.' });
    firstName = matchingRsvp.firstName || access.firstName || firstName;
    lastName = matchingRsvp.lastName || access.lastName || lastName;
    instagram = matchingRsvp.instagram || access.instagram || instagram;
  } else {
    if (!firstName || !lastName) {
      const unclaimed = normalizeRsvps(session).find(r => !r.checkedIn);
      if (unclaimed) {
        matchingRsvp = unclaimed;
        firstName = unclaimed.firstName;
        lastName = unclaimed.lastName;
        instagram = unclaimed.instagram || '';
      } else {
        firstName = 'Guest';
        lastName = 'Detective';
      }
    }
    if ((session.players instanceof Map ? session.players.size : 0) >= Math.max(1, Number(session.playerCap || 25)) && !incomingPlayerId) {
      return res.status(409).json({ error: 'This free event is at capacity. Please choose another showtime.' });
    }
  }

  if (!firstName) return res.status(400).json({ error: 'This RSVP is missing a first name. Please see the host.' });

  const displayName = makeDisplayName(firstName, lastName);
  const legalName = fullName(firstName, lastName);
  const playerId = isFreeEvent ? (incomingPlayerId || nanoid(12)) : (access.playerId || incomingPlayerId || nanoid(12));

  if (!isFreeEvent) {
    access.claimed = true;
    access.playerId = playerId;
    access.firstName = firstName;
    access.lastName = lastName;
    access.instagram = instagram;
    access.displayName = displayName;
    access.playerName = displayName;
    access.checkedIn = true;
    access.checkedInAt = access.checkedInAt || Date.now();
    access.claimedAt = access.claimedAt || Date.now();
    access.termsAccepted = true;
    access.termsAcceptedAt = Date.now();
  }

  if (matchingRsvp) {
    matchingRsvp.checkedIn = true;
    matchingRsvp.checkedInAt = matchingRsvp.checkedInAt || Date.now();
    matchingRsvp.playerId = playerId;
    matchingRsvp.accessCode = matchingRsvp.accessCode || accessCode;
    matchingRsvp.updatedAt = Date.now();
  }

  const existingPlayer = session.players.get(playerId) || {};
  session.players.set(playerId, {
    ...existingPlayer,
    id: playerId,
    name: displayName,
    firstName,
    lastName,
    fullName: legalName,
    instagram,
    socialMedia: instagram,
    phone: matchingRsvp?.phone || matchingRsvp?.contact || access?.phone || access?.contact || '',
    accessCode,
    eventType: isFreeEvent ? 'free' : 'paid',
    joinedAt: existingPlayer.joinedAt || Date.now(),
    lastSeen: Date.now(),
    connected: true
  });
  await saveSession(session);
  await advanceSessionIfNeeded(session);
  const state = clientState(session);
  res.json({ playerId, sessionCode: session.code, accessCode, player: session.players.get(playerId), state });
  broadcast(session.code);
});


app.post('/api/sessions/:code/players/:playerId/name', async (req, res) => {
  const session = getSessionOr404(req.params.code, res);
  if (!session) return;
  const playerId = String(req.params.playerId || '');
  const firstName = String(req.body.firstName || '').trim().slice(0, 30);
  const lastName = String(req.body.lastName || '').trim().slice(0, 30);
  if (!firstName) return res.status(400).json({ error: 'First name is required.' });
  const player = updatePlayerDisplayName(session, playerId, firstName, lastName);
  if (!player) return res.status(404).json({ error: 'Player not found.' });
  await saveSession(session);
  res.json({ ok: true, player: publicPlayer(player), state: clientState(session), hostState: hostState(session) });
  broadcast(session.code);
});

app.post('/api/sessions/:code/access-codes/:accessCode/paid', async (req, res) => {
  const session = getSessionOr404(req.params.code, res);
  if (!session) return;
  const code = normalizeAccessCode(req.params.accessCode);
  const access = normalizeAccessCodes(session).find(item => item.code === code);
  if (!access) return res.status(404).json({ error: 'Access code not found' });
  access.paid = Boolean(req.body.paid);
  await saveSession(session);
  res.json(hostState(session));
  broadcast(session.code);
});

app.get('/api/sessions/:code', async (req, res) => {
  const session = getSessionOr404(req.params.code, res);
  if (!session) return;
  await advanceSessionIfNeeded(session);
  res.json(clientState(session));
});

app.post('/api/sessions/:code/join', async (req, res) => {
  res.status(410).json({ error: 'Shared session-code joining is disabled. Use your personal paid access code.' });
});

app.post('/api/sessions/:code/start', async (req, res) => {
  const session = getSessionOr404(req.params.code, res);
  if (!session) return;
  if (req.body.truthPackId && truthPacks[req.body.truthPackId]) session.truthPackId = req.body.truthPackId;
  if (typeof req.body.venueName === 'string') session.venueName = String(req.body.venueName || '').slice(0, 80);
  if (typeof req.body.venueLogoUrl === 'string') session.venueLogoUrl = sanitizeUrl(req.body.venueLogoUrl);
  startBriefing(session, Date.now(), 'manual');
  await saveSession(session);
  res.json(clientState(session));
  broadcast(session.code);
});


app.post('/api/sessions/:code/skip-briefing', async (req, res) => {
  const session = getSessionOr404(req.params.code, res);
  if (!session) return;
  session.status = 'started';
  session.startedAt = Date.now();
  session.briefingStartedAt = null;
  session.briefingEndsAt = null;
  session.elapsedAtPause = 0;
  session.revealed = false;
  session.results = [];
  await saveSession(session);
  res.json(clientState(session));
  broadcast(session.code);
});

app.post('/api/sessions/:code/set-elapsed', async (req, res) => {
  const session = getSessionOr404(req.params.code, res);
  if (!session) return;
  const nextElapsed = Math.max(0, Math.min(GAME_TOTAL_SEC, Number(req.body.elapsedSec || 0)));
  session.status = 'started';
  session.revealed = false;
  session.results = [];
  session.elapsedAtPause = nextElapsed;
  session.startedAt = Date.now() - (nextElapsed * 1000);
  session.briefingStartedAt = null;
  session.briefingEndsAt = null;

  const pushRoundPopup = false;
  if (pushRoundPopup) {
    const pack = getPack(session);
    const { current } = currentRoundFor(session, pack);
    if (current) addHostMessage(session, { title: current.title, text: current.dialogue || current.objective || 'Review the newly unlocked evidence.', kind: 'dialog' });
  }

  if (nextElapsed >= GAME_TOTAL_SEC) revealSession(session, 'timer_set_to_end');

  await saveSession(session);
  res.json(clientState(session));
  broadcast(session.code);
});

app.post('/api/sessions/:code/reveal', async (req, res) => {
  const session = getSessionOr404(req.params.code, res);
  if (!session) return;
  revealSession(session, 'manual_host_reveal');
  await saveSession(session);
  res.json(clientState(session));
  broadcast(session.code);
});

app.post('/api/sessions/:code/reset', async (req, res) => {
  const session = getSessionOr404(req.params.code, res);
  if (!session) return;
  session.status = 'lobby';
  session.startedAt = null;
  session.briefingStartedAt = null;
  session.briefingEndsAt = null;
  session.elapsedAtPause = 0;
  session.players = new Map();
  normalizeAccessCodes(session).forEach(access => { access.claimed = false; access.playerId = ''; access.playerName = ''; access.firstName = ''; access.lastName = ''; access.instagram = ''; access.displayName = ''; access.claimedAt = null; });
  normalizeRsvps(session).forEach(rsvp => { rsvp.checkedIn = false; rsvp.playerId = ''; rsvp.updatedAt = Date.now(); });
  session.hostMessages = [];
  session.submissions = [];
  session.results = [];
  session.revealed = false;
  await saveSession(session);
  res.json(clientState(session));
  broadcast(session.code);
});

app.delete('/api/sessions/:code', async (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  const session = sessions.get(code);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  try {
    await database.deleteSession(code);
  } catch (err) {
    console.error('Database delete failed:', err);
    return res.status(500).json({ error: 'Could not delete session from saved storage. Refresh and try again.' });
  }
  sessions.delete(code);
  socketsBySession.get(code)?.forEach(ws => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'deleted', code }));
    try { ws.close(); } catch (_err) {}
  });
  socketsBySession.delete(code);
  res.json({ ok: true, deleted: code });
});


app.post('/api/sessions/:code/ads', async (req, res) => {
  const session = getSessionOr404(req.params.code, res);
  if (!session) return;
  const ad = normalizeSponsorAd(req.body || {});
  if (!ad.message) return res.status(400).json({ error: 'Ad message is required.' });
  const ads = normalizeSponsorAds(session);
  ads.unshift(ad);
  session.sponsorAds = ads.slice(0, 12);
  await saveSession(session);
  res.json(hostState(session));
  broadcast(session.code);
});

app.post('/api/sessions/:code/ads/:adId/toggle', async (req, res) => {
  const session = getSessionOr404(req.params.code, res);
  if (!session) return;
  const ads = normalizeSponsorAds(session);
  const ad = ads.find(item => item.id === req.params.adId);
  if (!ad) return res.status(404).json({ error: 'Ad not found.' });
  ad.enabled = req.body.enabled === undefined ? !ad.enabled : Boolean(req.body.enabled);
  await saveSession(session);
  res.json(hostState(session));
  broadcast(session.code);
});

app.delete('/api/sessions/:code/ads/:adId', async (req, res) => {
  const session = getSessionOr404(req.params.code, res);
  if (!session) return;
  session.sponsorAds = normalizeSponsorAds(session).filter(item => item.id !== req.params.adId);
  await saveSession(session);
  res.json(hostState(session));
  broadcast(session.code);
});

app.post('/api/sessions/:code/dashboard-ads', async (req, res) => {
  const session = getSessionOr404(req.params.code, res);
  if (!session) return;
  const ads = {};
  const bodyAds = (req.body && typeof req.body.ads === 'object') ? req.body.ads : {};
  DASHBOARD_AD_SLOTS.forEach(slot => {
    const normalized = normalizeDashboardSponsorAd(bodyAds[slot] || {});
    if (normalized.title || normalized.message || normalized.coupon || normalized.logoUrl) ads[slot] = normalized;
  });
  session.dashboardSponsorAds = ads;
  await saveSession(session);
  res.json(hostState(session));
  broadcast(session.code);
});

app.post('/api/sessions/:code/message', async (req, res) => {
  const session = getSessionOr404(req.params.code, res);
  if (!session) return;
  const text = String(req.body.text || '').trim().slice(0, 500);
  if (!text) return res.status(400).json({ error: 'Message is required' });
  const title = String(req.body.title || 'Host Update').trim().slice(0, 120);
  const kind = String(req.body.kind || 'dialog').trim().slice(0, 40);
  addHostMessage(session, { title, text, kind });
  await saveSession(session);
  res.json(clientState(session));
  broadcast(session.code);
});






app.post('/api/sessions/:code/answer', async (req, res) => {
  const session = getSessionOr404(req.params.code, res);
  if (!session) return;
  const phase = computePhase(session);
  if (phase === 'lobby' || phase === 'revealed') return res.status(409).json({ error: 'Answers are not open right now.' });
  const playerId = String(req.body.playerId || '');
  const player = session.players.get(playerId);
  if (!player) return res.status(404).json({ error: 'Player not found in this session.' });
  const pack = getPack(session);
  const elapsedSec = computeElapsedSec(session);
  const rawAnswers = req.body.answers || {};
  const answers = {};
  for (const q of (pack?.accusation?.questions || [])) {
    const selected = String(rawAnswers[q.id] || '').trim();
    const optionIds = new Set((q.options || []).map(o => o.id));
    const unlocked = elapsedSec >= getQuestionUnlockSec(q) || phase === 'accusation' || phase === 'accusation_locked';
    if (selected && optionIds.has(selected) && unlocked) answers[q.id] = selected;
  }
  if (!Object.keys(answers).length) return res.status(400).json({ error: 'No valid unlocked answer was submitted.' });
  const submission = upsertSubmission(session, {
    id: nanoid(8),
    playerId,
    playerName: player.name,
    answers,
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
  await saveSession(session);
  res.json({ ok: true, submission, state: clientState(session) });
  broadcast(session.code);
});

app.post('/api/sessions/:code/accuse', async (req, res) => {
  const session = getSessionOr404(req.params.code, res);
  if (!session) return;
  const phase = computePhase(session);
  if (phase !== 'accusation') return res.status(409).json({ error: 'Final accusation is not open right now.' });
  const playerId = String(req.body.playerId || '');
  const player = session.players.get(playerId);
  if (!player) return res.status(404).json({ error: 'Player not found in this session.' });
  const pack = getPack(session);
  const questions = pack?.accusation?.questions || [];
  const existing = (session.submissions || []).find(s => s.playerId === playerId);
  const rawAnswers = { ...(existing?.answers || {}), ...(req.body.answers || {}) };
  const answers = {};
  const missing = [];
  for (const q of questions) {
    const selected = String(rawAnswers[q.id] || '').trim();
    const optionIds = new Set((q.options || []).map(o => o.id));
    if (selected && optionIds.has(selected)) answers[q.id] = selected;
    else missing.push(q.id);
  }
  if (questions.length && missing.length) {
    return res.status(400).json({ error: `Please answer all ${questions.length} mystery questions before submitting.` });
  }
  const submission = upsertSubmission(session, {
    id: nanoid(8),
    playerId,
    playerName: player.name,
    answers,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    finalSubmittedAt: Date.now()
  });
  submission.finalSubmittedAt = Date.now();
  await saveSession(session);
  res.json({ ok: true, submission, state: clientState(session) });
  broadcast(session.code);
});

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const code = String(url.searchParams.get('code') || '').toUpperCase();
  const playerId = String(url.searchParams.get('playerId') || '');
  if (!code || !sessions.has(code)) {
    ws.send(JSON.stringify({ type: 'error', error: 'Session not found' }));
    ws.close();
    return;
  }

  if (!socketsBySession.has(code)) socketsBySession.set(code, new Set());
  socketsBySession.get(code).add(ws);

  const session = sessions.get(code);
  if (playerId && session.players.has(playerId)) {
    const p = session.players.get(playerId);
    p.connected = true;
    p.lastSeen = Date.now();
    saveSession(session);
  }

  ws.send(JSON.stringify({ type: 'state', state: clientState(session) }));
  broadcast(code);

  ws.on('close', () => {
    socketsBySession.get(code)?.delete(ws);
    if (playerId && session.players.has(playerId)) {
      const p = session.players.get(playerId);
      p.connected = false;
      p.lastSeen = Date.now();
      saveSession(session);
      broadcast(code);
    }
  });
});

async function startServer() {
  await database.init();
  const loaded = await loadSessionsFromDatabase();

  server.listen(PORT, () => {
    console.log(`Detective Mode Mystery App running on port ${PORT}`);
    console.log(process.env.DATABASE_URL ? 'Database: PostgreSQL' : 'Database: local JSON file');
  });
}

process.on('SIGTERM', async () => {
  await database.close();
  process.exit(0);
});

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
