# app/opening_families.py
from __future__ import annotations
import re
from typing import Optional


class OpeningFamilies:
    # ECO family ranges (coarse but practical). Ranges are inclusive.
    # Format: (family, start, end) where start/end are ECO like "B20".
    _ECO_RANGES = [
        ("Sicilian Defense", "B20", "B99"),
        ("French Defense", "C00", "C19"),
        ("Caro-Kann Defense", "B10", "B19"),
        ("Scandinavian Defense", "B01", "B01"),
        ("Alekhine Defense", "B02", "B05"),
        ("Pirc/Modern", "B06", "B09"),
        ("Ruy Lopez", "C60", "C99"),
        ("Italian Game", "C50", "C59"),
        ("Scotch Game", "C44", "C45"),
        ("Philidor Defense", "C41", "C41"),
        ("Petrov Defense", "C40", "C42"),
        ("Queen's Gambit", "D06", "D69"),
        ("Slav/Semi-Slav", "D10", "D19"),
        ("Catalan", "E01", "E09"),
        ("Nimzo-Indian", "E20", "E59"),
        ("Queen's Indian", "E12", "E19"),
        ("King's Indian", "E60", "E99"),
        ("Grünfeld", "D70", "D99"),
        ("Benoni/Benko", "A56", "A79"),
        ("Dutch Defense", "A80", "A99"),
        ("English Opening", "A10", "A39"),
        ("London/Trompowsky/Jobava", "A45", "A46"),  # coarse bucket
        ("Vienna Game", "C25", "C29"),
        ("King's Gambit", "C30", "C39"),
        ("Other/Irregular", "A00", "A09"),  # also catch-all with name fallback
    ]

    _name_rules = [
        (re.compile(r"sicilian", re.I), "Sicilian Defense"),
        (re.compile(r"french", re.I), "French Defense"),
        (re.compile(r"caro[- ]?kann", re.I), "Caro-Kann Defense"),
        (re.compile(r"italian", re.I), "Italian Game"),
        (re.compile(r"ruy", re.I), "Ruy Lopez"),
        (re.compile(r"scotch", re.I), "Scotch Game"),
        (re.compile(r"petrov|russian", re.I), "Petrov Defense"),
        (re.compile(r"philidor", re.I), "Philidor Defense"),
        (re.compile(r"queen'?s gambit", re.I), "Queen's Gambit"),
        (re.compile(r"slav", re.I), "Slav/Semi-Slav"),
        (re.compile(r"catalan", re.I), "Catalan"),
        (re.compile(r"nimzo", re.I), "Nimzo-Indian"),
        (re.compile(r"queen'?s indian", re.I), "Queen's Indian"),
        (re.compile(r"king'?s indian", re.I), "King's Indian"),
        (re.compile(r"gr[uü]nfeld", re.I), "Grünfeld"),
        (re.compile(r"benoni|benko", re.I), "Benoni/Benko"),
        (re.compile(r"dutch", re.I), "Dutch Defense"),
        (re.compile(r"english", re.I), "English Opening"),
        (re.compile(r"vienna", re.I), "Vienna Game"),
        (re.compile(r"king'?s gambit", re.I), "King's Gambit"),
        (re.compile(r"pirc|modern", re.I), "Pirc/Modern"),
        (re.compile(r"london|tromp|jobava", re.I), "London/Trompowsky/Jobava"),
    ]

    @staticmethod
    def _eco_to_num(eco: str) -> Optional[int]:
        # "B90" -> 1*1000 + 90 with letter weight ordering A..E
        if not eco or len(eco) != 3:
            return None
        letter, d1, d2 = eco[0].upper(), eco[1], eco[2]
        if letter not in "ABCDE" or not d1.isdigit() or not d2.isdigit():
            return None
        base = "ABCDE".index(letter) + 1
        return base * 1000 + int(d1 + d2)

    @staticmethod
    def family_from_eco_or_name(eco: Optional[str], opening: Optional[str] = None) -> str:
        if eco:
            n = OpeningFamilies._eco_to_num(eco)
            if n is not None:
                for fam, start, end in OpeningFamilies._ECO_RANGES:
                    ns, ne = OpeningFamilies._eco_to_num(start), OpeningFamilies._eco_to_num(end)
                    if ns is not None and ne is not None and ns <= n <= ne:
                        return fam
        if opening:
            for rx, fam in OpeningFamilies._name_rules:
                if rx.search(opening):
                    return fam
        return "Other/Irregular"
