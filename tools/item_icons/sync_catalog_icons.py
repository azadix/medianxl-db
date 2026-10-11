"""Set catalog icon fields from uniqueitems.bin invfile / custom gfx."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
TOOLS_DIR = SCRIPT_DIR.parent
REPO_ROOT = TOOLS_DIR.parent
CONFIG_PATH = TOOLS_DIR / "tools.local.json"

sys.path.insert(0, str(TOOLS_DIR / "skill_animator" / "app" / "engine"))
from mpq import MPQ  # noqa: E402

CODE_RE = re.compile(r"^[A-Za-z0-9@#!\\|.]{1,4} ?$")
FLIPPY_RE = re.compile(r"^flp", re.I)

NAME_ALIASES = {
    "signetofthegladiator": "signet of the gladiator",
    "blackhandsigil": "black hand sigil",
    "ringofwoe": "ring of woe",
    "bosssummonerring": "ring of pride",
    "upgradedbosssummonerring": "ring of virtue",
    "relicbonehexer": "bonehexer's puzzlebox",
    "relicskinrender": "skinrender's ear",
    "relicxx": "time-lost relic",
    "bookofakarat": "book of akara",
    "thebookofkalen": "books of kalan",
    "uniquedemonsbane": "demonsbane",
    "ancientrepositories": "the ancient repositories",
    "uldyssiancharm3": "neutrality pact",
    "srota": "silver seal of ureh",
}


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", s.lower())


def _game_dir() -> Path:
    if CONFIG_PATH.is_file():
        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        raw = data.get("d2_game_dir")
        if isinstance(raw, str) and raw.strip():
            return Path(raw)
    return Path(r"C:\Games\median-xl")


def _is_gfx(token: str) -> bool:
    t = token.strip()
    if not t or FLIPPY_RE.match(t) or CODE_RE.fullmatch(t):
        return False
    return True


def _parse_uniqueitems(raw: bytes) -> list[dict]:
    import struct

    n = struct.unpack_from("<I", raw, 0)[0]
    rs = (len(raw) - 4) // n
    rows = []
    for i in range(n):
        rec = raw[4 + i * rs : 4 + (i + 1) * rs]
        strs = [s.decode("latin-1") for s in re.findall(rb"[\x20-\x7e]{3,}", rec)]
        if not strs:
            continue
        name = strs[0].strip()
        code = strs[1].strip() if len(strs) > 1 else ""
        gfx = [s.strip() for s in strs[1:] if _is_gfx(s)]
        if gfx:
            rows.append({"name": name, "code": code, "icon": gfx[-1].lower()})
    return rows


def main() -> int:
    game_dir = _game_dir()
    archive = MPQ(str(game_dir / "medianxl-YmludGJsdHh0.mpq"))
    rows = _parse_uniqueitems(archive.read(r"data\global\excel\uniqueitems.bin"))
    rows += _parse_uniqueitems(archive.read(r"data\global\excel\uniqueitems2.bin"))

    by_code = {}
    by_name = {}
    for row in rows:
        if row["code"]:
            by_code[row["code"].lower()] = row["icon"]
        key = _norm(NAME_ALIASES.get(_norm(row["name"]), row["name"]))
        by_name[key] = row["icon"]
        by_name[_norm(row["name"])] = row["icon"]

    items_dir = REPO_ROOT / "public" / "items" / "2_14"
    db_path = items_dir / "unique-stats-db.json"
    db = json.loads(db_path.read_text(encoding="utf-8"))
    entries = db["entries"] if isinstance(db, dict) else db
    db_changed = 0
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        name = str(entry.get("name") or "")
        icon = by_name.get(_norm(name))
        if not icon:
            continue
        if entry.get("icon") == icon:
            continue
        entry["icon"] = icon
        db_changed += 1
    db_path.write_text(json.dumps(db, indent=2) + "\n", encoding="utf-8")

    charms_path = items_dir / "charms.json"
    charms = json.loads(charms_path.read_text(encoding="utf-8"))
    charm_changed = 0
    for row in charms:
        icon = by_code.get(str(row.get("id") or "").lower()) or by_name.get(_norm(str(row.get("name") or "")))
        if not icon or row.get("icon") == icon:
            continue
        row["icon"] = icon
        charm_changed += 1
    charms_path.write_text(json.dumps(charms, indent=2) + "\n", encoding="utf-8")

    print(f"unique-stats-db icon updates: {db_changed}")
    print(f"charms.json icon updates: {charm_changed}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
