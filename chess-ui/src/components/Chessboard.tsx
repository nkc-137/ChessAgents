import { useEffect, useRef } from 'react';
import { Chessground } from 'chessground';
import type { Api as CGApi } from 'chessground/api';
import type { Config as CGConfig } from 'chessground/config';

export type Arrow = { from: string; to: string } | null;

type Props = {
  fen: string;
  onUserMove: (from: string, to: string, promotion?: 'q'|'r'|'b'|'n') => void;
  bestMove?: Arrow;
  legalMoves?: Map<string, string[]>;
};

export default function Chessboard({ fen, onUserMove, bestMove, legalMoves }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<CGApi | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const cfg: CGConfig = {
      fen,
      orientation: 'white',
      draggable: { enabled: true, showGhost: true },
      highlight: { lastMove: true, check: true },
      coordinates: false,
      movable: {
        free: false,
        dests: legalMoves || new Map(),
      },
      events: {
        move: (from: any, to: any) => onUserMove(from, to, 'q')
      }
    };
    apiRef.current = Chessground(hostRef.current, cfg);
    return () => apiRef.current?.destroy();
  }, []);

  useEffect(() => {
    apiRef.current?.set({ 
      fen,
      movable: {
        dests: legalMoves || new Map(),
      }
    });
  }, [fen, legalMoves]);

  return (
    <div className="board-wrapper">
      <div ref={hostRef} className="board" />
      {/* Coordinate labels - positioned outside the board */}
      <div className="board-coords">
        {/* Files (a-h) - bottom */}
        <div className="coords-files coords-bottom">
          {['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((file) => (
            <span key={`file-${file}`} className="coord-label">{file}</span>
          ))}
        </div>
        {/* Ranks (1-8) - left side only */}
        <div className="coords-ranks coords-left">
          {[8, 7, 6, 5, 4, 3, 2, 1].map((rank) => (
            <span key={`rank-${rank}`} className="coord-label">{rank}</span>
          ))}
        </div>
      </div>
      {/* optional best-move arrow placeholder */}
      {/* Implement an SVG overlay if you want arrows; omitted for brevity */}
    </div>
  );
}