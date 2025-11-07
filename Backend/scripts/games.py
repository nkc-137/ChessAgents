import re
from chessdotcom import ChessDotComClient
from typing import List
from dataclasses import dataclass


@dataclass
class Game:
    pgn: str
    year: int
    month: int


client = ChessDotComClient(user_agent="WolfOnTheBoard application")


def parse_pgn_games(pgn_text: str) -> List[str]:
    """Split a bulk PGN blob into individual game PGNs.

    We split on two-or-more newlines that precede a new PGN header like `[Event "..."]`.
    This is more robust than a raw "\n\n\n" split and avoids breaking inside comments.
    """
    if not pgn_text:
        return []
    # Normalize line endings
    text = pgn_text.replace('\r\n', '\n').replace('\r', '\n').strip()
    # Split where there are blank lines before a new [Event "..."] header
    parts = re.split(r"\n{2,}(?=\[Event \")", text)
    # Clean up and filter empties
    return [part.strip() for part in parts if part and part.strip()]


def fetch_all_games(username: str) -> List[Game]:
    archives_response = client.get_player_game_archives(username)
    all_games: List[Game] = []
    for archive_url in archives_response.archives:
        # archive_url format: https://api.chess.com/pub/player/{username}/all_games/{year}/{month}
        parts = archive_url.rstrip('/').split('/')
        year = int(parts[-2])
        month = int(parts[-1])
        all_games += fetch_games_in_month(username, year, month)
    return all_games


def fetch_games_in_month(username: str, year: int, month: int) -> List[Game]:
    pgn_blob = client.get_player_games_by_month_pgn(username, year, month).pgn.data
    games: List[Game] = []
    for game_pgn in parse_pgn_games(pgn_blob):
        games.append(Game(pgn=game_pgn, year=year, month=month))

    return games


games = fetch_games_in_month("WolfOnTheBoard", 2025, 9)
