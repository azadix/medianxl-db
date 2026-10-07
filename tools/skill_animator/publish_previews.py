"""Copy animator GIFs into public/skill-previews/{skill-id}.gif.

Matches output filenames (safe display names) to skills.json ids and writes
public/skill-previews/manifest.json. Animator output stays the work folder.
"""
import json
import re
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
OUT_DIR = HERE / "output"
DEST_DIR = REPO / "public" / "skill-previews"
VERSIONS_PATH = REPO / "public" / "tree_data" / "versions.json"
SAFE_RE = re.compile(r"[^A-Za-z0-9 '\-]")


def safe(name):
    return SAFE_RE.sub("", str(name)).strip()


def name_key(name):
    return safe(name).casefold()


def latest_skills_json():
    versions = json.loads(VERSIONS_PATH.read_text(encoding="utf-8"))
    if not isinstance(versions, list) or not versions:
        raise SystemExit(f"No versions in {VERSIONS_PATH}")
    active = next((v for v in versions if v.get("is_active")), None)
    if not active:
        active = max(versions, key=lambda v: (int(v.get("major", 0)), int(v.get("minor", 0))))
    folder = f"{active['major']}_{active['minor']}"
    path = REPO / "public" / "tree_data" / folder / "skills.json"
    if not path.is_file():
        raise SystemExit(f"Missing skills.json: {path}")
    return path, folder


def catalog_by_safe_name(skills_path):
    rows = json.loads(skills_path.read_text(encoding="utf-8"))
    by_name = {}
    duplicates = []
    for row in rows:
        skill_id = str(row.get("id") or "").strip()
        display = str(row.get("displayName") or "").strip()
        key = name_key(display)
        if not skill_id or not key:
            continue
        by_name.setdefault(key, []).append(skill_id)
    unique = {}
    for key, ids in by_name.items():
        deduped = list(dict.fromkeys(ids))
        if len(deduped) > 1:
            duplicates.append((key, deduped))
        else:
            unique[key] = deduped[0]
    return unique, duplicates


def main():
    if not OUT_DIR.is_dir():
        raise SystemExit(f"Animator output folder is missing: {OUT_DIR}")
    skills_path, folder = latest_skills_json()
    unique, duplicates = catalog_by_safe_name(skills_path)
    dup_keys = {name for name, _ in duplicates}
    gifs = sorted(OUT_DIR.glob("*.gif"))
    if not gifs:
        raise SystemExit(f"No GIFs in {OUT_DIR}")

    DEST_DIR.mkdir(parents=True, exist_ok=True)
    published = []
    unmatched = []
    skipped_dup = []

    for gif in gifs:
        key = name_key(gif.stem)
        if key in dup_keys:
            skipped_dup.append(gif.name)
            continue
        skill_id = unique.get(key)
        if not skill_id:
            unmatched.append(gif.name)
            continue
        dest = DEST_DIR / f"{skill_id}.gif"
        shutil.copy2(gif, dest)
        published.append(skill_id)

    published_set = set(published)
    for stale in DEST_DIR.glob("*.gif"):
        if stale.stem not in published_set:
            stale.unlink()

    ids = sorted(published_set)
    (DEST_DIR / "manifest.json").write_text(
        json.dumps({"ids": ids}, indent=2) + "\n",
        encoding="utf-8",
    )

    print(f"Catalog: {skills_path.relative_to(REPO)} ({folder})")
    print(f"Copied {len(ids)} GIF(s) to {DEST_DIR.relative_to(REPO)}")
    if duplicates:
        print("Duplicate display names (skipped):")
        for name, ids_for_name in duplicates:
            print(f"  {name}: {', '.join(ids_for_name)}")
    if skipped_dup:
        print("GIFs skipped because display name is shared:")
        for name in skipped_dup:
            print(f"  {name}")
    if unmatched:
        print("Unmatched GIFs:")
        for name in unmatched:
            print(f"  {name}")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:
        print(exc, file=sys.stderr)
        raise SystemExit(1)
