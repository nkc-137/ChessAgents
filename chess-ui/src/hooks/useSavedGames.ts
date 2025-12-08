import { useCallback, useEffect, useState } from 'react';
import { getRecentGames, type StoredGame } from '@/lib/db';

export function useSavedGames(username: string, pageSize = 10) {
  const [games, setGames] = useState<StoredGame[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const loadPage = useCallback(
    async (pageToLoad: number) => {
      const trimmed = username.trim();
      if (!trimmed) {
        setGames([]);
        setStatus(null);
        setHasMore(false);
        return;
      }
      setStatus('Loading saved games…');
      try {
        const { games: next, hasMore: more } = await getRecentGames(
          trimmed,
          pageSize,
          pageToLoad * pageSize
        );
        setGames(next);
        setHasMore(more);
        setStatus(next.length ? null : 'No saved games yet.');
      } catch (err) {
        console.error('Failed to load saved games', err);
        setStatus('Failed to load saved games.');
        setHasMore(false);
      }
    },
    [pageSize, username]
  );

  useEffect(() => {
    setPage(0);
  }, [username]);

  useEffect(() => {
    loadPage(page);
  }, [loadPage, page]);

  const goPrev = useCallback(() => {
    setPage((p) => Math.max(0, p - 1));
  }, []);

  const goNext = useCallback(() => {
    setPage((p) => (hasMore ? p + 1 : p));
  }, [hasMore]);

  const refresh = useCallback(() => loadPage(page), [loadPage, page]);

  return { games, status, page, hasMore, goPrev, goNext, refresh };
}
