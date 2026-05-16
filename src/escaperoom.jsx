// ─── Cuarto Cerrado — Escape Room narrativo (con inventario y cadena) ──
// Habitación cerrada con imagen como protagonista. Cadena de objetos:
// examinar → coger items → usar items → desbloquear contenido → encontrar
// código → escapar.

// Frases ambientales — narrador suelta una cada cierto rato para crear presión
const ESCAPE_AMBIENT = [
  'El reloj de pared sigue su tictac, indiferente.',
  'Algo cruje en el techo. ¿La madera vieja, o pasos?',
  'La luz parpadea un instante. Vuelve, pero más débil.',
  'Te parece oler humo. Probablemente no es nada.',
  'Una corriente helada te eriza la nuca.',
  'En algún sitio gotea agua. No la habías oído antes.',
  'Te das cuenta de que llevas un rato conteniendo la respiración.',
  'El polvo en suspensión parece quieto. Demasiado quieto.',
  'Crees oír una voz al otro lado de la puerta. Calla en cuanto te concentras.',
  'La habitación parece más pequeña que cuando entraste.',
  'Un libro se desliza solo de la estantería. Cae con un golpe seco.',
  'El silencio se hace tan denso que duele.',
];

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
  'el observatorio de un astrónomo loco',
  'el taller secreto de un falsificador',
];

function EscapeGame({ opts = {}, onExit }) {
  const [phase, setPhase] = useState(opts.caseData ? 'loading' : 'setup');
  const [difficulty, setDifficulty] = useState(opts.difficulty || 'medio');
  const [room, setRoom] = useState(null);
  const [poolId, setPoolId] = useState(null);
  const [objectStates, setObjectStates] = useState({}); // {objId: 'examined' | 'unlocked'}
  const [inventory, setInventory] = useState([]); // [itemId]
  const [selectedObject, setSelectedObject] = useState(null);
  const [chatLog, setChatLog] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [image, setImage] = useState(null);
  const [draggedItem, setDraggedItem] = useState(null);  // id of item being dragged from inventory
  const [timer, setTimer] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState(null);
  const [narratorOpen, setNarratorOpen] = useState(true);
  const startTs = useRef(0);
  const { feed, push, done, reset } = useStatusFeed();

  useEffect(() => { if (opts.caseData) loadFromCase(opts.caseData, opts.poolId); }, []);

  useEffect(() => {
    if (phase !== 'playing') return;
    const id = setInterval(() => setTimer(Math.floor((Date.now() - startTs.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, [phase]);

  // Ambiental — cada 75-110s suelta una frase atmosférica
  useEffect(() => {
    if (phase !== 'playing') return;
    let cancelled = false;
    const fire = () => {
      if (cancelled) return;
      const line = CC.pick(ESCAPE_AMBIENT);
      setChatLog((log) => [...log, { who: 'them', text: `« ${line} »`, ambient: true }]);
    };
    const next = () => 75000 + Math.floor(Math.random() * 35000);
    let t = setTimeout(function loop() {
      fire();
      t = setTimeout(loop, next());
    }, next());
    return () => { cancelled = true; clearTimeout(t); };
  }, [phase]);

  const loadFromCase = (data, poolIdInput) => {
    setRoom(data);
    setPoolId(poolIdInput || null);
    setObjectStates({}); setInventory([]); setSelectedObject(null);
    setChatLog([{ who: 'them', text: data.intro }]);
    setHintsUsed(0); setTimer(0); setAnswer(''); setImage(null);
    startTs.current = Date.now();
    setPhase('playing');
    if (data._image) { setImage(data._image); return; }
    if (CC.config.hasOpenAI && data.imagePrompt) {
      CC.image({ prompt: `${data.imagePrompt}. Cinematic, photograph, warm tungsten light, film grain, mysterious atmosphere, no text, no captions.`, quality: 'low' })
        .then((img) => {
          setImage(img); data._image = img;
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
      push('Trazando la cadena de puzzles');
      const sys = `Eres un game master experto de escape rooms en español. Diseñas habitaciones cerradas con CADENAS de dependencias entre objetos: examinar A da un item, ese item desbloquea B, B revela una pista del código final. Responde SOLO con JSON válido, sin texto antes ni después.`;
      const N_obj = difficulty === 'fácil' ? 5 : difficulty === 'medio' ? 6 : 7;
      const N_items = difficulty === 'fácil' ? 1 : difficulty === 'medio' ? 2 : 3;
      const prompt = `Diseña una escape room JUGABLE en español ambientada en: ${theme}.

Dificultad: ${difficulty}. Debe tener:
- ${N_obj} objetos en la habitación, cada uno con posición sobre la imagen
- ${N_items} items en la cadena de dependencias
- Un código final (palabra o número, en minúsculas, sin tildes) que abre la salida
- Cadena coherente: examinar un objeto da un item, otro objeto necesita ese item para revelar pistas, y combinando todas las pistas se obtiene el código final.

Devuelve EXACTAMENTE este JSON:
{
  "title": "Título evocador (5-7 palabras)",
  "intro": "Texto atmosférico de 3-4 frases. Describe la habitación, por qué está cerrada, qué busca el jugador.",
  "imagePrompt": "Prompt MUY detallado en INGLÉS para gpt-image-1. IMPORTANTÍSIMO: describe la posición espacial de CADA objeto en lenguaje claro ('in the upper-left', 'on the wooden desk in the center', 'on the back wall above the fireplace', 'on the floor near bottom-right'). Estilo al final: 'vintage detective room, dimly lit, cinematic photograph, warm tungsten light, film grain, no text, no captions'.",
  "items": [
    {"id": "kebab-item-id", "name": "Nombre del item", "icon": "🗝️", "desc": "1 frase descriptiva"}
  ],
  "objects": [
    {
      "id": "kebab-id-unico",
      "name": "Nombre breve",
      "shortDesc": "1 frase visible al pasar el ratón",
      "examineText": "Lo que descubre al examinar la primera vez. Atmosférico, 2-3 frases. Puede contener pistas, números, palabras visibles. NO incluyas la solución directa de objetos que requieren item.",
      "position": [x, y, w, h],
      "givesItem": null,
      "requiresItem": null,
      "unlockedRevealText": null,
      "unlockedGivesItem": null
    }
  ],
  "puzzles": [
    {"desc": "(GM) Descripción del puzzle", "solutionHint": "(GM) Pista sutil"}
  ],
  "finalAnswer": "respuesta-final-minusculas",
  "finalAnswerHint": "(GM) Cómo se combina la información",
  "winText": "Texto narrativo de 2-3 frases al escapar."
}

REGLAS:
- "position": [x, y, w, h] en porcentajes (0-100) sobre la imagen. NO solapados. Reparte por toda la escena.
- "givesItem": si este objeto entrega un item al examinarse, pon el id del item. null si no.
- "requiresItem": id del item necesario para "desbloquear" más contenido. null si no.
- "unlockedRevealText": texto adicional revelado tras usar requiresItem (debe contener pistas clave para el código). null si requiresItem es null.
- "unlockedGivesItem": item adicional ganado tras desbloquear. null si no aplica.
- Al menos UN objeto debe tener requiresItem (no es escape room si no hay desbloqueo).
- La cadena debe llevar inevitablemente al finalAnswer combinando 2-3 pistas.
- "finalAnswer" sólo en minúsculas, sin tildes, sin espacios extra.
- Los icons de items deben ser emojis variados (🗝️ 🔑 📜 📖 🕯️ 💎 ⚱️ 🗡️ 🧪 🔍 🪙 etc.).`;

      const data = await CC.chatJSON({
        system: sys,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.95,
      });
      done();
      push('Escondiendo pistas en los cajones');

      if (!data.objects || !data.finalAnswer) throw new Error('Respuesta incompleta');
      if (!Array.isArray(data.items)) data.items = [];
      done();
      push('Archivando para uso futuro');
      const saved = await CC.poolSave('escape', data, difficulty, data.title);
      if (saved?.id) CC.markPlayed('escape', saved.id);
      done();
      push('Atrancando la puerta');
      await new Promise(r => setTimeout(r, 350));
      done();
      loadFromCase(data, saved?.id);
    } catch (e) {
      console.error(e);
      setError(e.message || 'Error generando habitación');
      setPhase('setup');
    }
  };

  // ─── Interacciones ──────────────────────────────────────────────────
  // Asegura que un id de item tenga definición en room.items. Si la IA generó
  // un givesItem sin entry correspondiente, sintetizamos una para que se vea
  // en el inventario.
  const ensureItemDef = (itemId) => {
    if (!room || !itemId) return;
    const existing = (room.items || []).find(it => it.id === itemId);
    if (existing) return;
    const niceName = itemId.split(/[-_\s]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const synth = { id: itemId, name: niceName, icon: '📦', desc: 'Objeto recogido' };
    setRoom((r) => ({ ...r, items: [...(r.items || []), synth] }));
  };

  const examineObject = (obj) => {
    setSelectedObject(obj);
    // Primera vez: log + posible item
    if (!objectStates[obj.id]) {
      setObjectStates((s) => ({ ...s, [obj.id]: 'examined' }));
      setChatLog((log) => [
        ...log,
        { who: 'me',   text: `Examinar ${obj.name}` },
        { who: 'them', text: obj.examineText },
      ]);
      if (obj.givesItem && !inventory.includes(obj.givesItem)) {
        ensureItemDef(obj.givesItem);
        const item = (room.items || []).find(it => it.id === obj.givesItem);
        setInventory((inv) => [...inv, obj.givesItem]);
        const niceName = item?.name || obj.givesItem.split(/[-_\s]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        const icon = item?.icon || '📦';
        CC.toast(`Cogiste: ${icon} ${niceName}`, 'ok', 2500);
      }
    }
  };

  const useItemOn = (obj, itemId) => {
    if (obj.requiresItem !== itemId) {
      CC.toast('No encaja aquí.', 'bad', 1500);
      return;
    }
    if (objectStates[obj.id] === 'unlocked') return;
    setObjectStates((s) => ({ ...s, [obj.id]: 'unlocked' }));
    const item = (room.items || []).find(it => it.id === itemId);
    setChatLog((log) => [
      ...log,
      { who: 'me', text: `Usar ${item?.name || 'item'} en ${obj.name}` },
      { who: 'them', text: obj.unlockedRevealText || '(algo cambia, pero no consigues distinguir qué)' },
    ]);
    if (obj.unlockedGivesItem && !inventory.includes(obj.unlockedGivesItem)) {
      ensureItemDef(obj.unlockedGivesItem);
      const newItem = (room.items || []).find(it => it.id === obj.unlockedGivesItem);
      setInventory((inv) => [...inv, obj.unlockedGivesItem]);
      const niceName = newItem?.name || obj.unlockedGivesItem.split(/[-_\s]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      const icon = newItem?.icon || '📦';
      CC.toast(`Cogiste: ${icon} ${niceName}`, 'ok', 2500);
    }
  };

  const askGM = async (text) => {
    const userMsg = text.trim();
    if (!userMsg) return;
    setInput('');
    setChatLog((log) => [...log, { who: 'me', text: userMsg }]);
    setBusy(true);
    try {
      const sys = `Eres el narrador (game master) de una escape room en español. Tono atmosférico, breve (2-3 frases por respuesta). NO reveles directamente la respuesta final ni el contenido completo de objetos no examinados. Si el jugador prueba algo imposible, descríbelo con elegancia. Si pide pistas, da UNA pista sutil. Contexto interno (NO lo cites literalmente):

Título: ${room.title}
Habitación: ${room.intro}
Objetos:
${room.objects.map(o => `- ${o.name} [${o.id}]: ${o.shortDesc}. Detalle: ${o.examineText}${o.requiresItem ? ` REQUIERE ITEM ${o.requiresItem}. Al desbloquear: ${o.unlockedRevealText}` : ''}${o.givesItem ? ` DA ITEM: ${o.givesItem}` : ''}`).join('\n')}
Items: ${room.items.map(i => `${i.id}: ${i.icon} ${i.name}`).join(', ') || 'ninguno'}
Inventario del jugador: ${inventory.join(', ') || 'vacío'}
Objetos ya examinados: ${Object.keys(objectStates).join(', ') || 'ninguno'}
Respuesta final: ${room.finalAnswer} (${room.finalAnswerHint})`;

      const history = chatLog.slice(-8).map(m => ({ role: m.who === 'me' ? 'user' : 'assistant', content: m.text }));
      const visionPrompt = history.length
        ? `Conversación previa:\n${history.map(m => `${m.role === 'user' ? 'JUGADOR' : 'NARRADOR'}: ${m.content}`).join('\n')}\n\nJUGADOR: ${userMsg}`
        : userMsg;
      let content;
      try {
        if (image) {
          content = await CC.chatVision({
            system: sys + '\n\nTIENES la imagen de la habitación adjunta. Cuando el jugador señale o pregunte por algo visible, descríbelo de forma fiel a la imagen.',
            prompt: visionPrompt,
            images: [image],
            temperature: 0.7,
          });
        } else {
          content = await CC.chat({ system: sys, messages: [...history, { role: 'user', content: userMsg }], temperature: 0.7 });
        }
      } catch (e) {
        console.warn('vision fallback', e.message);
        content = await CC.chat({ system: sys, messages: [...history, { role: 'user', content: userMsg }], temperature: 0.7 });
      }
      setChatLog((log) => [...log, { who: 'them', text: content }]);
    } catch (e) {
      setChatLog((log) => [...log, { who: 'them', text: '(El narrador no responde… error: ' + e.message + ')' }]);
    } finally { setBusy(false); }
  };

  const requestHint = () => { setHintsUsed(h => h + 1); askGM('Dame una pista sutil sobre por dónde tirar.'); };

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
      const perfectBonus = (hintsUsed === 0 ? 200 : 0) + (duration < 600 ? 150 : 0);
      CC.addScore(CC.calcScore({ difficulty, duration, hints: hintsUsed, perfectBonus }));
      CC.toast('¡Escapaste!', 'ok');
    } else {
      CC.toast('Esa no es la combinación.', 'bad');
      setChatLog((log) => [...log, { who: 'me', text: `Intentar: "${answer}"` }, { who: 'them', text: 'La cerradura no cede. No es eso.' }]);
    }
  };

  // ─── Pantallas ──────────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <GameShell title="Escape Room" subtitle="Sales si descubres el código" onExit={onExit}>
        <GameSetup
          gameId="escape"
          intro={<>
            <p>Una habitación cerrada. Examina objetos con marcas rojas en la imagen, recoge items, úsalos para desbloquear pistas, deduce el código y escapa.</p>
            <p className="muted tiny">El narrador puede ver la imagen contigo: si tienes modelo de visión, pregúntale por cualquier zona.</p>
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
        <div className="row gap-sm wrap">
          <span className="pill" title="Objetos examinados / total">🔎 {Object.keys(objectStates).length}/{(room.objects || []).length}</span>
          {inventory.length > 0 && <span className="pill" title="Items en inventario">🎒 {inventory.length}</span>}
          <button className="btn ghost small" onClick={() => setNarratorOpen(o => !o)}>
            {narratorOpen ? '✕ Cerrar narrador' : '💬 Narrador'}
          </button>
          <button className="btn ghost small" onClick={requestHint} disabled={!CC.getSettings().hintsAllowed || busy}>
            Pedir pista{hintsUsed > 0 ? ` (${hintsUsed})` : ''}
          </button>
        </div>
      )}
    >
      <div style={{ display: 'grid', gridTemplateColumns: narratorOpen ? 'minmax(0, 1.6fr) minmax(320px, 1fr)' : 'minmax(0, 1fr)', gap: '1.5rem', transition: 'grid-template-columns .25s' }}>
        {/* Columna izquierda: imagen GRANDE + inventario + cerradura */}
        <div className="col">
          <Paper aged style={{ padding: '.6rem' }}>
            {image ? (
              <div className="image-with-hotspots" style={{ width: '100%' }}>
                <img src={image} alt="Habitación" style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 2 }} />
                {room.objects.filter(o => Array.isArray(o.position) && o.position.length === 4).map((obj, i) => {
                  const [x, y, w, h] = obj.position;
                  const state = objectStates[obj.id];
                  const examined = !!state;
                  const unlocked = state === 'unlocked';
                  const locked = obj.requiresItem && !unlocked;
                  const isDragging = !!draggedItem;
                  const isDropTarget = isDragging && locked;
                  const isValidDrop = isDropTarget && draggedItem === obj.requiresItem;
                  // Feedback visual también para objetos no-locked durante drag (rojo: no encaja)
                  const isInvalidDrop = isDragging && !locked;
                  return (
                    <div key={obj.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`${obj.name}${unlocked ? ', desbloqueado' : examined ? ', examinado' : ''}${locked ? ', requiere objeto' : ''}`}
                      className={`hotspot ${examined ? 'examined' : ''}`}
                      style={{
                        left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%`,
                        ...(isDropTarget ? {
                          outline: `3px dashed ${isValidDrop ? 'var(--stamp-green)' : 'var(--stamp-blue)'}`,
                          outlineOffset: 2,
                          background: isValidDrop ? 'rgba(80,160,80,.18)' : 'rgba(80,140,200,.12)',
                        } : isInvalidDrop ? {
                          outline: '2px dashed rgba(140,140,140,.5)',
                          outlineOffset: 2,
                        } : null),
                      }}
                      onClick={() => examineObject(obj)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); examineObject(obj); } }}
                      onDragOver={(e) => { if (draggedItem) { e.preventDefault(); e.dataTransfer.dropEffect = locked ? 'move' : 'none'; } }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const itemId = e.dataTransfer.getData('text/plain') || draggedItem;
                        setDraggedItem(null);
                        if (!itemId) return;
                        if (!locked) { CC.toast('Aquí no hace falta nada.', '', 1500); return; }
                        if (!objectStates[obj.id]) examineObject(obj);
                        useItemOn(obj, itemId);
                      }}>
                      <div className="pin" style={locked ? { background: 'oklch(0.45 0.12 60)' } : (unlocked ? { background: 'var(--stamp-green)' } : undefined)}>
                        {unlocked ? '✓' : locked ? '🔒' : (i + 1)}
                      </div>
                      <div className="label">{obj.name}{unlocked ? ' · abierto' : examined ? ' · visto' : ''}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ aspectRatio: '4/3', background: 'var(--paper-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Loader msg="revelando la habitación" />
              </div>
            )}
            <div className="tiny muted center-text" style={{ marginTop: '.5rem', fontFamily: 'Caveat, cursive', fontSize: '1.05rem' }}>
              la escena · pulsa las marcas para examinar
            </div>
          </Paper>

          <InventoryBar
            items={inventory}
            itemDefs={room.items || []}
            draggedItem={draggedItem}
            onDragStart={(id) => setDraggedItem(id)}
            onDragEnd={() => setDraggedItem(null)}
          />

          {/* Cerradura final — bajo el inventario, prominente */}
          <Paper aged>
            <div className="between" style={{ marginBottom: '.5rem' }}>
              <h3 className="font-display" style={{ margin: 0 }}>La cerradura de salida</h3>
              {phase === 'won' && <Stamp solid>ABIERTA</Stamp>}
            </div>
            {phase === 'won' ? (
              <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                {(() => {
                  const tier = timer < 300 && hintsUsed === 0 ? { label: 'ESCAPE LEGENDARIO', kind: '' }
                              : timer < 600 && hintsUsed <= 1 ? { label: 'ESCAPE MAESTRO', kind: 'green' }
                              : { label: 'ESCAPASTE', kind: 'blue' };
                  return <Stamp kind={tier.kind} solid className="entrance" style={{ fontSize: '1rem', padding: '.5rem 1.2rem' }}>{tier.label}</Stamp>;
                })()}
                <p style={{ fontStyle: 'italic', marginTop: '.8rem' }}>{room.winText}</p>
                <div className="muted tiny">Resuelto en {CC.fmtTime(timer)} · {hintsUsed} pista{hintsUsed === 1 ? '' : 's'}</div>
                <ScoreReveal difficulty={difficulty} duration={timer} hints={hintsUsed} perfectBonus={(hintsUsed === 0 ? 200 : 0) + (timer < 600 ? 150 : 0)} extraNote={timer < 600 ? '⚡ escapada veloz' : null} />
                <Leaderboard gameId="escape" caseId={poolId} />
                <ShareBar gameId="escape" poolId={poolId} caseData={room} title={room.title} difficulty={difficulty} />
                <button className="btn" style={{ marginTop: '1rem' }} onClick={() => { setPhase('setup'); setRoom(null); setPoolId(null); }}>Otra escape room</button>
              </div>
            ) : (
              <>
                <p className="tiny muted" style={{ marginTop: 0 }}>Cuando creas tener el código, introdúcelo aquí.</p>
                <form onSubmit={(e) => { e.preventDefault(); tryAnswer(); }} className="row gap-sm" style={{ alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="código / palabra clave" style={{ fontSize: '1.05rem' }} />
                  </div>
                  <button className="btn red" disabled={!answer.trim()}>Probar</button>
                </form>
              </>
            )}
          </Paper>
        </div>

        {/* Columna derecha: narrador */}
        {narratorOpen && phase !== 'won' && (
          <Paper style={{ alignSelf: 'flex-start', position: 'sticky', top: '1rem' }}>
            <div className="between" style={{ marginBottom: '.5rem' }}>
              <h3 className="font-display" style={{ margin: 0 }}>El narrador</h3>
              {image && <Stamp kind="blue" style={{ fontSize: '.55rem', padding: '.1rem .35rem' }}>👁 con visión</Stamp>}
            </div>
            <div className="chat-log" style={{ maxHeight: '52vh' }}>
              {chatLog.map((m, i) => (
                <div key={i} className={`bubble ${m.who}`} style={m.ambient ? { fontStyle: 'italic', opacity: .7, borderLeft: '2px solid var(--ink-faded)', background: 'transparent' } : undefined}>
                  {m.text}
                </div>
              ))}
              {busy && <div className="bubble them"><Loader msg="escribiendo" /></div>}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); askGM(input); }} style={{ marginTop: '.8rem' }}>
              <div className="row gap-sm">
                <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Examinar el reloj, mirar bajo la cama…" disabled={busy} />
                <button className="btn" disabled={busy || !input.trim()}>Decir</button>
              </div>
            </form>
          </Paper>
        )}
      </div>

      {/* Modal de examen */}
      {selectedObject && (
        <ExamineModal
          obj={selectedObject}
          room={room}
          inventory={inventory}
          state={objectStates[selectedObject.id]}
          onClose={() => setSelectedObject(null)}
          onUseItem={(itemId) => useItemOn(selectedObject, itemId)}
        />
      )}
    </GameShell>
  );
}

// ─── Inventario ────────────────────────────────────────────────────────
function InventoryBar({ items, itemDefs, draggedItem, onDragStart, onDragEnd }) {
  return (
    <Paper style={{ padding: '.8rem 1rem' }}>
      <div className="row gap-sm" style={{ alignItems: 'center' }}>
        <div className="font-typewriter tiny" style={{ letterSpacing: '.2em', color: 'var(--ink-faded)', minWidth: 90 }}>INVENTARIO</div>
        <div className="row gap-sm wrap" style={{ flex: 1 }}>
          {items.length === 0 && <span className="muted tiny" style={{ fontStyle: 'italic' }}>(vacío — examina objetos para coger items)</span>}
          {items.map((id) => {
            const found = itemDefs.find(d => d.id === id);
            const it = found || {
              id,
              name: id.split(/[-_\s]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
              icon: '📦',
              desc: 'Objeto recogido',
            };
            const dragging = draggedItem === id;
            return (
              <div key={id}
                draggable={!!onDragStart}
                onDragStart={(e) => {
                  if (!onDragStart) return;
                  e.dataTransfer.setData('text/plain', id);
                  e.dataTransfer.effectAllowed = 'move';
                  onDragStart(id);
                }}
                onDragEnd={() => onDragEnd && onDragEnd()}
                title={(it.desc || '') + ' — Arrástralo al objeto cerrado de la imagen para usarlo'}
                style={{
                  padding: '.4rem .7rem',
                  background: 'var(--paper-2)',
                  border: `1px solid ${dragging ? 'var(--stamp-blue)' : 'var(--paper-edge)'}`,
                  display: 'flex', alignItems: 'center', gap: '.5rem',
                  cursor: 'grab',
                  opacity: dragging ? 0.45 : 1,
                  boxShadow: dragging ? '0 0 0 2px var(--stamp-blue)' : 'none',
                  transition: 'opacity .12s, box-shadow .12s, border-color .12s',
                  userSelect: 'none',
                }}>
                <span style={{ fontSize: '1.4rem', lineHeight: 1, pointerEvents: 'none' }}>{it.icon || '📦'}</span>
                <div style={{ pointerEvents: 'none' }}>
                  <div className="font-typewriter" style={{ fontSize: '.8rem', letterSpacing: '.05em' }}>{it.name}</div>
                  <div className="tiny muted" style={{ marginTop: -2 }}>{it.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {items.length > 0 && (
        <div className="tiny muted" style={{ marginTop: '.5rem', fontStyle: 'italic' }}>
          ✋ Arrastra un item sobre el objeto cerrado de la imagen para usarlo (o pulsa el objeto y elígelo en el modal).
        </div>
      )}
    </Paper>
  );
}

// ─── Modal de examen ───────────────────────────────────────────────────
function ExamineModal({ obj, room, inventory, state, onClose, onUseItem }) {
  const unlocked = state === 'unlocked';
  const hasRequired = obj.requiresItem && inventory.includes(obj.requiresItem);
  const synthItem = (id) => id ? { id, name: id.split(/[-_\s]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '), icon: '📦', desc: 'Objeto' } : null;
  const lookupItem = (id) => id ? ((room.items || []).find(it => it.id === id) || synthItem(id)) : null;
  const requiredItem = lookupItem(obj.requiresItem);
  const giveItem = lookupItem(obj.givesItem);
  const unlockedGiveItem = lookupItem(obj.unlockedGivesItem);

  return (
    <Modal onClose={onClose} title={obj.name}>
      <div className="font-typewriter tiny" style={{ letterSpacing: '.2em', color: 'var(--ink-faded)' }}>EXAMINANDO</div>
      <p className="muted" style={{ marginTop: '.3rem' }}>{obj.shortDesc}</p>

      <div className="paper aged" style={{ padding: '1rem 1.2rem', marginTop: '.8rem' }}>
        <p style={{ margin: 0 }}>{obj.examineText}</p>
        {giveItem && (
          <div className="row gap-sm" style={{ marginTop: '.8rem', padding: '.5rem .7rem', background: 'rgba(80,140,80,.1)', borderLeft: '3px solid var(--stamp-green)' }}>
            <span style={{ fontSize: '1.2rem' }}>{giveItem.icon}</span>
            <div className="tiny">Has cogido: <strong>{giveItem.name}</strong> — <em>{giveItem.desc}</em></div>
          </div>
        )}
        {unlocked && obj.unlockedRevealText && (
          <>
            <div className="divider dashed"></div>
            <p style={{ margin: 0, fontStyle: 'italic' }}>{obj.unlockedRevealText}</p>
            {unlockedGiveItem && (
              <div className="row gap-sm" style={{ marginTop: '.8rem', padding: '.5rem .7rem', background: 'rgba(80,140,80,.1)', borderLeft: '3px solid var(--stamp-green)' }}>
                <span style={{ fontSize: '1.2rem' }}>{unlockedGiveItem.icon}</span>
                <div className="tiny">Has cogido: <strong>{unlockedGiveItem.name}</strong> — <em>{unlockedGiveItem.desc}</em></div>
              </div>
            )}
          </>
        )}
      </div>

      {obj.requiresItem && !unlocked && (
        <div style={{ marginTop: '1rem' }}>
          <label>Aquí necesitas algo</label>
          {requiredItem && hasRequired && (
            <p className="tiny" style={{ marginBottom: '.5rem' }}>Tienes el objeto adecuado. Úsalo:</p>
          )}
          {!hasRequired && (
            <p className="tiny muted">Aún no llevas el objeto necesario. Sigue buscando.</p>
          )}
          {hasRequired && (
            <button className="btn red" onClick={() => onUseItem(obj.requiresItem)}>
              Usar {requiredItem.icon} {requiredItem.name}
            </button>
          )}
          {!hasRequired && inventory.length > 0 && (
            <div style={{ marginTop: '.8rem' }}>
              <div className="tiny muted">Probar con algo del inventario:</div>
              <div className="row gap-sm wrap" style={{ marginTop: '.4rem' }}>
                {inventory.map(itemId => {
                  const it = lookupItem(itemId);
                  if (!it) return null;
                  return (
                    <button key={itemId} className="btn ghost small" onClick={() => onUseItem(itemId)} title={it.desc}>
                      {it.icon} {it.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

window.EscapeGame = EscapeGame;
