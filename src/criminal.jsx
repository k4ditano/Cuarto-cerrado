// ─── Cuarto Cerrado — Caso Criminal (rediseño interactivo) ─────────────
// Escena del crimen como imagen con evidencias clickables.
// Recoger pruebas → presentarlas en interrogatorios → ver reacciones específicas
// de cada sospechoso → acusar.

const CRIME_SETTINGS = [
  'una mansión en la campiña inglesa durante una tormenta',
  'un crucero transatlántico en los años 30',
  'un teatro de variedades en el Madrid de 1928',
  'un internado nevado en los Alpes',
  'el club privado de coleccionistas más exclusivo de París',
  'un balneario termal en una montaña remota',
  'la consulta de un afamado relojero suizo',
  'un yate amarrado en la Riviera francesa',
  'un hotel art-déco en el Cairo',
  'una bodega vinícola tras la vendimia',
];

function CriminalGame({ opts = {}, onExit }) {
  const [phase, setPhase] = useState(opts.caseData ? 'loading' : 'setup');
  const [difficulty, setDifficulty] = useState(opts.difficulty || 'medio');
  const [caseFile, setCaseFile] = useState(null);
  const [poolId, setPoolId] = useState(null);
  const [portraits, setPortraits] = useState({}); // {suspectId: dataUrl}
  const [sceneImage, setSceneImage] = useState(null);
  const [collectedEvidence, setCollectedEvidence] = useState([]); // [evidenceId]
  const [examinedEvidence, setExaminedEvidence] = useState(null); // currently shown in modal
  const [interviewed, setInterviewed] = useState({}); // {suspectId: [{role, content, evidence?}]}
  const [presentedEvidence, setPresentedEvidence] = useState({}); // {suspectId: Set<evidenceId>}
  const [activeView, setActiveView] = useState('briefing'); // briefing | scene | suspects | accuse | <suspectId>
  const [busy, setBusy] = useState(false);
  const [timer, setTimer] = useState(0);
  const [accusations, setAccusations] = useState(0);
  const [error, setError] = useState(null);
  const [evidencePicker, setEvidencePicker] = useState(null); // {suspect, onPick} when presenting
  const [accusePrompt, setAccusePrompt] = useState(null); // {suspect}
  const startTs = useRef(0);
  const { feed, push, done, reset } = useStatusFeed();

  useEffect(() => { if (opts.caseData) loadFromCase(opts.caseData, opts.poolId); }, []);

  useEffect(() => {
    if (phase !== 'playing') return;
    const id = setInterval(() => setTimer(Math.floor((Date.now() - startTs.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, [phase]);

  const loadFromCase = (data, poolIdInput) => {
    setCaseFile(data); setPoolId(poolIdInput || null);
    setInterviewed({}); setCollectedEvidence([]); setPresentedEvidence({});
    setAccusations(0); setTimer(0); setActiveView('briefing');
    setPortraits(data._portraits || {});
    setSceneImage(data._sceneImage || null);
    startTs.current = Date.now();
    setPhase('playing');

    // Generar escena + retratos en paralelo, un único poolUpdate al final
    // para evitar race condition entre PUTs.
    if (CC.config.hasOpenAI) {
      const jobs = [];

      if (data.sceneImagePrompt && !data._sceneImage) {
        jobs.push(
          CC.image({ prompt: `${data.sceneImagePrompt}. Vintage detective crime scene photograph, sepia, dimly lit, film grain, no text.`, quality: 'low', size: '1024x1024' })
            .then((img) => {
              setSceneImage(img);
              data._sceneImage = img;
            })
            .catch((e) => console.warn('scene err', e))
        );
      }

      if (!data._portraits || Object.keys(data._portraits).length < data.suspects.length) {
        const have = new Set(Object.keys(data._portraits || {}));
        const todo = data.suspects.filter(s => s.portraitPrompt && !have.has(s.id));
        todo.forEach(s => {
          jobs.push(
            CC.image({ prompt: s.portraitPrompt, quality: 'low', size: '1024x1024' })
              .then((url) => {
                data._portraits = { ...(data._portraits || {}), [s.id]: url };
                setPortraits((p) => ({ ...p, [s.id]: url }));
              })
              .catch((e) => console.warn('portrait err', s.id, e))
          );
        });
      }

      if (jobs.length > 0 && poolIdInput) {
        Promise.all(jobs).then(() => CC.poolUpdate('criminal', poolIdInput, data));
      }
    }
  };

  const start = async () => {
    setPhase('loading'); setError(null); reset();
    try {
      const setting = CC.pick(CRIME_SETTINGS);
      push(`Escenario: ${setting}`); done();
      push('Convocando sospechosos y trazando coartadas');
      const sys = `Eres un escritor de misterio policiaco en español, al estilo Agatha Christie. Diseñas casos cerrados donde la evidencia, las coartadas y las reacciones del culpable encajan como un mecanismo de relojería. Respondes SOLO con JSON válido, sin texto antes ni después.`;
      const N_susp = difficulty === 'fácil' ? 3 : 4;
      const N_ev = difficulty === 'fácil' ? 4 : difficulty === 'medio' ? 5 : 6;
      const prompt = `Diseña un caso de asesinato JUGABLE en español, ambientado en: ${setting}. Dificultad: ${difficulty}.

Devuelve EXACTAMENTE este JSON:
{
  "title": "Título de novela negra (4-6 palabras)",
  "intro": "Briefing tipo novela: dónde, quién es la víctima, modus operandi aparente, por qué te llaman a ti. 4-5 frases.",
  "victim": {
    "name": "Nombre Apellido",
    "description": "1 frase con rol social y carácter",
    "timeOfDeath": "Hora aproximada (ej: 'entre las 22:00 y las 23:30')",
    "causeOfDeath": "Causa aparente (1 frase)"
  },
  "sceneImagePrompt": "Prompt MUY detallado en INGLÉS para gpt-image-1 de la ESCENA DEL CRIMEN. Tipo fotografía forense vintage: 'a [setting], the body of [victim] lying on the [floor/desk], [pose details]. Surrounding objects: [evidence 1 at upper-left], [evidence 2 on the table center-right], [evidence 3 near the window]…'. Describe la posición espacial de CADA evidencia con detalle, para que la imagen coincida con los 'position' del campo evidence. Estilo final: 'vintage 1930s crime scene photograph, sepia tones, dimly lit, dramatic shadows, film grain, no text, no captions'.",
  "evidence": [
    {
      "id": "kebab-id",
      "name": "Nombre breve de la evidencia",
      "shortDesc": "1 frase: qué es y dónde se encontró",
      "examineText": "Lo que un detective experimentado deduce al examinar. 2-3 frases. Puede incluir detalles cruciales (iniciales, manchas, marcas).",
      "position": [x, y, w, h],
      "significance": "alta" o "media" o "baja"
    }
  ],
  "suspects": [
    {
      "id": "kebab-id",
      "name": "Nombre Apellido",
      "role": "Rol (mayordomo, prima de la víctima, médico…)",
      "shortDesc": "Una frase con su personalidad",
      "alibi": "Su coartada (qué dice que estaba haciendo)",
      "motive": "(GM) Su motivo (no se cita literal)",
      "initialStatement": "Lo que dice al ser interrogado por primera vez (2-3 frases)",
      "portraitPrompt": "Prompt en INGLÉS para retrato vintage: 'vintage 1930s formal portrait, sepia photograph, [descripción física breve], [emoción facial], soft studio light, film grain, no text'",
      "isCulprit": false,
      "reactionsToEvidence": {
        "<evidence-id-1>": "Cómo reacciona ESTE sospechoso a que le muestres ESTA evidencia concreta (2-3 frases en primera persona). INOCENTES: explican con naturalidad, quizá nerviosos pero coherentes. CULPABLE: ante evidencia clave, se contradice sutilmente, sus emociones no encajan, o intenta cambiar de tema.",
        "<evidence-id-2>": "..."
      }
    }
  ],
  "culpritExplanation": "Resolución completa: quién fue, cómo, qué evidencia lo delata y qué inconsistencia en su declaración lo confirma. 3-4 frases.",
  "redHerring": "Una pista que parece incriminar a un inocente pero tiene explicación inocente. 1-2 frases."
}

REGLAS:
- ${N_susp} sospechosos. EXACTAMENTE uno con isCulprit: true.
- ${N_ev} evidencias en total.
- TODOS los sospechosos deben tener reactionsToEvidence con TODAS las evidencias como claves.
- "position" de cada evidencia: [x, y, w, h] en porcentajes (0-100). Reparte por la imagen sin solapar.
- El culpable se delata por:
  (a) Reacción inconsistente ante UNA evidencia concreta (la "clave")
  (b) Contradicción entre su initialStatement y lo que reacciona ante la evidencia clave
- Los nombres deben encajar con el setting (mezcla orígenes según ambiente).
- "examineText" puede ser largo y atmosférico, lleno de detalles.`;

      const data = await CC.chatJSON({
        system: sys,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.95,
      });
      done();
      push('Plantando evidencias en la escena');
      if (!data.suspects || data.suspects.length < 3) throw new Error('Respuesta incompleta');
      if (!Array.isArray(data.evidence)) data.evidence = [];
      const culprits = data.suspects.filter(s => s.isCulprit).length;
      if (culprits !== 1) {
        data.suspects.forEach(s => s.isCulprit = false);
        data.suspects[Math.floor(Math.random() * data.suspects.length)].isCulprit = true;
      }
      done();
      push('Revelando retratos (en segundo plano)');
      push('Archivando para uso futuro');
      const saved = await CC.poolSave('criminal', data, difficulty, data.title);
      if (saved?.id) CC.markPlayed('criminal', saved.id);
      done();
      push('Levantando el cadáver');
      await new Promise(r => setTimeout(r, 350));
      done();
      loadFromCase(data, saved?.id);
    } catch (e) {
      console.error(e);
      setError(e.message || 'Error generando caso');
      setPhase('setup');
    }
  };

  // ─── Examinar evidencia ──────────────────────────────────────────────
  const examineEvidence = (ev) => {
    setExaminedEvidence(ev);
    if (!collectedEvidence.includes(ev.id)) {
      setCollectedEvidence((c) => [...c, ev.id]);
      CC.toast(`Has recogido: ${ev.name}`, 'ok', 2000);
    }
  };

  // ─── Interrogar (chat libre) ─────────────────────────────────────────
  const askSuspect = async (suspect, question) => {
    setBusy(true);
    try {
      const sys = `Estás interpretando a ${suspect.name} (${suspect.role}) en un interrogatorio en español.
Contexto interno (NO lo cites literalmente):
- Caso: ${caseFile.intro}
- Víctima: ${caseFile.victim.name}
- Tu coartada: ${suspect.alibi}
- Tu motivo: ${suspect.motive}
- ¿Culpable? ${suspect.isCulprit ? 'SÍ. Mientes sutilmente, desvías sospechas. Si te aprietan, te pones nervioso pero no confiesas.' : 'NO. Eres inocente. Puedes estar incómodo, evasivo o resentido según tu personalidad.'}

Responde en primera persona, 1-3 frases, tono propio del personaje. NUNCA confieses ni digas "soy el asesino" o "no lo soy".`;

      const history = (interviewed[suspect.id] || []).slice(-10);
      const messages = history.map(m => ({ role: m.role, content: m.content }));
      messages.push({ role: 'user', content: question });
      const answer = await CC.chat({ system: sys, messages, temperature: 0.85 });

      setInterviewed((iv) => ({
        ...iv,
        [suspect.id]: [...(iv[suspect.id] || []),
          { role: 'user', content: question },
          { role: 'assistant', content: answer },
        ],
      }));
    } catch (e) {
      CC.toast('Error al interrogar: ' + e.message, 'bad');
    } finally { setBusy(false); }
  };

  // ─── Presentar evidencia ─────────────────────────────────────────────
  const presentEvidence = (suspect, evidenceId) => {
    const ev = caseFile.evidence.find(e => e.id === evidenceId);
    if (!ev) return;
    const reaction = suspect.reactionsToEvidence?.[evidenceId];
    const message = `Le muestras: ${ev.name}`;
    const response = reaction || '(Mira la evidencia en silencio, sin decir nada que la interpretes con claridad.)';
    setInterviewed((iv) => ({
      ...iv,
      [suspect.id]: [...(iv[suspect.id] || []),
        { role: 'user', content: message, evidence: ev.name },
        { role: 'assistant', content: response, isReaction: true },
      ],
    }));
    setPresentedEvidence((pe) => ({
      ...pe,
      [suspect.id]: new Set([...(pe[suspect.id] || []), evidenceId]),
    }));
  };

  // ─── Acusar ──────────────────────────────────────────────────────────
  const MAX_ACCUSATIONS = difficulty === 'difícil' ? 1 : difficulty === 'medio' ? 2 : 3;

  const openAccuse = (suspect) => setAccusePrompt({ suspect, keyEvId: null });
  const closeAccuse = () => setAccusePrompt(null);

  const accuse = (suspect, keyEvId) => {
    setAccusePrompt(null);
    const newAccs = accusations + 1;
    setAccusations(newAccs);
    if (suspect.isCulprit) {
      setPhase('won');
      const duration = Math.floor((Date.now() - startTs.current) / 1000);
      const keyEv = caseFile.evidence.find(e => e.id === keyEvId);
      const namedKeyRight = keyEv?.significance === 'alta';
      CC.addHistory({ gameId: 'criminal', won: true, difficulty, duration, summary: `${caseFile.title} — acusaste a ${suspect.name}` });
      CC.recordPlay('criminal', poolId, { duration, hints: accusations, won: true });
      CC.grantMedal('first-solve');
      CC.grantMedal('detective');
      if (accusations === 0) CC.grantMedal('detective-perfect');
      const perfectBonus = (accusations === 0 ? 250 : 0) + (namedKeyRight ? 150 : 0);
      CC.addScore(CC.calcScore({ difficulty, duration, hints: accusations, perfectBonus }));
      CC.toast(namedKeyRight ? '¡Resuelto con la prueba clave!' : '¡Resuelto!', 'ok');
    } else {
      if (newAccs >= MAX_ACCUSATIONS) {
        setPhase('lost');
        const duration = Math.floor((Date.now() - startTs.current) / 1000);
        CC.addHistory({ gameId: 'criminal', won: false, difficulty, duration, summary: `${caseFile.title} — culpable se escapó` });
        CC.toast('Sin más oportunidades. El verdadero culpable se ha esfumado.', 'bad', 5000);
      } else {
        CC.toast(`${suspect.name} era inocente. Te quedan ${MAX_ACCUSATIONS - newAccs} oportunidad${MAX_ACCUSATIONS - newAccs === 1 ? '' : 'es'}.`, 'bad', 4500);
      }
    }
  };

  // ─── Pantallas ──────────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <GameShell title="Caso Criminal" subtitle="Hay un cadáver y varias versiones" onExit={onExit}>
        <GameSetup
          gameId="criminal"
          intro={<>
            <p>Te llaman a la escena de un crimen. Examina la escena buscando pruebas, interroga a los sospechosos, y muéstrales las pruebas para ver cómo reaccionan. Cuando estés segura, acusa.</p>
            <p className="muted tiny">Las reacciones del culpable ante la evidencia clave revelan su mentira. Léelas con cuidado.</p>
          </>}
          difficulty={difficulty}
          setDifficulty={setDifficulty}
          onStartNew={start}
          onStartFromPool={loadFromCase}
          error={error}
          disabled={!CC.config.hasOllama}
          generationCost="~5-6¢ (texto + escena + retratos)"
        />
      </GameShell>
    );
  }

  if (phase === 'loading') {
    return (
      <GameShell title="Caso Criminal" onExit={onExit}>
        <LiveLoader feed={feed} title="Levantando el caso" idle={['Convocando sospechosos', 'Plantando pistas', 'Levantando el cadáver']} />
      </GameShell>
    );
  }

  const tabs = [
    ['briefing', '📋 Expediente'],
    ['scene',    `🔍 Escena (${collectedEvidence.length}/${caseFile.evidence.length})`],
    ['suspects', `👤 Sospechosos`],
    ['accuse',   '⚖ Acusar'],
  ];

  return (
    <GameShell
      title={caseFile.title}
      subtitle="Caso Criminal"
      onExit={onExit}
      difficulty={difficulty}
      timer={timer}
      right={
        <div className="row gap-sm">
          <span className="pill" title="Evidencias recogidas">🔍 {collectedEvidence.length}/{caseFile.evidence.length}</span>
          {accusations > 0 && <span className="pill" style={{ background: 'var(--stamp-red)', color: 'var(--paper)' }}>⚠ acusaciones {accusations}/{MAX_ACCUSATIONS}</span>}
        </div>
      }
    >
      <div className="row gap-sm wrap" style={{ marginBottom: '1.5rem' }}>
        {tabs.map(([k, label]) => (
          <button key={k}
            className={`navlink ${activeView === k || (k === 'suspects' && caseFile.suspects.some(s => s.id === activeView)) ? 'active' : ''}`}
            onClick={() => setActiveView(k)}>{label}</button>
        ))}
      </div>

      {activeView === 'briefing' && <BriefingView caseFile={caseFile} />}
      {activeView === 'scene' && (
        <CrimeSceneView
          caseFile={caseFile}
          sceneImage={sceneImage}
          collectedEvidence={collectedEvidence}
          onExamine={examineEvidence}
        />
      )}
      {activeView === 'suspects' && (
        <SuspectGrid suspects={caseFile.suspects} portraits={portraits} onOpen={(s) => setActiveView(s.id)} />
      )}
      {activeView === 'accuse' && (
        <AccusePanel
          suspects={caseFile.suspects} portraits={portraits} onAccuse={openAccuse}
          phase={phase} caseFile={caseFile} accusations={accusations} timer={timer} maxAccusations={MAX_ACCUSATIONS}
          onReplay={() => { setPhase('setup'); setCaseFile(null); setPoolId(null); setSceneImage(null); }}
          poolId={poolId} difficulty={difficulty}
        />
      )}
      {caseFile.suspects.find(s => s.id === activeView) && (
        <InterrogationView
          suspect={caseFile.suspects.find(s => s.id === activeView)}
          portrait={portraits[activeView]}
          history={interviewed[activeView] || []}
          collectedEvidence={collectedEvidence}
          caseFile={caseFile}
          presentedEvidence={presentedEvidence[activeView] || new Set()}
          onAsk={askSuspect}
          onPresent={(evId) => presentEvidence(caseFile.suspects.find(s => s.id === activeView), evId)}
          busy={busy}
          onBack={() => setActiveView('suspects')}
          locked={phase === 'won'}
        />
      )}

      {examinedEvidence && (
        <EvidenceModal ev={examinedEvidence} onClose={() => setExaminedEvidence(null)} />
      )}

      {accusePrompt && (
        <AccuseModal
          suspect={accusePrompt.suspect}
          collectedEvidence={collectedEvidence}
          caseFile={caseFile}
          accusations={accusations}
          maxAccusations={MAX_ACCUSATIONS}
          onCancel={closeAccuse}
          onConfirm={(keyEvId) => accuse(accusePrompt.suspect, keyEvId)}
        />
      )}
    </GameShell>
  );
}

// ─── Modal de acusación con elección de prueba clave ───────────────────
function AccuseModal({ suspect, collectedEvidence, caseFile, accusations, maxAccusations, onCancel, onConfirm }) {
  const [keyEvId, setKeyEvId] = useState(null);
  const evList = caseFile.evidence.filter(e => collectedEvidence.includes(e.id));
  const remaining = maxAccusations - accusations;
  return (
    <Modal onClose={onCancel} title={`Acusar a ${suspect.name}`}>
      <div className="font-typewriter tiny" style={{ letterSpacing: '.2em', color: 'var(--ink-faded)' }}>FORMALIZAR ACUSACIÓN</div>
      <p className="muted" style={{ marginTop: '.4rem' }}>
        Una acusación falsa marca tu expediente. Te quedan <strong>{remaining}</strong> oportunidad{remaining === 1 ? '' : 'es'} en total.
      </p>
      <div className="paper aged" style={{ padding: '.9rem 1.1rem', marginTop: '.8rem' }}>
        <div className="row gap-sm" style={{ alignItems: 'center' }}>
          <div style={{ fontSize: 26 }}>👤</div>
          <div>
            <div className="font-display">{suspect.name}</div>
            <div className="tiny muted">{suspect.role}</div>
          </div>
        </div>
      </div>
      <div style={{ marginTop: '1rem' }}>
        <label>¿Cuál es la prueba clave que lo delata?</label>
        <div className="tiny muted" style={{ marginBottom: '.5rem' }}>Si aciertas, bonificación extra. Si no la tienes recogida, puedes saltarte el paso.</div>
        <div className="col gap-sm" style={{ maxHeight: '38vh', overflowY: 'auto' }}>
          {evList.length === 0 && <p className="muted tiny">No has recogido evidencias todavía.</p>}
          {evList.map(ev => (
            <button key={ev.id}
              onClick={() => setKeyEvId(keyEvId === ev.id ? null : ev.id)}
              className="paper"
              style={{
                padding: '.6rem .8rem', textAlign: 'left',
                background: keyEvId === ev.id ? 'rgba(180,80,40,.18)' : 'var(--paper-2)',
                border: `2px solid ${keyEvId === ev.id ? 'var(--stamp-red)' : 'var(--paper-edge)'}`,
                cursor: 'pointer',
              }}>
              <div className="font-typewriter" style={{ fontSize: '.85rem' }}>{ev.name}</div>
              <div className="tiny muted">{ev.shortDesc}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="row gap-sm" style={{ marginTop: '1.2rem', justifyContent: 'flex-end' }}>
        <button className="btn ghost" onClick={onCancel}>Cancelar</button>
        <button className="btn red" onClick={() => onConfirm(keyEvId)}>
          {keyEvId ? 'Acusar con prueba' : 'Acusar sin prueba clave'}
        </button>
      </div>
    </Modal>
  );
}

// ─── Briefing ──────────────────────────────────────────────────────────
function BriefingView({ caseFile }) {
  const v = caseFile.victim || {};
  return (
    <Paper aged style={{ maxWidth: 800, position: 'relative' }}>
      <Stamp solid style={{ position: 'absolute', top: '1.5rem', right: '1.5rem' }}>CONFIDENCIAL</Stamp>
      <div className="font-typewriter tiny" style={{ letterSpacing: '.2em', color: 'var(--ink-faded)' }}>EXPEDIENTE</div>
      <h2 className="font-display" style={{ marginTop: '.3rem' }}>{caseFile.title}</h2>
      <p style={{ marginTop: '1rem' }}>{caseFile.intro}</p>
      <div className="divider dashed"></div>
      <h4 className="font-display">Víctima</h4>
      <p><strong>{v.name}</strong> — {v.description}</p>
      {v.timeOfDeath && <p className="tiny"><span className="muted">Hora de la muerte:</span> {v.timeOfDeath}</p>}
      {v.causeOfDeath && <p className="tiny"><span className="muted">Causa:</span> {v.causeOfDeath}</p>}
    </Paper>
  );
}

// ─── Escena del crimen ─────────────────────────────────────────────────
function CrimeSceneView({ caseFile, sceneImage, collectedEvidence, onExamine }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(280px, 1fr)', gap: '1.5rem' }}>
      <Paper aged style={{ padding: '.6rem' }}>
        {sceneImage ? (
          <div className="image-with-hotspots" style={{ width: '100%' }}>
            <img src={sceneImage} alt="Escena del crimen" style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 2 }} />
            {caseFile.evidence.filter(e => Array.isArray(e.position) && e.position.length === 4).map((ev, i) => {
              const [x, y, w, h] = ev.position;
              const collected = collectedEvidence.includes(ev.id);
              return (
                <div key={ev.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Evidencia ${ev.name}${collected ? ', recogida' : ''}`}
                  className={`hotspot ${collected ? 'examined' : ''}`}
                  style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` }}
                  onClick={() => onExamine(ev)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onExamine(ev); } }}>
                  <div className="pin">{collected ? '✓' : i + 1}</div>
                  <div className="label">{ev.name}{collected ? ' · recogido' : ''}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ aspectRatio: '4/3', background: 'var(--paper-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Loader msg="revelando la escena" />
          </div>
        )}
        <div className="tiny muted center-text" style={{ marginTop: '.5rem', fontFamily: 'Caveat, cursive', fontSize: '1.05rem' }}>
          la escena del crimen · pulsa las marcas para examinar
        </div>
      </Paper>

      <Paper>
        <h3 className="font-display">Evidencias recogidas</h3>
        {collectedEvidence.length === 0 && <p className="muted tiny">Aún no has recogido nada. Pulsa las marcas rojas de la imagen.</p>}
        <div className="col gap-sm">
          {caseFile.evidence.filter(e => collectedEvidence.includes(e.id)).map((ev) => (
            <div key={ev.id} className="paper" style={{ padding: '.6rem .8rem', background: 'var(--paper-2)', cursor: 'pointer' }} onClick={() => onExamine(ev)}>
              <div className="font-typewriter" style={{ fontSize: '.85rem', letterSpacing: '.05em' }}>
                {ev.name}
                {ev.significance === 'alta' && <Stamp kind="red" style={{ marginLeft: '.4rem', fontSize: '.5rem', padding: '.05rem .25rem', transform: 'none' }}>clave</Stamp>}
              </div>
              <div className="tiny muted">{ev.shortDesc}</div>
            </div>
          ))}
        </div>
        {collectedEvidence.length > 0 && (
          <div className="divider dashed" />
        )}
        <div className="tiny muted">
          Cuando interrogues a un sospechoso, podrás <strong>presentarle</strong> cualquier evidencia recogida y ver cómo reacciona.
        </div>
      </Paper>
    </div>
  );
}

// ─── Modal de evidencia ────────────────────────────────────────────────
function EvidenceModal({ ev, onClose }) {
  return (
    <Modal onClose={onClose} title={ev.name}>
      <div className="font-typewriter tiny" style={{ letterSpacing: '.2em', color: 'var(--ink-faded)' }}>EVIDENCIA</div>
      <p className="muted" style={{ marginTop: '.3rem' }}>{ev.shortDesc}</p>
      <div className="paper aged" style={{ padding: '1rem 1.2rem', marginTop: '.8rem' }}>
        <p style={{ margin: 0 }}>{ev.examineText}</p>
        {ev.significance && (
          <div style={{ marginTop: '.6rem' }}>
            <Stamp kind={ev.significance === 'alta' ? 'red' : ev.significance === 'media' ? 'blue' : 'green'} style={{ fontSize: '.55rem' }}>
              Relevancia {ev.significance}
            </Stamp>
          </div>
        )}
      </div>
      <p className="tiny muted" style={{ marginTop: '.8rem' }}>
        Esta evidencia ya está en tu expediente. Podrás presentarla a cualquier sospechoso durante el interrogatorio.
      </p>
    </Modal>
  );
}

// ─── Cuadrícula de sospechosos ─────────────────────────────────────────
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

// ─── Interrogatorio (con presentar evidencia) ──────────────────────────
function InterrogationView({ suspect, portrait, history, collectedEvidence, caseFile, presentedEvidence, onAsk, onPresent, busy, onBack, locked }) {
  const [q, setQ] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const submit = (e) => { e?.preventDefault(); if (!q.trim() || busy) return; onAsk(suspect, q.trim()); setQ(''); };

  // Mostrar declaración inicial al principio si no hay historial
  const initialBubble = history.length === 0
    ? [{ role: 'assistant', content: suspect.initialStatement }]
    : [];
  const log = [...initialBubble, ...history];

  const presets = [
    '¿Dónde estaba cuando ocurrió?',
    '¿Qué relación tenía con la víctima?',
    '¿Vio a alguien sospechoso?',
    '¿Algo más que quiera contarnos?',
  ];

  const evidenceNotYetPresented = caseFile.evidence.filter(ev =>
    collectedEvidence.includes(ev.id) && !presentedEvidence.has(ev.id)
  );

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

        <div className="divider dashed"></div>
        <div className="font-typewriter tiny" style={{ letterSpacing: '.15em', color: 'var(--ink-faded)' }}>COARTADA DECLARADA</div>
        <p className="tiny" style={{ marginTop: '.3rem', fontStyle: 'italic' }}>{suspect.alibi}</p>
      </div>

      <Paper>
        <div className="between" style={{ marginBottom: '.5rem' }}>
          <h3 className="font-display" style={{ margin: 0 }}>Interrogatorio</h3>
          {collectedEvidence.length > 0 && !locked && (
            <button className="btn red small" onClick={() => setShowPicker(true)} disabled={busy || evidenceNotYetPresented.length === 0}>
              📁 Presentar evidencia {evidenceNotYetPresented.length > 0 ? `(${evidenceNotYetPresented.length})` : ''}
            </button>
          )}
        </div>

        <div className="chat-log">
          {log.map((m, i) => (
            <React.Fragment key={i}>
              {m.role === 'user' && (
                <div className={`bubble me ${m.evidence ? 'with-evidence' : ''}`}>
                  {m.evidence ? <><span style={{ fontSize: '.7rem', letterSpacing: '.1em', display: 'block', opacity: .8, marginBottom: 2 }}>📁 EVIDENCIA</span>{m.content}</> : m.content}
                </div>
              )}
              {m.role === 'assistant' && (
                <div className={`bubble them ${m.isReaction ? 'reaction' : ''}`} style={m.isReaction ? { borderLeft: '3px solid var(--stamp-red)', background: 'rgba(180,80,40,.06)' } : undefined}>
                  {m.isReaction && <span style={{ fontSize: '.65rem', letterSpacing: '.15em', display: 'block', opacity: .7, marginBottom: 2, fontFamily: 'Special Elite, monospace', textTransform: 'uppercase' }}>reacción</span>}
                  {m.content}
                </div>
              )}
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

      {showPicker && (
        <Modal onClose={() => setShowPicker(false)} title={`Mostrar a ${suspect.name}…`}>
          <p className="tiny muted">Escoge una evidencia recogida. Verás su reacción.</p>
          <div className="col gap-sm" style={{ marginTop: '.8rem' }}>
            {caseFile.evidence.filter(ev => collectedEvidence.includes(ev.id)).map((ev) => {
              const already = presentedEvidence.has(ev.id);
              return (
                <button key={ev.id} className="paper" disabled={already} onClick={() => { onPresent(ev.id); setShowPicker(false); }} style={{
                  padding: '.7rem .9rem', textAlign: 'left',
                  background: already ? 'var(--paper-3)' : 'var(--paper-2)',
                  opacity: already ? 0.6 : 1,
                  cursor: already ? 'not-allowed' : 'pointer',
                  border: '1px solid var(--paper-edge)',
                }}>
                  <div className="font-typewriter" style={{ fontSize: '.85rem', letterSpacing: '.05em' }}>
                    {ev.name}
                    {already && <Stamp kind="green" style={{ marginLeft: '.4rem', fontSize: '.55rem', padding: '.05rem .3rem', transform: 'none' }}>ya mostrada</Stamp>}
                    {ev.significance === 'alta' && !already && <Stamp kind="red" style={{ marginLeft: '.4rem', fontSize: '.55rem', padding: '.05rem .3rem', transform: 'none' }}>clave</Stamp>}
                  </div>
                  <div className="tiny muted">{ev.shortDesc}</div>
                </button>
              );
            })}
            {collectedEvidence.length === 0 && (
              <p className="muted tiny">Aún no has recogido ninguna evidencia. Vuelve a la escena.</p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Panel de acusación + cierre ───────────────────────────────────────
function AccusePanel({ suspects, portraits, onAccuse, phase, caseFile, accusations, timer, maxAccusations = 99, onReplay, poolId, difficulty }) {
  if (phase === 'lost') {
    const culprit = suspects.find(s => s.isCulprit);
    return (
      <Paper aged style={{ maxWidth: 760 }}>
        <div className="center" style={{ flexDirection: 'column', textAlign: 'center', padding: '1rem' }}>
          <Stamp kind="red" solid className="entrance" style={{ fontSize: '1rem', padding: '.5rem 1.2rem' }}>CASO ARCHIVADO SIN RESOLVER</Stamp>
          <h2 className="font-display" style={{ marginTop: '1rem' }}>El verdadero culpable era {culprit.name}</h2>
          <p style={{ maxWidth: 560 }}>{caseFile.culpritExplanation}</p>
          <div className="muted tiny" style={{ marginTop: '.6rem' }}>{accusations} acusación{accusations === 1 ? '' : 'es'} fallida{accusations === 1 ? '' : 's'} · agotaste tus oportunidades</div>
          <button className="btn" style={{ marginTop: '1.5rem' }} onClick={onReplay}>Otro caso</button>
        </div>
      </Paper>
    );
  }
  if (phase === 'won') {
    const culprit = suspects.find(s => s.isCulprit);
    return (
      <Paper aged style={{ maxWidth: 760 }}>
        <div className="center" style={{ flexDirection: 'column', textAlign: 'center', padding: '1rem' }}>
          <Stamp solid style={{ fontSize: '1rem', padding: '.5rem 1.2rem' }}>CASO RESUELTO</Stamp>
          <h2 className="font-display" style={{ marginTop: '1rem' }}>{culprit.name} era culpable</h2>
          <p style={{ maxWidth: 560 }}>{caseFile.culpritExplanation}</p>
          <div className="muted tiny" style={{ marginTop: '.6rem' }}>Resuelto en {CC.fmtTime(timer)} con {accusations} acusación{accusations === 1 ? '' : 'es'} fallida{accusations === 1 ? '' : 's'}</div>
          <ScoreReveal difficulty={difficulty} duration={timer} hints={accusations} perfectBonus={accusations === 0 ? 250 : 0} extraNote={accusations === 0 ? '🔍 acusación perfecta' : null} />
          <Leaderboard gameId="criminal" caseId={poolId} />
          <ShareBar gameId="criminal" poolId={poolId} caseData={caseFile} title={caseFile.title} difficulty={difficulty} />
          <button className="btn" style={{ marginTop: '1.5rem' }} onClick={onReplay}>Otro caso</button>
        </div>
      </Paper>
    );
  }
  const remaining = maxAccusations - accusations;
  return (
    <div>
      <Paper style={{ marginBottom: '1.5rem' }}>
        <p>Cuando estés segura, elige a quién acusar. Tienes <strong>{remaining}</strong> oportunidad{remaining === 1 ? '' : 'es'} restante{remaining === 1 ? '' : 's'}. Si las agotas, el caso se archiva.</p>
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
