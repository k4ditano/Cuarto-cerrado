// ─── Cuarto Cerrado — Cifrados con historia ─────────────────────────────
// La IA genera una mini-historia con un mensaje en claro. Lo ciframos en
// el cliente con un esquema conocido. La jugadora debe descifrarlo.

const CIPHER_SETTINGS = [
  'una carta interceptada de un espía en los años 40',
  'una nota encontrada en el bolsillo de un asesino',
  'el diario en clave de un alquimista',
  'un telegrama urgente desde un faro',
  'una postal anónima recibida en un piso vacío',
  'un mensaje deslizado bajo la puerta de un hotel',
  'instrucciones encontradas en una caja fuerte abierta',
];

// ─── Esquemas de cifrado ───────────────────────────────────────────────
const CIPHERS = {
  cesar: {
    name: 'César',
    desc: 'Cada letra se desplaza N posiciones en el alfabeto. Ejemplo con +3: A→D, B→E.',
    hint: (n) => `Las letras están desplazadas exactamente ${n} posiciones.`,
    encode(text, key) {
      const k = ((key % 26) + 26) % 26;
      return text.replace(/[a-zñA-ZÑ]/g, (ch) => {
        const upper = ch === ch.toUpperCase();
        const c = ch.toLowerCase();
        // Tratar ñ como n para simplificar
        const base = c === 'ñ' ? 'n' : c;
        const i = base.charCodeAt(0) - 97;
        if (i < 0 || i > 25) return ch;
        const e = String.fromCharCode(((i + k) % 26) + 97);
        return upper ? e.toUpperCase() : e;
      });
    },
    randomKey: () => CC.rand(3, 9),
  },
  atbash: {
    name: 'Atbash',
    desc: 'A↔Z, B↔Y, C↔X… cada letra se sustituye por su simétrica en el alfabeto.',
    hint: () => 'A es Z, B es Y, C es X… espejo del alfabeto.',
    encode(text) {
      return text.replace(/[a-zñA-ZÑ]/g, (ch) => {
        const upper = ch === ch.toUpperCase();
        const c = ch.toLowerCase() === 'ñ' ? 'n' : ch.toLowerCase();
        const i = c.charCodeAt(0) - 97;
        if (i < 0 || i > 25) return ch;
        const e = String.fromCharCode(122 - i);
        return upper ? e.toUpperCase() : e;
      });
    },
    randomKey: () => null,
  },
  reverso: {
    name: 'Reverso',
    desc: 'El mensaje completo está escrito al revés, letra por letra.',
    hint: () => 'Léelo de derecha a izquierda.',
    encode(text) { return [...text].reverse().join(''); },
    randomKey: () => null,
  },
  a1z26: {
    name: 'A1Z26',
    desc: 'Cada letra es su posición en el alfabeto. A=1, B=2, …, Z=26. Letras separadas por guiones, palabras por barras.',
    hint: () => 'Los números son posiciones de letras: A=1, B=2…',
    encode(text) {
      return text.split(/\s+/).map((word) =>
        [...word].map((ch) => {
          const c = ch.toLowerCase() === 'ñ' ? 'n' : ch.toLowerCase();
          const i = c.charCodeAt(0) - 97;
          if (i < 0 || i > 25) return ch;
          return String(i + 1);
        }).join('-')
      ).join(' / ');
    },
    randomKey: () => null,
  },
  morse: {
    name: 'Morse',
    desc: 'Cada letra es una secuencia de puntos y rayas. Letras separadas por espacio, palabras por "/".',
    hint: () => 'Es código morse. Letras con espacio, palabras con "/".',
    encode(text) {
      const M = { a:'.-',b:'-...',c:'-.-.',d:'-..',e:'.',f:'..-.',g:'--.',h:'....',i:'..',j:'.---',k:'-.-',l:'.-..',m:'--',n:'-.',o:'---',p:'.--.',q:'--.-',r:'.-.',s:'...',t:'-',u:'..-',v:'...-',w:'.--',x:'-..-',y:'-.--',z:'--..',ñ:'--.--' };
      return text.toLowerCase().split(/\s+/).map(w =>
        [...w].map(ch => M[ch] || '').filter(Boolean).join(' ')
      ).filter(Boolean).join(' / ');
    },
    randomKey: () => null,
  },
  vigenere: {
    name: 'Vigenère',
    desc: 'Cifrado polialfabético con palabra clave. Cada letra del texto se desplaza según la letra correspondiente de la clave (A=0, B=1…), repitiendo la clave cíclicamente.',
    hint: (key) => `La palabra clave es: "${key}". Repite la clave letra a letra sobre el texto cifrado y resta su valor para descifrar.`,
    encode(text, key) {
      const k = (key || 'clave').toLowerCase().replace(/[^a-zñ]/g, '').replace(/ñ/g, 'n');
      let j = 0;
      return text.replace(/[a-zA-ZñÑ]/g, (ch) => {
        const upper = ch === ch.toUpperCase();
        const c = ch.toLowerCase() === 'ñ' ? 'n' : ch.toLowerCase();
        const i = c.charCodeAt(0) - 97;
        if (i < 0 || i > 25) return ch;
        const shift = k.charCodeAt(j % k.length) - 97;
        j++;
        const e = String.fromCharCode(((i + shift) % 26) + 97);
        return upper ? e.toUpperCase() : e;
      });
    },
    randomKey: () => CC.pick(['llave', 'sombra', 'reloj', 'humo', 'tinta', 'cuervo', 'ambar', 'limbo', 'rosa', 'orquidea', 'roble']),
  },
};

function CiphersGame({ opts = {}, onExit }) {
  const [phase, setPhase] = useState(opts.caseData ? 'loading' : 'setup');
  const [difficulty, setDifficulty] = useState(opts.difficulty || 'medio');
  const [scheme, setScheme] = useState(null); // {type, key, encoded, story}
  const [story, setStory] = useState(null);
  const [guess, setGuess] = useState('');
  const [hintLevel, setHintLevel] = useState(0); // 0 nothing, 1 cipher type, 2 explanation, 3 first letters
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

  const loadFromCase = (data) => {
    setStory(data.story); setScheme(data.scheme);
    setGuess(''); setHintLevel(0); setTimer(0);
    startTs.current = Date.now();
    setPhase('playing');
  };

  const start = async () => {
    setPhase('loading'); setError(null); reset();
    try {
      const setting = CC.pick(CIPHER_SETTINGS);
      const easyTypes = ['cesar', 'reverso'];
      const medTypes  = ['cesar', 'atbash', 'a1z26'];
      const hardTypes = ['atbash', 'a1z26', 'morse', 'vigenere'];
      const typePool = difficulty === 'fácil' ? easyTypes : difficulty === 'medio' ? medTypes : hardTypes;
      const type = CC.pick(typePool);
      push(`Escenario: ${setting}`); done();
      push(`Elegido esquema: ${CIPHERS[type].name}`); done();
      push('Redactando microficción');

      const sys = 'Eres un escritor de microficción y mensajes secretos en español. Respondes SOLO con JSON válido.';
      const prompt = `Diseña una mini-historia (3-4 frases) que envuelva un mensaje secreto, ambientada en: ${setting}.

El mensaje secreto será una FRASE en español, de entre 5 y 9 palabras, sin números, sin signos de puntuación complicados, sólo letras y espacios. Debe sonar a un mensaje real (orden, advertencia, ubicación, contraseña, pista).

Devuelve este JSON:
{
  "title": "Título evocador (3-5 palabras)",
  "intro": "3-4 frases de mini-historia que sitúan al jugador antes de mostrar el mensaje cifrado.",
  "theme": "${setting}",
  "plaintext": "el mensaje real en minusculas sin tildes ni puntuacion",
  "winText": "1-2 frases que cierran la escena al descifrarlo"
}

IMPORTANTE: "plaintext" en minúsculas, SIN TILDES, sólo letras a-z y espacios.`;

      const data = await CC.chatJSON({
        system: sys,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.95,
      });
      if (!data.plaintext) throw new Error('Respuesta incompleta');
      done();
      push('Cifrando con tinta invisible');

      const cipher = CIPHERS[type];
      const key = cipher.randomKey();
      const encoded = cipher.encode(data.plaintext, key);
      done();
      push('Plegando el mensaje');
      await new Promise(r => setTimeout(r, 300));
      done();

      loadFromCase({ story: data, scheme: { type, key, encoded } });
      CC.poolSave('ciphers', { story: data, scheme: { type, key, encoded } }, difficulty, data.title).then((r) => { if (r?.id) CC.markPlayed('ciphers', r.id); });
    } catch (e) {
      setError(e.message);
      setPhase('setup');
    }
  };

  const tryDecode = () => {
    const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
    if (norm(guess) === norm(story.plaintext)) {
      setPhase('won');
      const duration = Math.floor((Date.now() - startTs.current) / 1000);
      CC.addHistory({ gameId: 'ciphers', won: true, difficulty, duration, summary: story.title });
      CC.recordPlay('ciphers', poolId, { duration, hints: hintLevel, won: true });
      CC.grantMedal('first-solve');
      CC.grantMedal('cipher');
      if (hintLevel === 0) CC.grantMedal('no-hints');
      CC.toast('¡Descifrado!', 'ok');
    } else {
      CC.toast('No es exactamente eso. Mira los símbolos.', 'bad');
    }
  };

  if (phase === 'setup') {
    return (
      <GameShell title="Cifrados" subtitle="Descifra el mensaje" onExit={onExit}>
        <GameSetup
          gameId="ciphers"
          intro={<>
            <p>Recibirás un fragmento de historia con un mensaje cifrado. Tu trabajo: descifrarlo y devolverlo al claro.</p>
            <div className="muted tiny">Esquemas posibles: César, Atbash, Reverso, A1Z26, Morse, Vigenère. La dificultad determina cuáles aparecen.</div>
          </>}
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
    return <GameShell title="Cifrados" onExit={onExit}>
      <LiveLoader feed={feed} title="Cifrando mensaje" idle={['Tinta invisible', 'Plegando el mensaje', 'Esperando al mensajero']} />
    </GameShell>;
  }

  const cipher = CIPHERS[scheme.type];

  return (
    <GameShell title={story.title} subtitle="Cifrados" onExit={onExit} difficulty={difficulty} timer={timer}>
      <CaseBanner emoji="📜" title={story.title} theme={story.theme} subtitle={story.intro} />

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '2rem' }}>
        <Paper aged style={{ position: 'relative' }}>
          <Stamp kind="red" style={{ position: 'absolute', top: 12, right: 12, fontSize: '.55rem', padding: '.1rem .3rem' }}>EN CLAVE</Stamp>
          <div className="font-typewriter tiny" style={{ letterSpacing: '.2em', color: 'var(--ink-faded)' }}>EL MENSAJE</div>
          <div className="glyph-box" style={{ marginTop: '1rem', fontSize: scheme.type === 'morse' ? '1.1rem' : '1.4rem' }}>
            {scheme.encoded}
          </div>

          {phase !== 'won' && (
            <>
              <label style={{ marginTop: '1.5rem' }}>Tu interpretación</label>
              <textarea value={guess} onChange={(e) => setGuess(e.target.value)} placeholder="Escribe el mensaje en claro…" rows={2} />
              <div style={{ marginTop: '1rem' }}>
                <button className="btn red" onClick={tryDecode} disabled={!guess.trim()}>Comprobar</button>
              </div>
            </>
          )}
          {phase === 'won' && (
            <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
              <Stamp solid>MENSAJE EN CLARO</Stamp>
              <div className="glyph-box" style={{ marginTop: '.6rem', fontFamily: 'Caveat, cursive', fontSize: '1.6rem', background: 'rgba(255,250,200,.5)' }}>
                {story.plaintext}
              </div>
              <p style={{ marginTop: '1rem', fontStyle: 'italic' }}>{story.winText}</p>
              <Leaderboard gameId="ciphers" caseId={poolId} />
              <ShareBar gameId="ciphers" poolId={poolId} caseData={{ story, scheme }} title={story.title} difficulty={difficulty} />
              <button className="btn" onClick={() => { setPhase('setup'); setStory(null); setScheme(null); setPoolId(null); }}>Otro mensaje</button>
            </div>
          )}
        </Paper>

        <Paper>
          <h3 className="font-display">Pistas</h3>
          <div className="col gap-sm">
            <HintLayer
              level={1} current={hintLevel} setLevel={setHintLevel}
              title="¿Qué tipo de cifrado es?"
              reveal={cipher.name}
            />
            <HintLayer
              level={2} current={hintLevel} setLevel={setHintLevel}
              title="¿Cómo funciona?"
              reveal={cipher.desc + ' ' + cipher.hint(scheme.key)}
            />
            <HintLayer
              level={3} current={hintLevel} setLevel={setHintLevel}
              title="Las primeras 3 letras"
              reveal={story.plaintext.slice(0, 3) + '…'}
            />
          </div>
          <div className="tiny muted" style={{ marginTop: '1rem' }}>
            Cada pista que reveles cuenta para la medalla de "sin ayuda".
          </div>
        </Paper>
      </div>
    </GameShell>
  );
}

function HintLayer({ level, current, setLevel, title, reveal }) {
  const unlocked = current >= level;
  return (
    <div className="paper" style={{ padding: '.7rem .9rem', background: unlocked ? 'rgba(180,140,80,.12)' : 'var(--paper-2)' }}>
      <div className="between">
        <div className="font-typewriter tiny" style={{ letterSpacing: '.12em' }}>PISTA {level}</div>
        {!unlocked && CC.getSettings().hintsAllowed && (
          <button className="btn ghost small" onClick={() => setLevel(level)}>Revelar</button>
        )}
      </div>
      <div style={{ marginTop: '.4rem', fontSize: '.9rem' }}>
        {unlocked ? <span>{title}: <strong>{reveal}</strong></span> : <span className="muted">{title}</span>}
      </div>
    </div>
  );
}

window.CiphersGame = CiphersGame;
