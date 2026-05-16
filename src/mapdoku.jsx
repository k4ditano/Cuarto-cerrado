// ─── Cuarto Cerrado — Mapdoku ──────────────────────────────────────────
// Puzzle de lógica tipo "zebra" / "Einstein". Hay N posiciones (casas, calles,
// laboratorios…) y varias categorías; usando las pistas hay que rellenar cada
// posición con un valor de cada categoría.

const MAPDOKU_THEMES = [
  'una calle de casas victorianas con vecinos peculiares',
  'cuatro laboratorios de un instituto secreto',
  'una hilera de tiendas en un mercado nocturno',
  'cuatro vagones de un tren de medianoche',
  'cuatro habitaciones de una mansión gótica',
  'cuatro stands de una feria de coleccionistas',
  'cuatro torres de un castillo encantado',
];

function MapdokuGame({ opts = {}, onExit }) {
  const [phase, setPhase] = useState(opts.caseData ? 'loading' : 'setup'); // setup, loading, playing, won, lost
  const [difficulty, setDifficulty] = useState(opts.difficulty || 'medio');
  const [puzzle, setPuzzle] = useState(null);
  const [poolId, setPoolId] = useState(null);
  const [grid, setGrid] = useState({}); // {posIdx: {catName: value}}
  const [revealed, setRevealed] = useState([]); // clue indices revealed via hint
  const [timer, setTimer] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
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
    setPuzzle(data);
    setPoolId(poolIdInput || null);
    const init = {}; data.positions.forEach((_, i) => { init[i] = {}; });
    setGrid(init); setRevealed([]); setHintsUsed(0); setTimer(0);
    startTs.current = Date.now();
    setPhase('playing');
  };

  const start = async () => {
    setPhase('loading'); setError(null); reset();
    try {
      const theme = CC.pick(MAPDOKU_THEMES);
      const N = difficulty === 'fácil' ? 3 : difficulty === 'medio' ? 4 : 5;
      const C = difficulty === 'fácil' ? 3 : 4;
      push(`Eligiendo escenario: ${theme}`); done();
      push(`Sorteando ${N} posiciones con ${C} categorías`);
      const sys = `Eres un diseñador de puzzles de lógica tipo "zebra puzzle" en español. Generas casos con solución única y pistas elegantes. Respondes SOLO con JSON válido, sin texto antes ni después.`;
      const prompt = `Diseña un puzzle de lógica tipo zebra ambientado en: ${theme}.

Parámetros:
- ${N} posiciones (por ejemplo "Casa 1" a "Casa ${N}", o nombres temáticos: "Vagón Plata", "Vagón Cobre"…)
- ${C} categorías (cada una con ${N} valores distintos)
- Dificultad: ${difficulty} (fácil = pistas muy directas, difícil = pistas indirectas que requieren combinar varias)
- Entre ${N + C} y ${N + C + 3} pistas en total
- Cada pista debe ser una frase clara, en español, en el orden en que ayudan al razonamiento
- Las pistas deben ser SUFICIENTES y CONSISTENTES con la solución

Devuelve EXACTAMENTE este JSON:
{
  "title": "Título evocador (5-7 palabras)",
  "intro": "Texto narrativo de 2 frases que sitúa el puzzle.",
  "positions": ["..", ".."],
  "categories": [
    {"name": "Nombre", "values": ["..", ".."]}
  ],
  "clues": ["..", ".."],
  "solution": [
    {"<categoría1>": "<valor>", "<categoría2>": "<valor>"}
  ]
}

"solution" debe tener una entrada por posición, en el mismo orden que "positions". Las claves de cada objeto solution coinciden con los "name" de "categories". Los valores son strings.`;

      done('Llamando al archivero…');
      push('Tachando posibilidades imposibles');
      const data = await CC.chatJSON({
        system: sys,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.9,
      });
      done();
      push('Verificando que la solución cuadre');

      if (!data.positions || !data.categories || !data.solution) throw new Error('Respuesta incompleta');
      if (data.solution.length !== data.positions.length) throw new Error('Solución no cuadra con posiciones');
      done();
      push('Sellando el expediente');
      await new Promise(r => setTimeout(r, 350));
      done();
      push('Archivando para uso futuro');
      const saved = await CC.poolSave('mapdoku', data, difficulty, data.title);
      if (saved?.id) CC.markPlayed('mapdoku', saved.id);
      done();
      loadFromCase(data, saved?.id);
    } catch (e) {
      console.error(e);
      setError(e.message || 'Error generando puzzle');
      setPhase('setup');
    }
  };

  const setCell = (posIdx, catName, value) => {
    setGrid((g) => ({ ...g, [posIdx]: { ...g[posIdx], [catName]: value } }));
  };

  const isComplete = () => {
    if (!puzzle) return false;
    return puzzle.positions.every((_, i) =>
      puzzle.categories.every((c) => grid[i]?.[c.name])
    );
  };

  const check = () => {
    let ok = true;
    puzzle.positions.forEach((_, i) => {
      puzzle.categories.forEach((c) => {
        if (grid[i]?.[c.name] !== puzzle.solution[i][c.name]) ok = false;
      });
    });
    if (ok) {
      setPhase('won');
      const duration = Math.floor((Date.now() - startTs.current) / 1000);
      CC.addHistory({ gameId: 'mapdoku', won: true, difficulty, duration, summary: puzzle.title });
      CC.recordPlay('mapdoku', poolId, { duration, hints: hintsUsed, won: true });
      CC.grantMedal('first-solve');
      if (difficulty === 'fácil') CC.grantMedal('mapdoku-easy');
      if (difficulty === 'difícil' && hintsUsed === 0) CC.grantMedal('mapdoku-hard');
      if (hintsUsed === 0) CC.grantMedal('no-hints');
      CC.toast('¡Resuelto!', 'ok');
    } else {
      CC.toast('Algo no encaja. Revisa tus pistas.', 'bad', 3000);
    }
  };

  const reveal = () => {
    const next = puzzle.clues.findIndex((_, i) => !revealed.includes(i) && i >= revealed.length);
    if (next === -1) return;
    setRevealed([...revealed, next]);
    setHintsUsed(h => h + 1);
  };

  // ─── Pantallas ────────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <GameShell title="Mapdoku" subtitle="Puzzle lógico de deducción" onExit={onExit}>
        <GameSetup
          gameId="mapdoku"
          intro={<p>Hay varias posiciones (casas, vagones, laboratorios…) y cada una tiene un valor distinto en cada categoría: color, mascota, profesión, lo que sea. A partir de las pistas, deduce qué corresponde a cada cual.</p>}
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
    return (
      <GameShell title="Mapdoku" onExit={onExit}>
        <LiveLoader feed={feed} title="Diseñando tu Mapdoku" idle={['Sorteando vecinos', 'Tachando posibilidades', 'Redactando pistas']} />
      </GameShell>
    );
  }

  // playing / won
  return (
    <GameShell
      title={puzzle.title}
      subtitle="Mapdoku"
      onExit={onExit}
      difficulty={difficulty}
      timer={timer}
      right={
        <div className="row gap-sm wrap">
          <button className="btn ghost small" onClick={reveal} disabled={!CC.getSettings().hintsAllowed || revealed.length >= puzzle.clues.length}>
            Pista {hintsUsed > 0 ? `(${hintsUsed})` : ''}
          </button>
          <button className="btn red small" onClick={check} disabled={!isComplete() || phase === 'won'}>Comprobar</button>
        </div>
      }
    >
      <Paper style={{ marginBottom: '1.5rem' }}>
        <p style={{ fontStyle: 'italic' }}>{puzzle.intro}</p>
      </Paper>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '2rem' }}>
        <Paper>
          <h3 className="font-display">El plano</h3>
          <MapdokuGrid puzzle={puzzle} grid={grid} setCell={setCell} disabled={phase === 'won'} />
          {phase === 'won' && (
            <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
              <Stamp solid style={{ fontSize: '1rem', padding: '.5rem 1.2rem' }}>CASO CERRADO</Stamp>
              <div className="muted tiny" style={{ marginTop: '.6rem' }}>Resuelto en {CC.fmtTime(timer)} con {hintsUsed} pista{hintsUsed === 1 ? '' : 's'}</div>
              <Leaderboard gameId="mapdoku" caseId={poolId} />
              <ShareBar gameId="mapdoku" poolId={poolId} caseData={puzzle} title={puzzle.title} difficulty={difficulty} />
              <button className="btn" style={{ marginTop: '1rem' }} onClick={() => { setPhase('setup'); setPuzzle(null); setPoolId(null); }}>Otro Mapdoku</button>
            </div>
          )}
        </Paper>

        <Paper>
          <h3 className="font-display">Pistas</h3>
          <ol style={{ paddingLeft: '1.2rem', margin: 0 }}>
            {puzzle.clues.map((c, i) => (
              <li key={i} style={{
                marginBottom: '.7rem',
                padding: '.4rem .6rem',
                background: revealed.includes(i) ? 'rgba(180,80,40,.08)' : 'transparent',
                borderRadius: 2,
              }}>
                <span className="font-mono" style={{ fontSize: '.92rem' }}>{c}</span>
                {revealed.includes(i) && <Stamp kind="red" style={{ marginLeft: '.4rem', fontSize: '.55rem', padding: '.05rem .3rem', transform: 'none' }}>vista</Stamp>}
              </li>
            ))}
          </ol>
        </Paper>
      </div>
    </GameShell>
  );
}

function MapdokuGrid({ puzzle, grid, setCell, disabled }) {
  const [selected, setSelected] = useState(null); // {catName, value}

  // Para saber qué valores están ya usados en cada categoría
  const usedByCategory = {};
  puzzle.categories.forEach((cat) => {
    usedByCategory[cat.name] = new Set();
    puzzle.positions.forEach((_, posIdx) => {
      const v = grid[posIdx]?.[cat.name];
      if (v) usedByCategory[cat.name].add(v);
    });
  });

  // Paleta sutil por categoría para distinguir chips
  const catColors = [
    'oklch(0.85 0.06 25)',   // rojizo
    'oklch(0.85 0.06 240)',  // azulado
    'oklch(0.85 0.06 145)',  // verdoso
    'oklch(0.85 0.06 80)',   // dorado
    'oklch(0.85 0.06 320)',  // rosa
  ];
  const catColor = (i) => catColors[i % catColors.length];

  const placeIn = (posIdx) => {
    if (!selected) return;
    if (selected.catName !== null) {
      // Si ya hay un chip aquí (mismo cat), lo reemplazamos
      setCell(posIdx, selected.catName, selected.value);
      setSelected(null);
    }
  };

  const removeFromCell = (posIdx, catName) => {
    setCell(posIdx, catName, null);
  };

  return (
    <>
      {/* Bandejas de chips por categoría */}
      <div className="col" style={{ gap: '.6rem', marginBottom: '1.2rem' }}>
        {puzzle.categories.map((cat, ci) => (
          <div key={cat.name} className="paper" style={{
            padding: '.5rem .7rem',
            background: catColor(ci),
            borderLeft: '4px solid var(--ink)',
          }}>
            <div className="font-typewriter tiny" style={{ letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink)', marginBottom: '.3rem' }}>
              {cat.name}
            </div>
            <div className="row gap-sm wrap">
              {cat.values.map((v) => {
                const used = usedByCategory[cat.name].has(v);
                const isSelected = selected?.catName === cat.name && selected?.value === v;
                return (
                  <button
                    key={v}
                    disabled={disabled || (used && !isSelected)}
                    onClick={() => setSelected(isSelected ? null : { catName: cat.name, value: v })}
                    style={{
                      fontFamily: 'Caveat, cursive',
                      fontSize: '1.15rem',
                      padding: '.3rem .8rem',
                      background: isSelected ? 'var(--ink)' : (used ? 'rgba(50,40,30,.15)' : 'var(--paper)'),
                      color: isSelected ? 'var(--paper)' : (used ? 'var(--ink-soft)' : 'var(--ink)'),
                      border: `1px dashed ${isSelected ? 'var(--ink)' : 'var(--ink-soft)'}`,
                      borderRadius: 14,
                      cursor: disabled || (used && !isSelected) ? 'default' : 'pointer',
                      textDecoration: used && !isSelected ? 'line-through' : 'none',
                      transition: 'transform .1s',
                      transform: isSelected ? 'scale(1.05)' : 'scale(1)',
                    }}>
                    {v}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <div className="tiny" style={{ marginBottom: '.6rem', padding: '.4rem .7rem', background: 'rgba(80,140,200,.1)', borderLeft: '3px solid var(--stamp-blue)' }}>
          <strong>{selected.value}</strong> seleccionado · pulsa en una celda de <strong>{selected.catName}</strong> para colocarlo. <button className="btn ghost small" onClick={() => setSelected(null)} style={{ marginLeft: '.5rem', padding: '.1rem .4rem', fontSize: '.65rem' }}>cancelar</button>
        </div>
      )}

      {/* Cuadrícula */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', margin: '0 auto', minWidth: '100%' }}>
          <thead>
            <tr>
              <th></th>
              {puzzle.positions.map((p, i) => (
                <th key={i} style={{ padding: '.6rem .8rem', borderBottom: '2px solid var(--ink)' }}>
                  <div className="font-display" style={{ fontSize: '.95rem' }}>{p}</div>
                  <div className="tiny muted">#{i + 1}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {puzzle.categories.map((cat, ci) => (
              <tr key={cat.name}>
                <td className="font-typewriter" style={{
                  padding: '.6rem .8rem', borderRight: '2px solid var(--ink)',
                  fontSize: '.78rem', letterSpacing: '.12em', textTransform: 'uppercase',
                  textAlign: 'right',
                  background: catColor(ci),
                }}>
                  {cat.name}
                </td>
                {puzzle.positions.map((_, i) => {
                  const val = grid[i]?.[cat.name];
                  const canPlaceHere = selected && selected.catName === cat.name;
                  return (
                    <td key={i} style={{
                      border: '1px dashed var(--ink-soft)',
                      padding: 0,
                      background: canPlaceHere && !val ? 'rgba(80,140,200,.08)' : (val ? 'rgba(255,250,200,.4)' : 'transparent'),
                      transition: 'background .15s',
                    }}>
                      <button
                        disabled={disabled || (!val && !canPlaceHere)}
                        onClick={() => {
                          if (val) removeFromCell(i, cat.name);
                          else placeIn(i);
                        }}
                        style={{
                          width: '100%', minWidth: 110, height: 60,
                          background: 'transparent',
                          border: 'none',
                          cursor: disabled ? 'default' : (val || canPlaceHere ? 'pointer' : 'default'),
                          fontFamily: 'Caveat, cursive', fontSize: '1.3rem', color: 'var(--ink)',
                          padding: '.3rem',
                        }}
                        title={val ? 'Click para quitar' : (canPlaceHere ? `Colocar ${selected.value}` : '')}>
                        {val || (canPlaceHere ? <span style={{ fontSize: '1.6rem', opacity: .35 }}>+</span> : <span style={{ fontFamily: 'Special Elite', fontSize: '.7rem', color: 'var(--ink-soft)', letterSpacing: '.15em' }}>—</span>)}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="tiny muted" style={{ marginTop: '.8rem', textAlign: 'center' }}>
        Pulsa un chip arriba → pulsa una casilla para colocarlo · pulsa un chip ya colocado para quitarlo
      </div>
    </>
  );
}

window.MapdokuGame = MapdokuGame;
