from __future__ import annotations

import os
from typing import List, Any, Optional

from requests import Session

from repositories.game_repository import GameRepository
from repositories.sql_model_game_repository import SqlModelGameRepository


# ===== Facade & Contracts =====

class GameStoreFacade:
    """Facade that hides which backend we use.
    Supports SQLite/SQLModel, Postgres, etc.
    """
    def __init__(self, repo: GameRepository):
        self.repo = repo
        self.repo.init()

    @staticmethod
    def from_env() -> "GameStoreFacade":
        """
        Select a backend via CGE_DB_BACKEND env var.
        Supported: 'sqlmodel' (default).
        """
        backend = os.getenv("CGE_DB_BACKEND", "sqlmodel").lower()
        if backend == "sqlmodel":
            return GameStoreFacade(SqlModelGameRepository())
        raise ValueError(f"Unsupported backend: {backend}")

    def ingest(self, games: List[Any], session: Optional[Session] = None) -> dict:
        inserted, skipped = self.repo.upsert_games(games, session=session)
        return {"inserted": inserted, "skipped": skipped}
