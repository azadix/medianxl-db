#!/usr/bin/env python3
"""
Extract skills that contain {{...}} placeholders in description, skill_effect, or restriction
from tree_data JSON (skills.json).
"""

import argparse
import re
import sys
from pathlib import Path

_PY = Path(__file__).resolve().parent
if str(_PY) not in sys.path:
    sys.path.insert(0, str(_PY))

from tree_data_loader import (
    load_merged_skills,
    load_stats_json,
    resolve_data_dir,
    text_has_placeholder,
)


def extract_skills_with_placeholders(data_dir):
    """
    Returns:
        tuple: (skills_list, all_stat_keys)
    """
    data_dir = resolve_data_dir(data_dir)
    if not data_dir.is_dir():
        print(f"Error: Data directory not found: {data_dir}")
        return [], []

    try:
        merged = load_merged_skills(data_dir)
    except Exception as e:
        print(f"Error: {e}")
        return [], []

    stats = load_stats_json()
    all_stat_keys = sorted(str(r.get("key", "")) for r in stats if r.get("key"))

    out = []
    for row in merged:
        desc = row["description"] or ""
        eff = row["skill_effect"] or ""
        rest = row["restriction"] or ""
        if not (
            text_has_placeholder(desc)
            or text_has_placeholder(eff)
            or text_has_placeholder(rest)
        ):
            continue
        out.append(
            (
                row["numeric_id"],
                row["name"],
                row["display_name"],
                desc,
                eff,
                rest,
                row["class_name"],
            )
        )
    return out, all_stat_keys


def analyze_placeholders(description):
    pattern = r"\{\{[^}]+\}\}"
    return re.findall(pattern, description)


def main():
    parser = argparse.ArgumentParser(
        description="Extract skills that contain {{...}} placeholder format"
    )
    parser.add_argument(
        "data_dir",
        nargs="?",
        default=None,
        help="tree_data version folder (required), e.g. public/tree_data/2_12",
    )

    args = parser.parse_args()

    print("Extracting skills with {{...}} placeholder format...")
    print("=" * 60)

    skills, all_stat_keys = extract_skills_with_placeholders(args.data_dir)

    if not skills:
        print("No skills found with {{...}} placeholder format in descriptions.")
        return

    print(f"Found {len(skills)} skills with placeholder format:\n")

    current_class = None
    placeholder_stats = {str(k).lower(): 0 for k in all_stat_keys if k}

    for skill_id, skill_name, display_name, description, skill_effect, restriction, class_name in skills:
        if class_name != current_class:
            if current_class is not None:
                print()
            print(f"[CLASS] {class_name or 'No Class'}")
            print("-" * 40)
            current_class = class_name

        all_text = f"{description or ''} {skill_effect or ''} {restriction or ''}"
        placeholders = analyze_placeholders(all_text)

        for placeholder in placeholders:
            stat_key = (
                placeholder.replace("{{", "").replace("}}", "").split(":")[0].strip().lower()
            )
            if stat_key in placeholder_stats:
                placeholder_stats[stat_key] += 1

        print(f"  - {display_name} (ID: {skill_id})")
        print(f"    Key: {skill_name}")
        print(f"    Placeholders: {', '.join(placeholders)}")
        print()

    if placeholder_stats:
        print("=" * 60)
        print("PLACEHOLDER STATISTICS")
        print("=" * 60)
        print("All stat keys and their usage count:")

        sorted_stats = sorted(placeholder_stats.items(), key=lambda x: (-x[1], x[0]))

        for stat_key, count in sorted_stats:
            print(f"  {stat_key}: {count} times")

    used_stats = sum(1 for count in placeholder_stats.values() if count > 0)
    unused_stats = sum(1 for count in placeholder_stats.values() if count == 0)

    print(f"\n[SUCCESS] Total skills with placeholders: {len(skills)}")
    print(f"[SUCCESS] Total stat keys in stats.json: {len(all_stat_keys)}")
    print(f"[SUCCESS] Stat keys used: {used_stats}")
    print(f"[SUCCESS] Stat keys unused: {unused_stats}")
    print(f"Data: {resolve_data_dir(args.data_dir)}")


if __name__ == "__main__":
    main()
