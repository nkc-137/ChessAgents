import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const [moveHistory, setMoveHistory] = useState<string[]>([new Chess().fen()]);
  const [currentMoveIndex, setCurrentMoveIndex] = useState<number>(0);

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

  const legalMoves = useMemo(() => {
    const dests = new Map<string, string[]>();
    const g = new Chess(fen);
    for (const m of g.moves({ verbose: true })) {
      if (!dests.has(m.from)) dests.set(m.from, []);
      dests.get(m.from)!.push(m.to);
    }
    return dests;
  }, [fen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Prevent page scroll with arrows and ignore auto-repeat while key is held down
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        if ((e as any).repeat) return;
      } else {
        return;
      }

      if (e.key === 'ArrowLeft') {
        if (currentMoveIndex > 0) {
          const newIndex = currentMoveIndex - 1;
          const newFen = moveHistory[newIndex];
          gameRef.current = new Chess(newFen);
          setFen(newFen);
          setCurrentMoveIndex(newIndex);
        }
      } else if (e.key === 'ArrowRight') {
        if (currentMoveIndex < moveHistory.length - 1) {
          const newIndex = currentMoveIndex + 1;
          const newFen = moveHistory[newIndex];
          gameRef.current = new Chess(newFen);
          setFen(newFen);
          setCurrentMoveIndex(newIndex);
        }
      } else if (e.key === 'Home') {
        if (moveHistory.length) {
          const startFen = moveHistory[0];
          gameRef.current = new Chess(startFen);
          setFen(startFen);
          setCurrentMoveIndex(0);
        }
      } else if (e.key === 'End') {
        if (moveHistory.length) {
          const endFen = moveHistory[moveHistory.length - 1];
          gameRef.current = new Chess(endFen);
          setFen(endFen);
          setCurrentMoveIndex(moveHistory.length - 1);
        }
      }
    };
    // passive:false so we can call preventDefault on arrows
    window.addEventListener('keydown', handler, { passive: false });
    return () => window.removeEventListener('keydown', handler as any);
  }, [moveHistory, currentMoveIndex]);

  // Handle user moves
  const onUserMove = useCallback((from: string, to: string, promotion?: 'q'|'r'|'b'|'n') => {
    const g = gameRef.current;
    const mv = g.move({ from, to, promotion: promotion ?? 'q' });
    if (!mv) return;
    const nf = g.fen();
    setFen(nf);
    setMoveHistory(prev => {
      const next = prev.slice(0, currentMoveIndex + 1);
      next.push(nf);
      return next;
    });
    setCurrentMoveIndex(i => i + 1);
  }, [currentMoveIndex]);

  // Handle PGN file upload
  const onPgnUpload = async (f: File) => {
    const raw = await readTextFile(f);
    const games = splitMultiGamePgn(raw);
    const g = new Chess();
    g.loadPgn(games[0], { strict: false });
    gameRef.current = g;

    // Build move history from PGN
    const history: string[] = [];
    const tempGame = new Chess();
    history.push(tempGame.fen());

    const moves = g.history({ verbose: true });
    moves.forEach(move => {
      tempGame.move(move);
      history.push(tempGame.fen());
    });

    setMoveHistory(history);
    setCurrentMoveIndex(history.length - 1);
    setFen(g.fen());
  };

  // Navigation functions
  const goToStart = useCallback(() => {
    if (moveHistory.length === 0) return;
    const startFen = moveHistory[0];
    const g = new Chess(startFen);
    gameRef.current = g;
    setFen(startFen);
    setCurrentMoveIndex(0);
  }, [moveHistory]);

  const goBack = useCallback(() => {
    if (currentMoveIndex > 0) {
      const newIndex = currentMoveIndex - 1;
      const newFen = moveHistory[newIndex];
      const g = new Chess(newFen);
      gameRef.current = g;
      setFen(newFen);
      setCurrentMoveIndex(newIndex);
    }
  }, [moveHistory, currentMoveIndex]);

  const goForward = useCallback(() => {
    if (currentMoveIndex < moveHistory.length - 1) {
      const newIndex = currentMoveIndex + 1;
      const newFen = moveHistory[newIndex];
      const g = new Chess(newFen);
      gameRef.current = g;
      setFen(newFen);
      setCurrentMoveIndex(newIndex);
    }
  }, [moveHistory, currentMoveIndex]);

  const goToEnd = useCallback(() => {
    if (moveHistory.length === 0) return;
    const endFen = moveHistory[moveHistory.length - 1];
    const g = new Chess(endFen);
    gameRef.current = g;
    setFen(endFen);
    setCurrentMoveIndex(moveHistory.length - 1);
  }, [moveHistory]);

  // Apply PV line (best move preview)
  const applyPV = useCallback((uci: string[]) => {
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
      const nf = g.fen();
      gameRef.current = g;
      setFen(nf);
      // Update history - remove any moves after current index, then add new move
      setMoveHistory(prev => {
        const newHistory = prev.slice(0, currentMoveIndex + 1);
        newHistory.push(nf);
        return newHistory;
      });
      setCurrentMoveIndex(prev => prev + 1);
    }
  }, [currentMoveIndex]);

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

      <main className="main-layout">
        <div className="board-panel">
          <div className="panel-header">Chess Board</div>
          <div className="board-section">
            <Chessboard fen={fen} onUserMove={onUserMove} legalMoves={legalMoves} />
            <EvalBar score={score} />
          </div>
          <div className="board-navigation">
            <button
              onClick={goToStart}
              disabled={currentMoveIndex === 0}
              className="nav-button"
              title="Go to start"
            >
              ⏮
            </button>
            <button
              onClick={goBack}
              disabled={currentMoveIndex === 0}
              className="nav-button"
              title="Previous move"
            >
              ◀
            </button>
            <button
              onClick={goForward}
              disabled={currentMoveIndex >= moveHistory.length - 1}
              className="nav-button"
              title="Next move"
            >
              ▶
            </button>
            <button
              onClick={goToEnd}
              disabled={currentMoveIndex >= moveHistory.length - 1}
              className="nav-button"
              title="Go to end"
            >
              ⏭
            </button>
          </div>
        </div>
        <div className="engine-panel">
          <div className="panel-header">Engine Analysis</div>
          <PVList pvs={pvs} onApply={applyPV} />
        </div>
      </main>
    </div>
  );
}

function sortById<T extends { id: number }>(arr: T[]): T[] {
  return arr.slice().sort((a, b) => a.id - b.id);
}