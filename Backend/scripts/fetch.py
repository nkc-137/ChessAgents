from __future__ import annotations
from dataclasses import dataclass
from typing import List, Optional
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
import json
from fastapi import FastAPI, HTTPException, Query, Path
from pydantic import BaseModel
from repositories.game_store import GameStore

USER_AGENT = "ChessAgent/0.1 (+https://example.local)"
BASE = "https://api.chess.com/pub/player/{username}/games/{year:04d}/{month:02d}"


@dataclass
class Game:
    pgn: str
    year: int
    month: int
    white: Optional[str] = None
    black: Optional[str] = None
    result: Optional[str] = None
    time_control: Optional[str] = None
    eco: Optional[str] = None
    end_time_utc: Optional[int] = None  # from EndTime/UTC fields if present


class GameOut(BaseModel):
    pgn: str
    year: int
    month: int
    white: Optional[str] = None
    black: Optional[str] = None
    result: Optional[str] = None
    time_control: Optional[str] = None
    eco: Optional[str] = None
    end_time_utc: Optional[int] = None

store: GameStore | None = None

app = FastAPI(title="ChessAgent — Chess.com Fetch API")

@app.on_event("startup")
def on_startup():
    global store
    store = GameStore.from_env()


def _get_json(url: str) -> dict:
    req = Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urlopen(req, timeout=20) as resp:
            if resp.status != 200:
                raise HTTPError(url, resp.status, f"HTTP {resp.status}", resp.headers, None)
            data = resp.read().decode("utf-8")
            return json.loads(data)
    except HTTPError as e:
        if e.code == 404:
            # No games / bad month → return empty payload
            return {"games": []}
        raise
    except URLError as e:
        raise RuntimeError(f"Network error fetching {url}: {e}") from e


def month_url(username: str, year: int, month: int) -> str:
    return BASE.format(username=username, year=year, month=month)


def fetch_games_in_month(username: str, year: int, month: int) -> List[Game]:
    """Fetch finished games for a player in a specific month using Chess.com public API.

    Returns a list of Game objects (one per game). No third‑party SDK/library is used.
    """
    url = month_url(username, year, month)
    payload = _get_json(url)
    out: List[Game] = []
    for g in payload.get("games", []):
        pgn = g.get("pgn") or ""
        out.append(
            Game(
                pgn=pgn,
                year=year,
                month=month,
                white=(g.get("white") or {}).get("username"),
                black=(g.get("black") or {}).get("username"),
                result=g.get("result"),
                time_control=g.get("time_control"),
                eco=g.get("eco"),
                end_time_utc=g.get("end_time"),
            )
        )
    return out

def ingest_month_into_db(username: str, year: int, month: int) -> dict:
    games = fetch_games_in_month(username, year, month)
    assert store is not None, "Store not initialized"
    counts = store.ingest(games)
    return {**counts, "username": username, "year": year, "month": month}

@app.get("/games/{username}/{year}/{month}", response_model=List[GameOut])
def get_games_for_month(
    username: str,
    year: int = Path(..., ge=2007),
    month: int = Path(..., ge=1, le=12),
):
    try:
        games = fetch_games_in_month(username, year, month)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Upstream fetch failed: {e}")
    return [GameOut(**g.__dict__) for g in games]

@app.post("/ingest/{username}/{year}/{month}")
def ingest_month(
    username: str,
    year: int = Path(..., ge=2007),
    month: int = Path(..., ge=1, le=12),
):
    try:
        result = ingest_month_into_db(username, year, month)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Ingest failed: {e}")
    return result

if __name__ == "__main__":
    # Run with: uvicorn fetch:app --reload
    import uvicorn
    uvicorn.run("fetch:app", host="127.0.0.1", port=8000, reload=True)