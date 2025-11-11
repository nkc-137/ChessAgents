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

  // --- Engine readiness + helpers ---
  const engineReadyRef = useRef(false);
  const waitReadyResolvers = useRef<(() => void)[]>([]);
  const send = (cmd: string) => workerRef.current?.postMessage(cmd);
  const isReady = () =>
    new Promise<void>((resolve) => {
      if (engineReadyRef.current) return resolve();
      waitReadyResolvers.current.push(resolve);
      send('isready');
    });

  const [score, setScore] = useState<Score>({ cp: 0 });
  const [pvs, setPvs] = useState<PV[]>([]);
  const [depth, setDepth] = useState<number>(16);
  const [multiPV, setMultiPV] = useState<number>(3);
  const [moveHistory, setMoveHistory] = useState<string[]>([new Chess().fen()]);
  const [currentMoveIndex, setCurrentMoveIndex] = useState<number>(0);

  type CachedEval = { score?: Score; pvs: PV[]; depth: number; multiPV: number; ts: number };
  const cacheRef = useRef<Map<string, CachedEval>>(new Map());
  const activeKeyRef = useRef<string>('');     // key for the search currently running in the worker
  const currentKeyRef = useRef<string>('');    // key representing the UI's current (fen,depth,multipv)

  // Initialize Stockfish worker
  useEffect(() => {
    const w = new Worker('/stockfish/stockfish.js'); // classic worker served from public/
    workerRef.current = w;

    // Temporary accumulator for the currently active key
    let acc: { [id: number]: PV } = {};
    let lastScore: Score | undefined = undefined;

    w.onmessage = (e) => {
      const data = String(e.data);

      // UCI handshake & readiness
      if (data === 'uciok') {
        send('isready');
        return;
      }
      if (data === 'readyok') {
        engineReadyRef.current = true;
        // release all waiters
        for (const r of waitReadyResolvers.current) r();
        waitReadyResolvers.current = [];
        return;
      }

      // Only process messages for the actively requested key. If user navigated, ignore stale output.
      if (activeKeyRef.current !== currentKeyRef.current) return;

      if (data.startsWith('info')) {
        const p = parseInfo(data);
        if (!p) return;

        if (p.score) lastScore = p.score;

        if (p.pv && p.multiPv) {
          acc[p.multiPv] = { id: p.multiPv, score: p.score ?? lastScore ?? {}, line: p.pv };
          // Reflect live updates in UI (sorted by id)
          const arr = Object.values(acc).sort((a, b) => a.id - b.id);
          setPvs(arr);
          if (p.score) setScore(p.score);
        }
      } else if (data.startsWith('bestmove')) {
        // Finalize and cache for the current active key
        const finalArr = Object.values(acc).sort((a, b) => a.id - b.id);
        cacheRef.current.set(currentKeyRef.current, {
          score: lastScore,
          pvs: finalArr,
          depth,
          multiPV,
          ts: Date.now(),
        });
        // Reset accumulator for next search
        acc = {};
        lastScore = undefined;
      }
    };

    // init the engine
    send('uci');

    return () => w.terminate();
  }, []);

  const makeKey = useCallback((f: string, d: number, m: number) => `${f}|d=${d}|m=${m}`, []);

  const startSearch = useCallback(async (f: string, key: string) => {
    activeKeyRef.current = key;
    setPvs([]);

    // Stop whatever was running
    send('stop');

    // Ensure engine is ready before setting options/position/go
    await isReady();

    // Safe defaults for WASM build
    send('setoption name Threads value 1');
    send(`setoption name MultiPV value ${multiPV}`);
    // Optional: keep hash small in the browser to avoid memory issues
    send('setoption name Hash value 16');

    send(`position fen ${f}`);

    // Barrier to avoid racing setoption/position vs go
    await isReady();

    send(`go depth ${depth}`);
  }, [depth, multiPV]);

  const showFromCacheOrAnalyze = useCallback((f: string) => {
    const key = makeKey(f, depth, multiPV);
    currentKeyRef.current = key;

    const cached = cacheRef.current.get(key);
    if (cached) {
      // Serve from cache, no engine call
      setScore(cached.score ?? { cp: 0 });
      setPvs(cached.pvs);

      // Also stop any leftover search to save CPU and reduce races
      send('stop');
      activeKeyRef.current = '';
      return;
    }
    // Not cached → start a new search
    startSearch(f, key);
  }, [depth, multiPV, makeKey, startSearch]);

  // Run whenever fen OR engine settings change
  useEffect(() => {
    showFromCacheOrAnalyze(fen);
  }, [fen, depth, multiPV, showFromCacheOrAnalyze]);

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