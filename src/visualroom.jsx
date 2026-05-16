// ─── Cuarto Cerrado — Habitación Visual ────────────────────────────────
// La IA genera una imagen muy detallada de una escena, junto con una lista
// de preguntas u "objetos a encontrar". La jugadora responde mirando.

const VISUAL_SCENES = [
  'un despacho victoriano lleno de objetos curiosos',
  'una buhardilla de un coleccionista nocturno',
  'una habitación de hotel justo después de un robo',
  'el camarote desordenado de un capitán',
  'un cuarto de niño abandonado durante décadas',
  'el taller de un relojero con piezas por todas partes',
  'una librería privada donde algo se ha movido recientemente',
];

function VisualGame({ opts = {}, onExit }) {
  const [phase, setPhase] = useState(opts.caseData ? 'loading' : 'setup');
  const [difficulty, setDifficulty] = useState(opts.difficulty || 'medio');
  const [scenario, setScenario] = useState(null);
  const [poolId, setPoolId] = useState(null);
  const [image, setImage] = useState(null);
  const [answers, setAnswers] = useState({}); // {questionIdx: string}
  const [results, setResults] = useState(null); // {questionIdx: bool}
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
    setScenario(data); setAnswers({}); setResults(null); setTimer(0);
    setPoolId(poolIdInput || null);
    // Si el caso del pool ya trae imagen embebida, usarla
    const existingImage = preImage || data._image || null;
    setImage(existingImage);
    startTs.current = Date.now();
    if (existingImage) {
      setPhase('playing');
      return;
    }
    // Generar imagen (parte de la carga visible)
    if (CC.config.hasOpenAI) {
      push('Pintando la escena (gpt-image-1, low)');
      try {
        const img = await CC.image({ prompt: data.imagePrompt + '. Highly detailed, painterly, vintage, warm tungsten light, no text, no captions.', quality: 'low', size: '1024x1024' });
        done();
        setImage(img);
        // guardar la imagen dentro del caso para compartir
        data._image = img;
      } catch (e) { setError('No se pudo generar la imagen: ' + e.message); }
    }
    push('Enmarcando y colgando en la pared');
    await new Promise(r => setTimeout(r, 400));
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

Necesito una escena MUY detallada con muchos objetos identificables. Después de generar la imagen, la jugadora responderá ${N} preguntas sobre lo que ve.

Devuelve este JSON:
{
  "title": "Título evocador",
  "intro": "2 frases que sitúan la escena.",
  "imagePrompt": "Prompt MUY detallado en INGLÉS para gpt-image-1. Lista 15-20 objetos visibles concretos con sus posiciones aproximadas. Estilo: 'detailed illustration, vintage, warm tones, painted, lots of small props visible, no text labels'. Importante: SIN TEXTO en la imagen.",
  "questions": [
    {"q": "Pregunta sobre algo visible o contable", "a": "respuesta-corta-en-minusculas-sin-tildes"}
  ],
  "winText": "Cierre narrativo (1-2 frases) al completarlo"
}

Las preguntas pueden ser:
- "¿Cuántos X hay?" (números)
- "¿De qué color es Y?"
- "¿Qué hay encima de Z?"
- "¿Qué objeto aparece más cerca de la ventana?"
Las respuestas deben ser COHERENTES con lo que pediste en imagePrompt. ${N} preguntas en total. Dificultad: ${difficulty}.`;

      const data = await CC.chatJSON({
        system: sys,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.9,
      });
      if (!data.questions || !data.imagePrompt) throw new Error('Respuesta incompleta');
      done();
      await loadFromCase(data);
      // archivar (con imagen embebida si se generó)
      const saved = await CC.poolSave('visual', data, difficulty, data.title);
      if (saved?.id) { setPoolId(saved.id); CC.markPlayed('visual', saved.id); }
    } catch (e) {
      setError(e.message);
      setPhase('setup');
    }
  };

  const check = () => {
    const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
    const res = {};
    let correct = 0;
    scenario.questions.forEach((q, i) => {
      const ok = norm(answers[i]) === norm(q.a) || (norm(answers[i]) && norm(q.a).split(/[,/]/).some(opt => norm(opt) === norm(answers[i])));
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
          intro={<p>Aparecerá una escena cargada de objetos. Tendrás unas preguntas sobre lo que se ve: contar cosas, encontrar detalles, identificar lo fuera de lugar.</p>}
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

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '2rem' }}>
        <Paper style={{ padding: '.5rem' }}>
          {image ? (
            <img src={image} alt="La escena" style={{ width: '100%', display: 'block', border: '1px solid var(--paper-edge)' }} />
          ) : (
            <div style={{ aspectRatio: '1/1', background: 'var(--paper-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Loader msg="revelando la imagen" />
            </div>
          )}
        </Paper>

        <Paper>
          <h3 className="font-display">Preguntas</h3>
          <div className="col" style={{ gap: '.9rem' }}>
            {scenario.questions.map((q, i) => (
              <div key={i} style={{
                padding: '.6rem',
                background: results ? (results[i] ? 'rgba(60,120,60,.1)' : 'rgba(160,60,40,.1)') : 'transparent',
                borderLeft: results ? `3px solid ${results[i] ? 'var(--stamp-green)' : 'var(--stamp-red)'}` : '3px solid transparent',
              }}>
                <label style={{ display: 'block' }}>{i + 1}. {q.q}</label>
                <input
                  type="text"
                  value={answers[i] || ''}
                  onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })}
                  disabled={phase === 'won' || results?.[i]}
                />
                {results && !results[i] && <div className="tiny muted" style={{ marginTop: '.2rem' }}>respuesta correcta: <em>{q.a}</em></div>}
              </div>
            ))}
          </div>
          {phase !== 'won' && (
            <div style={{ marginTop: '1.2rem' }}>
              <button className="btn red" onClick={check} disabled={!image || Object.keys(answers).length < scenario.questions.length}>Comprobar</button>
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
