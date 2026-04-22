#!/usr/bin/env python3
"""
Extract skills that have descriptions or skill effects but do NOT contain {{...}} placeholders
from tree_data JSON (skills.json).
"""

import argparse
import sys
from pathlib import Path

_PY = Path(__file__).resolve().parent
if str(_PY) not in sys.path:
    sys.path.insert(0, str(_PY))

from tree_data_loader import resolve_data_dir, load_merged_skills, text_has_placeholder


def extract_skills_without_placeholders(data_dir):
    """
    Returns:
        list of tuples (numeric_id, skill_name, display_name, description, skill_effect, class_name)
    """
    data_dir = resolve_data_dir(data_dir)
    if not data_dir.is_dir():
        print(f"Error: Data directory not found: {data_dir}")
        return []

    try:
        merged = load_merged_skills(data_dir)
    except Exception as e:
        print(f"Error: {e}")
        return []

    results = []
    for row in merged:
        desc = row["description"] or ""
        eff = row["skill_effect"] or ""
        if not (desc.strip() or eff.strip()):
            continue
        if text_has_placeholder(desc) or text_has_placeholder(eff):
            continue
        results.append(
            (
                row["numeric_id"],
                row["name"],
                row["display_name"],
                desc,
                eff,
                row["class_name"],
            )
        )
    return results


def main():
    parser = argparse.ArgumentParser(
        description="Extract skills with description/effect but no {{...}} placeholders"
    )
    parser.add_argument(
        "data_dir",
        nargs="?",
        default=None,
        help="tree_data version folder (required), e.g. public/tree_data/2_12",
    )

    args = parser.parse_args()
    data_dir_arg = args.data_dir

    print("Extracting skills with descriptions but NO {{...}} placeholder format...")
    print("=" * 70)

    skills = extract_skills_without_placeholders(data_dir_arg)

    if not skills:
        print("No skills found with descriptions but no placeholder format.")
        return

    print(f"Found {len(skills)} skills with descriptions but no placeholders:\n")

    current_class = None
    class_counts = {}

    for skill_id, skill_name, display_name, description, skill_effect, class_name in skills:
        class_counts[class_name or "No Class"] = class_counts.get(class_name or "No Class", 0) + 1

        if class_name != current_class:
            if current_class is not None:
                print()
            print(f"[CLASS] {class_name or 'No Class'}")
            print("-" * 50)
            current_class = class_name

        print(f"  - {display_name} (ID: {skill_id})")
        print(f"    Key: {skill_name}")

        if description:
            desc_preview = description[:100] + "..." if len(description) > 100 else description
            print(f"    Description: {desc_preview}")

        if skill_effect:
            effect_preview = skill_effect[:100] + "..." if len(skill_effect) > 100 else skill_effect
            print(f"    Skill Effect: {effect_preview}")
        print()

    print("=" * 70)
    print("STATISTICS")
    print("=" * 70)
    print("Skills per class:")

    sorted_classes = sorted(class_counts.items(), key=lambda x: x[1], reverse=True)

    for class_name, count in sorted_classes:
        print(f"  {class_name}: {count} skills")

    print(f"\n[SUCCESS] Total skills with descriptions but no placeholders: {len(skills)}")
    print(f"[SUCCESS] Total classes represented: {len(class_counts)}")
    print(f"Data: {resolve_data_dir(data_dir_arg)}")


if __name__ == "__main__":
    main()
