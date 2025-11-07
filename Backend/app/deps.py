# app/deps.py
from typing import Iterator
from repositories.sql_model_game_repository import get_session
from sqlmodel import Session


def db_session() -> Iterator[Session]:
    # FastAPI treats generators that yield as dependencies to tear down automatically
    with get_session() as s:
        yield s
