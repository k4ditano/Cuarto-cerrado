// ─── Cuarto Cerrado — Habitación Visual ────────────────────────────────
// Escena con muchos objetos visibles. Preguntas de dos tipos:
//   - "text"  → escribe la respuesta (color, cuenta, etc.)
//   - "click" → señala el lugar de la imagen donde está la respuesta

const VISUAL_SCENES = [
  'un despacho victoriano lleno de objetos curiosos',
  'una buhardilla de un coleccionista nocturno',
  'una habitación de hotel justo después de un robo',
  'el camarote desordenado de un capitán',
  'un cuarto de niño abandonado durante décadas',
  'el taller de un relojero con piezas por todas partes',
  'una librería privada donde algo se ha movido recientemente',
  'una cocina de una bruja con tarros y cazuelas',
  'un dormitorio de una poeta con manuscritos por el suelo',
];

function VisualGame({ opts = {}, onExit }) {
  const [phase, setPhase] = useState(opts.caseData ? 'loading' : 'setup');
  const [difficulty, setDifficulty] = useState(opts.difficulty || 'medio');
  const [scenario, setScenario] = useState(null);
  const [poolId, setPoolId] = useState(null);
  const [image, setImage] = useState(null);
  const [answers, setAnswers] = useState({});      // text answers {qIdx: str}
  const [clicks, setClicks] = useState({});        // click answers {qIdx: {x,y}}
  const [activeQ, setActiveQ] = useState(null);    // index of question being clicked
  const [hoverQ, setHoverQ] = useState(null);      // index of marker being hovered (for tooltip)
  const [results, setResults] = useState(null);    // {qIdx: bool}
  const [hintTexts, setHintTexts] = useState({});
  const [hintBusy, setHintBusy] = useState({});
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

  const loadFromCase = async (data, poolIdInput, preImage) => {
    setScenario(data); setAnswers({}); setClicks({}); setResults(null); setTimer(0);
    setPoolId(poolIdInput || null);
    const existingImage = preImage || data._image || null;
    setImage(existingImage);
    startTs.current = Date.now();
    if (existingImage) { setPhase('playing'); return; }
    if (CC.config.hasOpenAI) {
      push('Pintando la escena (gpt-image-1, low)');
      try {
        const img = await CC.image({ prompt: data.imagePrompt + '. Highly detailed, painterly, vintage, warm tungsten light, no text, no captions.', quality: 'low', size: '1024x1024' });
        done();
        setImage(img);
        data._image = img;
        if (poolIdInput) CC.poolUpdate('visual', poolIdInput, data);
      } catch (e) { setError('No se pudo generar la imagen: ' + e.message); }
    }
    push('Enmarcando y colgando en la pared');
    await new Promise(r => setTimeout(r, 300));
    done();
    setPhase('playing');
  };

  const start = async () => {
    setPhase('loading'); setError(null); reset();
    try {
      const setting = CC.pick(VISUAL_SCENES);
      const N = difficulty === 'fácil' ? 4 : difficulty === 'medio' ? 6 : 8;
      push(`Escenario: ${setting}`); done();
      push(`Componiendo escena con ${N} preguntas de observación`);
      const sys = 'Diseñador de puzzles de observación. Respondes SOLO con JSON válido en español.';
      const prompt = `Diseña un puzzle visual ambientado en: ${setting}.

La jugadora verá una imagen muy detallada y responderá ${N} preguntas mirando. Algunas serán de texto, otras de CLICK sobre la imagen.

Devuelve EXACTAMENTE este JSON:
{
  "title": "Título evocador",
  "intro": "2 frases que sitúan la escena.",
  "imagePrompt": "Prompt MUY detallado en INGLÉS para gpt-image-1. Lista 15-20 objetos visibles concretos con sus POSICIONES aproximadas (upper-left, center, bottom-right, on the desk, etc.). Para las preguntas de tipo 'click' debe haber elementos identificables EXACTAMENTE en las coordenadas que indiques en 'target'. Estilo: 'detailed illustration, vintage, warm tones, painted, no text, no captions'.",
  "questions": [
    {"q": "¿Cuántos relojes hay?", "type": "text", "a": "tres"},
    {"q": "Clica en el objeto fuera de lugar", "type": "click", "target": [55, 30, 14, 16], "label": "globo terráqueo"}
  ],
  "winText": "Cierre narrativo (1-2 frases) al completarlo"
}

REGLAS:
- ${N} preguntas en total
- Mezcla tipos: ${difficulty === 'fácil' ? 'mitad text, mitad click' : difficulty === 'medio' ? '60% click, 40% text' : '70% click, 30% text'}
- Para preguntas type "text": "a" es la respuesta exacta en minúsculas sin tildes
- Para preguntas type "click": "target" es [x, y, w, h] en porcentajes (0-100) sobre la imagen — donde debe clicar la jugadora. "label" es el nombre del objeto para mostrar tras comprobar.
- Las preguntas tipo click deben ser sobre objetos VISIBLES e IDENTIFICABLES en la posición target.
- imagePrompt debe describir los objetos de las preguntas click en sus posiciones exactas.
- Dificultad: ${difficulty}`;

      const data = await CC.chatJSON({
        system: sys,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.9,
      });
      if (!data.questions || !data.imagePrompt) throw new Error('Respuesta incompleta');
      // Sanear preguntas — backward compat
      data.questions = data.questions.map(q => ({
        ...q,
        type: q.type || (q.target ? 'click' : 'text'),
      }));
      done();
      await loadFromCase(data);
      const saved = await CC.poolSave('visual', data, difficulty, data.title);
      if (saved?.id) { setPoolId(saved.id); CC.markPlayed('visual', saved.id); }
    } catch (e) {
      setError(e.message);
      setPhase('setup');
    }
  };

  const onImageClick = (e) => {
    if (activeQ == null || phase === 'won') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setClicks((c) => ({ ...c, [activeQ]: { x, y } }));
    setActiveQ(null);
  };

  const allAnswered = () => {
    if (!scenario) return false;
    return scenario.questions.every((q, i) =>
      q.type === 'click' ? !!clicks[i] : !!answers[i]
    );
  };

  const visionHint = async (qi) => {
    if (!image) return CC.toast('La imagen aún no está lista', 'bad');
    if (hintTexts[qi]) return;
    setHintBusy((b) => ({ ...b, [qi]: true }));
    try {
      const q = scenario.questions[qi];
      const target = q.type === 'click' ? `Está aproximadamente en [${q.target.join(', ')}] (porcentajes x,y,w,h).` : `La respuesta correcta es "${q.a}".`;
      const text = await CC.chatVision({
        system: 'Eres un mentor que mira la imagen y guía con sutileza. NO digas directamente la respuesta. Da una pista de 1 frase que oriente al jugador.',
        prompt: `Pregunta: "${q.q}"\n${target}\n\nDame una pista sutil basándote en lo que VES en la imagen, sin nombrar la respuesta exacta ni dar las coordenadas literales.`,
        images: [image],
      });
      setHintTexts((h) => ({ ...h, [qi]: text }));
    } catch (e) { CC.toast('Pista visual falló: ' + e.message, 'bad'); }
    finally { setHintBusy((b) => ({ ...b, [qi]: false })); }
  };

  const check = () => {
    const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
    const res = {};
    let correct = 0;
    scenario.questions.forEach((q, i) => {
      let ok = false;
      if (q.type === 'click') {
        const c = clicks[i];
        if (c && Array.isArray(q.target)) {
          const [tx, ty, tw, th] = q.target;
          ok = c.x >= tx && c.x <= tx + tw && c.y >= ty && c.y <= ty + th;
        }
      } else {
        const ans = norm(answers[i]);
        const correctA = norm(q.a);
        ok = ans === correctA || (ans && correctA.split(/[,/]/).some(opt => norm(opt) === ans));
      }
      res[i] = ok;
      if (ok) correct++;
    });
    setResults(res);
    const pct = correct / scenario.questions.length;
    if (pct >= 0.7) {
      setPhase('won');
      const duration = Math.floor((Date.now() - startTs.current) / 1000);
      CC.addHistory({ gameId: 'visual', won: true, difficulty, duration, summary: `${scenario.title} — ${correct}/${scenario.questions.length}` });
      CC.recordPlay('visual', poolId, { duration, hints: 0, won: true });
      CC.grantMedal('first-solve');
      CC.grantMedal('visual');
      CC.toast(`${correct}/${scenario.questions.length} aciertos`, 'ok');
    } else {
      CC.toast(`Sólo ${correct}/${scenario.questions.length}. Sigue mirando.`, 'bad', 3500);
    }
  };

  if (phase === 'setup') {
    return (
      <GameShell title="Habitación Visual" subtitle="Observa, cuenta, descubre" onExit={onExit}>
        <GameSetup
          gameId="visual"
          intro={<>
            <p>Aparecerá una escena cargada de objetos. Tendrás preguntas: contar, identificar colores, y <strong>clicar</strong> sobre objetos concretos.</p>
            <p className="muted tiny">Las preguntas de click te dejarán marcar tu respuesta directamente sobre la imagen.</p>
          </>}
          difficulty={difficulty}
          setDifficulty={setDifficulty}
          onStartNew={start}
          onStartFromPool={loadFromCase}
          error={error}
          disabled={!CC.config.hasOllama || !CC.config.hasOpenAI}
          generationCost="~1-2¢ (texto + 1 imagen)"
        />
        {!CC.config.hasOpenAI && <Paper style={{ marginTop: '1rem', maxWidth: 760 }}><div className="tiny muted">Este modo necesita OPENAI_API_KEY para generar imágenes nuevas. Pero puedes jugar las del archivo sin gastar.</div></Paper>}
      </GameShell>
    );
  }

  if (phase === 'loading') {
    return <GameShell title="Habitación Visual" onExit={onExit}>
      <LiveLoader feed={feed} title="Pintando la habitación" idle={['Componiendo la escena', 'Repartiendo objetos', 'Pintando sombras']} />
    </GameShell>;
  }

  return (
    <GameShell title={scenario.title} subtitle="Habitación Visual" onExit={onExit} difficulty={difficulty} timer={timer}>
      <Paper style={{ marginBottom: '1.5rem' }}><p style={{ fontStyle: 'italic', margin: 0 }}>{scenario.intro}</p></Paper>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(320px, 1fr)', gap: '1.5rem' }}>
        <Paper aged style={{ padding: '.5rem' }}>
          {image ? (
            <div className="image-with-hotspots" style={{ width: '100%', cursor: activeQ != null ? 'crosshair' : 'default' }} onClick={onImageClick}>
              <img src={image} alt="La escena" style={{ width: '100%', display: 'block', borderRadius: 2 }} />
              {/* Markers for click answers */}
              {Object.entries(clicks).map(([qi, pos]) => {
                const qIdx = Number(qi);
                const isResult = results && scenario.questions[qi]?.type === 'click';
                const correct = isResult && results[qi];
                const q = scenario.questions[qi];
                const tipText = q.q + (results && q.label ? ` · ${correct ? '✓' : '✗ era: ' + q.label}` : '');
                const showTip = hoverQ === qIdx;
                return (
                  <div key={qi}
                    onMouseEnter={(e) => { e.stopPropagation(); setHoverQ(qIdx); }}
                    onMouseLeave={() => setHoverQ(h => h === qIdx ? null : h)}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: 'absolute',
                      left: `${pos.x}%`, top: `${pos.y}%`,
                      width: 44, height: 44,
                      marginLeft: -22, marginTop: -22,
                      borderRadius: '50%',
                      background: isResult ? (correct ? 'var(--stamp-green)' : 'var(--stamp-red)') : 'var(--stamp-blue)',
                      border: '3px solid var(--paper)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--paper)', fontFamily: 'Special Elite, monospace', fontSize: '1.25rem', fontWeight: 700,
                      lineHeight: 1,
                      boxShadow: '0 3px 10px rgba(0,0,0,.55), 0 0 0 1px rgba(0,0,0,.3)',
                      textShadow: '0 1px 2px rgba(0,0,0,.5)',
                      cursor: 'help', zIndex: showTip ? 15 : 5,
                    }}>
                    {qIdx + 1}
                    {showTip && (
                      <div style={{
                        position: 'absolute', bottom: 'calc(100% + 10px)', left: '50%', transform: 'translateX(-50%)',
                        background: 'var(--ink)', color: 'var(--paper)',
                        padding: '.55rem .85rem',
                        fontFamily: 'Special Elite, monospace', fontSize: '1rem', fontWeight: 400, letterSpacing: '.02em',
                        lineHeight: 1.35,
                        borderRadius: 3, width: 'max-content', maxWidth: 320,
                        boxShadow: '0 6px 18px rgba(0,0,0,.55)',
                        pointerEvents: 'none', textShadow: 'none',
                      }}>
                        <span style={{ opacity: .7, marginRight: '.3rem' }}>{qIdx + 1}·</span>{tipText}
                        <div style={{
                          position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
                          width: 0, height: 0,
                          borderLeft: '7px solid transparent', borderRight: '7px solid transparent',
                          borderTop: '7px solid var(--ink)',
                        }}></div>
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Target rectangles after checking */}
              {results && scenario.questions.map((q, i) => {
                if (q.type !== 'click' || !Array.isArray(q.target)) return null;
                const [x, y, w, h] = q.target;
                return (
                  <div key={'t-' + i} style={{
                    position: 'absolute',
                    left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%`,
                    border: `3px dashed ${results[i] ? 'var(--stamp-green)' : 'var(--stamp-red)'}`,
                    background: 'transparent',
                    pointerEvents: 'none', zIndex: 4,
                    borderRadius: 4,
                    boxShadow: '0 0 0 1px rgba(0,0,0,.4)',
                  }}/>
                );
              })}
              {activeQ != null && (
                <div style={{
                  position: 'absolute', top: 12, left: 12,
                  background: 'var(--ink)', color: 'var(--paper)',
                  padding: '.6rem 1rem',
                  fontFamily: 'Special Elite, monospace', fontSize: '.95rem', letterSpacing: '.15em',
                  borderRadius: 2, pointerEvents: 'none', zIndex: 10,
                  boxShadow: '0 4px 14px rgba(0,0,0,.5)',
                }}>📍 CLICA EN LA RESPUESTA · pregunta {activeQ + 1}</div>
              )}
            </div>
          ) : (
            <div style={{ aspectRatio: '1/1', background: 'var(--paper-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Loader msg="revelando la imagen" />
            </div>
          )}
        </Paper>

        <Paper>
          <h3 className="font-display">Preguntas</h3>
          <div className="col" style={{ gap: '.9rem' }}>
            {scenario.questions.map((q, i) => {
              const isClick = q.type === 'click';
              const isActive = activeQ === i;
              const answered = isClick ? !!clicks[i] : !!answers[i];
              const result = results?.[i];
              return (
                <div key={i} style={{
                  padding: '.6rem .7rem',
                  background: results ? (result ? 'rgba(60,120,60,.08)' : 'rgba(160,60,40,.08)') : isActive ? 'rgba(80,140,200,.1)' : 'transparent',
                  borderLeft: `3px solid ${results ? (result ? 'var(--stamp-green)' : 'var(--stamp-red)') : isActive ? 'var(--stamp-blue)' : 'transparent'}`,
                  transition: 'all .15s',
                }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '.3rem' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 20, height: 20, borderRadius: '50%',
                      background: isClick ? 'var(--stamp-blue)' : 'var(--ink)', color: 'var(--paper)',
                      fontSize: '.7rem', fontFamily: 'Special Elite, monospace',
                      marginRight: '.2rem',
                    }}>{i + 1}</span>
                    {q.q}
                    {isClick && <span className="pill" style={{ fontSize: '.6rem', padding: '.05rem .35rem' }}>click</span>}
                  </label>

                  {isClick ? (
                    <div style={{ marginTop: '.4rem' }}>
                      {answered ? (
                        <div className="row gap-sm" style={{ alignItems: 'center' }}>
                          <span className="tiny" style={{ color: 'var(--stamp-blue)' }}>📍 marca colocada</span>
                          {!results?.[i] && (
                            <button className="btn ghost small" onClick={() => setActiveQ(i)} disabled={phase === 'won'} style={{ padding: '.2rem .5rem', fontSize: '.65rem' }}>cambiar</button>
                          )}
                          {!result && !results && (
                            <button className="btn ghost small" onClick={() => { setClicks(c => { const n = { ...c }; delete n[i]; return n; }); }} style={{ padding: '.2rem .5rem', fontSize: '.65rem' }}>borrar</button>
                          )}
                        </div>
                      ) : (
                        <button className="btn small" onClick={() => setActiveQ(isActive ? null : i)} disabled={phase === 'won' || !image} style={{ marginTop: '.2rem' }}>
                          {isActive ? 'cancelar' : '📍 marcar en la imagen'}
                        </button>
                      )}
                      {results && !result && q.label && (
                        <div className="tiny muted" style={{ marginTop: '.3rem' }}>correcto: <em>{q.label}</em></div>
                      )}
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={answers[i] || ''}
                        onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })}
                        disabled={phase === 'won' || result}
                      />
                      {results && !result && q.a && <div className="tiny muted" style={{ marginTop: '.2rem' }}>correcto: <em>{q.a}</em></div>}
                    </>
                  )}

                  {phase !== 'won' && !result && !hintTexts[i] && CC.getSettings().hintsAllowed && (
                    <button className="btn ghost small" onClick={() => visionHint(i)} disabled={hintBusy[i] || !image} style={{ marginTop: '.3rem', fontSize: '.65rem' }}>
                      {hintBusy[i] ? '👁 mirando…' : '👁 pista visual'}
                    </button>
                  )}
                  {hintTexts[i] && (
                    <div className="tiny" style={{ marginTop: '.4rem', padding: '.4rem .6rem', background: 'rgba(180,140,80,.12)', borderLeft: '2px solid var(--stamp-blue)', fontStyle: 'italic' }}>
                      👁 {hintTexts[i]}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {phase !== 'won' && (
            <div style={{ marginTop: '1.2rem' }}>
              <button className="btn red" onClick={check} disabled={!image || !allAnswered()}>Comprobar</button>
              {!allAnswered() && <div className="tiny muted" style={{ marginTop: '.4rem' }}>Faltan preguntas por responder</div>}
            </div>
          )}
          {phase === 'won' && (
            <div style={{ marginTop: '1rem', textAlign: 'center' }}>
              <Stamp solid>RESUELTO</Stamp>
              <p style={{ marginTop: '.8rem', fontStyle: 'italic' }}>{scenario.winText}</p>
              <Leaderboard gameId="visual" caseId={poolId} />
              <ShareBar gameId="visual" poolId={poolId} caseData={scenario} title={scenario.title} difficulty={difficulty} />
              <button className="btn" onClick={() => { setPhase('setup'); setScenario(null); setPoolId(null); }}>Otra escena</button>
            </div>
          )}
        </Paper>
      </div>
    </GameShell>
  );
}

window.VisualGame = VisualGame;
