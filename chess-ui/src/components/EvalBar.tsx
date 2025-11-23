export type Score = { cp?: number; mate?: number };

type Props = {
  score: Score;
  primaryScore?: Score;
};

export default function EvalBar({ score, primaryScore }: Props) {
  const displayScore = primaryScore ?? score;
  const pct = (() => {
    if (score?.mate !== undefined) return score.mate > 0 ? 5 : 95; // white wins -> small black band
    const pawns = (score?.cp ?? 0) / 100;
    const clamped = Math.max(-10, Math.min(10, pawns));
    return 50 - clamped * 2.5; // map ±10 pawns to 0..100%
  })();
  const fillPct = Math.max(0, Math.min(100, pct));
  const gradient = (() => {
    if (score?.mate !== undefined) {
      return score.mate > 0
        ? 'linear-gradient(to bottom, #fff 0%, #fff 100%)'
        : 'linear-gradient(to bottom, #000 0%, #000 100%)';
    }
    return `linear-gradient(to bottom, #000 0%, #000 ${fillPct}%, #fff ${fillPct}%, #fff 100%)`;
  })();

  const formattedScore = formatScore(displayScore);
  const isBlackAdvantage = hasBlackAdvantage(displayScore);

  return (
    <div style={{ 
      width: 20, 
      height: 560, 
      position: 'relative', 
      background: gradient,
      borderRadius: '4px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
    }}>
      {score?.mate === undefined && (
        <div style={{ 
          position: 'absolute', 
          left: 0, 
          right: 0, 
          height: 3, 
          background: '#ef4444', 
          top: `${pct}%`,
          borderRadius: '2px',
          boxShadow: '0 0 4px rgba(239, 68, 68, 0.5)'
        }} />
      )}
      {formattedScore && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translate(-50%, 0)',
            top: isBlackAdvantage ? -32 : undefined,
            bottom: !isBlackAdvantage ? -32 : undefined,
            padding: '4px 8px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            color: isBlackAdvantage ? '#f3f4f6' : '#111827',
            background: isBlackAdvantage ? 'rgba(0, 0, 0, 0.65)' : 'rgba(255, 255, 255, 0.85)',
            boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          {formattedScore}
        </div>
      )}
    </div>
  );
}

function formatScore(score?: Score) {
  if (!score) return '';
  if (score.mate !== undefined) {
    return `M${Math.abs(score.mate)}`;
  }
  if (score.cp === undefined) return '';
  const pawns = Math.abs(score.cp) / 100;
  return pawns.toFixed(2);
}

function hasBlackAdvantage(score?: Score) {
  if (!score) return false;
  if (score.mate !== undefined) return score.mate < 0;
  if (score.cp !== undefined) return score.cp < 0;
  return false;
}
