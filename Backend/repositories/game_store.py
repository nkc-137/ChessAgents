from __future__ import annotations
import os
import hashlib
from typing import Tuple, List, Optional, Any

from sqlmodel import SQLModel, Field, create_engine, Session, select

from repositories.game_repository import GameRepository


# ===== Facade & Contracts =====

class GameStore:
    """Facade that hides which backend we use (SQLite/SQLModel, Postgres, etc.)."""
    def __init__(self, repo: GameRepository):
        self.repo = repo
        self.repo.init()

    @staticmethod
    def from_env() -> "GameStore":
        """
        Select a backend via CGE_DB_BACKEND env var.
        Supported: 'sqlmodel' (default).
        """
        backend = os.getenv("CGE_DB_BACKEND", "sqlmodel").lower()
        if backend == "sqlmodel":
            return GameStore(SqlModelGameRepository())
        raise ValueError(f"Unsupported backend: {backend}")

    def ingest(self, games: List[Any]) -> dict:
        inserted, skipped = self.repo.upsert_games(games)
        return {"inserted": inserted, "skipped": skipped}


# ===== Default SQLite / SQLModel Backend =====

DB_PATH = os.getenv("CGE_DB_PATH", "database/cge.db")
_engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})


class GameRow(SQLModel, table=True):
    """
    Minimal schema for persistence. We avoid importing the app's Game dataclass here
    and instead accept any object with similar attributes in the repository methods.
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    pgn_sha1: str = Field(index=True, unique=True)
    pgn: str
    year: int
    month: int
    white: Optional[str] = None
    black: Optional[str] = None
    result: Optional[str] = None
    time_control: Optional[str] = None
    eco: Optional[str] = None
    opening: Optional[str] = None
    end_time_utc: Optional[int] = None


def _pgn_hash(pgn: str) -> str:
    return hashlib.sha1(pgn.encode("utf-8", errors="ignore")).hexdigest()


class SqlModelGameRepository:
    """Concrete repository backed by SQLite via SQLModel."""
    def __init__(self):
        self._engine = _engine

    def init(self) -> None:
        SQLModel.metadata.create_all(self._engine)

    def _session(self) -> Session:
        return Session(self._engine)

    def upsert_games(self, games: List[Any]) -> Tuple[int, int]:
        inserted = 0
        skipped = 0
        with self._session() as session:
            for g in games:
                # 'g' can be any object with attributes (pgn, year, month, white, black, ...)
                pgn = getattr(g, "pgn", "") or ""
                digest = _pgn_hash(pgn)
                exists = session.exec(select(GameRow).where(GameRow.pgn_sha1 == digest)).first()
                if exists:
                    skipped += 1
                    continue
                row = GameRow(
                    pgn_sha1=digest,
                    pgn=pgn,
                    year=int(getattr(g, "year", 0) or 0),
                    month=int(getattr(g, "month", 0) or 0),
                    white=getattr(g, "white", None),
                    black=getattr(g, "black", None),
                    result=getattr(g, "result", None),
                    time_control=getattr(g, "time_control", None),
                    eco=getattr(g, "eco", None),
                    end_time_utc=getattr(g, "end_time_utc", None),
                )
                session.add(row)
                inserted += 1
            session.commit()
        return inserted, skipped