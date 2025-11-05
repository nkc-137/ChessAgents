from dataclasses import dataclass

@dataclass
class Game:
    pgn: str
    year: int
    month: int