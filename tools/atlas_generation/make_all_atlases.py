# data/global/themes/classic_sigma/game/skills/icons-*.dc6

from PIL import Image
import argparse
import os
import re

ICON_SIZE = 48
ATLAS_SIZE = 912
ICONS_PER_ROW = ATLAS_SIZE // ICON_SIZE

# Regex to extract prefix + index from "icons-bar_84.png"
ICON_RE = re.compile(r"icons-([a-z]+)_(\d+)\.\w+$")

CLASS_IDS = ["shared", "ama", "ass", "bar", "dru", "nec", "pal", "sor"]


def make_atlas(input_dir, output_file):
    atlas = Image.new("RGBA", (ATLAS_SIZE, ATLAS_SIZE), (0, 0, 0, 0))

    files = [f for f in os.listdir(input_dir) if ICON_RE.match(f)]
    if not files:
        print(f"WARNING: No valid icons in {input_dir}")
        return

    files.sort(key=lambda f: int(ICON_RE.match(f).group(2)))

    for fname in files:
        match = ICON_RE.match(fname)
        if not match:
            continue

        idx = int(match.group(2))

        x = (idx % ICONS_PER_ROW) * ICON_SIZE
        y = (idx // ICONS_PER_ROW) * ICON_SIZE

        icon_path = os.path.join(input_dir, fname)
        icon = Image.open(icon_path).convert("RGBA")

        if icon.size != (ICON_SIZE, ICON_SIZE):
            icon = icon.resize((ICON_SIZE, ICON_SIZE), Image.LANCZOS)

        atlas.paste(icon, (x, y))

    atlas.save(output_file, format="WEBP", quality=85, method=6, lossless=False)
    print(f"SUCCESS: WebP atlas saved: {output_file}")


def resolve_input_dir(icons_dir, version, class_id):
    """Prefer icons/<version>/<class_id>/ when present; else icons/<class_id>/"""
    versioned = os.path.join(icons_dir, version, class_id)
    flat = os.path.join(icons_dir, class_id)
    if os.path.isdir(versioned):
        return versioned, "versioned"
    if os.path.isdir(flat):
        return flat, "flat"
    return None, None


def main():
    parser = argparse.ArgumentParser(
        description="Build class-*.webp atlas sprites under public/tree_data/<major>_<minor>/ from per-icon frames."
    )
    parser.add_argument(
        "--version",
        required=True,
        help='Game patch, e.g. "2.12" (output: public/tree_data/2_12/class-<class>.webp)',
    )
    args = parser.parse_args()
    version = args.version.strip()
    if not version:
        parser.error("--version must be non-empty")

    icons_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.dirname(os.path.dirname(icons_dir))
    tree_folder = version.replace(".", "_")
    out_dir = os.path.join(repo_root, "public", "tree_data", tree_folder)
    os.makedirs(out_dir, exist_ok=True)

    for class_id in CLASS_IDS:
        input_dir, source_kind = resolve_input_dir(icons_dir, version, class_id)
        if input_dir is None:
            print(f"WARNING: Skipping {class_id} (no folder at {icons_dir}/{version}/{class_id}/ or {icons_dir}/{class_id}/)")
            continue

        output_file = os.path.join(out_dir, f"class-{class_id}.webp")
        print(f"{class_id}: input={input_dir} ({source_kind}) -> {output_file}")
        make_atlas(input_dir, output_file)


if __name__ == "__main__":
    main()
