# app/agent_queries.py
from __future__ import annotations
from typing import Optional, List, Dict, Literal
from sqlmodel import select, or_, Session
from repositories.sql_model_game_repository import GameRow, get_session
from openings.opening_families import OpeningFamilies

ResultType = Literal["win", "loss", "draw"]
ColorType = Literal["white", "black"]
OrderBy = Literal["date", "id"]
OrderDir = Literal["asc", "desc"]


class AgentQueryService:
    """
    Query helper for agent use-cases:
      - games by opening (name contains), ECO prefix, or opening family
      - games by user's color
      - games filtered by win/loss/draw from the user's perspective
    Returns simple dicts that are easy for an agent to consume/ground.
    """

    def __init__(self, username: str, session: Optional[Session] = None):
        self.username = username.lower()
        self.session = session

    # ----------------- internal helpers -----------------
    def _pov(self, g: GameRow) -> Optional[ResultType]:
        if not g.result:
            return None
        is_w = (g.white or "").lower() == self.username
        is_b = (g.black or "").lower() == self.username
        if not (is_w or is_b):
            return None
        if g.result == "1/2-1/2":
            return "draw"
        if g.result == "1-0":
            return "win" if is_w else "loss"
        if g.result == "0-1":
            return "win" if is_b else "loss"
        return None

    def _my_color(self, g: GameRow) -> Optional[ColorType]:
        if (g.white or "").lower() == self.username:
            return "white"
        if (g.black or "").lower() == self.username:
            return "black"
        return None

    def _row_to_dict(self, g: GameRow) -> Dict:
        fam = OpeningFamilies.family_from_eco_or_name(g.eco, g.opening)
        return {
            "id": g.id,
            "date": None,                   # not stored separately in this schema; available in PGN if needed
            "white": g.white,
            "black": g.black,
            "my_color": self._my_color(g),
            "pov_result": self._pov(g),     # 'win'|'loss'|'draw'
            "eco": g.eco,
            "opening": g.opening,
            "family": fam,
            "time_control": g.time_control,
            "ply_count": None,              # not in this schema
            "end_time_utc": g.end_time_utc,
        }

    # ----------------- public queries -----------------
    def games(
        self,
        opening_like: Optional[str] = None,
        eco_prefix: Optional[str] = None,
        family: Optional[str] = None,
        color: Optional[ColorType] = None,              # my color
        result: Optional[ResultType] = None,            # from my POV
        limit: int = 50,
        offset: int = 0,
        order_dir: OrderDir = "desc",
    ) -> List[Dict]:
        """
        Core filter method backing all agent queries.
        You can filter by opening name, ECO prefix, family, my color, my result, and (future) dates.
        """
        s = self.session or get_session()
        try:
            stmt = select(GameRow).where(
                or_(GameRow.white.ilike(f"%{self.username}%"), GameRow.black.ilike(f"%{self.username}%"))
            )

            # SQL-side filters we can apply directly
            if opening_like:
                stmt = stmt.where(GameRow.opening.ilike(f"%{opening_like}%"))
            if eco_prefix:
                stmt = stmt.where(GameRow.eco.ilike(f"{eco_prefix}%"))

            order_col = GameRow.id  # default/fallback
            stmt = stmt.order_by(order_col.asc() if order_dir == "asc" else order_col.desc())

            rows = s.exec(stmt).all()
        finally:
            if self.session is None:
                s.close()

        # In-memory filters that need POV/family or my color
        out: List[Dict] = []
        for g in rows:
            my_col = self._my_color(g)
            if color and my_col != color:
                continue

            pov = self._pov(g)
            if result and pov != result:
                continue

            if family:
                fam = OpeningFamilies.family_from_eco_or_name(g.eco, g.opening)
                if fam.lower() != family.lower():
                    continue

            out.append(self._row_to_dict(g))

        # paginate after all filters
        return out[offset: offset + limit]

    # Convenience wrappers (nice for agents to call directly)
    def games_by_opening(
        self,
        opening_like: Optional[str] = None,
        eco_prefix: Optional[str] = None,
        family: Optional[str] = None,
        color: Optional[ColorType] = None,
        won: Optional[bool] = None,
        **kwargs,
    ) -> List[Dict]:
        res: Optional[ResultType] = None
        if won is True:
            res = "win"
        elif won is False:
            res = "loss"
        return self.games(opening_like=opening_like,
                          eco_prefix=eco_prefix,
                          family=family,
                          color=color,
                          result=res,
                          **kwargs)

    def wins(self, opening_like: Optional[str] = None, eco_prefix: Optional[str] = None,
             family: Optional[str] = None, color: Optional[ColorType] = None, **kwargs) -> List[Dict]:
        return self.games(opening_like=opening_like, eco_prefix=eco_prefix, family=family,
                          color=color, result="win", **kwargs)

    def losses(self, opening_like: Optional[str] = None, eco_prefix: Optional[str] = None,
               family: Optional[str] = None, color: Optional[ColorType] = None, **kwargs) -> List[Dict]:
        return self.games(opening_like=opening_like, eco_prefix=eco_prefix, family=family,
                          color=color, result="loss", **kwargs)

    def draws(self, opening_like: Optional[str] = None, eco_prefix: Optional[str] = None,
              family: Optional[str] = None, color: Optional[ColorType] = None, **kwargs) -> List[Dict]:
        return self.games(opening_like=opening_like, eco_prefix=eco_prefix, family=family,
                          color=color, result="draw", **kwargs)
