export const DB_NAME = 'chess-agent';
export const DB_VERSION = 1;
export const GAMES_STORE = 'games';

export type StoredGame = {
  username: string;
  pgn: string;
  year: number;
  month: number;
  white?: string | null;
  black?: string | null;
  result?: string | null;
  time_control?: string | null;
  eco_url?: string | null;
  eco?: string | null;
  opening_name?: string | null;
  end_time_utc?: number;
};

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(GAMES_STORE)) {
        db.createObjectStore(GAMES_STORE, { keyPath: ['username', 'end_time_utc'] });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveGames(games: StoredGame[]) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(GAMES_STORE, 'readwrite');
    const store = tx.objectStore(GAMES_STORE);
    games.forEach(game => {
      const normalized = {
        ...game,
        end_time_utc: game.end_time_utc ?? Date.now(),
      };
      store.put(normalized);
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getRecentGames(username: string, limit = 10): Promise<StoredGame[]> {
  if (!username.trim()) return [];
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(GAMES_STORE, 'readonly');
    const store = tx.objectStore(GAMES_STORE);
    const range = IDBKeyRange.bound(
      [username, 0],
      [username, Number.MAX_SAFE_INTEGER]
    );
    const req = store.openCursor(range, 'prev'); // walk newest first
    const out: StoredGame[] = [];
    let resolved = false;

    req.onsuccess = () => {
      if (resolved) return;
      const cursor = req.result;
      if (!cursor) {
        resolved = true;
        return resolve(out);
      }
      out.push(cursor.value as StoredGame);
      if (out.length >= limit) {
        resolved = true;
        return resolve(out);
      }
      cursor.continue();
    };
    req.onerror = () => {
      if (!resolved) reject(req.error);
    };
  });
}
