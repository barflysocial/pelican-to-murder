const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const GAME_TOTAL_SEC = 45 * 60;
const ACCUSATION_OPEN_SEC = 38 * 60;
const ACCUSATION_LOCK_SEC = 43 * 60;

function nanoid(size = 12) {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let id = '';
  for (let i = 0; i < size; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

const APP_BUCKETS = [
  'phone', 'messages', 'maps', 'bank', 'photos', 'social',
  'contacts', 'notes', 'files', 'browser', 'accuse'
];

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json({ limit: '1mb' }));
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

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

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
  if (!session.startedAt) return session.elapsedAtPause || 0;
  return Math.min(GAME_TOTAL_SEC, Math.floor((Date.now() - session.startedAt) / 1000));
}

function computePhase(session) {
  if (session.status === 'lobby') return 'lobby';
  if (session.status === 'revealed') return 'revealed';
  if (session.status === 'reset') return 'lobby';

  const elapsedSec = computeElapsedSec(session);
  if (elapsedSec >= GAME_TOTAL_SEC || elapsedSec >= ACCUSATION_LOCK_SEC) return 'accusation_locked';
  if (elapsedSec >= ACCUSATION_OPEN_SEC) return 'accusation';
  return 'investigation';
}

function normalizeRounds(pack) {
  const provided = Array.isArray(pack?.rounds) ? pack.rounds : [];
  const fallback = [
    { id: 'r1', title: 'Round 1: The Body', shortTitle: 'Round 1', startSec: 0, endSec: 12 * 60, objective: 'Review the scene and identify what makes the death suspicious.', dialogue: 'Detectives, Round 1 is live. Focus on the body, the scene, and the first obvious inconsistencies. Something about this death was staged to look simpler than it really was.' },
    { id: 'r2', title: 'Round 2: The Timeline', shortTitle: 'Round 2', startSec: 12 * 60, endSec: 24 * 60, objective: 'Rebuild the movement of the victim and suspects.', dialogue: 'Detectives, Round 2 is live. Stop guessing and start tracking movement. Calls, messages, and location evidence will tell you who had the opportunity.' },
    { id: 'r3', title: 'Round 3: The Cover-Up', shortTitle: 'Round 3', startSec: 24 * 60, endSec: ACCUSATION_OPEN_SEC, objective: 'Link the motive to the cover-up and find the strongest contradiction.', dialogue: 'Detectives, Round 3 is live. Now follow the money, the missing records, and the cover-up. The killer did not only commit the murder—they tried to control the story afterward.' },
    { id: 'r4', title: 'Final Accusation', shortTitle: 'Accuse', startSec: ACCUSATION_OPEN_SEC, endSec: ACCUSATION_LOCK_SEC, objective: 'Submit one culprit, one method, and one motive.', dialogue: 'Detectives, the accusation phase is open. You now have enough evidence. Choose one culprit, one method, and one motive, then lock in your final accusation.' }
  ];
  const rounds = (provided.length ? provided : fallback)
    .map((r, idx) => ({
      id: r.id || `round-${idx + 1}`,
      title: r.title || `Round ${idx + 1}`,
      shortTitle: r.shortTitle || r.title || `Round ${idx + 1}`,
      startSec: Number(r.startSec || 0),
      endSec: Number(r.endSec || GAME_TOTAL_SEC),
      objective: r.objective || '',
      dialogue: r.dialogue || ''
    }))
    .sort((a, b) => a.startSec - b.startSec);

  return rounds;
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
  const pack = truthPacks[session.truthPackId] || truthPacks['pelican-to-murder'] || truthPacks.demo;
  const aggregated = aggregateTruthPack(pack);
  const elapsedSec = computeElapsedSec(session);
  const publicClues = aggregated.publicClues
    .filter(c => Number(c.unlockSec || 0) <= elapsedSec)
    .sort((a, b) => Number(a.unlockSec || 0) - Number(b.unlockSec || 0));

  const apps = makeEmptyApps();
  for (const clue of aggregated.appClues) {
    if (Number(clue.unlockSec || 0) <= elapsedSec) {
      apps[normalizeBucket(clue.bucket)].push(clue);
    }
  }

  for (const bucket of Object.keys(apps)) {
    apps[bucket].sort((a, b) => Number(a.unlockSec || 0) - Number(b.unlockSec || 0));
  }

  return { publicClues, apps };
}

function publicPlayer(player) {
  return {
    id: player.id,
    name: player.name,
    joinedAt: player.joinedAt,
    connected: Boolean(player.connected),
    lastSeen: player.lastSeen
  };
}

function clientState(session) {
  const evidence = visibleEvidence(session);
  const elapsedSec = computeElapsedSec(session);
  const phase = computePhase(session);
  const pack = truthPacks[session.truthPackId] || truthPacks['pelican-to-murder'] || truthPacks.demo;
  const { rounds, current } = currentRoundFor(session, pack);

  return {
    sessionCode: session.code,
    tableName: session.tableName,
    truthPackId: session.truthPackId,
    truthPackTitle: pack.title,
    openingNarration: pack.openingNarration || '',
    revealScript: pack.revealScript || '',
    mode: 'Detective Mode',
    evidenceModel: 'Unified Evidence',
    phase,
    status: session.status,
    elapsedSec,
    totalSec: GAME_TOTAL_SEC,
    accusationOpenSec: ACCUSATION_OPEN_SEC,
    accusationLockSec: ACCUSATION_LOCK_SEC,
    rounds,
    currentRound: current,
    players: Array.from(session.players.values()).map(publicPlayer),
    hostMessages: session.hostMessages,
    helpRequests: session.helpRequests,
    submissions: session.submissions,
    revealed: session.revealed,
    answerKey: session.revealed ? pack.answerKey : null,
    publicClues: evidence.publicClues,
    apps: evidence.apps,
    serverTime: Date.now()
  };
}

function createSession({ tableName = 'Table 1', truthPackId = 'pelican-to-murder' } = {}) {
  let code = makeCode();
  while (sessions.has(code)) code = makeCode();
  const session = {
    id: nanoid(10),
    code,
    tableName,
    truthPackId: truthPacks[truthPackId] ? truthPackId : 'pelican-to-murder',
    status: 'lobby',
    startedAt: null,
    elapsedAtPause: 0,
    createdAt: Date.now(),
    players: new Map(),
    hostMessages: [],
    helpRequests: [],
    submissions: [],
    revealed: false
  };
  sessions.set(code, session);
  return session;
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

setInterval(() => {
  for (const session of sessions.values()) {
    if (session.status === 'started' && computeElapsedSec(session) >= GAME_TOTAL_SEC) {
      session.status = 'locked';
    }
  }
  broadcastAll();
}, 1000);

app.get('/', (_req, res) => res.redirect('/player/'));
app.get('/host', (_req, res) => res.redirect('/host/'));
app.get('/api/health', (_req, res) => res.json({ ok: true, sessions: sessions.size, time: Date.now() }));
app.get('/api/truth-packs', (_req, res) => {
  res.json(Object.values(truthPacks).map(p => ({ id: p.id, title: p.title, venue: p.venue || '', description: p.description || '' })));
});

app.post('/api/sessions', (req, res) => {
  const session = createSession(req.body || {});
  res.json(clientState(session));
  broadcast(session.code);
});

app.get('/api/sessions', (_req, res) => {
  res.json(Array.from(sessions.values()).map(clientState));
});

app.get('/api/sessions/:code', (req, res) => {
  const session = getSessionOr404(req.params.code, res);
  if (!session) return;
  res.json(clientState(session));
});

app.post('/api/sessions/:code/join', (req, res) => {
  const session = getSessionOr404(req.params.code, res);
  if (!session) return;
  const name = String(req.body.name || '').trim().slice(0, 40);
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const playerId = req.body.playerId && String(req.body.playerId).length > 5 ? String(req.body.playerId) : nanoid(12);
  session.players.set(playerId, {
    id: playerId,
    name,
    joinedAt: Date.now(),
    lastSeen: Date.now(),
    connected: true
  });
  const state = clientState(session);
  res.json({ playerId, state });
  broadcast(session.code);
});

app.post('/api/sessions/:code/start', (req, res) => {
  const session = getSessionOr404(req.params.code, res);
  if (!session) return;
  if (req.body.truthPackId && truthPacks[req.body.truthPackId]) session.truthPackId = req.body.truthPackId;
  session.status = 'started';
  session.revealed = false;
  session.startedAt = Date.now();
  session.elapsedAtPause = 0;
  res.json(clientState(session));
  broadcast(session.code);
});

app.post('/api/sessions/:code/reveal', (req, res) => {
  const session = getSessionOr404(req.params.code, res);
  if (!session) return;
  session.status = 'revealed';
  session.revealed = true;
  session.elapsedAtPause = computeElapsedSec(session);
  session.startedAt = null;
  res.json(clientState(session));
  broadcast(session.code);
});

app.post('/api/sessions/:code/reset', (req, res) => {
  const session = getSessionOr404(req.params.code, res);
  if (!session) return;
  session.status = 'lobby';
  session.startedAt = null;
  session.elapsedAtPause = 0;
  session.hostMessages = [];
  session.helpRequests = [];
  session.submissions = [];
  session.revealed = false;
  res.json(clientState(session));
  broadcast(session.code);
});

app.post('/api/sessions/:code/message', (req, res) => {
  const session = getSessionOr404(req.params.code, res);
  if (!session) return;
  const text = String(req.body.text || '').trim().slice(0, 500);
  if (!text) return res.status(400).json({ error: 'Message is required' });
  const title = String(req.body.title || 'Host Update').trim().slice(0, 120);
  const kind = String(req.body.kind || 'dialog').trim().slice(0, 40);
  session.hostMessages.push({ id: nanoid(8), title, text, kind, createdAt: Date.now(), from: 'Host' });
  res.json(clientState(session));
  broadcast(session.code);
});

app.post('/api/sessions/:code/help', (req, res) => {
  const session = getSessionOr404(req.params.code, res);
  if (!session) return;
  const playerId = String(req.body.playerId || '');
  const player = session.players.get(playerId);
  const text = String(req.body.text || 'Team needs help').trim().slice(0, 300);
  const help = { id: nanoid(8), playerId, playerName: player?.name || 'Unknown Detective', text, createdAt: Date.now(), status: 'open' };
  session.helpRequests.unshift(help);
  res.json({ ok: true, helpRequest: help, state: clientState(session) });
  broadcast(session.code);
});

app.post('/api/sessions/:code/accuse', (req, res) => {
  const session = getSessionOr404(req.params.code, res);
  if (!session) return;
  const phase = computePhase(session);
  if (phase !== 'accusation') return res.status(409).json({ error: 'Final accusation is not open right now.' });
  const playerId = String(req.body.playerId || '');
  const player = session.players.get(playerId);
  const submission = {
    id: nanoid(8),
    playerId,
    playerName: player?.name || 'Unknown Detective',
    culprit: String(req.body.culprit || '').trim().slice(0, 80),
    weapon: String(req.body.weapon || '').trim().slice(0, 80),
    motive: String(req.body.motive || '').trim().slice(0, 300),
    notes: String(req.body.notes || '').trim().slice(0, 500),
    createdAt: Date.now()
  };
  session.submissions.unshift(submission);
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
  }

  ws.send(JSON.stringify({ type: 'state', state: clientState(session) }));
  broadcast(code);

  ws.on('close', () => {
    socketsBySession.get(code)?.delete(ws);
    if (playerId && session.players.has(playerId)) {
      const p = session.players.get(playerId);
      p.connected = false;
      p.lastSeen = Date.now();
      broadcast(code);
    }
  });
});

createSession({ tableName: 'Pelican to Mars', truthPackId: 'pelican-to-murder' });

server.listen(PORT, () => {
  console.log(`Detective Mode Mystery App running on port ${PORT}`);
});
