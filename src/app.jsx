// ─── Cuarto Cerrado — app principal: router, lobby, ajustes, historial ─

const GAMES = [
  { id: 'mapdoku',     emoji: '🗺️', name: 'Mapdoku',           tag: 'Lógica',     blurb: 'Deduce qué hay en cada casilla a partir de pistas.', accent: 'oklch(0.5 0.12 145)' },
  { id: 'escape',      emoji: '🔐', name: 'Escape Room',       tag: 'Narrativo',  blurb: 'Habitación cerrada. Examina, combina, escapa.',        accent: 'oklch(0.46 0.18 28)'  },
  { id: 'criminal',    emoji: '🕵️', name: 'Caso Criminal',     tag: 'Detective',  blurb: 'Cuatro sospechosos. Sólo uno mintió.',                  accent: 'oklch(0.38 0.1 245)'  },
  { id: 'visual',      emoji: '🖼️', name: 'Habitación Visual', tag: 'Observación', blurb: 'Una escena, un secreto escondido a plena vista.',    accent: 'oklch(0.5 0.13 80)'   },
  { id: 'riddles',     emoji: '🧩', name: 'Acertijos',          tag: 'Riddles',    blurb: 'Una cadena de enigmas con final cifrado.',              accent: 'oklch(0.45 0.1 320)'  },
  { id: 'ciphers',     emoji: '📜', name: 'Cifrados',           tag: 'Criptografía', blurb: 'Un mensaje en clave. Descifra antes de medianoche.', accent: 'oklch(0.4 0.08 60)'   },
  { id: 'anagrams',    emoji: '🔤', name: 'Anagramas',          tag: 'Palabras',   blurb: 'Letras desordenadas. Encuentra la palabra y la final.', accent: 'oklch(0.45 0.12 180)' },
  { id: 'surprise',    emoji: '🎭', name: 'Sorpréndeme',        tag: 'Random',     blurb: 'La casa elige por ti. Sin spoilers.',                   accent: 'oklch(0.3 0.05 30)'   },
];

// ─── App root ──────────────────────────────────────────────────────────
function App() {
  const [route, setRoute] = useState('lobby');
  const [activeGame, setActiveGame] = useState(null); // {id, ...launch opts}
  const [configLoaded, setConfigLoaded] = useState(false);
  const [loadingShared, setLoadingShared] = useState(false);
  const [dailyList, setDailyList] = useState([]);

  useEffect(() => {
    (async () => {
      await CC.loadConfig();
      const url = new URL(location.href);
      const gameId = url.searchParams.get('game');
      const caseId = url.searchParams.get('case');
      const dailyId = url.searchParams.get('daily');
      if (gameId && caseId) {
        setLoadingShared(true);
        try {
          // Intentar primero como caso del pool (nuevo flujo)
          let data = await CC.poolGetCase(gameId, caseId);
          if (data?.caseData) {
            setActiveGame({ id: gameId, caseData: data.caseData, poolId: caseId });
            history.replaceState({}, '', location.pathname);
          } else {
            // Fallback al share legado
            const legacy = await CC.fetchShared(caseId);
            if (legacy?.gameId && legacy?.caseData) {
              setActiveGame({ id: legacy.gameId, caseData: legacy.caseData });
              history.replaceState({}, '', location.pathname);
            } else {
              CC.toast('Caso no encontrado', 'bad', 3000);
            }
          }
        } catch (e) { CC.toast('No se pudo cargar el caso: ' + e.message, 'bad', 4000); }
        setLoadingShared(false);
      } else if (dailyId) {
        try {
          const d = await CC.fetchDaily(dailyId);
          if (d) {
            setActiveGame({ id: d.gameId, caseData: d.caseData, poolId: d.poolId });
            history.replaceState({}, '', location.pathname);
          }
        } catch { /* sin daily */ }
      }
      CC.fetchDailyList().then(d => setDailyList(d.items || []));
      setConfigLoaded(true);
    })();
  }, []);

  const launchGame = (id, opts = {}) => setActiveGame({ id, ...opts });
  const exitGame   = () => setActiveGame(null);

  if (!configLoaded || loadingShared) {
    return <div className="center" style={{ minHeight: '100vh', padding: '2rem' }}>
      <LiveLoader feed={loadingShared ? [{ text: 'Recuperando caso compartido', done: false }] : []} title={loadingShared ? 'Cargando caso compartido' : 'Abriendo el archivo'} idle={['Abriendo el archivo', 'Encendiendo la lámpara', 'Afilando los lápices']} />
    </div>;
  }

  return (
    <div className="app">
      {!activeGame && <Topbar route={route} setRoute={setRoute} />}
      <main className="main">
        {activeGame ? (
          <GameRouter game={activeGame} onExit={exitGame} />
        ) : (
          <>
            {route === 'lobby'     && <Lobby onLaunch={launchGame} dailyList={dailyList} />}
            {route === 'historial' && <History onReplay={launchGame} />}
            {route === 'medallas'  && <Medals />}
            {route === 'ajustes'   && <Settings />}
          </>
        )}
      </main>
      {!activeGame && (
        <footer style={{ padding: '1rem 1.5rem', textAlign: 'center' }} className="muted tiny">
          Cuarto Cerrado · cada caso es único, generado al momento por la IA
        </footer>
      )}
    </div>
  );
}

// ─── Router de juegos ──────────────────────────────────────────────────
function GameRouter({ game, onExit }) {
  switch (game.id) {
    case 'mapdoku':  return <MapdokuGame  opts={game} onExit={onExit} />;
    case 'escape':   return <EscapeGame   opts={game} onExit={onExit} />;
    case 'criminal': return <CriminalGame opts={game} onExit={onExit} />;
    case 'visual':   return <VisualGame   opts={game} onExit={onExit} />;
    case 'riddles':  return <RiddlesGame  opts={game} onExit={onExit} />;
    case 'ciphers':  return <CiphersGame  opts={game} onExit={onExit} />;
    case 'anagrams': return <AnagramsGame opts={game} onExit={onExit} />;
    case 'surprise': return <SurpriseGame onExit={onExit} />;
    default: return <div>Modo desconocido</div>;
  }
}

// ─── Lobby ─────────────────────────────────────────────────────────────
function Lobby({ onLaunch, dailyList = [] }) {
  const medals = CC.getMedals();
  const totalMedals = Object.values(medals).reduce((a, b) => a + (b?.count || 0), 0);
  const history = CC.getHistory();
  const wins = history.filter(h => h.won).length;
  const streak = CC.getStreak();
  const score = CC.getScore();
  const playDaily = async (gameId) => {
    try {
      const d = await CC.fetchDaily(gameId);
      if (d) onLaunch(d.gameId, { caseData: d.caseData, poolId: d.poolId });
      else CC.toast('No hay caso del día para ese modo', 'bad');
    } catch (e) { CC.toast('Error: ' + e.message, 'bad'); }
  };
  return (
    <div>
      <APIStatus />

      {dailyList.length > 0 && (
        <div className="paper aged" style={{
          padding: '1.5rem 2rem', marginBottom: '2rem', position: 'relative',
          background: 'linear-gradient(135deg, oklch(0.88 0.05 80), oklch(0.92 0.03 70))',
          borderLeft: '6px solid var(--stamp-red)',
        }}>
          <Stamp kind="red" style={{ position: 'absolute', top: 12, right: 16, fontSize: '.65rem' }}>HOY</Stamp>
          <div className="font-typewriter tiny" style={{ letterSpacing: '.2em', color: 'var(--ink-faded)' }}>CASO DEL DÍA</div>
          <h3 className="font-display" style={{ marginTop: '.3rem' }}>{dailyList.length} caso{dailyList.length === 1 ? '' : 's'} publicado{dailyList.length === 1 ? '' : 's'} hoy</h3>
          <div className="row gap-sm wrap" style={{ marginTop: '.8rem' }}>
            {dailyList.map((d) => {
              const g = GAMES.find(g => g.id === d.gameId);
              return (
                <button key={d.gameId} className="btn ghost small" onClick={() => playDaily(d.gameId)}>
                  {g?.emoji} {g?.name || d.gameId}{d.title ? ` — ${d.title}` : ''}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="paper aged" style={{ padding: '2rem 2.5rem', marginBottom: '2rem', position: 'relative' }}>
        <Stamp solid style={{ position: 'absolute', top: '1.5rem', right: '2rem' }}>EXPEDIENTE 001</Stamp>
        <div className="font-typewriter tiny" style={{ letterSpacing: '.25em', color: 'var(--ink-faded)' }}>SOCIEDAD ENIGMÁTICA · SALA DE OPERACIONES</div>
        <h1 className="font-display" style={{ marginTop: '.4rem', marginBottom: '.6rem', fontSize: '2.4rem' }}>Bienvenida al Cuarto Cerrado</h1>
        <p style={{ maxWidth: 640, color: 'var(--ink-2)' }}>
          Ocho tipos de enigma esperan dentro. Cada partida es nueva, generada al vuelo por nuestros archiveros mecánicos — o sacada del archivo si alguien ya la jugó antes. Escoge un expediente para empezar.
        </p>
        <div className="row gap-sm wrap" style={{ marginTop: '1rem' }}>
          <span className="pill">🏆 {totalMedals} medallas</span>
          <span className="pill">✅ {wins} casos resueltos</span>
          <span className="pill">📂 {history.length} partidas</span>
          <span className="pill">⭐ {score.toLocaleString('es-ES')} pts</span>
          {streak.current > 0 && <span className="pill" style={{ background: 'var(--stamp-red)', color: 'var(--paper)' }}>🔥 racha {streak.current}</span>}
          {streak.best > 1 && <span className="pill">★ mejor racha {streak.best}</span>}
        </div>
      </div>

      <h2 className="font-display" style={{ marginBottom: '1.5rem' }}>Expedientes disponibles</h2>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '2rem',
      }}>
        {GAMES.map((g, i) => (
          <div key={g.id} className="folder" onClick={() => onLaunch(g.id)} style={{ transform: `rotate(${(i % 3 - 1) * 0.5}deg)` }}>
            <div className="tag">№ {String(i + 1).padStart(3, '0')}</div>
            <div className="tape" style={{ top: -10, left: '50%', transform: `translateX(-50%) rotate(${(i % 2 === 0 ? -3 : 3)}deg)` }}></div>
            <div style={{ fontSize: 48, marginTop: '.5rem' }}>{g.emoji}</div>
            <h3 className="font-display" style={{ margin: '.6rem 0 .2rem', color: g.accent }}>{g.name}</h3>
            <Stamp kind={i % 2 ? 'blue' : ''} style={{ alignSelf: 'flex-start', transform: 'rotate(-3deg)', fontSize: '.65rem' }}>{g.tag}</Stamp>
            <p className="font-mono" style={{ marginTop: '.8rem', fontSize: '.9rem', color: 'var(--ink-2)', flex: 1 }}>{g.blurb}</p>
            <div style={{ marginTop: 'auto', textAlign: 'right' }}>
              <span className="font-typewriter tiny" style={{ letterSpacing: '.2em', color: 'var(--ink-faded)' }}>ABRIR ▸</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Ajustes ───────────────────────────────────────────────────────────
function Settings() {
  const [s, setS] = useState(CC.getSettings());
  const [pin, setPin] = useState(CC.getPin());
  const save = (next) => { setS(next); CC.setSettings(next); };
  const savePin = (p) => { setPin(p); CC.setPin(p); };

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 className="font-display">Ajustes</h1>

      <Paper style={{ marginBottom: '1.5rem' }}>
        <h3>Estado del servidor</h3>
        <div className="col gap-sm">
          <div className="between">
            <span>Ollama Cloud (texto)</span>
            <Stamp kind={CC.config.hasOllama ? 'green' : 'red'} solid={CC.config.hasOllama}>{CC.config.hasOllama ? 'Conectado' : 'No configurado'}</Stamp>
          </div>
          <div className="between">
            <span>OpenAI Images</span>
            <Stamp kind={CC.config.hasOpenAI ? 'green' : 'red'} solid={CC.config.hasOpenAI}>{CC.config.hasOpenAI ? 'Conectado' : 'No configurado'}</Stamp>
          </div>
          <div className="between">
            <span>Modelo de texto</span>
            <code className="tiny">{CC.config.ollamaModel || '—'}</code>
          </div>
        </div>
        <div className="divider dashed"></div>
        <p className="tiny muted">
          Las claves se configuran en el servidor con variables de entorno (<code>.env</code>). Revisa el README.
        </p>
      </Paper>

      {CC.config.pinRequired && (
        <Paper style={{ marginBottom: '1.5rem' }}>
          <h3>Acceso</h3>
          <div className="field">
            <label>PIN de acceso</label>
            <input type="password" value={pin} onChange={(e) => savePin(e.target.value)} placeholder="••••" />
            <div className="tiny muted" style={{ marginTop: '.4rem' }}>Se guarda en este navegador para no pedírtelo cada vez.</div>
          </div>
        </Paper>
      )}

      <Paper style={{ marginBottom: '1.5rem' }}>
        <h3>Preferencias</h3>
        <div className="field">
          <label>Nickname (para los récords)</label>
          <input type="text" value={s.nickname || ''} onChange={(e) => save({ ...s, nickname: e.target.value.slice(0, 20) })} placeholder="anónimo" maxLength={20} />
          <div className="tiny muted" style={{ marginTop: '.3rem' }}>Aparecerá en la tabla de récords cuando ganes un caso del archivo.</div>
        </div>
        <div className="field between">
          <div>
            <label style={{ margin: 0 }}>Sonido (cuando proceda)</label>
            <div className="tiny muted">Efectos sutiles de máquina de escribir, sellos…</div>
          </div>
          <Switch on={s.sound} onChange={(v) => save({ ...s, sound: v })} />
        </div>
        <div className="field between">
          <div>
            <label style={{ margin: 0 }}>Permitir pistas</label>
            <div className="tiny muted">Si lo apagas, ningún juego ofrecerá pistas (más medallas posibles).</div>
          </div>
          <Switch on={s.hintsAllowed} onChange={(v) => save({ ...s, hintsAllowed: v })} />
        </div>
      </Paper>

      <Paper>
        <h3>Datos locales</h3>
        <div className="tiny muted" style={{ marginBottom: '.8rem' }}>El historial y las medallas se guardan solo en este navegador.</div>
        <div className="row gap-sm wrap">
          <button className="btn ghost small" onClick={() => {
            if (confirm('¿Borrar historial?')) { CC.clearHistory(); CC.toast('Historial borrado'); }
          }}>Borrar historial</button>
          <button className="btn ghost small" onClick={() => {
            if (confirm('¿Borrar medallas?')) { localStorage.removeItem('cc.medals'); CC.toast('Medallas borradas'); }
          }}>Borrar medallas</button>
          <ImportPoolButton />
        </div>
      </Paper>
    </div>
  );
}

function Switch({ on, onChange }) {
  return (
    <button onClick={() => onChange(!on)} style={{
      width: 52, height: 28, borderRadius: 14,
      background: on ? 'var(--ink)' : 'var(--paper-3)',
      border: '1px solid var(--ink-soft)',
      position: 'relative', cursor: 'pointer', padding: 0,
      transition: 'background .15s',
    }}>
      <span style={{
        position: 'absolute', top: 2, left: on ? 26 : 2,
        width: 22, height: 22, borderRadius: '50%',
        background: on ? 'var(--paper)' : 'var(--ink)',
        transition: 'left .18s',
      }}></span>
    </button>
  );
}

// ─── Historial ─────────────────────────────────────────────────────────
function History({ onReplay }) {
  const [items, setItems] = useState(CC.getHistory());
  return (
    <div>
      <h1 className="font-display">Historial</h1>
      <p className="muted">Tus últimas partidas. Las más recientes arriba.</p>

      {items.length === 0 && (
        <Paper style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontSize: 48 }}>📂</div>
          <p>Aún no hay expedientes archivados.</p>
        </Paper>
      )}

      <div className="col">
        {items.map((h) => {
          const game = GAMES.find(g => g.id === h.gameId);
          return (
            <Paper key={h.id} className="between" style={{ alignItems: 'center', gap: '1rem' }}>
              <div className="row" style={{ alignItems: 'center', flex: 1, gap: '1rem' }}>
                <div style={{ fontSize: 32 }}>{game?.emoji || '📄'}</div>
                <div>
                  <div className="font-display" style={{ fontSize: '1.1rem' }}>{game?.name || h.gameId}</div>
                  <div className="tiny muted">{CC.fmtDate(h.ts)} · {h.difficulty || '—'} {h.duration ? `· ${CC.fmtTime(h.duration)}` : ''}</div>
                  {h.summary && <div className="tiny" style={{ marginTop: '.3rem', fontStyle: 'italic' }}>{h.summary}</div>}
                </div>
              </div>
              <div className="row gap-sm" style={{ alignItems: 'center' }}>
                <Stamp kind={h.won ? 'green' : 'red'} solid>{h.won ? 'Resuelto' : 'Sin resolver'}</Stamp>
                <button className="btn ghost small" onClick={() => onReplay(h.gameId)}>Jugar otra</button>
              </div>
            </Paper>
          );
        })}
      </div>
    </div>
  );
}

// ─── Medallas ──────────────────────────────────────────────────────────
function Medals() {
  const owned = CC.getMedals();
  const all = Object.entries(CC.MEDALS);
  return (
    <div>
      <h1 className="font-display">Medallas</h1>
      <p className="muted">Logros desbloqueables. Algunos son secretos hasta que los consigues.</p>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: '1.5rem', marginTop: '1.5rem',
      }}>
        {all.map(([key, meta]) => {
          const got = owned[key];
          return (
            <Paper key={key} style={{ textAlign: 'center', opacity: got ? 1 : 0.5, padding: '1.5rem' }}>
              <div className={`medal ${meta.tier === 'silver' ? 'silver' : meta.tier === 'bronze' ? 'bronze' : ''}`} style={{ margin: '0 auto .8rem' }}>
                {got ? (meta.tier === 'gold' ? '★' : meta.tier === 'silver' ? '◆' : '●') : '?'}
              </div>
              <h3 className="font-display" style={{ fontSize: '1rem' }}>{got ? meta.title : '???'}</h3>
              <div className="tiny muted">{got ? meta.desc : 'Aún sin desbloquear'}</div>
              {got?.count > 1 && <div className="tiny" style={{ marginTop: '.4rem' }}>×{got.count}</div>}
            </Paper>
          );
        })}
      </div>
    </div>
  );
}

// ─── Importar pool desde JSON ──────────────────────────────────────────
function ImportPoolButton() {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      // Acepta dos formatos:
      // (a) { "gameId": "mapdoku", "cases": [{caseData, difficulty?, title?}, ...] }
      // (b) { "mapdoku": [{caseData, ...}], "ciphers": [...] }   → multi-modo
      let totalAdded = 0;
      if (data.gameId && Array.isArray(data.cases)) {
        const r = await CC.importPool(data.gameId, data.cases);
        totalAdded += r.added || 0;
      } else if (typeof data === 'object') {
        for (const [gameId, cases] of Object.entries(data)) {
          if (!Array.isArray(cases)) continue;
          const r = await CC.importPool(gameId, cases);
          totalAdded += r.added || 0;
        }
      }
      CC.toast(`${totalAdded} casos importados`, 'ok', 3000);
    } catch (err) {
      CC.toast('Error: ' + err.message, 'bad', 4000);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <>
      <input ref={inputRef} type="file" accept=".json,application/json" onChange={onFile} style={{ display: 'none' }} />
      <button className="btn ghost small" onClick={() => inputRef.current?.click()} disabled={busy}>
        {busy ? 'Importando…' : '📥 Importar JSON'}
      </button>
    </>
  );
}

// ─── Mount ─────────────────────────────────────────────────────────────
const root = ReactDOM.createRoot(document.getElementById('app'));
root.render(<App />);
