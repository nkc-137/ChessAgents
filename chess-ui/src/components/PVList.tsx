import type { Score } from './EvalBar';

export type PV = { id: number; score: Score; line: string[]; san?: string[] };

type Props = {
  pvs: PV[];
  onPreview?: (uciLine: string[]) => void;
  onApply?: (uciLine: string[]) => void;
};

export default function PVList({ pvs, onPreview, onApply }: Props) {
  return (
    <div className="sidebar">
      <h3>Engine Lines</h3>
      {pvs.map((pv) => (
        <div key={pv.id} style={{ padding: 8, border: '1px solid #eee', borderRadius: 8 }}
             onMouseEnter={() => onPreview?.(pv.line)}
             onMouseLeave={() => onPreview?.([])}
             onClick={() => onApply?.(pv.line)}>
          <div style={{ fontWeight: 600 }}>#{pv.id} {fmtScore(pv.score)}</div>
          <div style={{ fontSize: 13, opacity: 0.9, wordBreak: 'break-word' }}>
            {pv.san?.slice(0, 20).join(' ') ?? pv.line.join(' ')}
          </div>
        </div>
      ))}
    </div>
  );
}

function fmtScore(s: Score) {
  if (s.mate !== undefined) return `M${Math.abs(s.mate)}`;
  const pawns = (s.cp ?? 0) / 100;
  return pawns.toFixed(2);
}