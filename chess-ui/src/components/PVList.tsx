import type { Score } from './EvalBar';

export type PV = { id: number; score: Score; line: string[]; san?: string[] };

type Props = {
  pvs: PV[];
  onPreview?: (uciLine: string[]) => void;
  onApply?: (uciLine: string[]) => void;
};

export default function PVList({ pvs, onPreview, onApply }: Props) {
  return (
    <div style={{ padding: '16px', overflowY: 'auto', maxHeight: 'calc(100vh - 200px)' }}>
      {pvs.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '40px 20px', 
          color: '#999',
          fontSize: '14px'
        }}>
          Waiting for engine analysis...
        </div>
      ) : (
        pvs.map((pv) => (
          <div 
            key={pv.id} 
            style={{ 
              padding: '12px', 
              marginBottom: '12px',
              border: '1px solid #e5e7eb', 
              borderRadius: '8px',
              background: pv.id === 1 ? '#f0f9ff' : '#fff',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: pv.id === 1 ? '0 2px 8px rgba(59, 130, 246, 0.1)' : '0 1px 3px rgba(0,0,0,0.05)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
              onPreview?.(pv.line);
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = pv.id === 1 ? '0 2px 8px rgba(59, 130, 246, 0.1)' : '0 1px 3px rgba(0,0,0,0.05)';
              onPreview?.([]);
            }}
            onClick={() => onApply?.(pv.line)}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px'
            }}>
              <div style={{ 
                fontWeight: 700, 
                fontSize: '16px',
                color: pv.id === 1 ? '#2563eb' : '#374151'
              }}>
                #{pv.id}
              </div>
              <div style={{ 
                fontWeight: 600, 
                fontSize: '15px',
                color: pv.id === 1 ? '#2563eb' : '#059669',
                padding: '4px 12px',
                background: pv.id === 1 ? '#dbeafe' : '#d1fae5',
                borderRadius: '6px'
              }}>
                {fmtScore(pv.score)}
              </div>
            </div>
            <div style={{ 
              fontSize: '13px', 
              color: '#6b7280',
              wordBreak: 'break-word',
              lineHeight: '1.6',
              fontFamily: 'monospace'
            }}>
              {pv.san?.slice(0, 25).join(' ') ?? pv.line.slice(0, 10).join(' ')}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function fmtScore(s: Score) {
  if (s.mate !== undefined) return `M${Math.abs(s.mate)}`;
  const pawns = (s.cp ?? 0) / 100;
  return pawns.toFixed(2);
}