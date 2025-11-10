import { useCallback, useEffect, useRef, useState } from 'react';
import Chessboard from '@/components/Chessboard';
import EvalBar, { type Score } from '@/components/EvalBar';
import PVList, { type PV } from '@/components/PVList';
import { Chess } from 'chess.js';
import { parseInfo } from '@/lib/uci';
import { readTextFile, splitMultiGamePgn } from '@/lib/pgn';

export default function Home() {
  const [fen, setFen] = useState<string>(new Chess().fen());
  const gameRef = useRef(new Chess());
  const workerRef = useRef<Worker | null>(null);
  const [score, setScore] = useState<Score>({ cp: 0 });
  const [pvs, setPvs] = useState<PV[]>([]);
  const [depth, setDepth] = useState<number>(16);
  const [multiPV, setMultiPV] = useState<number>(3);

  // Initialize Stockfish worker
  useEffect(() => {
  const w = new Worker('/stockfish/stockfish.js'); // classic worker served from public/
  workerRef.current = w;

  w.onmessage = (e) => {
    const s = String(e.data);
    const p = parseInfo(s);
    if (!p) return;
    if (p.score) setScore(p.score);
    if (p.pv && p.multiPv) {
      setPvs(prev => {
        const others = prev.filter(x => x.id !== p.multiPv);
        const curr = { id: p.multiPv!, score: p.score ?? {}, line: p.pv! };
        return [...others, curr].sort((a, b) => a.id - b.id);
      });
    }
  };

  // init the engine
  w.postMessage('uci');

  return () => w.terminate();
}, []);

  // Analyze position with Stockfish
  const analyze = useCallback((f: string) => {
  const w = workerRef.current; if (!w) return;
  w.postMessage('stop');
  w.postMessage(`position fen ${f}`);
  w.postMessage(`go depth ${depth} multipv ${multiPV}`);
  setPvs([]);
}, [depth, multiPV]);

  useEffect(() => {
    analyze(fen);
  }, [fen, analyze]);

  // Calculate legal moves for chessground
  const getLegalMoves = useCallback((): Map<string, string[]> => {
    const dests = new Map<string, string[]>();
    const moves = gameRef.current.moves({ verbose: true });

    moves.forEach((move) => {
      if (!dests.has(move.from)) {
        dests.set(move.from, []);
      }
      dests.get(move.from)!.push(move.to);
    });

    return dests;
  }, []);

  // Handle user moves
  const onUserMove = useCallback((from: string, to: string, promotion?: 'q'|'r'|'b'|'n') => {
    try {
      const mv = gameRef.current.move({ from, to, promotion: promotion ?? 'q' });
      if (mv) {
        const nf = gameRef.current.fen();
        setFen(nf);
      }
    } catch (error) {
      // Move is invalid, ignore it - chessground should have prevented this
      console.warn('Invalid move attempted:', { from, to, promotion });
    }
  }, []);

  // Handle PGN file upload
  const onPgnUpload = async (f: File) => {
    const raw = await readTextFile(f);
    const games = splitMultiGamePgn(raw);
    const g = new Chess();
    g.loadPgn(games[0], { strict: false });
    gameRef.current = g;
    setFen(g.fen());
  };

  // Apply PV line (best move preview)
  const applyPV = (uci: string[]) => {
  if (!uci.length) return;
  const g = new Chess(gameRef.current.fen());

  // parse first UCI move
  const [first] = uci;
  const from = first.slice(0, 2);
  const to = first.slice(2, 4);
  const promo = first.length > 4 ? first[4] as any : undefined;

  // check legality against generated legal moves
  const legal = g.moves({ verbose: true }).some(m =>
    m.from === from &&
    m.to === to &&
    (m.promotion ? m.promotion === promo : true)
  );
  if (!legal) {
    console.warn('PV move is not legal in current position:', { from, to, promo, fen: g.fen() });
    return; // or try a different PV here
  }

  // apply if legal
  if (g.move({ from, to, promotion: promo })) {
    gameRef.current = g;
    setFen(g.fen());
  }
};

  return (
    <div>
      <header style={{ display: 'flex', gap: 12, padding: 12, alignItems: 'center', borderBottom: '1px solid #eee' }}>
        <input
          type="file"
          accept=".pgn"
          onChange={(e) => e.target.files && onPgnUpload(e.target.files[0])}
        />
        <label>
          Depth
          <input
            type="number"
            min={8}
            max={30}
            value={depth}
            onChange={(e) => setDepth(parseInt(e.target.value))}
            style={{ width: 60, marginLeft: 4 }}
          />
        </label>
        <label>
          MultiPV
          <input
            type="number"
            min={1}
            max={5}
            value={multiPV}
            onChange={(e) => setMultiPV(parseInt(e.target.value))}
            style={{ width: 60, marginLeft: 4 }}
          />
        </label>
      </header>

      <main className="container">
        <Chessboard fen={fen} onUserMove={onUserMove} legalMoves={getLegalMoves()} />
        <EvalBar score={score} />
        <PVList pvs={pvs} onApply={applyPV} />
      </main>
    </div>
  );
}

function sortById<T extends { id: number }>(arr: T[]): T[] {
  return arr.slice().sort((a, b) => a.id - b.id);
}