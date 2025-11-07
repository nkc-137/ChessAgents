# app/main.py
from __future__ import annotations
import io
import json
import logging
from dataclasses import dataclass
from typing import List, Optional, Dict, Literal
from fastapi import FastAPI, HTTPException, Path, Query, Depends
from pydantic import BaseModel
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from sqlmodel import SQLModel, Session
from app.deps import db_session
from facade.game_store_facade import GameStoreFacade
from openings.opening_families import OpeningFamilies
from repositories.sql_model_game_repository import get_engine
from app.agent_queries import AgentQueryService
from chess.pgn import read_game


logger = logging.getLogger("uvicorn.error")
USER_AGENT = "ChessAgent/0.1 (+https://example.local)"
BASE = "https://api.chess.com/pub/player/{username}/games/{year:04d}/{month:02d}"


# ---------------------------
# Models for fetch API I/O
# ---------------------------

@dataclass
class Game:
    pgn: str
    year: int
    month: int
    white: Optional[str] = None
    black: Optional[str] = None
    result: Optional[str] = None
    time_control: Optional[str] = None
    eco_url: Optional[str] = None
    eco: Optional[str] = None
    opening_name: Optional[str] = None
    end_time_utc: Optional[int] = None


class GameOut(BaseModel):
    pgn: str
    year: int
    month: int
    white: Optional[str] = None
    black: Optional[str] = None
    result: Optional[str] = None
    time_control: Optional[str] = None
    eco_url: Optional[str] = None
    eco: Optional[str] = None
    opening_name: Optional[str] = None
    end_time_utc: Optional[int] = None


# ---------------------------
# App init
# ---------------------------
app = FastAPI(title="ChessAgent — Unified API", debug=True)
store: GameStoreFacade | None = None


@app.on_event("startup")
def on_startup() -> None:
    """Init store and ensure tables exist once."""
    global store
    store = GameStoreFacade.from_env()
    engine = get_engine()
    SQLModel.metadata.create_all(engine)


@app.get("/", tags=["meta"])
def root():
    return {"ok": True, "service": app.title}


# ---------------------------
# Fetch helpers
# ---------------------------
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
            # No games for that month → empty payload
            return {"games": []}
        raise
    except URLError as e:
        raise RuntimeError(f"Network error fetching {url}: {e}") from e


def month_url(username: str, year: int, month: int) -> str:
    return BASE.format(username=username, year=year, month=month)


def fetch_games_in_month(username: str, year: int, month: int) -> List[Game]:
    """Fetch finished games for a player in a specific month (Chess.com public API)."""
    url = month_url(username, year, month)
    payload = _get_json(url)
    out: List[Game] = []
    for g in payload.get("games", []):
        pgn = g.get("pgn") or ""
        pgn_game = read_game(io.StringIO(pgn))
        eco_code = pgn_game.headers.get("ECO")
        result = pgn_game.headers.get("Result")
        out.append(
            Game(
                pgn=pgn,
                year=year,
                month=month,
                white=(g.get("white") or {}).get("username"),
                black=(g.get("black") or {}).get("username"),
                result=result,
                time_control=g.get("time_control"),
                eco_url=g.get("eco"),
                eco=eco_code,
                # family_from_eco_or_name accepts (eco, opening_name); we only have ECO here
                opening_name=OpeningFamilies.family_from_eco_or_name(eco_code, None),
                end_time_utc=g.get("end_time"),
            )
        )
    return out


def ingest_month_into_db(username: str, year: int, month: int, session: Session) -> dict:
    """Helper: ingest one month using an existing per-request Session."""
    games = fetch_games_in_month(username, year, month)
    assert store is not None, "Store not initialized"
    counts = store.ingest(games, session=session)  # pass shared session
    return {**counts, "username": username, "year": year, "month": month}


# ---------------------------
# Fetch + Ingest endpoints
# ---------------------------
@app.get("/games/{username}/{year}/{month}", response_model=List[GameOut], tags=["fetch"])
def get_games_for_month_endpoint(
    username: str,
    year: int = Path(..., ge=2007),
    month: int = Path(..., ge=1, le=12),
):
    try:
        games = fetch_games_in_month(username, year, month)
    except Exception as e:
        logger.exception("GET /games/%s/%s/%s failed", username, year, month)
        raise HTTPException(status_code=502, detail=f"Upstream fetch failed: {e}") from e
    return [GameOut(**g.__dict__) for g in games]


@app.post("/ingest/{username}/{year}/{month}", tags=["ingest"])
def ingest_month_endpoint(
    username: str,
    year: int = Path(..., ge=2007),
    month: int = Path(..., ge=1, le=12),
    session: Session = Depends(db_session),
):
    try:
        result = ingest_month_into_db(username, year, month, session)
    except Exception as e:
        logger.exception("POST /ingest/%s/%s/%s failed", username, year, month)
        raise HTTPException(status_code=502, detail=f"Ingest failed: {e}") from e
    return result


# ---------------------------
# Agent endpoints (use same session)
# ---------------------------
Color = Literal["white", "black"]
Result = Literal["win", "loss", "draw"]
OrderBy = Literal["date", "id"]
OrderDir = Literal["asc", "desc"]


@app.get("/agent/games", tags=["agent"])
def agent_games(
    username: str,
    opening_like: Optional[str] = Query(None, description="Substring match on opening name"),
    eco_prefix: Optional[str] = Query(None, description="ECO code prefix, e.g. 'B9'"),
    family: Optional[str] = Query(None, description="Opening family (e.g., 'Sicilian Defense')"),
    color: Optional[Color] = Query(None, description="'white' or 'black' (your color)"),
    result: Optional[Result] = Query(None, description="'win'|'loss'|'draw' from your POV"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    order_by: OrderBy = "id",
    order_dir: OrderDir = "desc",
    session: Session = Depends(db_session),
) -> List[Dict]:
    svc = AgentQueryService(username, session=session)
    return svc.games(
        opening_like=opening_like,
        eco_prefix=eco_prefix,
        family=family,
        color=color,
        result=result,
        limit=limit,
        offset=offset,
        order_by=order_by,
        order_dir=order_dir,
    )


@app.get("/agent/games/wins", tags=["agent"])
def agent_wins(
    username: str,
    opening_like: Optional[str] = None,
    eco_prefix: Optional[str] = None,
    family: Optional[str] = None,
    color: Optional[Color] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    session: Session = Depends(db_session),
) -> List[Dict]:
    svc = AgentQueryService(username, session=session)
    return svc.wins(opening_like=opening_like, eco_prefix=eco_prefix, family=family, color=color,
                    limit=limit, offset=offset)


@app.get("/agent/games/losses", tags=["agent"])
def agent_losses(
    username: str,
    opening_like: Optional[str] = None,
    eco_prefix: Optional[str] = None,
    family: Optional[str] = None,
    color: Optional[Color] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    session: Session = Depends(db_session),
) -> List[Dict]:
    svc = AgentQueryService(username, session=session)
    return svc.losses(opening_like=opening_like, eco_prefix=eco_prefix, family=family, color=color,
                      limit=limit, offset=offset)


@app.get("/agent/games/draws", tags=["agent"])
def agent_draws(
    username: str,
    opening_like: Optional[str] = None,
    eco_prefix: Optional[str] = None,
    family: Optional[str] = None,
    color: Optional[Color] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    session: Session = Depends(db_session),
) -> List[Dict]:
    svc = AgentQueryService(username, session=session)
    return svc.draws(opening_like=opening_like, eco_prefix=eco_prefix, family=family, color=color,
                     limit=limit, offset=offset)
