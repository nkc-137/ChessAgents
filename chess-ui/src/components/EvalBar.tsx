export type Score = { cp?: number; mate?: number };

export default function EvalBar({ score }: { score: Score }) {
  const pct = (() => {
    if (score?.mate !== undefined) return score.mate > 0 ? 5 : 95; // white wins -> small black band
    const pawns = (score?.cp ?? 0) / 100;
    const clamped = Math.max(-10, Math.min(10, pawns));
    return 50 - clamped * 2.5; // map ±10 pawns to 0..100%
  })();

  return (
    <div style={{ width: 16, height: 540, position: 'relative', background: 'linear-gradient(#000,#fff)' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, height: 2, background: 'red', top: `${pct}%` }} />
    </div>
  );
}