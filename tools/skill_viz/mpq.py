"""Extract missile DCC/palette files from game MPQs."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
TOOLS_DIR = SCRIPT_DIR.parent
CONFIG_PATH = TOOLS_DIR / "tools.local.json"
PALETTE_PATH = r"data\global\palette\units\pal.dat"
EXTRACT_ROOT = SCRIPT_DIR / "_extract"

MPQ_SEARCH_ORDER = (
    "medianxl-bWlzc2xz.mpq",
    "patch_d2.mpq",
    "d2exp.mpq",
    "d2data.mpq",
)


def load_config() -> dict:
    if not CONFIG_PATH.is_file():
        print(f"Missing {CONFIG_PATH} (see tools.local.json.example).", file=sys.stderr)
        raise SystemExit(2)
    try:
        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        print(f"Could not read {CONFIG_PATH}: {e}", file=sys.stderr)
        raise SystemExit(2) from e
    if not isinstance(data, dict):
        print(f"{CONFIG_PATH} must be a JSON object.", file=sys.stderr)
        raise SystemExit(2)
    return data


def require_path(config: dict, key: str) -> Path:
    raw = config.get(key)
    if not raw or not isinstance(raw, str):
        print(f"Set {key} in {CONFIG_PATH}.", file=sys.stderr)
        raise SystemExit(2)
    path = Path(raw)
    if not path.exists():
        print(f"{key} not found: {path}", file=sys.stderr)
        raise SystemExit(2)
    return path


def run_mpq_script(exe: Path, commands: list[str], timeout: int = 30) -> str:
    script = SCRIPT_DIR / "_run.mpqscript"
    script.write_text("\r\n".join([*commands, "exit", ""]), encoding="ascii")
    proc = subprocess.run(
        [str(exe), "/console", str(script)],
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    if proc.returncode not in (0, None):
        print(proc.stdout)
        print(proc.stderr, file=sys.stderr)
        raise SystemExit(proc.returncode or 1)
    return proc.stdout or ""


def extract_file(exe: Path, mpq: Path, inner: str, dest: Path) -> bool:
    dest.mkdir(parents=True, exist_ok=True)
    out = run_mpq_script(exe, [f"extract {mpq} {inner} {dest} /fp"])
    return bool(re.search(r"(?<!\d)([1-9]\d*) file\(s\) extracted", out, re.I))


def iter_extracted_files(exe: Path, game_dir: Path, inner_names: list[str], dest: Path):
    mpqs = [game_dir / name for name in MPQ_SEARCH_ORDER if (game_dir / name).is_file()]
    for mpq in mpqs:
        for inner in inner_names:
            if not extract_file(exe, mpq, inner, dest):
                continue
            extracted = dest.joinpath(*inner.split("\\"))
            if not extracted.is_file():
                matches = list(dest.rglob(Path(inner).name))
                if not matches:
                    continue
                extracted = matches[0]
            print(f"Extracted {inner} from {mpq.name}")
            yield extracted


def find_and_extract(exe: Path, game_dir: Path, inner_names: list[str], dest: Path) -> Path:
    for extracted in iter_extracted_files(exe, game_dir, inner_names, dest):
        return extracted
    print(f"Could not extract {inner_names} from {game_dir}", file=sys.stderr)
    raise SystemExit(1)


def extract_cel(exe: Path, game_dir: Path, cel: str) -> Path:
    cel = cel.replace("/", "\\")
    EXTRACT_ROOT.mkdir(parents=True, exist_ok=True)
    return find_and_extract(exe, game_dir, _cel_inner_names(cel), EXTRACT_ROOT)


def iter_extracted_cels(exe: Path, game_dir: Path, cel: str):
    cel = cel.replace("/", "\\")
    EXTRACT_ROOT.mkdir(parents=True, exist_ok=True)
    yield from iter_extracted_files(exe, game_dir, _cel_inner_names(cel), EXTRACT_ROOT)


def _cel_inner_names(cel: str) -> list[str]:
    return [
        rf"data\global\missiles\{cel}.dcc",
        rf"data\global\missiles\{cel}.dc6",
    ]


def extract_palette(exe: Path, game_dir: Path) -> Path:
    EXTRACT_ROOT.mkdir(parents=True, exist_ok=True)
    return find_and_extract(exe, game_dir, [PALETTE_PATH], EXTRACT_ROOT)


def load_palette(path: Path) -> list[tuple[int, int, int]]:
    raw = path.read_bytes()
    if len(raw) < 768:
        raise SystemExit(f"palette too small: {path}")
    return [(raw[i + 2], raw[i + 1], raw[i]) for i in range(0, 768, 3)]
