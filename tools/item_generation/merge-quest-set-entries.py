"""Merge quest-set-entries.json into unique-stats-db.json."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
QUEST_PATH = Path(__file__).resolve().parent / "quest-set-entries.json"
DB_PATH = ROOT / "public" / "items" / "2_14" / "unique-stats-db.json"
QUALITY_ORDER = {
    "Sacred Set": 0,
    "Set": 1,
    "SU": 2,
    "TU": 3,
    "Relic": 4,
    "Charm": 5,
}


def entry_key(entry: dict) -> tuple:
    return (
        entry.get("quality") or "",
        entry.get("name") or "",
        "" if entry.get("tier") is None else str(entry.get("tier")),
        entry.get("variant") or "",
    )


def sort_key(entry: dict) -> tuple:
    return (
        QUALITY_ORDER.get(entry.get("quality") or "", 99),
        entry.get("name") or "",
        entry.get("tier") or 0,
        entry.get("variant") or "",
    )


def main() -> None:
    quest = json.loads(QUEST_PATH.read_text(encoding="utf-8"))
    db = json.loads(DB_PATH.read_text(encoding="utf-8"))
    entries = db["entries"] if isinstance(db, dict) else db
    incoming = {entry_key(e) for e in quest}
    kept = [
        e
        for e in entries
        if e.get("source") != "quest" and entry_key(e) not in incoming
    ]
    merged = sorted(kept + quest, key=sort_key)
    if isinstance(db, dict):
        db["entries"] = merged
        payload = db
    else:
        payload = merged
    DB_PATH.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(merged)} entries ({len(quest)} quest) -> {DB_PATH}")


if __name__ == "__main__":
    main()
