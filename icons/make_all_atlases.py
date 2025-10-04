# data/global/themes/classic_sigma/game/skills/icons-*.dc6

from PIL import Image
import os
import re

ICON_SIZE = 48
ATLAS_SIZE = 912
ICONS_PER_ROW = ATLAS_SIZE / ICON_SIZE

# Regex to extract prefix + index from "icons-bar_84.png"
ICON_RE = re.compile(r"icons-([a-z]+)_(\d+)\.\w+$")


def make_atlas(input_dir, output_file):
    atlas = Image.new("RGBA", (ATLAS_SIZE, ATLAS_SIZE), (0, 0, 0, 0))

    files = [f for f in os.listdir(input_dir) if ICON_RE.match(f)]
    if not files:
        print(f"⚠️ No valid icons in {input_dir}")
        return

    # Sort by numeric index
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

        # Ensure correct size
        if icon.size != (ICON_SIZE, ICON_SIZE):
            icon = icon.resize((ICON_SIZE, ICON_SIZE), Image.LANCZOS)

        atlas.paste(icon, (x, y))

    atlas.save(output_file)
    print(f"✅ Atlas saved: {output_file}")


if __name__ == "__main__":
    current_dir = os.getcwd()

    for class_id in ["shared", "ama", "ass", "bar", "dru", "nec", "pal", "sor"]:
        input_dir = os.path.join(current_dir, class_id)
        if not os.path.isdir(input_dir):
            print(f"⚠️ Skipping {class_id} (no folder)")
            continue

        output_file = os.path.join(current_dir, f"class-{class_id}.png")
        make_atlas(input_dir, output_file)
