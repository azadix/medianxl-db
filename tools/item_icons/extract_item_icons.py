from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
TOOLS_DIR = SCRIPT_DIR.parent
CONFIG_PATH = TOOLS_DIR / "tools.local.json"
DEFAULT_INPUT_DIR = SCRIPT_DIR / "input"
DEFAULT_GAME_DIR = Path(r"C:\Games\median-xl")
ITEM_DC6_PREFIX = "data\\global\\items\\"
MPQ_NAMES = (
    "d2data.mpq",
    "d2exp.mpq",
    "patch_d2.mpq",
    "medianxl-aXRlbXNnZng.mpq",
)
# Present in itemsgfx but often missing from (listfile); always try to pull these.
EXTRA_ITEM_DC6_STEMS = (
    "r-d-02",
    "r-d-05",
    "r-d-11",
    "fire-rune",
    "phys-rune",
    "magic-rune",
    "pois-rune",
    "ltng-rune",
    "cold-rune",
    "xisEl",
    "xisEld",
    "xisTir",
    "xisNef",
    "xisEth",
    "xisIth",
    "xisTal",
    "xisRal",
    "xisOrt",
    "xisThul",
    "xisAmn",
    "xisSol",
    "xisShael",
    "xisDol",
    "xisHel",
    "xisIo",
    "xisLum",
    "xisKo",
    "xisFal",
    "xisLem",
    "xisPul",
    "xisUm",
    "xisMal",
    "xisIst",
    "xisGul",
    "xisVex",
    "xisOhm",
    "xisLo",
    "xisSur",
    "xisBer",
    "xisJah",
    "xisCham",
    "xisZod",
)


def _load_config() -> dict:
    if not CONFIG_PATH.is_file():
        return {}
    try:
        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        print(f"WARNING: Could not read {CONFIG_PATH}: {e}", file=sys.stderr)
        return {}
    return data if isinstance(data, dict) else {}


def _snapshot_outputs(input_dir: Path, stem: str) -> set[Path]:
    # qdc6 writes next to the input file using the input stem
    # (foo.png or foo_0.png). Prefix glob would also match fooBar.dc6.
    out: set[Path] = set()
    for p in input_dir.iterdir():
        if not p.is_file():
            continue
        name = p.name
        if name == f"{stem}{p.suffix}" or name.startswith(f"{stem}_"):
            out.add(p.resolve())
    return out


def _resolve_qdc6(cli_path: str | None, config: dict) -> Path:
    if cli_path:
        path = Path(cli_path)
        if not path.is_absolute():
            script_local = SCRIPT_DIR / path
            path = script_local if script_local.exists() else path
        return path.resolve()

    raw = config.get("qdc6_exe")
    if isinstance(raw, str) and raw.strip():
        return Path(raw).resolve()

    print(
        "qdc6.exe path not set. Pass --qdc6 or create "
        f"{CONFIG_PATH} (see tools/tools.local.json.example).",
        file=sys.stderr,
    )
    raise SystemExit(2)


def _resolve_game_dir(cli_path: str | None, config: dict) -> Path:
    if cli_path:
        return Path(cli_path).resolve()
    raw = config.get("d2_game_dir")
    if isinstance(raw, str) and raw.strip():
        return Path(raw)
    return DEFAULT_GAME_DIR


def _version_folder(version: str) -> str:
    return version.strip().replace(".", "_")


def _safe_output_name(stem: str) -> str:
    """Normalize DC6 stems that start with #/@ for filesystem-safe PNG names."""
    return stem


def _catalog_icon_stems(version_folder: str) -> set[str]:
    """Icon stems referenced by public/items/<version> catalogs (incl. unique-stats-db)."""
    items_dir = TOOLS_DIR.parent / "public" / "items" / version_folder
    stems: set[str] = set()
    if not items_dir.is_dir():
        return stems
    for path in sorted(items_dir.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        rows = data
        if isinstance(data, dict):
            rows = data.get("entries")
        if not isinstance(rows, list):
            continue
        for row in rows:
            if not isinstance(row, dict):
                continue
            icon = row.get("icon")
            if isinstance(icon, str) and icon.strip():
                stems.add(icon.strip().lower())
    return stems


def _read_item_dc6(archives: list, stem: str) -> bytes | None:
    rel = f"{ITEM_DC6_PREFIX}{stem}.dc6"
    for _name, archive in archives:
        try:
            data = archive.read(rel)
        except Exception:
            data = None
        if data:
            return data
    return None


def _extract_dc6_from_mpq(game_dir: Path, input_dir: Path, version_folder: str = "") -> int:
    sys.path.insert(0, str(TOOLS_DIR / "skill_animator" / "app" / "engine"))
    from mpq import MPQ

    if not game_dir.is_dir():
        print(f"game dir not found: {game_dir}", file=sys.stderr)
        return 2

    archives = []
    for name in MPQ_NAMES:
        path = game_dir / name
        if not path.is_file():
            print(f"skip missing {path}")
            continue
        try:
            archives.append((name, MPQ(str(path))))
        except Exception as e:
            print(f"skip {name}: {e}")
    if not archives:
        print("no MPQs opened", file=sys.stderr)
        return 2

    input_dir.mkdir(parents=True, exist_ok=True)
    written = 0
    for name, archive in archives:
        listing = archive.read("(listfile)") or b""
        paths = [
            ln.strip()
            for ln in listing.decode("latin-1", errors="replace").splitlines()
            if ln.strip().lower().startswith(ITEM_DC6_PREFIX)
            and ln.strip().lower().endswith(".dc6")
        ]
        print(f"{name}: {len(paths)} item dc6")
        for rel in paths:
            data = archive.read(rel.replace("/", "\\"))
            if not data:
                continue
            stem = Path(rel.replace("\\", "/")).stem.lower()
            (input_dir / f"{stem}.dc6").write_bytes(data)
            written += 1

    # Some DC6s exist in MPQs but are absent from (listfile). Pull catalog-
    # referenced stems plus known great/elemental rune stems.
    catalog_stems = _catalog_icon_stems(version_folder) if version_folder else set()
    probe_stems = set(catalog_stems) | {s.lower() for s in EXTRA_ITEM_DC6_STEMS}
    filled = 0
    for stem in sorted(probe_stems):
        dest = input_dir / f"{stem}.dc6"
        if dest.is_file():
            continue
        data = _read_item_dc6(archives, stem)
        if not data:
            continue
        dest.write_bytes(data)
        filled += 1
    if filled:
        print(f"filled {filled} icon(s) missing from listfiles")
        written += filled

    print(f"wrote {written} dc6 files -> {input_dir}")
    return 0


def _convert_dc6(input_dir: Path, output_dir: Path, qdc6_path: Path, pattern: str, overwrite: bool) -> int:
    if not input_dir.is_dir():
        print(f"Input dir not found: {input_dir}", file=sys.stderr)
        return 2
    if not qdc6_path.is_file():
        print(f"qdc6.exe not found: {qdc6_path}", file=sys.stderr)
        return 2

    output_dir.mkdir(parents=True, exist_ok=True)

    dc6_files = sorted(input_dir.glob(pattern))
    dc6_files = [p for p in dc6_files if p.suffix.lower() == ".dc6"]
    if not dc6_files:
        print(f"No files matching {pattern} in {input_dir}")
        return 0

    failures: list[tuple[Path, int]] = []

    for src in dc6_files:
        try:
            proc = subprocess.run(
                [str(qdc6_path), str(src)],
                cwd=str(input_dir),
                env=os.environ.copy(),
                capture_output=True,
                text=True,
                check=False,
            )
        except OSError as e:
            print(f"[{src.name}] failed to start qdc6.exe: {e}", file=sys.stderr)
            failures.append((src, 127))
            continue

        to_move = sorted(_snapshot_outputs(input_dir, src.stem) - {src.resolve()})

        moved = 0
        cleaned = 0
        out_stem = _safe_output_name(src.stem)
        for p in to_move:
            if p.suffix.lower() not in {".png", ".bmp", ".gif"}:
                try:
                    p.unlink(missing_ok=True)
                    cleaned += 1
                except OSError:
                    pass
                continue

            dest = output_dir / f"{out_stem}{p.suffix.lower()}"
            try:
                if dest.exists() and not overwrite:
                    p.unlink(missing_ok=True)
                    cleaned += 1
                    continue
                p.replace(dest)
                moved += 1
            except OSError:
                continue

        for leftover in _snapshot_outputs(input_dir, src.stem) - {src.resolve()}:
            try:
                leftover.unlink(missing_ok=True)
                cleaned += 1
            except OSError:
                continue

        if proc.returncode != 0:
            print(
                f"[{src.name}] qdc6.exe exited with {proc.returncode}",
                file=sys.stderr,
            )
            if proc.stderr:
                print(proc.stderr.strip(), file=sys.stderr)
            failures.append((src, proc.returncode))
        else:
            extra = f", {cleaned} cleaned" if cleaned else ""
            print(f"[{src.name}] OK ({moved} installed{extra}) -> {output_dir}")

    if failures:
        print("\nFailures:", file=sys.stderr)
        for f, code in failures:
            print(f"  - {f.name}: exit {code}", file=sys.stderr)
        return 1
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Extract item DC6s from the game MPQs into tools/item_icons/input/, "
            "then run qdc6.exe and install PNGs into tools/item_icons/<major>_<minor>/."
        )
    )
    parser.add_argument(
        "--input-dir",
        default=str(DEFAULT_INPUT_DIR),
        help=f"Directory for extracted *.dc6 files (default: {DEFAULT_INPUT_DIR}).",
    )
    parser.add_argument(
        "--version",
        required=True,
        help='Game patch, e.g. "2.14" (output: tools/item_icons/2_14/).',
    )
    parser.add_argument(
        "--output-dir",
        default=None,
        help="Override PNG output directory (default: tools/item_icons/<major>_<minor>/).",
    )
    parser.add_argument(
        "--qdc6",
        default=None,
        help="Path to qdc6.exe (overrides tools/tools.local.json).",
    )
    parser.add_argument(
        "--game-dir",
        default=None,
        help="Diablo II / Median XL install (overrides tools/tools.local.json d2_game_dir).",
    )
    parser.add_argument(
        "--skip-mpq",
        action="store_true",
        help="Skip MPQ extract; convert DC6s already in --input-dir.",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Replace existing PNGs in the output folder.",
    )
    parser.add_argument(
        "--pattern",
        default="*.dc6",
        help='Glob for DC6 files (default: "*.dc6"). Use "inv*.dc6" to limit.',
    )
    args = parser.parse_args()

    input_dir = Path(args.input_dir).resolve()
    version = args.version.strip()
    if not version:
        parser.error("--version must be non-empty")

    if args.output_dir:
        output_dir = Path(args.output_dir).resolve()
    else:
        output_dir = (SCRIPT_DIR / _version_folder(version)).resolve()

    config = _load_config()
    if not args.skip_mpq:
        game_dir = _resolve_game_dir(args.game_dir, config)
        extracted = _extract_dc6_from_mpq(game_dir, input_dir, _version_folder(version))
        if extracted != 0:
            return extracted

    qdc6_path = _resolve_qdc6(args.qdc6, config)
    converted = _convert_dc6(input_dir, output_dir, qdc6_path, args.pattern, args.overwrite)
    if converted != 0:
        return converted

    print(
        "\nPublish WebPs with: "
        f"python tools/item_icons/publish_item_icons.py --version {version}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
