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


def _load_qdc6_from_config() -> Path | None:
    if not CONFIG_PATH.is_file():
        return None
    try:
        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        print(f"WARNING: Could not read {CONFIG_PATH}: {e}", file=sys.stderr)
        return None
    raw = data.get("qdc6_exe")
    if not raw or not isinstance(raw, str):
        return None
    return Path(raw)


def _class_key_from_filename(path: Path) -> str:
    # Expected: icons-<key>.dc6  -> <key>
    name = path.name
    if not name.lower().startswith("icons-") or path.suffix.lower() != ".dc6":
        raise ValueError(f"Unexpected filename: {name}")
    return name[len("icons-") : -len(".dc6")]


def _snapshot_outputs(input_dir: Path, stem: str) -> set[Path]:
    # qdc6 writes next to the input file using the input stem prefix,
    # e.g. icons-sor_170.png
    out: set[Path] = set()
    for p in input_dir.glob(f"{stem}*"):
        if p.is_file():
            out.add(p.resolve())
    return out


def _resolve_qdc6(cli_path: str | None) -> Path:
    if cli_path:
        path = Path(cli_path)
        if not path.is_absolute():
            script_local = SCRIPT_DIR / path
            path = script_local if script_local.exists() else path
        return path.resolve()

    from_config = _load_qdc6_from_config()
    if from_config is not None:
        return from_config.resolve()

    print(
        "qdc6.exe path not set. Pass --qdc6 or create "
        f"{CONFIG_PATH} (see tools/tools.local.json.example).",
        file=sys.stderr,
    )
    raise SystemExit(2)


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Run qdc6.exe on each icons-*.dc6 and install PNGs into "
            "tools/atlas_generation/<class>/."
        )
    )
    parser.add_argument(
        "--input-dir",
        required=True,
        help="Directory containing icons-*.dc6 files.",
    )
    parser.add_argument(
        "--output-dir",
        default=str(SCRIPT_DIR),
        help=f"Root with per-class folders (default: {SCRIPT_DIR}).",
    )
    parser.add_argument(
        "--qdc6",
        default=None,
        help="Path to qdc6.exe (overrides tools/tools.local.json).",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Replace existing PNGs in the class folders.",
    )
    args = parser.parse_args()

    input_dir = Path(args.input_dir).resolve()
    output_root = Path(args.output_dir).resolve()
    qdc6_path = _resolve_qdc6(args.qdc6)

    if not input_dir.is_dir():
        print(f"Input dir not found: {input_dir}", file=sys.stderr)
        return 2
    if not qdc6_path.is_file():
        print(f"qdc6.exe not found: {qdc6_path}", file=sys.stderr)
        return 2

    output_root.mkdir(parents=True, exist_ok=True)

    dc6_files = sorted(input_dir.glob("icons-*.dc6"))
    if not dc6_files:
        print(f"No icons-*.dc6 files found in {input_dir}")
        return 0

    failures: list[tuple[Path, int]] = []

    for src in dc6_files:
        key = _class_key_from_filename(src)
        target_dir = output_root / key
        target_dir.mkdir(parents=True, exist_ok=True)

        # qdc6 extracts next to the input .dc6; run with cwd=input_dir then move.
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
        for p in to_move:
            dest = target_dir / p.name
            try:
                if dest.exists() and not args.overwrite:
                    p.unlink(missing_ok=True)
                    cleaned += 1
                    continue
                p.replace(dest)
                moved += 1
            except OSError:
                continue

        # Remove any leftover qdc6 outputs still sitting beside the .dc6.
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
            print(f"[{src.name}] OK ({moved} installed{extra}) -> {target_dir}")

    if failures:
        print("\nFailures:", file=sys.stderr)
        for f, code in failures:
            print(f"  - {f.name}: exit {code}", file=sys.stderr)
        return 1

    print("\nRebuild atlases with: python tools/atlas_generation/make_all_atlases.py --version <ver>")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
