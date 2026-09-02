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


def _snapshot_outputs(input_dir: Path, stem: str) -> set[Path]:
    # qdc6 writes next to the input file using the input stem prefix,
    # e.g. invpa4.png
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


def _version_folder(version: str) -> str:
    return version.strip().replace(".", "_")


def _safe_output_name(stem: str) -> str:
    """Normalize DC6 stems that start with #/@ for filesystem-safe PNG names."""
    return stem


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Run qdc6.exe on each *.dc6 in tools/item_icons/input/ and install "
            "PNGs into tools/item_icons/<major>_<minor>/."
        )
    )
    parser.add_argument(
        "--input-dir",
        default=str(DEFAULT_INPUT_DIR),
        help=f"Directory containing *.dc6 files (default: {DEFAULT_INPUT_DIR}).",
    )
    parser.add_argument(
        "--version",
        required=True,
        help='Game patch, e.g. "2.14" (output: tools/item_icons/2_14/).',
    )
    parser.add_argument(
        "--output-dir",
        default=None,
        help="Override output directory (default: tools/item_icons/<major>_<minor>/).",
    )
    parser.add_argument(
        "--qdc6",
        default=None,
        help="Path to qdc6.exe (overrides tools/tools.local.json).",
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

    qdc6_path = _resolve_qdc6(args.qdc6)

    if not input_dir.is_dir():
        print(f"Input dir not found: {input_dir}", file=sys.stderr)
        return 2
    if not qdc6_path.is_file():
        print(f"qdc6.exe not found: {qdc6_path}", file=sys.stderr)
        return 2

    output_dir.mkdir(parents=True, exist_ok=True)

    dc6_files = sorted(input_dir.glob(args.pattern))
    dc6_files = [p for p in dc6_files if p.suffix.lower() == ".dc6"]
    if not dc6_files:
        print(f"No files matching {args.pattern} in {input_dir}")
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
                if dest.exists() and not args.overwrite:
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

    print(
        "\nPublish WebPs with: "
        f"python tools/item_icons/publish_item_icons.py --version {version}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
