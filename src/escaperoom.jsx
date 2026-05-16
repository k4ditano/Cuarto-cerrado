// ─── Cuarto Cerrado — Escape Room narrativo (con inventario y cadena) ──
// Habitación cerrada con imagen como protagonista. Cadena de objetos:
// examinar → coger items → usar items → desbloquear contenido → encontrar
// código → escapar.

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
        const item = room.items.find(it => it.id === obj.givesItem);
        setInventory((inv) => [...inv, obj.givesItem]);
        if (item) CC.toast(`Cogiste: ${item.icon} ${item.name}`, 'ok', 2500);
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
    const item = room.items.find(it => it.id === itemId);
    setChatLog((log) => [
      ...log,
      { who: 'me', text: `Usar ${item?.name || 'item'} en ${obj.name}` },
      { who: 'them', text: obj.unlockedRevealText || '(algo cambia, pero no consigues distinguir qué)' },
    ]);
    if (obj.unlockedGivesItem && !inventory.includes(obj.unlockedGivesItem)) {
      const newItem = room.items.find(it => it.id === obj.unlockedGivesItem);
      setInventory((inv) => [...inv, obj.unlockedGivesItem]);
      if (newItem) CC.toast(`Cogiste: ${newItem.icon} ${newItem.name}`, 'ok', 2500);
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
      let content;
      try {
        if (image) {
          content = await CC.chatVision({
            system: sys + '\n\nTIENES la imagen de la habitación adjunta. Cuando el jugador señale o pregunte por algo visible, descríbelo de forma fiel a la imagen.',
            prompt: userMsg,
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
        <div className="row gap-sm">
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
                  return (
                    <div key={obj.id}
                      className={`hotspot ${examined ? 'examined' : ''}`}
                      style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` }}
                      onClick={() => examineObject(obj)}>
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

          <InventoryBar items={inventory} itemDefs={room.items || []} />

          {/* Cerradura final — bajo el inventario, prominente */}
          <Paper aged>
            <div className="between" style={{ marginBottom: '.5rem' }}>
              <h3 className="font-display" style={{ margin: 0 }}>La cerradura de salida</h3>
              {phase === 'won' && <Stamp solid>ABIERTA</Stamp>}
            </div>
            {phase === 'won' ? (
              <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                <p style={{ fontStyle: 'italic' }}>{room.winText}</p>
                <div className="muted tiny">Resuelto en {CC.fmtTime(timer)} · {hintsUsed} pista{hintsUsed === 1 ? '' : 's'}</div>
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
              {chatLog.map((m, i) => (<div key={i} className={`bubble ${m.who}`}>{m.text}</div>))}
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
function InventoryBar({ items, itemDefs }) {
  return (
    <Paper style={{ padding: '.8rem 1rem' }}>
      <div className="row gap-sm" style={{ alignItems: 'center' }}>
        <div className="font-typewriter tiny" style={{ letterSpacing: '.2em', color: 'var(--ink-faded)', minWidth: 90 }}>INVENTARIO</div>
        <div className="row gap-sm wrap" style={{ flex: 1 }}>
          {items.length === 0 && <span className="muted tiny" style={{ fontStyle: 'italic' }}>(vacío — examina objetos para coger items)</span>}
          {items.map((id) => {
            const it = itemDefs.find(d => d.id === id);
            if (!it) return null;
            return (
              <div key={id} className="paper" style={{
                padding: '.4rem .7rem',
                background: 'var(--paper-2)',
                border: '1px solid var(--paper-edge)',
                display: 'flex', alignItems: 'center', gap: '.5rem',
              }} title={it.desc}>
                <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>{it.icon || '📦'}</span>
                <div>
                  <div className="font-typewriter" style={{ fontSize: '.8rem', letterSpacing: '.05em' }}>{it.name}</div>
                  <div className="tiny muted" style={{ marginTop: -2 }}>{it.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Paper>
  );
}

// ─── Modal de examen ───────────────────────────────────────────────────
function ExamineModal({ obj, room, inventory, state, onClose, onUseItem }) {
  const unlocked = state === 'unlocked';
  const hasRequired = obj.requiresItem && inventory.includes(obj.requiresItem);
  const requiredItem = obj.requiresItem ? room.items.find(it => it.id === obj.requiresItem) : null;
  const giveItem = obj.givesItem ? room.items.find(it => it.id === obj.givesItem) : null;
  const unlockedGiveItem = obj.unlockedGivesItem ? room.items.find(it => it.id === obj.unlockedGivesItem) : null;

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
                  const it = room.items.find(i => i.id === itemId);
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
