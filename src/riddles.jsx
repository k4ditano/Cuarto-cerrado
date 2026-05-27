// ─── Cuarto Cerrado — Cadena de Acertijos ──────────────────────────────
// 5-7 riddles encadenados temáticamente. Cada respuesta correcta desbloquea
// el siguiente. Al final, una "frase secreta" formada por las iniciales.

const RIDDLE_THEMES = [
  'el bosque encantado',
  'la biblioteca infinita',
  'el océano profundo',
  'el viaje en tren a medianoche',
  'la casa de los espejos',
  'el atelier del relojero',
  'el mercado de los sueños',
  'la cocina alquímica',
];

function RiddlesGame({ opts = {}, onExit }) {
  const [phase, setPhase] = useState(opts.caseData ? 'loading' : 'setup');
  const [difficulty, setDifficulty] = useState(opts.difficulty || 'medio');
  const [chain, setChain] = useState(null); // {title, intro, riddles:[{q,a,hint}], finalPhrase, winText}
  const [poolId, setPoolId] = useState(null);
  const [current, setCurrent] = useState(0);
  const [solved, setSolved] = useState([]); // indices solved
  const [answer, setAnswer] = useState('');
  const [wrongAttempts, setWrongAttempts] = useState({}); // {idx: count}
  const [hintsShown, setHintsShown] = useState({});
  const [timer, setTimer] = useState(0);
  const [error, setError] = useState(null);
  const startTs = useRef(0);
  const { feed, push, done, reset } = useStatusFeed();

  useEffect(() => {
    if (opts.caseData) loadFromCase(opts.caseData, opts.poolId);
  }, []);

  useEffect(() => {
    if (phase !== 'playing') return;
    const id = setInterval(() => setTimer(Math.floor((Date.now() - startTs.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, [phase]);

  const loadFromCase = (data, poolIdInput) => {
    setChain(data); setPoolId(poolIdInput || null);
    setCurrent(0); setSolved([]); setHintsShown({}); setAnswer(''); setTimer(0); setWrongAttempts({});
    startTs.current = Date.now();
    setPhase('playing');
  };

  const start = async () => {
    setPhase('loading'); setError(null); reset();
    try {
      const theme = CC.pick(RIDDLE_THEMES);
      const N = difficulty === 'fácil' ? 5 : difficulty === 'medio' ? 6 : 7;
      push(`Tema: ${theme}`); done();
      push(`Trenzando ${N} versos`);
      const sys = 'Eres un poeta de acertijos en español. Tus riddles son breves, rítmicos y elegantes. Respondes SOLO con JSON válido.';
      const prompt = `Diseña una cadena de ${N} acertijos en torno al tema: ${theme}.

Cada respuesta es una palabra sencilla (sustantivo común). La INICIAL de cada respuesta, en orden, forma una "frase secreta" coherente con el tema.

Dificultad: ${difficulty} (fácil = pistas más directas, difícil = metáforas más densas).

Devuelve este JSON:
{
  "title": "Título evocador",
  "intro": "2 frases que sitúan al jugador.",
  "theme": "${theme}",
  "riddles": [
    {"q": "Acertijo en 2-4 versos cortos en español", "a": "palabra-respuesta-en-minusculas-sin-tildes", "hint": "Pista sutil de 1 frase"}
  ],
  "finalPhrase": "frase formada concatenando las iniciales (en minúsculas, espacios donde corresponda si tienen sentido)",
  "winText": "Texto poético de 1-2 frases al completar la cadena"
}

IMPORTANTE: la concatenación de la primera letra de cada respuesta DEBE formar exactamente "finalPhrase". Verifícalo antes de responder.`;

      let data;
      try {
        data = await CC.chatJSON({
          system: sys,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.9,
        });
      } catch (e1) {
        push('La IA devolvió JSON dudoso. Reintentando…');
        data = await CC.chatJSON({
          system: sys,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.6,
        });
      }
      if (!data.riddles || data.riddles.length < 3) throw new Error('Respuesta incompleta');
      done();
      push('Escondiendo la frase secreta en las iniciales');
      await new Promise(r => setTimeout(r, 350));
      done();
      const saved = await CC.poolSave('riddles', data, difficulty, data.title);
      if (saved?.id) CC.markPlayed('riddles', saved.id);
      loadFromCase(data, saved?.id);
    } catch (e) {
      setError(e.message);
      setPhase('setup');
    }
  };

  const tryAnswer = () => {
    const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const r = chain.riddles[current];
    if (norm(answer) === norm(r.a)) {
      const newSolved = [...solved, current];
      setSolved(newSolved);
      setAnswer('');
      CC.toast('Correcto', 'ok', 1400);
      if (current + 1 < chain.riddles.length) {
        setCurrent(current + 1);
      } else {
        // Cadena completa
        setPhase('won');
        const duration = Math.floor((Date.now() - startTs.current) / 1000);
        const hints = Object.keys(hintsShown).length;
        CC.addHistory({ gameId: 'riddles', won: true, difficulty, duration, summary: chain.title });
        CC.recordPlay('riddles', poolId, { duration, hints, won: true });
        CC.grantMedal('first-solve');
        CC.grantMedal('riddler');
        if (hints === 0) CC.grantMedal('no-hints');
        const perfectBonus = hints === 0 ? 200 : 0;
        CC.addScore(CC.calcScore({ difficulty, duration, hints, perfectBonus }));
      }
    } else {
      const next = (wrongAttempts[current] || 0) + 1;
      setWrongAttempts({ ...wrongAttempts, [current]: next });
      // Pista progresiva: 2 fallos → 1 letra, 4 → 2, 6 → mitad
      const nLetters = next >= 6 ? Math.ceil(r.a.length / 2) : next >= 4 ? 2 : next >= 2 ? 1 : 0;
      if (nLetters > 0) {
        CC.toast(`Empieza por "${r.a.slice(0, nLetters)}…"`, 'bad', 2200);
      } else {
        CC.toast('No es eso. Sigue pensando.', 'bad', 1800);
      }
    }
  };

  const revealedLetters = (idx) => {
    const r = chain?.riddles?.[idx];
    if (!r) return 0;
    const w = wrongAttempts[idx] || 0;
    return w >= 6 ? Math.ceil(r.a.length / 2) : w >= 4 ? 2 : w >= 2 ? 1 : 0;
  };

  if (phase === 'setup') {
    return (
      <GameShell title="Cadena de Acertijos" subtitle="Cada respuesta desbloquea la siguiente" onExit={onExit}>
        <GameSetup
          gameId="riddles"
          intro={<p>Una serie de acertijos en torno a un tema. La inicial de cada respuesta, en orden, formará una frase secreta.</p>}
          difficulty={difficulty}
          setDifficulty={setDifficulty}
          onStartNew={start}
          onStartFromPool={loadFromCase}
          error={error}
          disabled={!CC.config.hasOllama}
          generationCost="~1¢"
        />
      </GameShell>
    );
  }

  if (phase === 'loading') {
    return <GameShell title="Cadena de Acertijos" onExit={onExit}>
      <LiveLoader feed={feed} title="Tejiendo acertijos" idle={['Trenzando versos', 'Probando rimas', 'Escondiendo respuestas']} />
    </GameShell>;
  }

  return (
    <GameShell title={chain.title} subtitle="Cadena de acertijos" onExit={onExit} difficulty={difficulty} timer={timer}>
      <CaseBanner emoji="🧩" title={chain.title} theme={chain.theme} subtitle={chain.intro} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '2rem' }}>
        <Paper aged>
          {phase === 'won' ? (
            <div style={{ textAlign: 'center', padding: '1rem' }}>
              <Stamp solid className="entrance" style={{ fontSize: '1rem' }}>CADENA COMPLETA</Stamp>
              <h2 className="font-display" style={{ marginTop: '1rem' }}>Frase secreta</h2>
              <div className="glyph-box" style={{ fontFamily: 'IM Fell English, serif', fontSize: '1.6rem', letterSpacing: '.05em' }}>
                {chain.finalPhrase}
              </div>
              <p style={{ marginTop: '1rem', fontStyle: 'italic' }}>{chain.winText}</p>
              <ScoreReveal difficulty={difficulty} duration={timer} hints={Object.keys(hintsShown).length} perfectBonus={Object.keys(hintsShown).length === 0 ? 200 : 0} />
              <Leaderboard gameId="riddles" caseId={poolId} />
              <ShareBar gameId="riddles" poolId={poolId} caseData={chain} title={chain.title} difficulty={difficulty} />
              <button className="btn" onClick={() => { setPhase('setup'); setChain(null); setPoolId(null); }}>Otra cadena</button>
            </div>
          ) : (
            <>
              <div className="font-typewriter tiny" style={{ letterSpacing: '.2em', color: 'var(--ink-faded)' }}>
                ACERTIJO {current + 1} / {chain.riddles.length}
              </div>
              <div className="glyph-box" style={{ marginTop: '1rem', fontFamily: 'IM Fell English, serif', fontSize: '1.25rem', fontStyle: 'italic' }}>
                {chain.riddles[current].q}
              </div>
              {(() => {
                const r = chain.riddles[current];
                const n = revealedLetters(current);
                if (!n) return null;
                return (
                  <div className="font-mono" style={{ marginTop: '.8rem', textAlign: 'center', letterSpacing: '.4em', fontSize: '1.1rem' }}>
                    {r.a.slice(0, n).toUpperCase()}{'·'.repeat(r.a.length - n)}
                    <span className="tiny muted" style={{ marginLeft: '.6rem', letterSpacing: 'normal' }}>
                      · {n}/{r.a.length} letra{n === 1 ? '' : 's'} reveladas
                    </span>
                  </div>
                );
              })()}
              <form onSubmit={(e) => { e.preventDefault(); tryAnswer(); }} style={{ marginTop: '1.2rem' }}>
                <div className="row gap-sm">
                  <input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Tu respuesta…" autoFocus />
                  <button className="btn red" disabled={!answer.trim()}>Responder</button>
                </div>
              </form>
              {hintsShown[current] && (
                <div className="tiny" style={{ marginTop: '.8rem', padding: '.6rem', background: 'rgba(180,80,40,.08)', borderLeft: '3px solid var(--stamp-red)' }}>
                  <strong>Pista:</strong> {chain.riddles[current].hint}
                </div>
              )}
              <div className="row" style={{ marginTop: '.8rem', justifyContent: 'space-between' }}>
                <button className="btn ghost small" onClick={() => setHintsShown({ ...hintsShown, [current]: true })} disabled={hintsShown[current] || !CC.getSettings().hintsAllowed}>
                  Mostrar pista
                </button>
                <span className="tiny muted">{solved.length} resueltos · {Object.keys(hintsShown).length} pistas</span>
              </div>
            </>
          )}
        </Paper>

        <Paper>
          <h3 className="font-display">Progreso</h3>
          <div className="col gap-sm">
            {chain.riddles.map((_, i) => (
              <div key={i} className="row gap-sm" style={{ alignItems: 'center' }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: solved.includes(i) ? 'var(--stamp-green)' : i === current ? 'var(--ink)' : 'var(--paper-3)',
                  color: solved.includes(i) || i === current ? 'var(--paper)' : 'var(--ink-faded)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'Special Elite', fontSize: '.75rem',
                  border: '1px solid var(--ink-soft)',
                }}>{solved.includes(i) ? '✓' : i + 1}</div>
                <div className="tiny" style={{ flex: 1 }}>
                  {solved.includes(i) ? <strong>{chain.riddles[i].a}</strong> : i === current ? <em>en curso…</em> : <span className="muted">bloqueado</span>}
                </div>
              </div>
            ))}
          </div>
        </Paper>
      </div>
    </GameShell>
  );
}

window.RiddlesGame = RiddlesGame;
