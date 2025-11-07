import hashlib
import os
from pathlib import Path
from typing import Optional, List, Any, Tuple

from sqlalchemy import Engine
from sqlmodel import SQLModel, Field, Session, select
from sqlmodel import create_engine

# ===== Default SQLite / SQLModel Backend =====
BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_DB_PATH = BASE_DIR / "database"
DEFAULT_DB_PATH.mkdir(parents=True, exist_ok=True)
DB_PATH = os.getenv("CGE_DB_PATH", DEFAULT_DB_PATH / "cge.db")
_engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})


def get_session() -> Session:
    return Session(_engine)


def get_engine() -> Engine:
    return _engine


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
    eco_url: Optional[str] = None
    eco: Optional[str] = None
    opening: Optional[str] = None
    end_time_utc: Optional[int] = None


class SqlModelGameRepository:
    """Concrete repository backed by SQLite via SQLModel."""
    def __init__(self):
        self._engine = _engine

    def init(self) -> None:
        SQLModel.metadata.create_all(self._engine)

    def _session(self) -> Session:
        return Session(self._engine)

    def upsert_games(self, games: List[Any], session: Optional[Session] = None) -> Tuple[int, int]:
        own_session = False
        if session is None:
            session = self._session()
            own_session = True
        inserted, skipped = 0, 0
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
                    eco_url=getattr(g, "eco_url", None),
                    eco=getattr(g, "eco", None),
                    opening=(getattr(g, "opening_name", None)),
                    end_time_utc=getattr(g, "end_time_utc", None),
                )

                session.add(row)
                inserted += 1

            if own_session:
                session.commit()
                session.close()
            else:
                session.commit()
        return inserted, skipped


def _pgn_hash(pgn: str) -> str:
    return hashlib.sha1(pgn.encode("utf-8", errors="ignore")).hexdigest()
