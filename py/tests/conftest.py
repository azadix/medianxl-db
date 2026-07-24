"""Shared fixtures for skill data tests."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

_REPO = Path(__file__).resolve().parents[2]
_PY = _REPO / "py"
_SPELLCHECK = _REPO / "spellcheck"

for path in (_PY, _SPELLCHECK):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from tree_data_loader import (  # noqa: E402
    default_data_dir,
    load_merged_skills,
    load_stats_json,
    repo_root,
    stats_by_key_lower,
)


@pytest.fixture(scope="session")
def root() -> Path:
    return repo_root()


@pytest.fixture(scope="session")
def data_dir() -> Path:
    return default_data_dir()


@pytest.fixture(scope="session")
def merged_skills(data_dir: Path) -> list[dict]:
    return load_merged_skills(data_dir)


@pytest.fixture(scope="session")
def skills_json(data_dir: Path) -> list[dict]:
    return json.loads((data_dir / "skills.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def subskills_json(data_dir: Path) -> list[dict]:
    path = data_dir / "subskills.json"
    if not path.is_file():
        return []
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def tree_struct(data_dir: Path) -> dict | list | None:
    path = data_dir / "tree_struct.json"
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def stats_map() -> dict[str, dict]:
    return stats_by_key_lower(load_stats_json())


@pytest.fixture(scope="session")
def character_stats_json(data_dir: Path) -> list[dict]:
    path = data_dir / "character_stats.json"
    if not path.is_file():
        return []
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def game_meta(data_dir: Path) -> dict:
    return json.loads((data_dir / "game_meta.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def spellcheck_dicts() -> tuple[list[str], list[str]]:
    script_dir = _SPELLCHECK
    dict_files = [str(script_dir / "spelling-dict.txt")]
    ignore_files = [str(script_dir / "ignore-dict.txt")]
    return dict_files, ignore_files
