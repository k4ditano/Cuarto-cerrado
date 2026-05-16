// ─── Cuarto Cerrado — Sorpréndeme ──────────────────────────────────────
// Elige un modo al azar, lo envuelve con una mini-presentación y lo lanza.

function SurpriseGame({ onExit }) {
  const [picked, setPicked] = useState(null);
  const [stage, setStage] = useState('roulette'); // roulette → reveal → game
  const [reel, setReel] = useState(0);
  const candidates = ['mapdoku', 'escape', 'criminal', 'visual', 'riddles', 'ciphers', 'anagrams'];

  useEffect(() => {
    if (stage !== 'roulette') return;
    let i = 0;
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    let count = 18 + Math.floor(Math.random() * 6);
    const step = () => {
      setReel((r) => (r + 1) % candidates.length);
      count--;
      if (count > 0) setTimeout(step, 80 + (18 - count) * 22);
      else {
        const idx = candidates.indexOf(target);
        setReel(idx);
        setPicked(target);
        setTimeout(() => setStage('reveal'), 800);
      }
    };
    setTimeout(step, 400);
  }, [stage]);

  const gameMeta = {
    mapdoku:  { emoji: '🗺️', name: 'Mapdoku',           tagline: 'Deduce la cuadrícula' },
    escape:   { emoji: '🔐', name: 'Escape Room',       tagline: 'Encuentra el código y sal' },
    criminal: { emoji: '🕵️', name: 'Caso Criminal',     tagline: 'Una víctima, cuatro versiones' },
    visual:   { emoji: '🖼️', name: 'Habitación Visual', tagline: 'Lo verás todo o no verás nada' },
    riddles:  { emoji: '🧩', name: 'Acertijos',          tagline: 'Versos que esconden palabras' },
    ciphers:  { emoji: '📜', name: 'Cifrados',           tagline: 'Devuelve el mensaje al claro' },
    anagrams: { emoji: '🔤', name: 'Anagramas',          tagline: 'Reordena las letras' },
  };

  if (stage === 'game') {
    // Lanzar el juego elegido
    const opts = {};
    switch (picked) {
      case 'mapdoku':  return <MapdokuGame  opts={opts} onExit={onExit} />;
      case 'escape':   return <EscapeGame   opts={opts} onExit={onExit} />;
      case 'criminal': return <CriminalGame opts={opts} onExit={onExit} />;
      case 'visual':   return <VisualGame   opts={opts} onExit={onExit} />;
      case 'riddles':  return <RiddlesGame  opts={opts} onExit={onExit} />;
      case 'ciphers':  return <CiphersGame  opts={opts} onExit={onExit} />;
      case 'anagrams': return <AnagramsGame opts={opts} onExit={onExit} />;
      default: return <div>?</div>;
    }
  }

  const current = candidates[reel];
  const meta = gameMeta[current];

  return (
    <GameShell title="Sorpréndeme" subtitle="La casa elige por ti" onExit={onExit}>
      <div className="center" style={{ flexDirection: 'column', padding: '3rem 1rem', textAlign: 'center', gap: '1.5rem' }}>
        {stage === 'roulette' ? (
          <>
            <div className="font-typewriter tiny" style={{ letterSpacing: '.3em', color: 'var(--ink-faded)' }}>SORTEANDO EXPEDIENTE…</div>
            <Paper aged style={{ width: 360, padding: '2.5rem', position: 'relative' }}>
              <div style={{ fontSize: 84, lineHeight: 1, transition: 'transform .15s' }}>{meta.emoji}</div>
              <h2 className="font-display" style={{ marginTop: '.8rem' }}>{meta.name}</h2>
              <div className="tiny muted">{meta.tagline}</div>
            </Paper>
            <div className="loader"><span>repartiendo cartas</span><span className="dots"><span></span><span></span><span></span></span></div>
          </>
        ) : (
          <>
            <Stamp solid style={{ fontSize: '1rem', padding: '.5rem 1.2rem' }}>TE TOCA…</Stamp>
            <Paper aged style={{ width: 420, padding: '3rem', position: 'relative' }}>
              <Stamp kind="red" style={{ position: 'absolute', top: 16, right: 16, fontSize: '.65rem', transform: 'rotate(8deg)' }}>OFICIAL</Stamp>
              <div style={{ fontSize: 96, lineHeight: 1 }}>{gameMeta[picked].emoji}</div>
              <h1 className="font-display" style={{ marginTop: '1rem' }}>{gameMeta[picked].name}</h1>
              <p className="muted">{gameMeta[picked].tagline}</p>
            </Paper>
            <div className="row gap-sm">
              <button className="btn ghost" onClick={() => { setStage('roulette'); setPicked(null); }}>Otra ronda</button>
              <button className="btn red" onClick={() => setStage('game')}>Jugar</button>
            </div>
          </>
        )}
      </div>
    </GameShell>
  );
}

window.SurpriseGame = SurpriseGame;
