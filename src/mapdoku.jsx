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

// Pide a la IA que verifique cada pista contra la solución y reescriba
// las que no se cumplan. Devuelve un nuevo array de pistas o null si todo OK.
async function verifyAndFixClues(puzzle) {
  const solutionRows = puzzle.positions.map((pos, i) => {
    const row = puzzle.solution[i] || {};
    const parts = puzzle.categories.map((c) => `${c.name}=${row[c.name] ?? '?'}`).join(', ');
    return `${i + 1}) ${pos}: ${parts}`;
  }).join('\n');
  const cluesList = puzzle.clues.map((c, i) => `${i + 1}. ${c}`).join('\n');
  const sys = 'Eres un verificador de puzzles de lógica. Compruebas si cada pista es VERDADERA dada la solución, sin ambigüedad. Respondes SOLO con JSON.';
  const prompt = `Solución del puzzle (autoritativa, no la cuestiones):
${solutionRows}

Categorías y valores válidos:
${puzzle.categories.map(c => `- ${c.name}: ${c.values.join(', ')}`).join('\n')}

Pistas a auditar:
${cluesList}

Para cada pista:
- Indica si es VERDADERA dada la solución (true) o FALSA/ambigua/contradictoria (false).
- Si es falsa, escribe una versión "corrected" que SÍ se cumpla exactamente con la solución, manteniendo el tono y la dificultad. No inventes datos fuera de la solución.
- Si es verdadera, "corrected" debe ser la pista original tal cual.

Devuelve EXACTAMENTE este JSON:
{
  "checks": [
    {"idx": 1, "ok": true, "corrected": "..."},
    ...
  ]
}`;
  const result = await CC.chatJSON({
    system: sys,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
  });
  if (!result?.checks || !Array.isArray(result.checks)) return null;
  const out = [...puzzle.clues];
  let changed = false;
  result.checks.forEach((chk) => {
    const i = (chk.idx | 0) - 1;
    if (i < 0 || i >= out.length) return;
    if (chk.ok === false && typeof chk.corrected === 'string' && chk.corrected.trim()) {
      out[i] = chk.corrected.trim();
      changed = true;
    }
  });
  return changed ? out : null;
}

function MapdokuGame({ opts = {}, onExit }) {
  const [phase, setPhase] = useState(opts.caseData ? 'loading' : 'setup'); // setup, loading, playing, won, lost
  const [difficulty, setDifficulty] = useState(opts.difficulty || 'medio');
  const [puzzle, setPuzzle] = useState(null);
  const [poolId, setPoolId] = useState(null);
  const [grid, setGrid] = useState({}); // {posIdx: {catName: value}}
  const [notes, setNotes] = useState({}); // {posIdx: {catName: [values]}} marcas tentativas
  const [noteMode, setNoteMode] = useState(false); // si true, colocar = marca tentativa
  const [revealed, setRevealed] = useState([]); // clue indices revealed via hint
  const [timer, setTimer] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [wrongCells, setWrongCells] = useState({}); // {posIdx-catName: true} para celdas erróneas tras check
  const [checkCount, setCheckCount] = useState(0);
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
    setGrid(init); setNotes({}); setNoteMode(false);
    setRevealed([]); setHintsUsed(0); setTimer(0);
    setWrongCells({}); setCheckCount(0);
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
      let data;
      try {
        data = await CC.chatJSON({
          system: sys,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.9,
        });
      } catch (eFirst) {
        push('JSON dudoso. Reintentando con temperatura menor…');
        data = await CC.chatJSON({
          system: sys,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.5,
        });
      }
      done();
      push('Verificando que la solución cuadre');

      if (!data.positions || !data.categories || !data.solution) throw new Error('Respuesta incompleta');
      if (data.solution.length !== data.positions.length) throw new Error('Solución no cuadra con posiciones');
      if (!Array.isArray(data.clues) || data.clues.length === 0) throw new Error('Sin pistas');
      done();

      push('Auditando pistas contra la solución');
      try {
        const fixed = await verifyAndFixClues(data);
        if (fixed) data.clues = fixed;
      } catch (eVerify) {
        console.warn('Verificación de pistas falló', eVerify);
      }
      done();

      push('Sellando el expediente');
      await new Promise(r => setTimeout(r, 250));
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
    // Al fijar un definitivo, limpia notas de esa celda
    if (value) {
      setNotes((nMap) => {
        const row = nMap[posIdx];
        if (!row?.[catName]) return nMap;
        const newRow = { ...row }; delete newRow[catName];
        return { ...nMap, [posIdx]: newRow };
      });
    }
    // Limpia marca de error al cambiar
    setWrongCells((w) => {
      const k = `${posIdx}-${catName}`;
      if (!w[k]) return w;
      const n = { ...w }; delete n[k]; return n;
    });
  };

  // Alterna una marca tentativa en (posIdx, catName) para un valor.
  const toggleNote = (posIdx, catName, value) => {
    if (!value) return;
    setNotes((nMap) => {
      const row = { ...(nMap[posIdx] || {}) };
      const arr = Array.isArray(row[catName]) ? [...row[catName]] : [];
      const i = arr.indexOf(value);
      if (i === -1) arr.push(value); else arr.splice(i, 1);
      if (arr.length) row[catName] = arr; else delete row[catName];
      return { ...nMap, [posIdx]: row };
    });
  };

  const clearAllNotes = () => setNotes({});

  const isComplete = () => {
    if (!puzzle) return false;
    return puzzle.positions.every((_, i) =>
      puzzle.categories.every((c) => grid[i]?.[c.name])
    );
  };

  const check = () => {
    let ok = true;
    const wrongs = {};
    let wrongCount = 0;
    puzzle.positions.forEach((_, i) => {
      puzzle.categories.forEach((c) => {
        if (grid[i]?.[c.name] !== puzzle.solution[i][c.name]) {
          ok = false;
          wrongs[`${i}-${c.name}`] = true;
          wrongCount++;
        }
      });
    });
    setCheckCount(n => n + 1);
    if (ok) {
      setPhase('won');
      const duration = Math.floor((Date.now() - startTs.current) / 1000);
      CC.addHistory({ gameId: 'mapdoku', won: true, difficulty, duration, summary: puzzle.title });
      CC.recordPlay('mapdoku', poolId, { duration, hints: hintsUsed, won: true });
      CC.grantMedal('first-solve');
      if (difficulty === 'fácil') CC.grantMedal('mapdoku-easy');
      if (difficulty === 'difícil' && hintsUsed === 0) CC.grantMedal('mapdoku-hard');
      if (hintsUsed === 0) CC.grantMedal('no-hints');
      const perfectBonus = hintsUsed === 0 ? 200 : 0;
      CC.addScore(CC.calcScore({ difficulty, duration, hints: hintsUsed, perfectBonus }));
      CC.toast('¡Resuelto!', 'ok');
    } else {
      setWrongCells(wrongs);
      // En fácil/medio mostramos cuántas; en difícil sólo "hay errores"
      if (difficulty === 'difícil') {
        CC.toast(`Algo no encaja. Revisa tus pistas. (${checkCount + 1}ª comprobación)`, 'bad', 3000);
      } else {
        CC.toast(`${wrongCount} celda${wrongCount === 1 ? '' : 's'} mal · marcadas en rojo`, 'bad', 3500);
      }
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
          <button
            className={`btn small ${noteMode ? '' : 'ghost'}`}
            onClick={() => setNoteMode(m => !m)}
            disabled={phase === 'won'}
            title="En modo tentativo, colocar un valor solo lo apunta como marca mental (otro color), no lo fija."
            style={noteMode ? { background: 'oklch(0.55 0.14 240)', color: '#fff', borderColor: 'oklch(0.4 0.14 240)' } : null}>
            {noteMode ? '✎ Tentativo' : '◉ Definitivo'}
          </button>
          <button className="btn ghost small" onClick={clearAllNotes} disabled={phase === 'won' || !Object.keys(notes).some(k => Object.keys(notes[k] || {}).length)}>
            Borrar marcas
          </button>
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
          <MapdokuGrid puzzle={puzzle} grid={grid} setCell={setCell} notes={notes} toggleNote={toggleNote} noteMode={noteMode} wrongCells={wrongCells} disabled={phase === 'won'} />
          {phase === 'won' && (
            <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
              <Stamp solid style={{ fontSize: '1rem', padding: '.5rem 1.2rem' }}>CASO CERRADO</Stamp>
              <div className="muted tiny" style={{ marginTop: '.6rem' }}>Resuelto en {CC.fmtTime(timer)} con {hintsUsed} pista{hintsUsed === 1 ? '' : 's'}</div>
              <ScoreReveal difficulty={difficulty} duration={timer} hints={hintsUsed} perfectBonus={hintsUsed === 0 ? 200 : 0} />
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

function MapdokuGrid({ puzzle, grid, setCell, notes = {}, toggleNote = () => {}, noteMode = false, wrongCells = {}, disabled }) {
  const [selected, setSelected] = useState(null); // {catName, value}

  // Para saber qué valores están ya usados en cada categoría (solo definitivos)
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
      if (noteMode) {
        // Modo tentativo: alterna marca y mantiene chip seleccionado para marcar varias celdas
        toggleNote(posIdx, selected.catName, selected.value);
      } else {
        setCell(posIdx, selected.catName, selected.value);
        setSelected(null);
      }
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
                // En modo tentativo permitimos seleccionar aunque esté usado
                const blocked = used && !isSelected && !noteMode;
                const noteBg = 'oklch(0.55 0.14 240)';
                return (
                  <button
                    key={v}
                    disabled={disabled || blocked}
                    onClick={() => setSelected(isSelected ? null : { catName: cat.name, value: v })}
                    style={{
                      fontFamily: 'Caveat, cursive',
                      fontSize: '1.15rem',
                      padding: '.3rem .8rem',
                      background: isSelected ? (noteMode ? noteBg : 'var(--ink)') : (used ? 'rgba(50,40,30,.15)' : 'var(--paper)'),
                      color: isSelected ? 'var(--paper)' : (used && !noteMode ? 'var(--ink-soft)' : 'var(--ink)'),
                      border: `1px dashed ${isSelected ? (noteMode ? noteBg : 'var(--ink)') : 'var(--ink-soft)'}`,
                      borderRadius: 14,
                      cursor: disabled || blocked ? 'default' : 'pointer',
                      textDecoration: used && !isSelected && !noteMode ? 'line-through' : 'none',
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
        <div className="tiny" style={{ marginBottom: '.6rem', padding: '.4rem .7rem', background: noteMode ? 'rgba(80,140,200,.18)' : 'rgba(80,140,200,.1)', borderLeft: `3px solid ${noteMode ? 'oklch(0.55 0.14 240)' : 'var(--stamp-blue)'}` }}>
          <strong>{selected.value}</strong> seleccionado · pulsa celdas de <strong>{selected.catName}</strong> para {noteMode ? 'marcarlas como mapa mental (no fija nada)' : 'colocarlo'}. <button className="btn ghost small" onClick={() => setSelected(null)} style={{ marginLeft: '.5rem', padding: '.1rem .4rem', fontSize: '.65rem' }}>cancelar</button>
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
                  const cellNotes = notes[i]?.[cat.name] || [];
                  const canPlaceHere = selected && selected.catName === cat.name;
                  const isWrong = !!wrongCells[`${i}-${cat.name}`];
                  const noteColor = 'oklch(0.55 0.14 240)';
                  const noteBgSoft = 'rgba(80,140,200,.10)';
                  return (
                    <td key={i} style={{
                      border: isWrong ? '2px solid var(--stamp-red)' : '1px dashed var(--ink-soft)',
                      padding: 0,
                      background: isWrong ? 'rgba(180,60,40,.18)' : (canPlaceHere && !val ? (noteMode ? noteBgSoft : 'rgba(80,140,200,.08)') : (val ? 'rgba(255,250,200,.4)' : (cellNotes.length ? noteBgSoft : 'transparent'))),
                      transition: 'background .15s',
                      animation: isWrong ? 'mapdokuWrongPulse .6s ease-out' : 'none',
                    }}>
                      <button
                        disabled={disabled || (!val && !canPlaceHere && cellNotes.length === 0)}
                        onClick={() => {
                          if (val) { removeFromCell(i, cat.name); return; }
                          if (canPlaceHere) { placeIn(i); return; }
                        }}
                        style={{
                          width: '100%', minWidth: 110, minHeight: 60,
                          background: 'transparent',
                          border: 'none',
                          cursor: disabled ? 'default' : (val || canPlaceHere ? 'pointer' : 'default'),
                          fontFamily: 'Caveat, cursive', fontSize: '1.3rem', color: 'var(--ink)',
                          padding: '.3rem',
                          display: 'block',
                        }}
                        title={val ? 'Click para quitar' : (canPlaceHere ? (noteMode ? `Marcar ${selected.value} (tentativo)` : `Colocar ${selected.value}`) : '')}>
                        {val ? (
                          val
                        ) : cellNotes.length ? (
                          <div className="row gap-sm wrap" style={{ justifyContent: 'center', gap: '.25rem' }}>
                            {cellNotes.map((n) => (
                              <span
                                key={n}
                                role="button"
                                onClick={(e) => { e.stopPropagation(); if (!disabled) toggleNote(i, cat.name, n); }}
                                style={{
                                  fontFamily: 'Caveat, cursive',
                                  fontSize: '.85rem',
                                  padding: '.05rem .4rem',
                                  background: 'transparent',
                                  color: noteColor,
                                  border: `1px dashed ${noteColor}`,
                                  borderRadius: 10,
                                  cursor: disabled ? 'default' : 'pointer',
                                  lineHeight: 1.1,
                                }}
                                title="Click para borrar esta marca">
                                {n}
                              </span>
                            ))}
                          </div>
                        ) : (canPlaceHere ? (
                          <span style={{ fontSize: '1.6rem', opacity: .35 }}>{noteMode ? '✎' : '+'}</span>
                        ) : (
                          <span style={{ fontFamily: 'Special Elite', fontSize: '.7rem', color: 'var(--ink-soft)', letterSpacing: '.15em' }}>—</span>
                        ))}
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
        Chip arriba → casilla para colocarlo · click en chip puesto para quitarlo · botón <strong>Tentativo</strong> para marcar varias casillas sin fijar (mapa mental, en azul)
      </div>
    </>
  );
}

window.MapdokuGame = MapdokuGame;
