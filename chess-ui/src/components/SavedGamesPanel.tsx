import { type StoredGame } from '@/lib/db';

type Props = {
  games: StoredGame[];
  status: string | null;
  page: number;
  hasMore: boolean;
  onPrev: () => void;
  onNext: () => void;
  onSelect: (game: StoredGame) => void;
};

const formatEndTime = (ts?: number) => {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '—';
  }
};

export function SavedGamesPanel({ games, status, page, hasMore, onPrev, onNext, onSelect }: Props) {
  return (
    <div className="sidebar-status" style={{ marginTop: 12, padding: 8, border: '1px solid #eee', borderRadius: 8, background: '#fafafa' }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Saved games (latest 10)</div>
      {status && !games.length && <div>{status}</div>}
      {!status && !games.length && <div>No saved games yet.</div>}
      {games.map((g) => (
        <button
          key={`${g.username}-${g.end_time_utc}-${g.pgn?.length ?? 0}`}
          type="button"
          onClick={() => onSelect(g)}
          style={{
            padding: '8px 6px',
            border: '1px solid #eee',
            borderRadius: 6,
            background: '#fff',
            textAlign: 'left',
            width: '100%',
            marginBottom: 6,
            cursor: 'pointer',
          }}
        >
          <div style={{ fontWeight: 600 }}>{(g.white ?? 'Unknown')} vs {(g.black ?? 'Unknown')}</div>
          <div style={{ fontSize: 12, color: '#666', display: 'flex', justifyContent: 'space-between' }}>
            <span>{formatEndTime(g.end_time_utc)}</span>
            <span>{g.result ?? ''}</span>
          </div>
        </button>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
        <button
          type="button"
          className="nav-button"
          onClick={onPrev}
          disabled={page === 0}
          style={{ fontSize: 12 }}
        >
          ◀ Prev
        </button>
        <div style={{ fontSize: 12, color: '#555' }}>Page {page + 1}</div>
        <button
          type="button"
          className="nav-button"
          onClick={onNext}
          disabled={!hasMore}
          style={{ fontSize: 12 }}
        >
          Next ▶
        </button>
      </div>
    </div>
  );
}
