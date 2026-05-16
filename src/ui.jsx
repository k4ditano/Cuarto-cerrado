// ─── Cuarto Cerrado — UI compartida ────────────────────────────────────
const { useState, useEffect, useRef, useMemo, useCallback } = React;

// ─── Paper card ────────────────────────────────────────────────────────
function Paper({ className = '', children, aged = true, style }) {
  return (
    <div className={`paper ${aged ? 'aged' : ''} ${className}`} style={style}>
      {children}
    </div>
  );
}

// ─── Stamp ─────────────────────────────────────────────────────────────
function Stamp({ children, kind = '', style = {}, solid = false }) {
  return (
    <span className={`stamp ${kind} ${solid ? 'solid' : ''}`} style={style}>{children}</span>
  );
}

// ─── Topbar ────────────────────────────────────────────────────────────
function Topbar({ route, setRoute }) {
  const links = [
    ['lobby', 'Sala'],
    ['historial', 'Historial'],
    ['medallas', 'Medallas'],
    ['ajustes', 'Ajustes'],
  ];
  return (
    <header className="topbar">
      <div className="brand" onClick={() => setRoute('lobby')} style={{ cursor: 'pointer' }}>
        <span className="dot"></span>
        <span>Cuarto Cerrado</span>
        <small>Expedientes · Casos · Enigmas</small>
      </div>
      <nav>
        {links.map(([k, label]) => (
          <button key={k} className={`navlink ${route === k ? 'active' : ''}`} onClick={() => setRoute(k)}>{label}</button>
        ))}
      </nav>
    </header>
  );
}

// ─── Loader ────────────────────────────────────────────────────────────
function Loader({ msg = 'Cargando' }) {
  return (
    <div className="loader">
      <span>{msg}</span>
      <span className="dots"><span></span><span></span><span></span></span>
    </div>
  );
}

function BigLoader({ steps = ['Mecanografiando expediente', 'Sellando con tinta roja', 'Archivando pistas'] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % steps.length), 1800);
    return () => clearInterval(t);
  }, [steps.length]);
  return (
    <div className="loader-big">
      <div style={{ fontSize: 42 }}>🕵️</div>
      <div className="typewriter" style={{ minWidth: 280 }}>{steps[i]}…</div>
      <div className="muted tiny">la IA está preparando tu caso</div>
    </div>
  );
}

// ─── LiveLoader: feed de estado en tiempo real ─────────────────────────
function useStatusFeed() {
  const [feed, setFeed] = useState([]);
  const push  = useCallback((text)         => setFeed((f) => [...f.map(x => ({ ...x, done: true })), { text, done: false }]), []);
  const done  = useCallback((text)         => setFeed((f) => f.map((x, i) => i === f.length - 1 ? { ...x, done: true, text: text || x.text } : x)), []);
  const reset = useCallback(()             => setFeed([]), []);
  return { feed, push, done, reset };
}

function LiveLoader({ feed = [], title = 'Generando expediente', idle = ['Mecanografiando', 'Plegando papel', 'Sellando con tinta'] }) {
  const [tick, setTick] = useState(0);
  const last = feed[feed.length - 1];
  const isIdle = feed.length === 0;
  useEffect(() => {
    if (!isIdle) return;
    const t = setInterval(() => setTick((x) => x + 1), 1500);
    return () => clearInterval(t);
  }, [isIdle]);
  const idleMsg = idle[tick % idle.length];

  return (
    <div className="paper aged" style={{ maxWidth: 560, margin: '2rem auto', padding: '2rem', position: 'relative' }}>
      <Stamp kind="red" style={{ position: 'absolute', top: 16, right: 16, fontSize: '.6rem', padding: '.15rem .4rem' }}>EN PROCESO</Stamp>
      <div className="row gap-sm" style={{ alignItems: 'center', marginBottom: '1.2rem' }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          border: '3px solid var(--ink)',
          borderTopColor: 'transparent',
          animation: 'spinrot 1s linear infinite',
        }}></div>
        <div>
          <div className="font-display" style={{ fontSize: '1.2rem' }}>{title}</div>
          <div className="tiny muted">la IA está trabajando en tu caso</div>
        </div>
      </div>

      <div className="col" style={{ gap: '.5rem' }}>
        {feed.map((step, i) => {
          const isCurrent = !step.done && i === feed.length - 1;
          return (
            <div key={i} className="row gap-sm" style={{ alignItems: 'flex-start', opacity: step.done ? 0.7 : 1 }}>
              <div style={{ width: 22, paddingTop: 2, flexShrink: 0 }}>
                {step.done ? (
                  <span style={{ color: 'var(--stamp-green)', fontFamily: 'Special Elite', fontSize: '1rem' }}>✓</span>
                ) : (
                  <span className="dots" style={{ display: 'inline-flex', gap: 3 }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--ink)', display: 'inline-block', animation: 'blink 1.2s infinite' }}></span>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--ink)', display: 'inline-block', animation: 'blink 1.2s infinite .15s' }}></span>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--ink)', display: 'inline-block', animation: 'blink 1.2s infinite .3s' }}></span>
                  </span>
                )}
              </div>
              <div className="font-mono" style={{ fontSize: '.92rem', textDecoration: step.done ? 'none' : 'none' }}>
                {isCurrent ? <Typewriter text={step.text} /> : step.text}
              </div>
            </div>
          );
        })}
        {isIdle && (
          <div className="row gap-sm" style={{ alignItems: 'flex-start' }}>
            <div style={{ width: 22, paddingTop: 2 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--ink)', display: 'inline-block' }}></span>
            </div>
            <div className="font-mono muted" style={{ fontSize: '.9rem', fontStyle: 'italic' }}>{idleMsg}…</div>
          </div>
        )}
      </div>

      <div className="divider dashed" style={{ marginTop: '1.5rem' }}></div>
      <div className="tiny muted" style={{ marginTop: '.6rem', fontStyle: 'italic' }}>
        Cada caso es único. La generación tarda entre 10 y 40 segundos según el modo.
      </div>
    </div>
  );
}

function Typewriter({ text, speed = 28 }) {
  const [shown, setShown] = useState(0);
  useEffect(() => { setShown(0); }, [text]);
  useEffect(() => {
    if (shown >= text.length) return;
    const t = setTimeout(() => setShown(shown + 1), speed);
    return () => clearTimeout(t);
  }, [shown, text, speed]);
  return (
    <span>
      {text.slice(0, shown)}
      <span style={{ borderRight: '2px solid var(--ink)', marginLeft: 1, opacity: shown < text.length ? 1 : 0, animation: 'caret .6s steps(1) infinite' }}>&nbsp;</span>
    </span>
  );
}

// ─── Modal ─────────────────────────────────────────────────────────────
function Modal({ children, onClose, title }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="between" style={{ marginBottom: '1rem' }}>
          {title && <h2 style={{ margin: 0 }}>{title}</h2>}
          <button className="btn ghost small" onClick={onClose}>Cerrar</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Game shell (wraps every game) ─────────────────────────────────────
function GameShell({ title, subtitle, onExit, children, difficulty, timer, right }) {
  return (
    <div>
      <div className="between wrap" style={{ marginBottom: '1.5rem', gap: '1rem' }}>
        <div>
          <div className="row gap-sm" style={{ alignItems: 'baseline' }}>
            <button className="btn ghost small" onClick={onExit}>← Sala</button>
            {difficulty && <Stamp kind={difficulty === 'difícil' ? '' : difficulty === 'medio' ? 'blue' : 'green'}>{difficulty}</Stamp>}
            {timer != null && <span className="pill">⏱ {CC.fmtTime(timer)}</span>}
          </div>
          <h1 className="font-display" style={{ marginTop: '.5rem', marginBottom: 0 }}>{title}</h1>
          {subtitle && <div className="muted tiny" style={{ marginTop: 4, letterSpacing: '.15em', textTransform: 'uppercase' }}>{subtitle}</div>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

// ─── Difficulty picker (start screen) ──────────────────────────────────
function DifficultyPicker({ value, onChange }) {
  const opts = [
    ['fácil', 'green', 'Relax con premio fácil'],
    ['medio', 'blue', 'Pensar pero fluido'],
    ['difícil', '', 'Que sude'],
  ];
  return (
    <div>
      <label>Dificultad</label>
      <div className="row gap-sm wrap" style={{ marginTop: '.4rem' }}>
        {opts.map(([k, kind, desc]) => (
          <button key={k}
            onClick={() => onChange(k)}
            className="paper"
            style={{
              padding: '.7rem 1rem', cursor: 'pointer',
              background: value === k ? 'var(--ink)' : 'var(--paper-2)',
              color: value === k ? 'var(--paper)' : 'var(--ink)',
              border: '1px solid var(--ink-soft)',
              minWidth: 180, textAlign: 'left',
            }}>
            <Stamp kind={kind} solid={value === k}>{k}</Stamp>
            <div className="tiny" style={{ marginTop: '.4rem', opacity: .8 }}>{desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── API status banner ─────────────────────────────────────────────────
function APIStatus() {
  if (CC.config.hasOllama && CC.config.hasOpenAI) return null;
  return (
    <div className="paper" style={{ background: 'oklch(0.88 0.05 70)', marginBottom: '1.5rem', borderLeft: '4px solid var(--stamp-red)' }}>
      <div className="font-typewriter" style={{ fontSize: '.85rem', letterSpacing: '.05em' }}>
        ⚠ Faltan claves en el servidor: {!CC.config.hasOllama && <Stamp kind="red" style={{ margin: '0 .3rem' }}>OLLAMA_API_KEY</Stamp>} {!CC.config.hasOpenAI && <Stamp kind="red" style={{ margin: '0 .3rem' }}>OPENAI_API_KEY</Stamp>}
      </div>
      <div className="tiny muted" style={{ marginTop: '.4rem' }}>
        Configúralas en <code>.env</code> y reinicia el servidor. Hasta entonces los juegos no pueden generarse.
      </div>
    </div>
  );
}

// ─── Win screen helpers: compartir / publicar como diario ──────────────
function ShareBar({ gameId, poolId, caseData, title, difficulty }) {
  const [id, setId] = useState(poolId || null);
  const [busy, setBusy] = useState(false);
  const [pubOk, setPubOk] = useState(false);

  useEffect(() => { if (poolId) setId(poolId); }, [poolId]);

  const ensureId = async () => {
    if (id) return id;
    setBusy(true);
    try {
      const r = await CC.poolSave(gameId, caseData, difficulty || 'medio', title);
      if (r?.id) { setId(r.id); return r.id; }
    } finally { setBusy(false); }
    return null;
  };

  const share = async () => {
    const i = await ensureId();
    if (!i) return CC.toast('No se pudo compartir', 'bad');
    CC.copy(CC.shareUrl(gameId, i));
  };

  const publish = async () => {
    setBusy(true);
    try {
      await CC.publishDaily(gameId, caseData, title);
      setPubOk(true);
      CC.toast('Caso del día publicado', 'ok');
    } catch (e) { CC.toast('Error: ' + e.message, 'bad'); }
    finally { setBusy(false); }
  };

  return (
    <div className="paper" style={{ background: 'rgba(255,250,210,.4)', marginTop: '1rem', padding: '1rem 1.2rem' }}>
      <div className="font-typewriter tiny" style={{ letterSpacing: '.2em', color: 'var(--ink-faded)', marginBottom: '.5rem' }}>COMPARTIR ESTE CASO</div>
      <div className="row gap-sm wrap" style={{ alignItems: 'center' }}>
        <input readOnly value={id ? CC.shareUrl(gameId, id) : ''} placeholder={busy ? 'archivando…' : 'la URL aparecerá al copiar'} onClick={(e) => e.target.select()} style={{ flex: 1, minWidth: 200, fontSize: '.8rem' }} />
        <button className="btn small" onClick={share} disabled={busy}>🔗 Copiar URL</button>
        <button className="btn ghost small" onClick={publish} disabled={busy || pubOk}>{pubOk ? '✓ Diario' : '🌟 Caso del día'}</button>
      </div>
    </div>
  );
}

// ─── Leaderboard de un caso concreto ──────────────────────────────────
function Leaderboard({ gameId, caseId }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!caseId) return;
    CC.fetchPlays(gameId, caseId).then(setData);
  }, [gameId, caseId]);

  if (!caseId || !data || data.total === 0) return null;

  return (
    <div className="paper" style={{ marginTop: '1rem', padding: '1rem 1.2rem', background: 'var(--paper-2)' }}>
      <div className="between" style={{ marginBottom: '.6rem' }}>
        <div className="font-typewriter tiny" style={{ letterSpacing: '.2em' }}>RÉCORDS DE ESTE CASO</div>
        <span className="tiny muted">{data.total} partida{data.total === 1 ? '' : 's'} · {data.wins} victoria{data.wins === 1 ? '' : 's'}</span>
      </div>
      {data.top.length === 0 ? (
        <div className="tiny muted">Nadie lo ha ganado todavía.</div>
      ) : (
        <ol style={{ margin: 0, paddingLeft: '1.5rem' }}>
          {data.top.slice(0, 5).map((p, i) => (
            <li key={i} className="tiny" style={{ marginBottom: 2 }}>
              <span className="font-typewriter" style={{ marginRight: '.4rem' }}>{p.nickname}</span>
              · {CC.fmtTime(p.duration)}{p.hints > 0 ? ` · ${p.hints} pistas` : ''}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ─── GameSetup: pantalla común de inicio (modo + dificultad) ───────────
function GameSetup({ gameId, intro, difficulty, setDifficulty, onStartNew, onStartFromPool, error, disabled, generationCost = '~10-25¢' }) {
  const [stats, setStats] = useState({ total: 0, byDifficulty: {} });
  const [mode, setMode] = useState('archive'); // archive | new
  const [showList, setShowList] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    CC.poolStats(gameId).then(setStats);
  }, [gameId]);

  const countForDiff = stats.byDifficulty?.[difficulty] || 0;
  const totalCount = stats.total || 0;

  // Si no hay nada en archivo para esta dificultad, autoflip a 'new'
  useEffect(() => {
    if (countForDiff === 0 && mode === 'archive') setMode('new');
  }, [countForDiff]);

  const start = async () => {
    setBusy(true);
    try {
      if (mode === 'archive') {
        const picked = await CC.poolPick(gameId, difficulty);
        if (picked && picked.caseData) {
          CC.markPlayed(gameId, picked.id);
          onStartFromPool(picked.caseData, picked.id);
        } else {
          CC.toast('No hay casos guardados para esa dificultad. Generando uno nuevo.', '', 2500);
          onStartNew();
        }
      } else {
        onStartNew();
      }
    } finally { setBusy(false); }
  };

  return (
    <div style={{ maxWidth: 760 }}>
      <Paper style={{ marginBottom: '1.2rem' }}>
        {intro}
      </Paper>

      <Paper>
        <label>Tipo de partida</label>
        <div className="row gap-sm wrap" style={{ marginTop: '.4rem' }}>
          <ModeCard
            active={mode === 'archive'}
            onClick={() => setMode('archive')}
            disabled={countForDiff === 0 && totalCount === 0}
            icon="📚"
            title="Del archivo"
            subtitle={countForDiff > 0
              ? `${countForDiff} caso${countForDiff === 1 ? '' : 's'} en ${difficulty} · gratis`
              : totalCount > 0
                ? `0 en ${difficulty} (otros niveles: ${totalCount})`
                : 'archivo vacío todavía'
            }
          />
          <ModeCard
            active={mode === 'new'}
            onClick={() => setMode('new')}
            icon="✨"
            title="Caso nuevo"
            subtitle={`generado por IA · coste ${generationCost}`}
          />
        </div>
        {totalCount > 0 && (
          <button className="btn ghost small" onClick={() => setShowList(true)} style={{ marginTop: '.7rem' }}>
            📂 Explorar archivo ({totalCount})
          </button>
        )}

        <div className="divider dashed"></div>
        <DifficultyPicker value={difficulty} onChange={setDifficulty} />

        {error && <div className="pill red" style={{ marginTop: '1rem' }}>{error}</div>}

        <div style={{ marginTop: '1.5rem' }} className="row gap-sm wrap">
          <button className="btn red" onClick={start} disabled={disabled || busy}>
            {mode === 'archive' ? '🎲 Jugar caso del archivo' : '✨ Generar caso nuevo'}
          </button>
          {mode === 'archive' && countForDiff > 0 && (
            <span className="tiny muted">
              {CC.getPlayed(gameId).length > 0 && `Ya has jugado ${CC.getPlayed(gameId).length}. `}
              Se elige uno que no hayas jugado.
            </span>
          )}
        </div>
      </Paper>

      {showList && (
        <PoolBrowser gameId={gameId} onClose={() => setShowList(false)} onPick={(c) => { CC.markPlayed(gameId, c.id); onStartFromPool(c.caseData, c.id); }} />
      )}
    </div>
  );
}

function ModeCard({ active, onClick, disabled, icon, title, subtitle }) {
  return (
    <button onClick={onClick} disabled={disabled} className="paper" style={{
      padding: '1rem 1.2rem', cursor: disabled ? 'not-allowed' : 'pointer',
      background: active ? 'var(--ink)' : 'var(--paper-2)',
      color: active ? 'var(--paper)' : 'var(--ink)',
      opacity: disabled ? 0.5 : 1,
      border: '1px solid var(--paper-edge)',
      flex: 1, minWidth: 180, textAlign: 'left',
    }}>
      <div style={{ fontSize: 26 }}>{icon}</div>
      <div className="font-display" style={{ marginTop: '.4rem', fontSize: '1.1rem' }}>{title}</div>
      <div className="tiny" style={{ opacity: .85, marginTop: '.2rem' }}>{subtitle}</div>
    </button>
  );
}

function PoolBrowser({ gameId, onClose, onPick }) {
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState('todos');
  const [sortBy, setSortBy] = useState('recientes'); // recientes | likes
  const [tick, setTick] = useState(0);
  const played = new Set(CC.getPlayed(gameId));
  useEffect(() => { CC.poolList(gameId).then(setItems); }, [gameId, tick]);

  let filtered = (items || []).filter(it => filter === 'todos' || it.difficulty === filter);
  if (sortBy === 'likes') filtered = filtered.sort((a, b) => (b.likes || 0) - (a.likes || 0));

  const playFromPool = async (id) => {
    const c = await CC.poolGetCase(gameId, id);
    if (c?.caseData) { CC.markPlayed(gameId, id); onPick({ ...c, id }); }
    else CC.toast('No se pudo cargar', 'bad');
  };

  const like = async (id) => {
    const r = await CC.toggleLike(gameId, id);
    if (r) setTick(t => t + 1);
  };

  return (
    <Modal onClose={onClose} title="Archivo de casos">
      <div className="between wrap" style={{ marginBottom: '1rem', gap: '.5rem' }}>
        <div className="row gap-sm wrap">
          {['todos', 'fácil', 'medio', 'difícil'].map(d => (
            <button key={d} className={`navlink ${filter === d ? 'active' : ''}`} onClick={() => setFilter(d)}>{d}</button>
          ))}
        </div>
        <div className="row gap-sm">
          <button className={`navlink ${sortBy === 'recientes' ? 'active' : ''}`} onClick={() => setSortBy('recientes')}>↻ recientes</button>
          <button className={`navlink ${sortBy === 'likes' ? 'active' : ''}`} onClick={() => setSortBy('likes')}>❤ favoritos</button>
        </div>
      </div>
      {!items && <Loader msg="cargando" />}
      {items && filtered.length === 0 && <p className="muted">No hay casos para ese filtro.</p>}
      <div className="col gap-sm" style={{ maxHeight: '55vh', overflowY: 'auto' }}>
        {filtered.map((it) => {
          const liked = CC.hasLiked(gameId, it.id);
          return (
            <div key={it.id} className="paper between" style={{ padding: '.7rem .9rem', background: 'var(--paper-2)', gap: '.5rem' }}>
              <div style={{ flex: 1 }}>
                <div className="font-display" style={{ fontSize: '.95rem' }}>{it.title || '(sin título)'}</div>
                <div className="tiny muted">
                  <Stamp kind={it.difficulty === 'difícil' ? 'red' : it.difficulty === 'medio' ? 'blue' : 'green'} style={{ fontSize: '.55rem', padding: '.05rem .3rem', transform: 'none', marginRight: '.4rem' }}>{it.difficulty}</Stamp>
                  {CC.fmtDate(it.ts)}
                  {it.likes > 0 && <span style={{ marginLeft: '.5rem' }}>· ❤ {it.likes}</span>}
                  {played.has(it.id) && <span style={{ marginLeft: '.5rem' }}>· ✓ jugado</span>}
                </div>
              </div>
              <button onClick={() => like(it.id)} title={liked ? 'Quitar like' : 'Me gusta'} style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                fontSize: '1.3rem', color: liked ? 'var(--stamp-red)' : 'var(--ink-soft)',
              }}>{liked ? '❤' : '♡'}</button>
              <button className="btn small" onClick={() => playFromPool(it.id)}>Jugar</button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

// Export al window para uso global
Object.assign(window, { Paper, Stamp, Topbar, Loader, BigLoader, LiveLoader, useStatusFeed, Typewriter, Modal, GameShell, DifficultyPicker, APIStatus, ShareBar, Leaderboard, GameSetup, ModeCard, PoolBrowser });
