// ─── Cuarto Cerrado — librería compartida (vanilla JS) ──────────────────

window.CC = window.CC || {};

// ─── Config & PIN ─────────────────────────────────────────────────────
CC.config = { hasOllama: false, hasOpenAI: false, pinRequired: false, ollamaModel: '' };

CC.loadConfig = async function () {
  try {
    const r = await fetch('/api/config');
    if (r.ok) CC.config = await r.json();
  } catch (e) { /* offline preview */ }
  return CC.config;
};

CC.getPin = () => localStorage.getItem('cc.pin') || '';
CC.setPin = (p) => localStorage.setItem('cc.pin', p || '');

// ─── API calls ─────────────────────────────────────────────────────────
async function apiFetch(path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const pin = CC.getPin();
  if (pin) headers['x-access-pin'] = pin;
  const r = await fetch(path, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!r.ok) {
    let msg = `${r.status}`;
    try { const d = await r.json(); msg = d.error || msg; } catch {}
    throw new Error(msg);
  }
  return r.json();
}

CC.chat = async function ({ messages, system, json = false, temperature = 0.85, model }) {
  const { content } = await apiFetch('/api/chat', { messages, system, json, temperature, model });
  return content;
};

CC.chatJSON = async function (opts) {
  const text = await CC.chat({ ...opts, json: true });
  // Some models wrap JSON in ```json … ``` — strip it
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(cleaned); }
  catch (e) {
    // try to extract first {...} or [...]
    const m = cleaned.match(/[\{\[][\s\S]*[\}\]]/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
    throw new Error('La IA devolvió algo no-JSON: ' + cleaned.slice(0, 200));
  }
};

CC.image = async function ({ prompt, size = '1024x1024', quality = 'low' }) {
  const { image } = await apiFetch('/api/image', { prompt, size, quality });
  return image;
};

// ─── Storage: history, medals, settings ────────────────────────────────
const HIST_KEY = 'cc.history';
const MEDALS_KEY = 'cc.medals';
const SETTINGS_KEY = 'cc.settings';

CC.defaultSettings = {
  paperFlair: true,
  sound: false,
  hintsAllowed: true,
  nickname: '',
};
CC.getSettings = () => {
  try { return { ...CC.defaultSettings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; }
  catch { return { ...CC.defaultSettings }; }
};
CC.setSettings = (s) => localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));

CC.getHistory = () => {
  try { return JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); }
  catch { return []; }
};
CC.addHistory = (entry) => {
  const list = CC.getHistory();
  list.unshift({ ...entry, ts: Date.now(), id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}` });
  localStorage.setItem(HIST_KEY, JSON.stringify(list.slice(0, 200)));
};
CC.clearHistory = () => localStorage.removeItem(HIST_KEY);

CC.getMedals = () => {
  try { return JSON.parse(localStorage.getItem(MEDALS_KEY) || '{}'); }
  catch { return {}; }
};
CC.grantMedal = (key, meta = {}) => {
  const m = CC.getMedals();
  if (m[key]) { m[key].count = (m[key].count || 1) + 1; m[key].lastTs = Date.now(); }
  else m[key] = { count: 1, firstTs: Date.now(), lastTs: Date.now(), ...meta };
  localStorage.setItem(MEDALS_KEY, JSON.stringify(m));
  return m;
};

// Catálogo de medallas posibles
CC.MEDALS = {
  'first-solve':       { title: 'Primer caso',         desc: 'Resolviste tu primer enigma',           tier: 'bronze' },
  'mapdoku-easy':      { title: 'Cartógrafo novato',   desc: 'Mapdoku resuelto en fácil',             tier: 'bronze' },
  'mapdoku-hard':      { title: 'Maestro del mapa',    desc: 'Mapdoku en difícil sin pistas',         tier: 'gold'   },
  'escape-fast':       { title: 'Escapista',           desc: 'Escape Room en menos de 10 min',        tier: 'silver' },
  'detective':         { title: 'Detective',           desc: 'Resolviste un caso criminal',           tier: 'silver' },
  'detective-perfect': { title: 'Sherlock',            desc: 'Caso resuelto sin acusar inocentes',    tier: 'gold'   },
  'visual':            { title: 'Ojo de halcón',       desc: 'Habitación visual completada',          tier: 'silver' },
  'riddler':           { title: 'Acertijero',          desc: 'Cadena de acertijos completa',          tier: 'silver' },
  'cipher':            { title: 'Criptógrafo',         desc: 'Cifrado descifrado',                    tier: 'silver' },
  'streak-3':          { title: 'Tres en raya',        desc: '3 victorias seguidas',                  tier: 'silver' },
  'streak-7':          { title: 'Imparable',           desc: '7 victorias seguidas',                  tier: 'gold'   },
  'no-hints':          { title: 'Mente afilada',       desc: 'Resolviste sin usar pistas',            tier: 'gold'   },
};

// ─── Toast ─────────────────────────────────────────────────────────────
CC.toast = function (msg, kind = '', ms = 2500) {
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, ms - 300);
  setTimeout(() => t.remove(), ms);
};

// ─── Sharing & Daily ───────────────────────────────────────────────────
CC.shareCase = async function (gameId, caseData, title) {
  const r = await fetch('/api/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(CC.getPin() ? { 'x-access-pin': CC.getPin() } : {}) },
    body: JSON.stringify({ gameId, caseData, title }),
  });
  if (!r.ok) throw new Error('No se pudo compartir');
  const { id } = await r.json();
  return id;
};

CC.fetchShared = async function (id) {
  const r = await fetch(`/api/share/${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error('Caso no encontrado');
  return r.json();
};

CC.publishDaily = async function (gameId, caseData, title) {
  const r = await fetch(`/api/daily/${gameId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(CC.getPin() ? { 'x-access-pin': CC.getPin() } : {}) },
    body: JSON.stringify({ caseData, title }),
  });
  if (!r.ok) throw new Error('No se pudo publicar como diario');
  return r.json();
};

CC.fetchDailyList = async function () {
  try {
    const r = await fetch('/api/daily');
    if (!r.ok) return { items: [] };
    return r.json();
  } catch { return { items: [] }; }
};

CC.fetchDaily = async function (gameId) {
  const r = await fetch(`/api/daily/${gameId}`);
  if (!r.ok) return null;
  return r.json();
};

CC.shareUrl = (gameId, caseId) => {
  const u = new URL(location.href);
  u.search = `?game=${encodeURIComponent(gameId)}&case=${encodeURIComponent(caseId)}`;
  u.hash = '';
  return u.toString();
};

// ─── Pool compartido (casos generados disponibles para todos) ─────────
CC.poolStats = async function (gameId) {
  try {
    const r = await fetch(`/api/pool/${gameId}/stats`);
    if (!r.ok) return { total: 0, byDifficulty: {} };
    return r.json();
  } catch { return { total: 0, byDifficulty: {} }; }
};

CC.poolPick = async function (gameId, difficulty) {
  const played = CC.getPlayed(gameId);
  const url = new URL(`/api/pool/${gameId}/random`, location.origin);
  if (difficulty) url.searchParams.set('difficulty', difficulty);
  if (played.length) url.searchParams.set('exclude', played.join(','));
  const r = await fetch(url.toString());
  if (!r.ok) return null;
  const data = await r.json();
  return data.id ? data : null;
};

CC.poolSave = async function (gameId, caseData, difficulty, title) {
  try {
    const r = await fetch(`/api/pool/${gameId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseData, difficulty, title }),
    });
    if (!r.ok) return null;
    return r.json();
  } catch { return null; }
};

CC.poolList = async function (gameId) {
  try {
    const r = await fetch(`/api/pool/${gameId}/list`);
    if (!r.ok) return [];
    return (await r.json()).items || [];
  } catch { return []; }
};

CC.poolGetCase = async function (gameId, id) {
  const r = await fetch(`/api/pool/${gameId}/case/${id}`);
  if (!r.ok) return null;
  return r.json();
};

CC.poolUpdate = async function (gameId, id, caseData, difficulty, title) {
  try {
    await fetch(`/api/pool/${gameId}/case/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseData, difficulty, title }),
    });
  } catch {}
};

// ─── Plays / Leaderboard ───────────────────────────────────────────────
CC.recordPlay = async function (gameId, caseId, { duration, hints, won } = {}) {
  if (!caseId) return null;
  const nickname = CC.getSettings().nickname || 'anónimo';
  try {
    const r = await fetch(`/api/pool/${gameId}/case/${caseId}/play`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname, duration, hints, won }),
    });
    return r.ok ? r.json() : null;
  } catch { return null; }
};

CC.fetchPlays = async function (gameId, caseId) {
  if (!caseId) return null;
  try {
    const r = await fetch(`/api/pool/${gameId}/case/${caseId}/plays`);
    return r.ok ? r.json() : null;
  } catch { return null; }
};

// ─── Likes ─────────────────────────────────────────────────────────────
const LIKED_KEY = (gameId) => `cc.liked.${gameId}`;
CC.getLiked = (gameId) => {
  try { return new Set(JSON.parse(localStorage.getItem(LIKED_KEY(gameId)) || '[]')); }
  catch { return new Set(); }
};
CC.hasLiked = (gameId, caseId) => CC.getLiked(gameId).has(caseId);
CC.toggleLike = async function (gameId, caseId) {
  const liked = CC.getLiked(gameId);
  const willLike = !liked.has(caseId);
  const direction = willLike ? 1 : -1;
  try {
    const r = await fetch(`/api/pool/${gameId}/case/${caseId}/like`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction }),
    });
    if (!r.ok) throw new Error('like falló');
    const { likes } = await r.json();
    if (willLike) liked.add(caseId); else liked.delete(caseId);
    localStorage.setItem(LIKED_KEY(gameId), JSON.stringify([...liked]));
    return { likes, liked: willLike };
  } catch (e) { CC.toast(e.message, 'bad'); return null; }
};

// ─── Importar pool desde JSON ──────────────────────────────────────────
CC.importPool = async function (gameId, cases) {
  const r = await fetch('/api/pool/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameId, cases }),
  });
  if (!r.ok) throw new Error('Import falló: ' + r.status);
  return r.json();
};

// Casos que el usuario ya ha jugado (para no repetir)
const PLAYED_KEY = (gameId) => `cc.played.${gameId}`;
CC.getPlayed = (gameId) => {
  try { return JSON.parse(localStorage.getItem(PLAYED_KEY(gameId)) || '[]'); }
  catch { return []; }
};
CC.markPlayed = (gameId, id) => {
  if (!id) return;
  const list = CC.getPlayed(gameId);
  if (list.includes(id)) return;
  list.push(id);
  localStorage.setItem(PLAYED_KEY(gameId), JSON.stringify(list.slice(-500)));
};

CC.copy = async (text) => {
  try { await navigator.clipboard.writeText(text); CC.toast('Copiado al portapapeles', 'ok'); }
  catch { CC.toast('No se pudo copiar', 'bad'); }
};

// ─── Utils ─────────────────────────────────────────────────────────────
CC.rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
CC.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
CC.shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
CC.fmtTime = (sec) => {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};
CC.fmtDate = (ts) => new Date(ts).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
