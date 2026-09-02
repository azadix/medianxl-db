"""
Load skill text + balance from tree_data JSON (skills.json, stats.json; game_meta for non-skill data if needed).
Scripts live under `tools/py/`; paths are resolved from repo root.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
_TREE_DATA_ROOT = _REPO_ROOT / "public" / "tree_data"


def repo_root() -> Path:
    return _REPO_ROOT


def tree_data_root() -> Path:
    return _TREE_DATA_ROOT


def default_data_dir() -> Path:
    """Active patch folder under public/tree_data (from versions.json)."""
    versions_path = _TREE_DATA_ROOT / "versions.json"
    if versions_path.is_file():
        try:
            versions = json.loads(versions_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            versions = None
        if isinstance(versions, list) and versions:
            active = next((v for v in versions if v.get("is_active")), versions[0])
            major = active.get("major")
            minor = active.get("minor")
            if major is not None and minor is not None:
                return _TREE_DATA_ROOT / f"{major}_{minor}"
    return _TREE_DATA_ROOT / "2_14"


def resolve_data_dir(arg: str | None) -> Path:
    """
    Resolve CLI path to an absolute tree_data version directory.
    Accepts e.g. public/tree_data/2_14, ../public/tree_data/2_14 (from tools/py/).
    """
    if arg is None or arg == "":
        ex = default_data_dir().relative_to(_REPO_ROOT)
        print(
            f"Error: specify the tree_data version directory (example: {ex.as_posix()}).",
            file=sys.stderr,
        )
        raise SystemExit(1)
    p = Path(arg)
    if not p.is_absolute():
        p = (Path.cwd() / p).resolve()
    return p


def load_stats_json() -> list[dict]:
    path = _TREE_DATA_ROOT / "stats.json"
    if not path.is_file():
        return []
    return json.loads(path.read_text(encoding="utf-8"))


def stats_by_key_lower(stats: list[dict]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for row in stats:
        k = str(row.get("key", "")).lower()
        if k:
            out[k] = row
    return out


_PLACEHOLDER_RE = re.compile(r"\{\{[^}]+\}\}")


def _text_value_to_string(value: object) -> str:
    """
    skills.json text fields may be:
      - string (legacy)
      - list[str] (new: one entry per row/line)
      - null
    Normalize to a single string.
    """
    if value is None:
        return ""
    if isinstance(value, list):
        return "\n".join("" if item is None else str(item) for item in value)
    return str(value)


def text_has_placeholder(text: str | None) -> bool:
    if not text:
        return False
    return bool(_PLACEHOLDER_RE.search(text))


def load_merged_skills(data_dir: Path) -> list[dict]:
    """
    One row per skills.json and subskills.json catalog entry (definition + balance in one file).

    Each row: name (internal), display_name, description, skill_effect, restriction,
    class_name, scalingConstants

    Optional subskill metadata (used by the app UI, preserved by the JSON editor):
    - parentSkillId: internal id of the parent skill (string)
    """
    cat_path = data_dir / "skills.json"
    if not cat_path.is_file():
        raise FileNotFoundError(f"Missing skills.json: {cat_path}")

    catalog = json.loads(cat_path.read_text(encoding="utf-8"))
    if not isinstance(catalog, list):
        raise ValueError("skills.json must be a JSON array")

    sub_path = data_dir / "subskills.json"
    if sub_path.is_file():
        sub = json.loads(sub_path.read_text(encoding="utf-8"))
        if not isinstance(sub, list):
            raise ValueError("subskills.json must be a JSON array")
        catalog = [*catalog, *sub]

    rows: list[dict] = []
    for row in catalog:
        if not isinstance(row, dict):
            continue
        iid = row.get("id")
        if iid is None:
            continue
        se = row.get("skillEffect")
        if se is None:
            se = row.get("skill_effect")
        rows.append(
            {
                "name": str(iid),
                "display_name": row.get("displayName") or str(iid),
                "description": _text_value_to_string(row.get("description")),
                "skill_effect": _text_value_to_string(se),
                "restriction": _text_value_to_string(row.get("restriction")),
                "class_name": row.get("class"),
                "scalingConstants": list(row.get("scalingConstants") or []),
            }
        )
    rows.sort(key=lambda r: (r["class_name"] or "", r["display_name"] or ""))
    return rows


def skill_has_stat_scaling(row: dict, stat_key_lower: str) -> bool:
    """True if scalingConstants include this stat key (any version)."""
    sk = stat_key_lower.lower()
    for r in row.get("scalingConstants") or []:
        if str(r.get("statKey", "")).lower() == sk:
            return True
    return False
