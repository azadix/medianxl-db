"""Convert extracted inventory PNGs to WebP under public/icons/item_icons/."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent
OUT_DIR = REPO_ROOT / "public" / "icons" / "item_icons"

# Catalog / items.txt stems missing from the DC6 dump that have a close stand-in.
# dest_stem -> source_stem (copy published WebP after convert).
ICON_ALIASES = {
    "invgswe": "invgsw",  # Perfect Diamond (gem) — dump has invgsw only
    "invamu4": "invamu",  # docs has invamu1-3 + invamu; no invamu4.jpg
}


def _version_folder(version: str) -> str:
    return version.strip().replace(".", "_")


def _load_catalog_icon_keys(catalog_path: Path) -> set[str] | None:
    paths = [catalog_path]
    if catalog_path.is_dir():
        paths = sorted(catalog_path.glob("*.json"))
    elif catalog_path.name == "catalog.json":
        version_dir = catalog_path.parent
        paths = [
            version_dir / "baseitems.json",
            version_dir / "charms.json",
            version_dir / "other.json",
        ]

    keys: set[str] = set()
    loaded = False
    for path in paths:
        if not path.is_file():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as e:
            print(f"WARNING: Could not read catalog {path}: {e}", file=sys.stderr)
            continue
        if not isinstance(data, list):
            continue
        loaded = True
        for row in data:
            if not isinstance(row, dict):
                continue
            icon = row.get("icon")
            if isinstance(icon, str) and icon.strip():
                keys.add(icon.strip())
    if not loaded:
        print(f"WARNING: Catalog not found: {catalog_path}", file=sys.stderr)
        return None
    return keys


def _find_png(icons_dir: Path, key: str) -> Path | None:
    for ext in (".png", ".PNG", ".bmp", ".BMP"):
        p = icons_dir / f"{key}{ext}"
        if p.is_file():
            return p
    return None


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Publish inventory icon WebPs to public/icons/item_icons/ "
            "from tools/item_icons/<major>_<minor>/ PNGs."
        )
    )
    parser.add_argument(
        "--version",
        required=True,
        help='Game patch for source PNGs, e.g. "2.14" (tools/item_icons/2_14/).',
    )
    parser.add_argument(
        "--icons-dir",
        default=None,
        help="Source PNG directory (default: tools/item_icons/<major>_<minor>/).",
    )
    parser.add_argument(
        "--catalog",
        default=None,
        help="Catalog.json path used with --catalog-only.",
    )
    parser.add_argument(
        "--catalog-only",
        action="store_true",
        help=(
            "Only publish icons referenced by the version catalog "
            "(default: public/items/<folder>/*.json)."
        ),
    )
    args = parser.parse_args()

    version = args.version.strip()
    if not version:
        parser.error("--version must be non-empty")

    folder = _version_folder(version)
    icons_dir = (
        Path(args.icons_dir).resolve()
        if args.icons_dir
        else (SCRIPT_DIR / folder).resolve()
    )
    out_dir = OUT_DIR.resolve()

    if not icons_dir.is_dir():
        print(f"Icons dir not found: {icons_dir}", file=sys.stderr)
        return 2

    filter_keys = None
    if args.catalog_only:
        catalog_path = (
            Path(args.catalog).resolve()
            if args.catalog
            else (REPO_ROOT / "public" / "items" / folder)
        )
        filter_keys = _load_catalog_icon_keys(catalog_path)

    if filter_keys is not None:
        keys = sorted(filter_keys)
        print(f"Publishing {len(keys)} catalog icon(s) from {icons_dir}")
    else:
        keys = sorted(
            {
                p.stem
                for p in icons_dir.iterdir()
                if p.is_file() and p.suffix.lower() in {".png", ".bmp"}
            }
        )
        print(f"Publishing all {len(keys)} PNG(s) from {icons_dir}")

    out_dir.mkdir(parents=True, exist_ok=True)

    published = 0
    missing: list[str] = []

    for key in keys:
        src = _find_png(icons_dir, key)
        if src is None:
            missing.append(key)
            continue
        dest = out_dir / f"{key}.webp"
        try:
            icon = Image.open(src).convert("RGBA")
            icon.save(dest, format="WEBP", quality=85, method=6, lossless=False)
            published += 1
        except OSError as e:
            print(f"WARNING: Failed to convert {src.name}: {e}", file=sys.stderr)
            missing.append(key)

    print(f"Wrote {published} WebP(s) -> {out_dir}")
    if missing:
        print(f"WARNING: {len(missing)} icon(s) missing source PNG:", file=sys.stderr)
        for k in missing[:30]:
            print(f"  - {k}", file=sys.stderr)
        if len(missing) > 30:
            print(f"  ... and {len(missing) - 30} more", file=sys.stderr)

    aliased = 0
    for dest_key, src_key in ICON_ALIASES.items():
        src = out_dir / f"{src_key}.webp"
        dest = out_dir / f"{dest_key}.webp"
        if not src.is_file():
            print(f"WARNING: alias source missing: {src.name}", file=sys.stderr)
            continue
        # Skip if a real extracted PNG existed for dest_key.
        if _find_png(icons_dir, dest_key) is not None:
            continue
        dest.write_bytes(src.read_bytes())
        aliased += 1
        print(f"Aliased {dest_key}.webp <- {src_key}.webp")
    if aliased:
        published += aliased

    return 0 if published or not keys else 1


if __name__ == "__main__":
    raise SystemExit(main())
