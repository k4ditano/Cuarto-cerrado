// ─── Cuarto Cerrado — Anagramas ────────────────────────────────────────
// Cadena de palabras desordenadas relacionadas con un tema. Cada palabra es
// un anagrama (letras barajadas) y hay que reconstruirla. Las últimas letras
// de cada respuesta forman una palabra extra al final.

const ANAGRAM_THEMES = [
  'utensilios de cocina',
  'instrumentos musicales',
  'aves nocturnas',
  'flores de jardín',
  'objetos de un escritorio',
  'piezas de ajedrez y juegos clásicos',
  'libros de una biblioteca antigua',
  'frutas exóticas',
  'monumentos del mundo',
  'planetas y cuerpos celestes',
];

function shuffleWord(word) {
  const arr = [...word];
  let attempts = 0;
  do {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    attempts++;
  } while (arr.join('') === word && attempts < 8 && word.length > 2);
  return arr.join('');
}

function AnagramsGame({ opts = {}, onExit }) {
  const [phase, setPhase] = useState(opts.caseData ? 'loading' : 'setup');
  const [difficulty, setDifficulty] = useState(opts.difficulty || 'medio');
  const [game, setGame] = useState(null); // {title, intro, theme, words:[{a, scrambled, hint}], finalWord, winText}
  const [poolId, setPoolId] = useState(null);
  const [current, setCurrent] = useState(0);
  const [solved, setSolved] = useState([]);
  const [answer, setAnswer] = useState('');
  const [hintsShown, setHintsShown] = useState({});
  const [timer, setTimer] = useState(0);
  const [error, setError] = useState(null);
  const startTs = useRef(0);
  const { feed, push, done, reset } = useStatusFeed();

  useEffect(() => { if (opts.caseData) loadFromCase(opts.caseData, opts.poolId); }, []);

  useEffect(() => {
    if (phase !== 'playing') return;
    const id = setInterval(() => setTimer(Math.floor((Date.now() - startTs.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, [phase]);

  const loadFromCase = (data, poolIdInput) => {
    setGame(data); setPoolId(poolIdInput || null);
    setCurrent(0); setSolved([]); setAnswer(''); setHintsShown({}); setTimer(0);
    startTs.current = Date.now();
    setPhase('playing');
  };

  const start = async () => {
    setPhase('loading'); setError(null); reset();
    try {
      const theme = CC.pick(ANAGRAM_THEMES);
      const N = difficulty === 'fácil' ? 5 : difficulty === 'medio' ? 6 : 8;
      push(`Tema: ${theme}`); done();
      push(`Eligiendo ${N} palabras del tema`);
      const sys = 'Eres un creador de anagramas en español. Respondes SOLO con JSON válido.';
      const prompt = `Diseña un juego de anagramas con el tema: ${theme}.

Necesito ${N} palabras coherentes con el tema. Reglas:
- Todas en minúsculas, SIN tildes (usa "a" no "á", "n" no "ñ" si puedes evitarlo), sólo letras a-z
- Longitud entre 4 y 9 letras
- Sustantivos comunes en español
- Que las inicial de cada palabra, en orden, forme una palabra extra coherente con el tema (la "palabra final")

Dificultad: ${difficulty} (fácil = palabras cortas y comunes, difícil = más largas o menos comunes)

Devuelve este JSON:
{
  "title": "Título evocador (3-5 palabras)",
  "intro": "2 frases que sitúan el juego.",
  "theme": "${theme}",
  "words": [
    {"a": "palabra-en-minusculas-sin-tildes", "hint": "Pista de 1 frase (sin nombrar la palabra)"}
  ],
  "finalWord": "palabra formada por las iniciales",
  "winText": "1-2 frases poéticas al completar"
}

IMPORTANTE: las iniciales de "words" en orden DEBEN formar exactamente "finalWord". Verifícalo antes de responder.`;

      const data = await CC.chatJSON({
        system: sys,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.9,
      });
      if (!data.words || data.words.length < 3) throw new Error('Respuesta incompleta');
      done();
      push('Barajando letras');
      data.words = data.words.map(w => ({ ...w, scrambled: shuffleWord(w.a) }));
      done();
      push('Sellando el dossier');
      await new Promise(r => setTimeout(r, 300));
      done();
      push('Archivando para uso futuro');
      const saved = await CC.poolSave('anagrams', data, difficulty, data.title);
      if (saved?.id) CC.markPlayed('anagrams', saved.id);
      done();
      loadFromCase(data, saved?.id);
    } catch (e) {
      setError(e.message);
      setPhase('setup');
    }
  };

  const tryAnswer = () => {
    const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const w = game.words[current];
    if (norm(answer) === norm(w.a)) {
      const ns = [...solved, current];
      setSolved(ns);
      setAnswer('');
      CC.toast('Correcto', 'ok', 1200);
      if (current + 1 < game.words.length) setCurrent(current + 1);
      else {
        setPhase('won');
        const duration = Math.floor((Date.now() - startTs.current) / 1000);
        CC.addHistory({ gameId: 'anagrams', won: true, difficulty, duration, summary: game.title });
        CC.recordPlay('anagrams', poolId, { duration, hints: Object.keys(hintsShown).length, won: true });
        CC.grantMedal('first-solve');
        CC.grantMedal('riddler');
        if (Object.keys(hintsShown).length === 0) CC.grantMedal('no-hints');
      }
    } else {
      CC.toast('No, prueba a reordenar.', 'bad', 1500);
    }
  };

  if (phase === 'setup') {
    return (
      <GameShell title="Anagramas" subtitle="Reordena las letras" onExit={onExit}>
        <GameSetup
          gameId="anagrams"
          intro={<p>Una cadena de palabras con las letras desordenadas. Adivina cada una y la inicial de todas formará una palabra final.</p>}
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
    return <GameShell title="Anagramas" onExit={onExit}>
      <LiveLoader feed={feed} title="Barajando letras" idle={['Eligiendo palabras', 'Barajando', 'Sellando']} />
    </GameShell>;
  }

  return (
    <GameShell title={game.title} subtitle="Anagramas" onExit={onExit} difficulty={difficulty} timer={timer}>
      <CaseBanner emoji="🔤" title={game.title} theme={game.theme} subtitle={game.intro} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '2rem' }}>
        <Paper aged>
          {phase === 'won' ? (
            <div style={{ textAlign: 'center', padding: '1rem' }}>
              <Stamp solid style={{ fontSize: '1rem' }}>CADENA COMPLETA</Stamp>
              <h2 className="font-display" style={{ marginTop: '1rem' }}>Palabra final</h2>
              <div className="glyph-box" style={{ fontFamily: 'IM Fell English, serif', fontSize: '1.6rem' }}>{game.finalWord}</div>
              <p style={{ marginTop: '1rem', fontStyle: 'italic' }}>{game.winText}</p>
              <Leaderboard gameId="anagrams" caseId={poolId} />
              <ShareBar gameId="anagrams" poolId={poolId} caseData={game} title={game.title} difficulty={difficulty} />
              <button className="btn" onClick={() => { setPhase('setup'); setGame(null); setPoolId(null); }}>Otra ronda</button>
            </div>
          ) : (
            <>
              <div className="font-typewriter tiny" style={{ letterSpacing: '.2em', color: 'var(--ink-faded)' }}>
                PALABRA {current + 1} / {game.words.length} · TEMA: {game.theme.toUpperCase()}
              </div>
              <div className="glyph-box" style={{ marginTop: '1rem', fontFamily: 'Special Elite, monospace', fontSize: '2.2rem', letterSpacing: '.4em', textTransform: 'uppercase' }}>
                {game.words[current].scrambled}
              </div>
              <div className="tiny muted" style={{ textAlign: 'center', marginTop: '.4rem' }}>{game.words[current].a.length} letras</div>

              <form onSubmit={(e) => { e.preventDefault(); tryAnswer(); }} style={{ marginTop: '1.2rem' }}>
                <div className="row gap-sm">
                  <input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="La palabra real…" autoFocus />
                  <button className="btn red" disabled={!answer.trim()}>Responder</button>
                </div>
              </form>
              {hintsShown[current] && (
                <div className="tiny" style={{ marginTop: '.8rem', padding: '.6rem', background: 'rgba(180,80,40,.08)', borderLeft: '3px solid var(--stamp-red)' }}>
                  <strong>Pista:</strong> {game.words[current].hint} <span className="muted">· empieza por <strong>{game.words[current].a[0]}</strong></span>
                </div>
              )}
              <div className="row" style={{ marginTop: '.8rem', justifyContent: 'space-between' }}>
                <button className="btn ghost small" onClick={() => setHintsShown({ ...hintsShown, [current]: true })} disabled={hintsShown[current] || !CC.getSettings().hintsAllowed}>
                  Mostrar pista
                </button>
                <span className="tiny muted">{solved.length} resueltas · {Object.keys(hintsShown).length} pistas</span>
              </div>
            </>
          )}
        </Paper>

        <Paper>
          <h3 className="font-display">Progreso</h3>
          <div className="col gap-sm">
            {game.words.map((_, i) => (
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
                  {solved.includes(i) ? <strong>{game.words[i].a}</strong> : i === current ? <em>en curso…</em> : <span className="muted">bloqueada</span>}
                </div>
              </div>
            ))}
          </div>
          <div className="divider dashed"></div>
          <div className="tiny muted">La inicial de cada respuesta formará una palabra final coherente con el tema.</div>
        </Paper>
      </div>
    </GameShell>
  );
}

window.AnagramsGame = AnagramsGame;
