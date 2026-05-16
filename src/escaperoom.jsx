// ─── Cuarto Cerrado — Escape Room narrativo ────────────────────────────
// Una habitación cerrada con N objetos. Examinar, combinar, introducir la
// solución final. La IA genera todo y modera las acciones del jugador.

const ESCAPE_THEMES = [
  'el despacho de un anticuario',
  'el camarote de un capitán pirata',
  'el laboratorio abandonado de un alquimista',
  'la habitación de hotel donde se hospedó un fantasma',
  'el sótano de una librería antigua',
  'la consulta de un psiquiatra vienés en 1923',
  'una cámara secreta tras una chimenea',
  'el dormitorio de un coleccionista de mapas',
  'la cabina de un fotógrafo de los años 30',
];

function EscapeGame({ opts = {}, onExit }) {
  const [phase, setPhase] = useState(opts.caseData ? 'loading' : 'setup'); // setup, loading, playing, won
  const [difficulty, setDifficulty] = useState(opts.difficulty || 'medio');
  const [room, setRoom] = useState(null);
  const [poolId, setPoolId] = useState(null);
  const [inspected, setInspected] = useState({}); // {objectId: details}
  const [inventory, setInventory] = useState([]); // string ids
  const [chatLog, setChatLog] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [image, setImage] = useState(null);
  const [timer, setTimer] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [answer, setAnswer] = useState('');
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
    setRoom(data);
    setPoolId(poolIdInput || null);
    setInspected({}); setInventory([]); setChatLog([{ who: 'them', text: data.intro }]);
    setHintsUsed(0); setTimer(0); setAnswer(''); setImage(null);
    startTs.current = Date.now();
    setPhase('playing');
    if (data._image) { setImage(data._image); return; }
    if (CC.config.hasOpenAI && data.imagePrompt) {
      CC.image({ prompt: `${data.imagePrompt}. Cinematic, photograph, warm tungsten light, film grain, mysterious atmosphere, no text.`, quality: 'low' })
        .then((img) => {
          setImage(img); data._image = img;
          // Persistir imagen en el pool
          if (poolIdInput) CC.poolUpdate('escape', poolIdInput, data);
        })
        .catch((e) => console.warn('img err', e));
    }
  };

  const start = async () => {
    setPhase('loading'); setError(null); reset();
    try {
      const theme = CC.pick(ESCAPE_THEMES);
      push(`Escenario: ${theme}`); done();
      push('Construyendo paredes y objetos');
      const sys = `Eres un game master de escape rooms en español. Diseñas habitaciones cerradas con puzzles encadenados elegantes y narrativa atmosférica. Respondes SOLO con JSON válido.`;
      const prompt = `Diseña una escape room ambientada en: ${theme}.

Parámetros:
- Dificultad: ${difficulty}
- Entre 5 y 7 objetos interactuables
- 2-3 puzzles que encadenen: descubrir algo en un objeto desbloquea pistas sobre otro
- Un código final (palabra, número, o frase) que abre la salida

Devuelve este JSON:
{
  "title": "Título evocador",
  "intro": "Texto atmosférico de 3-4 frases que sitúa al jugador. Describe la habitación, la situación, por qué está cerrada.",
  "imagePrompt": "Prompt en INGLÉS muy detallado para generar la imagen de la habitación. IMPORTANTÍSIMO: describe la posición espacial de CADA objeto usando lenguaje claro ('in the upper-left corner', 'on the wooden desk in the center-right', 'on the floor near the bottom-left', 'on the back wall above the fireplace'). Esto debe coincidir con los 'position' de cada objeto. Estilo al final: 'vintage detective scene, dimly lit, photograph, film grain, warm tungsten light, no text'.",
  "objects": [
    {
      "id": "kebab-case-id-unico",
      "name": "Nombre breve",
      "shortDesc": "Descripción breve (1 frase) que ve el jugador al entrar",
      "examineText": "Lo que descubre al examinar. Puede contener pistas, números, palabras, o sub-objetos.",
      "containsItemId": "id-de-otro-objeto-o-null-si-no-contiene-nada",
      "position": [x, y, w, h]
    }
  ],
  "puzzles": [
    {
      "desc": "Descripción interna del puzzle (para el GM)",
      "solutionHint": "Pista sutil que el jugador podría inferir"
    }
  ],
  "finalAnswer": "la-palabra-clave-o-numero",
  "finalAnswerHint": "Cómo se llega a esta respuesta combinando pistas",
  "winText": "Texto narrativo de 2-3 frases que cierra la historia al resolverlo"
}

IMPORTANTE:
- "finalAnswer" en minúsculas, sin tildes, sin espacios extra
- Los objetos deben tener pistas SUFICIENTES para llegar al final
- "examineText" puede ser largo y atmosférico
- "position" de cada objeto: [x, y, width, height] en PORCENTAJES (0-100) sobre la imagen. La x e y son la esquina superior-izquierda del rectángulo. Ej: [10, 60, 18, 22] = un objeto en la zona inferior-izquierda. Reparte los objetos por la imagen sin solaparlos demasiado. NO los pongas todos en el centro. El imagePrompt DEBE describir esas posiciones para que la imagen generada coincida lo mejor posible.`;

      const data = await CC.chatJSON({
        system: sys,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.95,
      });
      done();
      push('Escondiendo pistas en los cajones');

      if (!data.objects || !data.finalAnswer) throw new Error('Respuesta incompleta');
      done();
      push('Atrancando la puerta y encendiendo la lámpara');
      await new Promise(r => setTimeout(r, 400));
      done();
      push('Archivando para uso futuro');
      const saved = await CC.poolSave('escape', data, difficulty, data.title);
      if (saved?.id) CC.markPlayed('escape', saved.id);
      done();
      loadFromCase(data, saved?.id);
    } catch (e) {
      console.error(e);
      setError(e.message || 'Error generando habitación');
      setPhase('setup');
    }
  };

  const examineObject = (obj) => {
    if (inspected[obj.id]) return; // ya visto
    setInspected({ ...inspected, [obj.id]: true });
    setChatLog((log) => [
      ...log,
      { who: 'me', text: `Examinar ${obj.name}` },
      { who: 'them', text: obj.examineText },
    ]);
    if (obj.containsItemId) {
      setInventory((inv) => [...new Set([...inv, obj.containsItemId])]);
    }
  };

  const askGM = async (text) => {
    const userMsg = text.trim();
    if (!userMsg) return;
    setInput('');
    setChatLog((log) => [...log, { who: 'me', text: userMsg }]);
    setBusy(true);
    try {
      const sys = `Eres el narrador (game master) de una escape room en español. Mantén tono atmosférico, breve (2-3 frases por respuesta). NO reveles directamente la respuesta final ni el contenido completo de los objetos no examinados. Si el jugador prueba una acción imposible, descríbelo con elegancia. Si pide pistas explícitas, dale UNA pista sutil. Aquí tienes el contexto interno (NO lo cites literalmente):

Título: ${room.title}
Habitación: ${room.intro}
Objetos:
${room.objects.map(o => `- ${o.name} [${o.id}]: ${o.shortDesc}. Detalle al examinar: ${o.examineText}`).join('\n')}
Puzzles:
${room.puzzles.map(p => `- ${p.desc} (pista: ${p.solutionHint})`).join('\n')}
Respuesta final: ${room.finalAnswer} (${room.finalAnswerHint})

Objetos ya examinados: ${Object.keys(inspected).join(', ') || 'ninguno'}.`;

      const history = chatLog.slice(-8).map(m => ({ role: m.who === 'me' ? 'user' : 'assistant', content: m.text }));
      let content;
      try {
        if (image) {
          // Con visión: el narrador "ve" la habitación
          content = await CC.chatVision({
            system: sys + '\n\nTIENES la imagen de la habitación adjunta. Puedes describir lo que el jugador señala basándote en lo que ves. Sé fiel a la imagen.',
            prompt: userMsg,
            images: [image],
            temperature: 0.7,
          });
        } else {
          content = await CC.chat({
            system: sys,
            messages: [...history, { role: 'user', content: userMsg }],
            temperature: 0.7,
          });
        }
      } catch (e) {
        // Fallback sin visión si el modelo de visión falla
        console.warn('vision falló, fallback a texto:', e.message);
        content = await CC.chat({
          system: sys,
          messages: [...history, { role: 'user', content: userMsg }],
          temperature: 0.7,
        });
      }
      setChatLog((log) => [...log, { who: 'them', text: content }]);
    } catch (e) {
      setChatLog((log) => [...log, { who: 'them', text: '(El narrador no responde… error: ' + e.message + ')' }]);
    } finally {
      setBusy(false);
    }
  };

  const requestHint = () => {
    setHintsUsed(h => h + 1);
    askGM('Dame una pista sutil sobre por dónde tirar.');
  };

  const tryAnswer = () => {
    const normalize = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
    if (normalize(answer) === normalize(room.finalAnswer)) {
      setPhase('won');
      const duration = Math.floor((Date.now() - startTs.current) / 1000);
      CC.addHistory({ gameId: 'escape', won: true, difficulty, duration, summary: room.title });
      CC.recordPlay('escape', poolId, { duration, hints: hintsUsed, won: true });
      CC.grantMedal('first-solve');
      if (duration < 600) CC.grantMedal('escape-fast');
      if (hintsUsed === 0) CC.grantMedal('no-hints');
      CC.toast('¡Escapaste!', 'ok');
    } else {
      CC.toast('Esa no es la combinación.', 'bad');
      setChatLog((log) => [...log, { who: 'me', text: `Intentar abrir: "${answer}"` }, { who: 'them', text: 'La cerradura no cede. No es eso.' }]);
    }
  };

  // ─── Pantallas ──────────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <GameShell title="Escape Room" subtitle="Sales si descubres el código" onExit={onExit}>
        <GameSetup
          gameId="escape"
          intro={<>
            <p>La puerta se cerró tras de ti. La habitación tiene objetos. Algunos esconden pistas. Combínalas, deduce el código final y sal.</p>
            <p className="muted tiny">Puedes hablar con el narrador para describir acciones libres, o examinar los objetos directamente.</p>
          </>}
          difficulty={difficulty}
          setDifficulty={setDifficulty}
          onStartNew={start}
          onStartFromPool={loadFromCase}
          error={error}
          disabled={!CC.config.hasOllama}
          generationCost="~2-3¢ (texto + 1 imagen)"
        />
      </GameShell>
    );
  }

  if (phase === 'loading') {
    return (
      <GameShell title="Escape Room" onExit={onExit}>
        <LiveLoader feed={feed} title="Cerrando la habitación" idle={['Construyendo paredes', 'Escondiendo pistas', 'Atrancando la puerta', 'Encendiendo la lámpara']} />
      </GameShell>
    );
  }

  return (
    <GameShell
      title={room.title}
      subtitle="Escape Room"
      onExit={onExit}
      difficulty={difficulty}
      timer={timer}
      right={phase !== 'won' && (
        <button className="btn ghost small" onClick={requestHint} disabled={!CC.getSettings().hintsAllowed || busy}>
          Pedir pista{hintsUsed > 0 ? ` (${hintsUsed})` : ''}
        </button>
      )}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '2rem' }}>
        {/* Columna izquierda: imagen + objetos */}
        <div className="col">
          {image ? (
            <div className="polaroid" style={{ alignSelf: 'flex-start', maxWidth: 520 }}>
              <div className="image-with-hotspots">
                <img src={image} alt="Habitación" />
                {room.objects.filter(o => Array.isArray(o.position) && o.position.length === 4).map((obj, i) => {
                  const [x, y, w, h] = obj.position;
                  const examined = inspected[obj.id];
                  return (
                    <div key={obj.id}
                      className={`hotspot ${examined ? 'examined' : ''}`}
                      style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` }}
                      onClick={() => examineObject(obj)}>
                      <div className="pin">{i + 1}</div>
                      <div className="label">{obj.name}{examined ? ' ✓' : ''}</div>
                    </div>
                  );
                })}
              </div>
              <div className="cap">la escena · pulsa las marcas</div>
            </div>
          ) : (
            <Paper style={{ textAlign: 'center', padding: '2rem' }}>
              <div className="ph" style={{ aspectRatio: '1/1', maxWidth: 360, margin: '0 auto', background: 'var(--paper-3)', position: 'relative' }}>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 64, opacity: .3 }}>🔒</div>
              </div>
              <div className="tiny muted" style={{ marginTop: '.6rem' }}>generando imagen…</div>
            </Paper>
          )}

          <Paper>
            <h3 className="font-display">Objetos en la habitación</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '.7rem' }}>
              {room.objects.map((obj) => (
                <button key={obj.id} className="paper" onClick={() => examineObject(obj)} disabled={phase === 'won'} style={{
                  padding: '.7rem', cursor: phase === 'won' ? 'default' : 'pointer',
                  background: inspected[obj.id] ? 'rgba(180,140,80,.15)' : 'var(--paper-2)',
                  border: '1px solid var(--paper-edge)',
                  textAlign: 'left',
                }}>
                  <div className="font-typewriter" style={{ fontSize: '.85rem', letterSpacing: '.05em' }}>{obj.name}</div>
                  <div className="tiny muted" style={{ marginTop: '.2rem' }}>{obj.shortDesc}</div>
                  {inspected[obj.id] && <Stamp kind="green" style={{ marginTop: '.5rem', fontSize: '.55rem', padding: '.05rem .3rem' }}>visto</Stamp>}
                </button>
              ))}
            </div>
          </Paper>
        </div>

        {/* Columna derecha: chat + final */}
        <div className="col">
          <Paper>
            <h3 className="font-display">El narrador</h3>
            <div className="chat-log" id="chat-log">
              {chatLog.map((m, i) => (
                <div key={i} className={`bubble ${m.who}`}>{m.text}</div>
              ))}
              {busy && <div className="bubble them"><Loader msg="escribiendo" /></div>}
            </div>
            {phase !== 'won' && (
              <form onSubmit={(e) => { e.preventDefault(); askGM(input); }} style={{ marginTop: '1rem' }}>
                <div className="row gap-sm">
                  <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Examinar el reloj, buscar bajo la cama, leer la carta…" disabled={busy} />
                  <button className="btn" disabled={busy || !input.trim()}>Decir</button>
                </div>
              </form>
            )}
          </Paper>

          <Paper aged>
            <h3 className="font-display">La cerradura</h3>
            <p className="tiny muted">Cuando creas tener el código, introdúcelo aquí.</p>
            {phase === 'won' ? (
              <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                <Stamp solid style={{ fontSize: '1rem', padding: '.5rem 1.2rem' }}>PUERTA ABIERTA</Stamp>
                <p style={{ marginTop: '1rem', fontStyle: 'italic' }}>{room.winText}</p>
                <div className="muted tiny">Resuelto en {CC.fmtTime(timer)} · {hintsUsed} pista{hintsUsed === 1 ? '' : 's'}</div>
                <Leaderboard gameId="escape" caseId={poolId} />
                <ShareBar gameId="escape" poolId={poolId} caseData={room} title={room.title} difficulty={difficulty} />
                <button className="btn" style={{ marginTop: '1rem' }} onClick={() => { setPhase('setup'); setRoom(null); setPoolId(null); }}>Otra escape room</button>
              </div>
            ) : (
              <div className="row gap-sm" style={{ marginTop: '.6rem' }}>
                <input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="código / palabra clave" />
                <button className="btn red" onClick={tryAnswer} disabled={!answer.trim()}>Probar</button>
              </div>
            )}
          </Paper>
        </div>
      </div>
    </GameShell>
  );
}

window.EscapeGame = EscapeGame;
