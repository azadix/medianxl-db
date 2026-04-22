#!/usr/bin/env python3
"""
Extract all text lines that are NOT template placeholders from skill descriptions,
skill effects, and restrictions (tree_data JSON).
"""

import argparse
import re
import sys
from pathlib import Path

_PY = Path(__file__).resolve().parent
if str(_PY) not in sys.path:
    sys.path.insert(0, str(_PY))

from tree_data_loader import load_merged_skills, resolve_data_dir


def is_placeholder_line(line):
    if not line or not line.strip():
        return True

    without_placeholders = re.sub(r"\{\{[^}]+\}\}", "", line)
    without_placeholders = re.sub(r"\[\[[^\]]+\]\]", "", without_placeholders)

    remaining = without_placeholders.strip()

    if not remaining or remaining in ["", ".", ",", ":", "-", "–", "—"]:
        return True

    return False


def extract_non_placeholder_lines(data_dir):
    data_dir = resolve_data_dir(data_dir)
    if not data_dir.is_dir():
        print(f"Error: Data directory not found: {data_dir}")
        return 1

    try:
        skills = load_merged_skills(data_dir)
    except Exception as e:
        print(f"Error: {e}")
        return 1

    print("=" * 80)
    print("EXTRACTING NON-PLACEHOLDER TEXT LINES")
    print("=" * 80)
    print()

    with_text = [
        r
        for r in skills
        if (r["description"] or "").strip()
        or (r["skill_effect"] or "").strip()
        or (r["restriction"] or "").strip()
    ]

    print(f"Checking {len(with_text)} skills with non-empty text fields...\n")

    all_lines = set()
    skill_line_map = {}

    for row in with_text:
        display_name = row["display_name"]
        class_name = row["class_name"] or "No Class"

        for field, label in (
            ("description", "Description"),
            ("skill_effect", "Skill Effect"),
            ("restriction", "Restriction"),
        ):
            text = row.get(field) or ""
            if not text:
                continue
            for line in text.split("\n"):
                if not is_placeholder_line(line):
                    clean_line = line.strip()
                    all_lines.add(clean_line)

                    if clean_line not in skill_line_map:
                        skill_line_map[clean_line] = []
                    skill_line_map[clean_line].append((display_name, label, class_name))

    sorted_lines = sorted(all_lines, key=lambda line: (-len(skill_line_map.get(line, [])), line))

    print(f"Found {len(sorted_lines)} unique non-placeholder text lines\n")

    print("=" * 80)
    print("NON-PLACEHOLDER TEXT LINES FROM SKILL DESCRIPTIONS, SKILL EFFECTS, AND RESTRICTIONS")
    print("Sorted by occurrence count (most common first)")
    print("=" * 80)
    print()
    print(f"Total unique lines: {len(sorted_lines)}")
    print(f"Extracted from {len(with_text)} skills")
    print(f"Data: {data_dir}")
    print()
    print("=" * 80)
    print()

    for line in sorted_lines:
        skills_using = skill_line_map.get(line, [])
        occurrence_count = len(skills_using)

        print(f"[{occurrence_count}x] {line}")

        if skills_using:
            for skill_name, location, class_name in skills_using[:5]:
                print(f"  - {skill_name} ({class_name}) - {location}")
            if len(skills_using) > 5:
                print(f"  - ... and {len(skills_using) - 5} more")
        print()

    return 0


def main():
    parser = argparse.ArgumentParser(
        description="Extract non-placeholder text lines from skill strings in tree_data JSON"
    )
    parser.add_argument(
        "data_dir",
        nargs="?",
        default=None,
        help="tree_data version folder (required), e.g. public/tree_data/2_12",
    )

    args = parser.parse_args()

    sys.exit(extract_non_placeholder_lines(args.data_dir))


if __name__ == "__main__":
    main()
