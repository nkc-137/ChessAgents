from typing import Protocol, Tuple, List, Any, Optional
from sqlmodel import Session


class GameRepository(Protocol):
    """Persistence-agnostic contract for storing games."""
    def init(self) -> None:
        ...

    def upsert_games(self, games: List[Any], session: Optional[Session]) -> Tuple[int, int]:
        ...
