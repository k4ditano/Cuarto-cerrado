// ─── Cuarto Cerrado — Caso Criminal ─────────────────────────────────────
// Hay una víctima, 4 sospechosos (con retratos generados), pruebas, y un
// culpable. La jugadora examina pistas, interroga sospechosos y acusa.

const CRIME_SETTINGS = [
  'una mansión en la campiña inglesa durante una tormenta',
  'un crucero transatlántico en los años 30',
  'un teatro de variedades en el Madrid de 1928',
  'un internado nevado en los Alpes',
  'el club privado de coleccionistas más exclusivo de París',
  'un balneario termal en una montaña remota',
  'la consulta de un afamado relojero suizo',
  'un yate amarrado en la Riviera francesa',
];

function CriminalGame({ opts = {}, onExit }) {
  const [phase, setPhase] = useState(opts.caseData ? 'loading' : 'setup'); // setup, loading, playing, won, lost, postmortem
  const [difficulty, setDifficulty] = useState(opts.difficulty || 'medio');
  const [caseFile, setCaseFile] = useState(null);
  const [poolId, setPoolId] = useState(null);
  const [portraits, setPortraits] = useState({}); // {suspectId: dataUrl}
  const [interviewed, setInterviewed] = useState({}); // {suspectId: [Q,A,...]}
  const [examinedClues, setExaminedClues] = useState([]);
  const [activeView, setActiveView] = useState('briefing'); // briefing | suspects | clues | accuse | <suspectId>
  const [busy, setBusy] = useState(false);
  const [timer, setTimer] = useState(0);
  const [accusations, setAccusations] = useState(0);
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
    setCaseFile(data); setPoolId(poolIdInput || null);
    setInterviewed({}); setExaminedClues([]);
    setAccusations(0); setTimer(0); setActiveView('briefing'); setPortraits(data._portraits || {});
    startTs.current = Date.now();
    setPhase('playing');

    // Si ya tiene retratos completos, no regenerar
    if (data._portraits && Object.keys(data._portraits).length >= data.suspects.length) return;
    if (!CC.config.hasOpenAI) return;

    const have = new Set(Object.keys(data._portraits || {}));
    const todo = data.suspects.filter(s => s.portraitPrompt && !have.has(s.id));
    Promise.all(todo.map(s =>
      CC.image({ prompt: s.portraitPrompt, quality: 'low', size: '1024x1024' })
        .then((url) => {
          data._portraits = { ...(data._portraits || {}), [s.id]: url };
          setPortraits((p) => ({ ...p, [s.id]: url }));
        })
        .catch((e) => console.warn('portrait err', s.id, e))
    )).then(() => {
      // Persistir retratos en el pool para que la próxima vez sean gratis
      if (poolIdInput) CC.poolUpdate('criminal', poolIdInput, data);
    });
  };

  const start = async () => {
    setPhase('loading'); setError(null); reset();
    try {
      const setting = CC.pick(CRIME_SETTINGS);
      push(`Escenario: ${setting}`); done();
      push('Convocando sospechosos y redactando coartadas');
      const sys = `Eres un escritor de misterio policiaco en español. Diseñas casos cerrados al estilo Agatha Christie. Respondes SOLO con JSON válido.`;
      const prompt = `Diseña un caso de asesinato cerrado, ambientado en: ${setting}.

Parámetros:
- Dificultad: ${difficulty}
- 4 sospechosos con personalidad distinta, motivo y coartada
- Exactamente UNO es el culpable
- 4-6 piezas de evidencia que el detective puede examinar
- Cada sospechoso tiene una afirmación inicial (lo que dirá si lo interrogas la primera vez)
- El culpable miente sutilmente; un detalle de su afirmación o coartada lo delata si se combina con la evidencia

Devuelve este JSON:
{
  "title": "Título de novela negra",
  "intro": "Texto del briefing en tono de novela: víctima, lugar, modo aparente, por qué te llaman a ti (3-4 frases).",
  "victim": {"name": "...", "description": "1 frase"},
  "suspects": [
    {
      "id": "kebab-id",
      "name": "Nombre Apellido",
      "role": "Rol (mayordomo, prima de la víctima…)",
      "shortDesc": "Una frase de presentación",
      "alibi": "Su coartada",
      "motive": "Su motivo (para el detective, no se cita literal)",
      "initialStatement": "Lo que dice voluntariamente al ser interrogado",
      "portraitPrompt": "Prompt en INGLÉS para retrato: 'vintage 1930s formal portrait, sepia photograph, [descripción física breve], serious expression, soft studio light, film grain, no text'",
      "isCulprit": false
    }
  ],
  "clues": [
    {"id": "k", "name": "Nombre breve", "description": "Qué es y dónde se encontró", "examineText": "Detalles que revela un examen cuidadoso"}
  ],
  "culpritExplanation": "Por qué el culpable es culpable: qué detalle de la evidencia + qué inconsistencia en su declaración lo delatan",
  "redHerring": "Pista que parece incriminar a otro sospechoso pero tiene explicación inocente"
}

Marca isCulprit: true en EXACTAMENTE uno. Los nombres de sospechosos deben ser convincentes (mezcla de orígenes según ambiente).`;

      const data = await CC.chatJSON({
        system: sys,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.95,
      });
      done();
      push('Plantando evidencias en la escena');

      if (!data.suspects || data.suspects.length < 3) throw new Error('Respuesta incompleta');
      const culprits = data.suspects.filter(s => s.isCulprit).length;
      if (culprits !== 1) {
        // forzar uno
        data.suspects.forEach(s => s.isCulprit = false);
        data.suspects[Math.floor(Math.random() * data.suspects.length)].isCulprit = true;
      }
      done();
      push(`Revelando ${data.suspects.length} retratos (en segundo plano)`);
      await new Promise(r => setTimeout(r, 400));
      done();
      push('Archivando para uso futuro');
      const saved = await CC.poolSave('criminal', data, difficulty, data.title);
      if (saved?.id) CC.markPlayed('criminal', saved.id);
      done();
      loadFromCase(data, saved?.id);
    } catch (e) {
      console.error(e);
      setError(e.message || 'Error generando caso');
      setPhase('setup');
    }
  };

  const askSuspect = async (suspect, question) => {
    setBusy(true);
    try {
      const sys = `Estás interpretando a ${suspect.name} (${suspect.role}) en un interrogatorio policial en español.
Contexto interno (NO lo cites literalmente):
- Caso: ${caseFile.intro}
- Víctima: ${caseFile.victim.name}
- Tu coartada: ${suspect.alibi}
- Tu motivo (si lo tuvieras): ${suspect.motive}
- ¿Eres el culpable? ${suspect.isCulprit ? 'SÍ. Mientes sutilmente sobre tu coartada y desvías sospechas, pero sin ser obvio. Si te aprietan con evidencia concreta, puedes ponerte nervioso.' : 'NO. Eres inocente, dices la verdad, aunque puedes estar nervioso, evasivo o resentido según tu personalidad.'}

Responde en primera persona, en 1-3 frases, en tono propio de tu personaje. NUNCA confieses directamente. NUNCA digas "soy el asesino" o "no soy el asesino". Si se te pregunta por otros sospechosos, opinas según tu personalidad.`;

      const previous = (interviewed[suspect.id] || []).map((qa, i) => i % 2 === 0
        ? { role: 'user', content: qa }
        : { role: 'assistant', content: qa }
      );

      const answer = await CC.chat({
        system: sys,
        messages: [...previous, { role: 'user', content: question }],
        temperature: 0.85,
      });

      setInterviewed((iv) => ({
        ...iv,
        [suspect.id]: [...(iv[suspect.id] || []), question, answer],
      }));
    } catch (e) {
      CC.toast('Error al interrogar: ' + e.message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  const accuse = (suspect) => {
    if (!confirm(`¿Acusar a ${suspect.name} del asesinato? Si te equivocas, contará en tu expediente.`)) return;
    setAccusations(a => a + 1);
    if (suspect.isCulprit) {
      setPhase('won');
      const duration = Math.floor((Date.now() - startTs.current) / 1000);
      CC.addHistory({ gameId: 'criminal', won: true, difficulty, duration, summary: `${caseFile.title} — acusaste a ${suspect.name}` });
      CC.recordPlay('criminal', poolId, { duration, hints: accusations, won: true });
      CC.grantMedal('first-solve');
      CC.grantMedal('detective');
      if (accusations === 0) CC.grantMedal('detective-perfect');
      CC.toast('¡Resuelto!', 'ok');
    } else {
      CC.toast(`${suspect.name} era inocente. Vuelve a investigar.`, 'bad', 3500);
    }
  };

  // ─── Pantallas ──────────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <GameShell title="Caso Criminal" subtitle="Hay un cadáver y cuatro versiones" onExit={onExit}>
        <GameSetup
          gameId="criminal"
          intro={<>
            <p>Te llaman al lugar de un crimen. Cuatro personas estaban allí esa noche. Sus historias no encajan del todo. Examina las pruebas, interroga a quien quieras, y cuando estés segura, acusa.</p>
            <p className="muted tiny">Si acusas a un inocente, el verdadero culpable lo sabrá y se reirá de ti, pero el caso sigue abierto.</p>
          </>}
          difficulty={difficulty}
          setDifficulty={setDifficulty}
          onStartNew={start}
          onStartFromPool={loadFromCase}
          error={error}
          disabled={!CC.config.hasOllama}
          generationCost="~4-5¢ (texto + 4 retratos)"
        />
      </GameShell>
    );
  }

  if (phase === 'loading') {
    return (
      <GameShell title="Caso Criminal" onExit={onExit}>
        <LiveLoader feed={feed} title="Levantando el caso" idle={['Convocando sospechosos', 'Fotografiando retratos', 'Plantando pistas', 'Levantando el cadáver']} />
      </GameShell>
    );
  }

  // ─── Caso abierto / cerrado ─────────────────────────────────────────
  const tabs = [
    ['briefing', 'Expediente'],
    ['suspects', `Sospechosos (${caseFile.suspects.length})`],
    ['clues',    `Pruebas (${caseFile.clues.length})`],
    ['accuse',   'Acusar'],
  ];

  return (
    <GameShell
      title={caseFile.title}
      subtitle="Caso Criminal"
      onExit={onExit}
      difficulty={difficulty}
      timer={timer}
      right={accusations > 0 && <span className="pill red">acusaciones fallidas · {accusations}</span>}
    >
      <div className="row gap-sm wrap" style={{ marginBottom: '1.5rem' }}>
        {tabs.map(([k, label]) => (
          <button key={k} className={`navlink ${activeView === k || (k === 'suspects' && caseFile.suspects.some(s => s.id === activeView)) ? 'active' : ''}`} onClick={() => setActiveView(k)}>{label}</button>
        ))}
      </div>

      {activeView === 'briefing' && <BriefingView caseFile={caseFile} />}
      {activeView === 'suspects' && (
        <SuspectGrid suspects={caseFile.suspects} portraits={portraits} onOpen={(s) => setActiveView(s.id)} />
      )}
      {activeView === 'clues' && (
        <ClueList clues={caseFile.clues} examined={examinedClues} setExamined={setExaminedClues} />
      )}
      {activeView === 'accuse' && (
        <AccusePanel suspects={caseFile.suspects} portraits={portraits} onAccuse={accuse} phase={phase} caseFile={caseFile} accusations={accusations} timer={timer} onReplay={() => { setPhase('setup'); setCaseFile(null); setPoolId(null); }} poolId={poolId} difficulty={difficulty} />
      )}
      {caseFile.suspects.find(s => s.id === activeView) && (
        <InterrogationView
          suspect={caseFile.suspects.find(s => s.id === activeView)}
          portrait={portraits[activeView]}
          history={interviewed[activeView] || []}
          onAsk={askSuspect}
          busy={busy}
          onBack={() => setActiveView('suspects')}
          locked={phase === 'won'}
        />
      )}
    </GameShell>
  );
}

function BriefingView({ caseFile }) {
  return (
    <Paper aged style={{ maxWidth: 760, position: 'relative' }}>
      <Stamp solid style={{ position: 'absolute', top: '1.5rem', right: '1.5rem' }}>CONFIDENCIAL</Stamp>
      <div className="font-typewriter tiny" style={{ letterSpacing: '.2em', color: 'var(--ink-faded)' }}>EXPEDIENTE</div>
      <h2 className="font-display" style={{ marginTop: '.3rem' }}>{caseFile.title}</h2>
      <p style={{ marginTop: '1rem' }}>{caseFile.intro}</p>
      <div className="divider dashed"></div>
      <h4 className="font-display">Víctima</h4>
      <p><strong>{caseFile.victim.name}</strong> — {caseFile.victim.description}</p>
    </Paper>
  );
}

function SuspectGrid({ suspects, portraits, onOpen }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1.5rem' }}>
      {suspects.map((s, i) => (
        <Paper key={s.id} style={{ cursor: 'pointer', textAlign: 'center', transform: `rotate(${(i % 2 ? -.5 : .5)}deg)` }} onClick={() => onOpen(s)}>
          <div className="polaroid" style={{ background: '#f7f3e8', display: 'block', margin: '0 auto', maxWidth: 200 }}>
            {portraits[s.id] ? <img src={portraits[s.id]} alt={s.name} /> : (
              <div className="ph center" style={{ aspectRatio: '1/1', background: 'var(--paper-3)' }}>
                <Loader msg="revelando" />
              </div>
            )}
            <div className="cap">{s.name}</div>
          </div>
          <div className="tiny muted" style={{ marginTop: '.7rem', textTransform: 'uppercase', letterSpacing: '.1em' }}>{s.role}</div>
          <p className="tiny" style={{ marginTop: '.5rem' }}>{s.shortDesc}</p>
          <Stamp kind="blue" style={{ marginTop: '.5rem', fontSize: '.65rem' }}>Interrogar</Stamp>
        </Paper>
      ))}
    </div>
  );
}

function InterrogationView({ suspect, portrait, history, onAsk, busy, onBack, locked }) {
  const [q, setQ] = useState('');
  const submit = (e) => { e?.preventDefault(); if (!q.trim() || busy) return; onAsk(suspect, q.trim()); setQ(''); };

  // Si no se ha interrogado aún, mostrar declaración inicial
  const log = history.length === 0
    ? [{ q: null, a: suspect.initialStatement }]
    : Array.from({ length: history.length / 2 }, (_, i) => ({ q: history[i*2], a: history[i*2+1] }));

  const presets = [
    '¿Dónde estaba cuando ocurrió?',
    '¿Qué relación tenía con la víctima?',
    '¿Vio a alguien sospechoso?',
    '¿Hay algo que no nos haya contado?',
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '2rem' }}>
      <div>
        <button className="btn ghost small" onClick={onBack} style={{ marginBottom: '1rem' }}>← Sospechosos</button>
        <div className="polaroid" style={{ background: '#f7f3e8' }}>
          {portrait ? <img src={portrait} alt={suspect.name} /> : <div className="ph center" style={{ aspectRatio: '1/1', background: 'var(--paper-3)' }}><Loader msg="revelando" /></div>}
          <div className="cap">{suspect.name}</div>
        </div>
        <div className="tiny muted" style={{ marginTop: '.6rem', textAlign: 'center' }}>{suspect.role}</div>
        <p className="tiny" style={{ marginTop: '.6rem' }}>{suspect.shortDesc}</p>
      </div>

      <Paper>
        <h3 className="font-display">Interrogatorio</h3>
        <div className="chat-log">
          {log.map((m, i) => (
            <React.Fragment key={i}>
              {m.q && <div className="bubble me">{m.q}</div>}
              <div className="bubble them">{m.a}</div>
            </React.Fragment>
          ))}
          {busy && <div className="bubble them"><Loader msg="pensando" /></div>}
        </div>
        {!locked && (
          <>
            <div className="row gap-sm wrap" style={{ marginTop: '1rem' }}>
              {presets.map((p) => (
                <button key={p} className="btn ghost small" disabled={busy} onClick={() => onAsk(suspect, p)}>{p}</button>
              ))}
            </div>
            <form onSubmit={submit} style={{ marginTop: '.8rem' }}>
              <div className="row gap-sm">
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hazle una pregunta directa…" disabled={busy} />
                <button className="btn" disabled={busy || !q.trim()}>Preguntar</button>
              </div>
            </form>
          </>
        )}
      </Paper>
    </div>
  );
}

function ClueList({ clues, examined, setExamined }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
      {clues.map((c, i) => (
        <Paper key={c.id} aged style={{ position: 'relative' }}>
          <Stamp kind={examined.includes(c.id) ? 'green' : 'red'} style={{ position: 'absolute', top: 12, right: 12, fontSize: '.55rem', padding: '.1rem .3rem' }}>
            {examined.includes(c.id) ? 'examinado' : 'sin examinar'}
          </Stamp>
          <div className="font-typewriter tiny" style={{ letterSpacing: '.2em', color: 'var(--ink-faded)' }}>EVIDENCIA {String(i + 1).padStart(2, '0')}</div>
          <h4 className="font-display" style={{ marginTop: '.4rem' }}>{c.name}</h4>
          <p className="tiny" style={{ fontStyle: 'italic' }}>{c.description}</p>
          {examined.includes(c.id) ? (
            <p className="font-mono" style={{ marginTop: '.6rem', fontSize: '.9rem' }}>{c.examineText}</p>
          ) : (
            <button className="btn ghost small" onClick={() => setExamined([...examined, c.id])} style={{ marginTop: '.6rem' }}>Examinar de cerca</button>
          )}
        </Paper>
      ))}
    </div>
  );
}

function AccusePanel({ suspects, portraits, onAccuse, phase, caseFile, accusations, timer, onReplay, poolId, difficulty }) {
  if (phase === 'won') {
    const culprit = suspects.find(s => s.isCulprit);
    return (
      <Paper aged style={{ maxWidth: 720 }}>
        <div className="center" style={{ flexDirection: 'column', textAlign: 'center', padding: '1rem' }}>
          <Stamp solid style={{ fontSize: '1rem', padding: '.5rem 1.2rem' }}>CASO RESUELTO</Stamp>
          <h2 className="font-display" style={{ marginTop: '1rem' }}>{culprit.name} era culpable</h2>
          <p style={{ maxWidth: 540 }}>{caseFile.culpritExplanation}</p>
          <div className="muted tiny" style={{ marginTop: '.6rem' }}>Resuelto en {CC.fmtTime(timer)} con {accusations} acusación{accusations === 1 ? '' : 'es'} fallida{accusations === 1 ? '' : 's'}</div>
          <Leaderboard gameId="criminal" caseId={poolId} />
          <ShareBar gameId="criminal" poolId={poolId} caseData={caseFile} title={caseFile.title} difficulty={difficulty} />
          <button className="btn" style={{ marginTop: '1.5rem' }} onClick={onReplay}>Otro caso</button>
        </div>
      </Paper>
    );
  }
  return (
    <div>
      <Paper style={{ marginBottom: '1.5rem' }}>
        <p>Cuando estés segura, elige a quién acusar. Si fallas, el caso sigue abierto pero quedará registrado.</p>
      </Paper>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1.5rem' }}>
        {suspects.map((s) => (
          <Paper key={s.id} style={{ textAlign: 'center' }}>
            <div className="polaroid" style={{ background: '#f7f3e8', maxWidth: 180, margin: '0 auto' }}>
              {portraits[s.id] ? <img src={portraits[s.id]} alt={s.name} /> : <div className="ph" style={{ aspectRatio: '1/1', background: 'var(--paper-3)' }}></div>}
              <div className="cap">{s.name}</div>
            </div>
            <button className="btn red" style={{ marginTop: '1rem' }} onClick={() => onAccuse(s)}>Acusar</button>
          </Paper>
        ))}
      </div>
    </div>
  );
}

window.CriminalGame = CriminalGame;
