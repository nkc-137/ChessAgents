from __future__ import annotations
from dataclasses import dataclass
from typing import List, Optional
import re

from sqlmodel import Session, select
from repositories.game_store import GameRow, _engine

# --- Lightweight PGN header parsing helpers ---
_HDR_RE = re.compile(r"^\[([^\s]+)\s+\"(.*?)\"\]$", re.MULTILINE)


def pgn_headers(pgn: str) -> dict:
    headers = {}
    if not pgn:
        return headers
    for m in _HDR_RE.finditer(pgn):
        headers[m.group(1)] = m.group(2)
    return headers


def header_eco(pgn: str) -> Optional[str]:
    return pgn_headers(pgn).get("ECO")


def header_opening(pgn: str) -> Optional[str]:
    return pgn_headers(pgn).get("Opening")


@dataclass
class GameView:
    id: int
    year: int
    month: int
    white: Optional[str]
    black: Optional[str]
    result: Optional[str]
    eco: Optional[str]
    opening: Optional[str]


class GameAnalyzer:
    """Read-only analysis helpers over the ingested DB.

    - Fetch games by ECO code/prefix with fallback to PGN headers
    - Fetch games the given user won/lost/drew (based on White/Black + Result)
    """

    def __init__(self):
        self._engine = _engine

    def _session(self) -> Session:
        return Session(self._engine)

    # --- Core mappers ---
    @staticmethod
    def _to_view(row: GameRow) -> GameView:
        eco = row.eco or header_eco(row.pgn or "")
        opening = header_opening(row.pgn or "")
        return GameView(
            id=row.id or 0,
            year=row.year,
            month=row.month,
            white=row.white,
            black=row.black,
            result=row.result,
            eco=eco,
            opening=opening,
        )

    # --- Queries ---
    def list_games(self, limit: int = 50, offset: int = 0) -> List[GameView]:
        with self._session() as s:
            rows = s.exec(select(GameRow).offset(offset).limit(limit)).all()
            return [self._to_view(r) for r in rows]

    def games_by_eco(self, eco: str, prefix: bool = True, limit: int = 50, offset: int = 0) -> List[GameView]:
        """Return games whose ECO matches a code or prefix (e.g., 'B90').
        Falls back to scanning PGN headers when DB eco is null.
        """
        pattern = f"{eco.upper()}%" if prefix else eco.upper()
        with self._session() as s:
            # First pass: filter via DB eco when present
            stmt = select(GameRow).where(GameRow.eco.ilike(pattern)).offset(offset).limit(limit)
            db_hits = s.exec(stmt).all()

            # If we didn't fill the quota or eco is missing, scan PGN headers
            if len(db_hits) < limit:
                remaining = limit - len(db_hits)
                # Look for rows where eco is NULL and header ECO matches
                null_stmt = select(GameRow).where(GameRow.eco == None).offset(0).limit(5000)  # safety cap
                null_rows = s.exec(null_stmt).all()
                header_hits: List[GameRow] = []
                for r in null_rows:
                    eco_hdr = header_eco(r.pgn or "")
                    if not eco_hdr:
                        continue
                    if prefix:
                        if eco_hdr.upper().startswith(eco.upper()):
                            header_hits.append(r)
                    else:
                        if eco_hdr.upper() == eco.upper():
                            header_hits.append(r)
                    if len(header_hits) >= remaining:
                        break
                all_rows = db_hits + header_hits
            else:
                all_rows = db_hits

            return [self._to_view(r) for r in all_rows[:limit]]

    def games_by_result(self, username: str, outcome: str, limit: int = 50, offset: int = 0) -> List[GameView]:
        """Return games that the given user (by username) won/lost/drew.
        Outcome: 'win' | 'loss' | 'draw'
        Uses White/Black usernames vs Result ('1-0','0-1','1/2-1/2').
        """
        outcome = outcome.lower()
        assert outcome in {"win", "loss", "draw"}, "outcome must be win|loss|draw"
        uname = username.lower()

        def is_win(r: GameRow) -> bool:
            if not r.result:
                return False
            if (r.white or "").lower() == uname:
                return r.result == "1-0"
            if (r.black or "").lower() == uname:
                return r.result == "0-1"
            return False

        def is_loss(r: GameRow) -> bool:
            if not r.result:
                return False
            if (r.white or "").lower() == uname:
                return r.result == "0-1"
            if (r.black or "").lower() == uname:
                return r.result == "1-0"
            return False

        def is_draw(r: GameRow) -> bool:
            return r.result == "1/2-1/2"

        predicate = {"win": is_win, "loss": is_loss, "draw": is_draw}[outcome]

        with self._session() as s:
            # Pull a reasonable window; you can paginate via offset/limit
            rows = s.exec(select(GameRow).offset(offset).limit(limit * 10)).all()
            filtered: List[GameRow] = [r for r in rows if predicate(r)]
            return [self._to_view(r) for r in filtered[:limit]]


# --- Convenience functions if you prefer functions over class ---
_default = GameAnalyzer()

def list_games(limit: int = 50, offset: int = 0) -> List[GameView]:
    return _default.list_games(limit, offset)


def games_by_eco(eco: str, prefix: bool = True, limit: int = 50, offset: int = 0) -> List[GameView]:
    return _default.games_by_eco(eco, prefix, limit, offset)


def games_won(username: str, limit: int = 50, offset: int = 0) -> List[GameView]:
    return _default.games_by_result(username, "win", limit, offset)


def games_lost(username: str, limit: int = 50, offset: int = 0) -> List[GameView]:
    return _default.games_by_result(username, "loss", limit, offset)


def games_drawn(username: str, limit: int = 50, offset: int = 0) -> List[GameView]:
    return _default.games_by_result(username, "draw", limit, offset)
