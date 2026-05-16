import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const SHARES_DIR = path.join(DATA_DIR, 'shares');
const DAILY_DIR  = path.join(DATA_DIR, 'daily');
const POOL_DIR   = path.join(DATA_DIR, 'pool');
const PLAYS_DIR  = path.join(DATA_DIR, 'plays');
await fs.mkdir(SHARES_DIR, { recursive: true });
await fs.mkdir(DAILY_DIR,  { recursive: true });
await fs.mkdir(POOL_DIR,   { recursive: true });
await fs.mkdir(PLAYS_DIR,  { recursive: true });

const app = express();
app.use(express.json({ limit: '25mb' }));

// ─── Config ─────────────────────────────────────────────────────────────
const OLLAMA_BASE   = process.env.OLLAMA_BASE_URL || 'https://ollama.com';
const OLLAMA_KEY    = process.env.OLLAMA_API_KEY || '';
const OLLAMA_MODEL  = process.env.OLLAMA_MODEL || 'gpt-oss:120b-cloud';
const OPENAI_KEY    = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL  = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
const IMG_QUALITY   = process.env.OPENAI_IMAGE_QUALITY || 'low';
const ACCESS_PIN    = process.env.ACCESS_PIN || '';
const PORT          = process.env.PORT || 3000;

// ─── Auth (PIN opcional) ────────────────────────────────────────────────
app.use((req, res, next) => {
  if (!ACCESS_PIN) return next();
  if (req.path.startsWith('/api/')) {
    const pin = req.headers['x-access-pin'];
    if (pin !== ACCESS_PIN) return res.status(401).json({ error: 'PIN incorrecto' });
  }
  next();
});

// ─── Config endpoint ────────────────────────────────────────────────────
app.get('/api/config', (req, res) => {
  res.json({
    ollamaModel: OLLAMA_MODEL,
    hasOllama: !!OLLAMA_KEY,
    hasOpenAI: !!OPENAI_KEY,
    pinRequired: !!ACCESS_PIN,
  });
});

// ─── Chat (Ollama) ──────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  try {
    if (!OLLAMA_KEY) return res.status(503).json({ error: 'OLLAMA_API_KEY no configurada en el servidor' });
    const { messages, system, json, model, temperature = 0.85 } = req.body || {};
    if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'messages requerido' });

    const finalMessages = system ? [{ role: 'system', content: system }, ...messages] : messages;
    const body = {
      model: model || OLLAMA_MODEL,
      messages: finalMessages,
      stream: false,
      options: { temperature },
    };
    if (json) body.format = 'json';

    const r = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OLLAMA_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const text = await r.text();
      console.error('Ollama err', r.status, text);
      return res.status(r.status).json({ error: `Ollama ${r.status}: ${text.slice(0, 400)}` });
    }
    const data = await r.json();
    res.json({ content: data?.message?.content || '' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── Image (OpenAI) ─────────────────────────────────────────────────────
app.post('/api/image', async (req, res) => {
  try {
    if (!OPENAI_KEY) return res.status(503).json({ error: 'OPENAI_API_KEY no configurada en el servidor' });
    const { prompt, size = '1024x1024', quality = IMG_QUALITY } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'prompt requerido' });

    const r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: OPENAI_MODEL, prompt, n: 1, size, quality }),
    });
    if (!r.ok) {
      const text = await r.text();
      console.error('OpenAI img err', r.status, text);
      return res.status(r.status).json({ error: `OpenAI ${r.status}: ${text.slice(0, 400)}` });
    }
    const data = await r.json();
    const item = data?.data?.[0] || {};
    const image = item.b64_json ? `data:image/png;base64,${item.b64_json}` : item.url;
    res.json({ image });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── Casos compartidos ──────────────────────────────────────────────────
// POST /api/share  { gameId, caseData } → { id }
// GET  /api/share/:id                   → { gameId, caseData, ts }
const sanitizeId = (s) => String(s || '').replace(/[^a-z0-9-]/gi, '').slice(0, 16);

app.post('/api/share', async (req, res) => {
  try {
    const { gameId, caseData, title } = req.body || {};
    if (!gameId || !caseData) return res.status(400).json({ error: 'gameId y caseData requeridos' });
    const id = crypto.randomBytes(5).toString('hex');
    const payload = { gameId, caseData, title: title || '', ts: Date.now() };
    await fs.writeFile(path.join(SHARES_DIR, `${id}.json`), JSON.stringify(payload));
    res.json({ id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/share/:id', async (req, res) => {
  try {
    const id = sanitizeId(req.params.id);
    if (!id) return res.status(400).json({ error: 'id inválido' });
    const txt = await fs.readFile(path.join(SHARES_DIR, `${id}.json`), 'utf8');
    res.json(JSON.parse(txt));
  } catch (e) {
    res.status(404).json({ error: 'No encontrado' });
  }
});

// ─── Caso del día ────────────────────────────────────────────────────────
// PUT /api/daily/:gameId       (publicar)
// GET /api/daily               (listar lo de hoy)
const today = () => new Date().toISOString().slice(0, 10);

app.put('/api/daily/:gameId', async (req, res) => {
  try {
    const gameId = String(req.params.gameId).replace(/[^a-z]/g, '').slice(0, 20);
    const { caseData, title } = req.body || {};
    if (!gameId || !caseData) return res.status(400).json({ error: 'datos faltantes' });
    const payload = { gameId, caseData, title: title || '', ts: Date.now(), date: today() };
    await fs.writeFile(path.join(DAILY_DIR, `${today()}-${gameId}.json`), JSON.stringify(payload));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/daily', async (req, res) => {
  try {
    const files = await fs.readdir(DAILY_DIR);
    const todays = files.filter(f => f.startsWith(today() + '-'));
    const items = await Promise.all(todays.map(async (f) => {
      const txt = await fs.readFile(path.join(DAILY_DIR, f), 'utf8');
      const d = JSON.parse(txt);
      return { gameId: d.gameId, title: d.title, ts: d.ts };
    }));
    res.json({ date: today(), items });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/daily/:gameId', async (req, res) => {
  try {
    const gameId = String(req.params.gameId).replace(/[^a-z]/g, '').slice(0, 20);
    const txt = await fs.readFile(path.join(DAILY_DIR, `${today()}-${gameId}.json`), 'utf8');
    res.json(JSON.parse(txt));
  } catch (e) {
    res.status(404).json({ error: 'No hay caso del día para ese modo' });
  }
});

// ─── Pool compartido de casos ───────────────────────────────────────────
// Cada caso generado se archiva. Cualquiera puede sacar uno al azar gratis.
const sanitizeGameId = (s) => String(s || '').replace(/[^a-z]/gi, '').slice(0, 20);

async function readIndex(gameId) {
  try {
    const idx = await fs.readFile(path.join(POOL_DIR, `${gameId}.index.json`), 'utf8');
    return JSON.parse(idx);
  } catch { return []; }
}
async function writeIndex(gameId, index) {
  await fs.writeFile(path.join(POOL_DIR, `${gameId}.index.json`), JSON.stringify(index));
}

app.post('/api/pool/:gameId', async (req, res) => {
  try {
    const gameId = sanitizeGameId(req.params.gameId);
    if (!gameId) return res.status(400).json({ error: 'gameId inválido' });
    const { caseData, difficulty = 'medio', title = '' } = req.body || {};
    if (!caseData) return res.status(400).json({ error: 'caseData requerido' });
    const id = crypto.randomBytes(5).toString('hex');
    const dir = path.join(POOL_DIR, gameId);
    await fs.mkdir(dir, { recursive: true });
    const payload = { id, caseData, difficulty, title, ts: Date.now() };
    await fs.writeFile(path.join(dir, `${id}.json`), JSON.stringify(payload));
    const index = await readIndex(gameId);
    index.push({ id, difficulty, title, ts: payload.ts });
    await writeIndex(gameId, index);
    res.json({ id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/pool/:gameId/stats', async (req, res) => {
  try {
    const gameId = sanitizeGameId(req.params.gameId);
    const index = await readIndex(gameId);
    const byDiff = { 'fácil': 0, 'medio': 0, 'difícil': 0 };
    index.forEach(it => { if (byDiff[it.difficulty] !== undefined) byDiff[it.difficulty]++; });
    res.json({ total: index.length, byDifficulty: byDiff });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/pool/:gameId/random', async (req, res) => {
  try {
    const gameId = sanitizeGameId(req.params.gameId);
    const { difficulty, exclude } = req.query;
    const ex = new Set(String(exclude || '').split(',').filter(Boolean));
    const index = await readIndex(gameId);
    let pool = index;
    if (difficulty) pool = pool.filter(it => it.difficulty === difficulty);
    const fresh = pool.filter(it => !ex.has(it.id));
    const pick = fresh.length > 0 ? fresh[Math.floor(Math.random() * fresh.length)]
              : pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : null;
    if (!pick) return res.json({ id: null });
    const data = JSON.parse(await fs.readFile(path.join(POOL_DIR, gameId, `${pick.id}.json`), 'utf8'));
    res.json({ ...data, reused: ex.has(pick.id) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/pool/:gameId/list', async (req, res) => {
  try {
    const gameId = sanitizeGameId(req.params.gameId);
    const index = await readIndex(gameId);
    // Devolver más recientes primero, máximo 200
    res.json({ items: index.slice().sort((a, b) => b.ts - a.ts).slice(0, 200) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/pool/:gameId/case/:id', async (req, res) => {
  try {
    const gameId = sanitizeGameId(req.params.gameId);
    const id = sanitizeId(req.params.id);
    const data = JSON.parse(await fs.readFile(path.join(POOL_DIR, gameId, `${id}.json`), 'utf8'));
    res.json(data);
  } catch (e) { res.status(404).json({ error: 'No encontrado' }); }
});

// Update (para enriquecer con imágenes ya generadas)
app.put('/api/pool/:gameId/case/:id', async (req, res) => {
  try {
    const gameId = sanitizeGameId(req.params.gameId);
    const id = sanitizeId(req.params.id);
    const { caseData, difficulty, title } = req.body || {};
    if (!caseData) return res.status(400).json({ error: 'caseData requerido' });
    const file = path.join(POOL_DIR, gameId, `${id}.json`);
    let existing;
    try { existing = JSON.parse(await fs.readFile(file, 'utf8')); }
    catch { return res.status(404).json({ error: 'No encontrado' }); }
    existing.caseData = caseData;
    if (difficulty) existing.difficulty = difficulty;
    if (title) existing.title = title;
    await fs.writeFile(file, JSON.stringify(existing));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Plays / leaderboard por caso ───────────────────────────────────────
app.post('/api/pool/:gameId/case/:id/play', async (req, res) => {
  try {
    const gameId = sanitizeGameId(req.params.gameId);
    const id = sanitizeId(req.params.id);
    const { nickname = 'anónimo', duration = 0, hints = 0, won = true } = req.body || {};
    const dir = path.join(PLAYS_DIR, gameId);
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${id}.json`);
    let plays = [];
    try { plays = JSON.parse(await fs.readFile(file, 'utf8')); } catch {}
    plays.push({
      nickname: String(nickname).slice(0, 20),
      duration: Math.max(0, Math.floor(duration)),
      hints: Math.max(0, Math.floor(hints)),
      won: !!won, ts: Date.now(),
    });
    plays = plays.slice(-200);
    await fs.writeFile(file, JSON.stringify(plays));
    res.json({ ok: true, totalPlays: plays.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/pool/:gameId/case/:id/plays', async (req, res) => {
  try {
    const gameId = sanitizeGameId(req.params.gameId);
    const id = sanitizeId(req.params.id);
    try {
      const plays = JSON.parse(await fs.readFile(path.join(PLAYS_DIR, gameId, `${id}.json`), 'utf8'));
      const wins = plays.filter(p => p.won);
      const top = wins.slice().sort((a, b) => a.duration - b.duration).slice(0, 10);
      res.json({ total: plays.length, wins: wins.length, top });
    } catch { res.json({ total: 0, wins: 0, top: [] }); }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Likes ───────────────────────────────────────────────────────────────
app.post('/api/pool/:gameId/case/:id/like', async (req, res) => {
  try {
    const gameId = sanitizeGameId(req.params.gameId);
    const id = sanitizeId(req.params.id);
    const direction = Number(req.body?.direction || 1);
    const index = await readIndex(gameId);
    const entry = index.find(it => it.id === id);
    if (!entry) return res.status(404).json({ error: 'No encontrado' });
    entry.likes = Math.max(0, (entry.likes || 0) + (direction > 0 ? 1 : -1));
    await writeIndex(gameId, index);
    res.json({ likes: entry.likes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Importar pool desde JSON ────────────────────────────────────────────
app.post('/api/pool/import', async (req, res) => {
  try {
    const { gameId, cases } = req.body || {};
    const gid = sanitizeGameId(gameId);
    if (!gid || !Array.isArray(cases)) return res.status(400).json({ error: 'gameId y cases[] requeridos' });
    const dir = path.join(POOL_DIR, gid);
    await fs.mkdir(dir, { recursive: true });
    const index = await readIndex(gid);
    let added = 0;
    for (const c of cases) {
      if (!c?.caseData) continue;
      const id = crypto.randomBytes(5).toString('hex');
      const payload = {
        id, caseData: c.caseData,
        difficulty: c.difficulty || 'medio',
        title: c.title || '', ts: Date.now(),
      };
      await fs.writeFile(path.join(dir, `${id}.json`), JSON.stringify(payload));
      index.push({ id, difficulty: payload.difficulty, title: payload.title, ts: payload.ts });
      added++;
    }
    await writeIndex(gid, index);
    res.json({ added });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Auto-daily: el servidor promociona un caso del archivo a "caso del día" ───
const ALL_GAME_IDS = ['mapdoku', 'escape', 'criminal', 'visual', 'riddles', 'ciphers', 'anagrams'];
async function ensureDailies() {
  const date = today();
  for (const gid of ALL_GAME_IDS) {
    const file = path.join(DAILY_DIR, `${date}-${gid}.json`);
    try { await fs.access(file); continue; } catch {}
    const index = await readIndex(gid);
    if (index.length === 0) continue;
    // Preferir casos con más likes/plays como "destacados"
    const sorted = index.slice().sort((a, b) => (b.likes || 0) - (a.likes || 0));
    const top = sorted.slice(0, Math.max(3, Math.floor(sorted.length / 4)));
    const pick = top[Math.floor(Math.random() * top.length)];
    try {
      const full = JSON.parse(await fs.readFile(path.join(POOL_DIR, gid, `${pick.id}.json`), 'utf8'));
      const payload = { gameId: gid, caseData: full.caseData, title: full.title || '', ts: Date.now(), date, poolId: pick.id };
      await fs.writeFile(file, JSON.stringify(payload));
      console.log(`  [daily] ${gid} → ${pick.id} (${pick.title || 'sin título'})`);
    } catch (e) { console.warn('daily err', gid, e.message); }
  }
}
ensureDailies();
setInterval(ensureDailies, 60 * 60 * 1000); // cada hora

// ─── Static ─────────────────────────────────────────────────────────────
app.use(express.static(__dirname, { extensions: ['html'] }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, () => {
  console.log(`\n  ╔════════════════════════════════════════╗`);
  console.log(`  ║  Cuarto Cerrado en  http://0.0.0.0:${PORT}  ║`);
  console.log(`  ╚════════════════════════════════════════╝`);
  console.log(`  Ollama: ${OLLAMA_KEY ? '✓' : '✗ falta OLLAMA_API_KEY'}  (${OLLAMA_MODEL})`);
  console.log(`  OpenAI: ${OPENAI_KEY ? '✓' : '✗ falta OPENAI_API_KEY'}  (${OPENAI_MODEL} ${IMG_QUALITY})`);
  console.log(`  PIN:    ${ACCESS_PIN ? '✓ activado' : '✗ abierto'}\n`);
});
