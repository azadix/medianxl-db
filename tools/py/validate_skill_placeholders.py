#!/usr/bin/env python3
"""
Validate skill placeholders against tree_data JSON (stats.json + merged skills).

Checks:
1. Placeholder stat keys exist in stats.json
2. For stats whose format uses {value...}, scalingConstants exists for that skill+stat
"""

import argparse
import re
import sys
from collections import defaultdict
from pathlib import Path

_PY = Path(__file__).resolve().parent
if str(_PY) not in sys.path:
    sys.path.insert(0, str(_PY))

from tree_data_loader import (
    load_merged_skills,
    load_stats_json,
    resolve_data_dir,
    skill_has_stat_scaling,
    stats_by_key_lower,
)


def check_placeholder_validity(
    stats_by_key_lower_map, skill_row, display_name, description, show_no_scaling_warnings=True
):
    issues = []

    if not description:
        return issues

    placeholder_pattern = r"\{\{([^}]+)\}\}"
    placeholders = re.findall(placeholder_pattern, description)

    for placeholder in placeholders:
        parts = placeholder.split(":")
        if len(parts) < 1:
            continue

        stat_key = parts[0].strip().lower()

        stat_row = stats_by_key_lower_map.get(stat_key)
        if not stat_row:
            issues.append(
                f"Unknown stat key: '{parts[0].strip()}' in placeholder {{{{{placeholder}}}}}"
            )
            continue

        stat_format = stat_row.get("format") or ""

        if len(parts) > 1:
            values = [v.strip() for v in parts[1].split(",")]
            has_placeholders = any(
                re.match(r"%?value\d*%?", v, re.IGNORECASE) for v in values
            )

            if not has_placeholders:
                continue

        if stat_format and "{value" in stat_format:
            if not skill_has_stat_scaling(skill_row, stat_key):
                if len(parts) == 1 and show_no_scaling_warnings:
                    issues.append(f"No scaling data for stat '{parts[0].strip()}'")

    return issues


def validate_skills(data_dir=None, show_no_scaling_warnings=True):
    data_dir = resolve_data_dir(data_dir)
    if not data_dir.is_dir():
        print(f"Error: Data directory not found: {data_dir}")
        return 1

    try:
        merged = load_merged_skills(data_dir)
    except Exception as e:
        print(f"Error: {e}")
        return 1

    stats_list = load_stats_json()
    sk_map = stats_by_key_lower(stats_list)

    print("=" * 80)
    print("SKILL PLACEHOLDER VALIDATION (tree_data JSON)")
    print("=" * 80)
    print()
    print("Note: This validates placeholder content against stats.json and skill balance rows;")
    print("      fix template syntax (unclosed braces, etc.) in your editor.")
    print()
    print(f"Data: {data_dir}")
    print()

    with_text = [
        r
        for r in merged
        if (r["description"] or "").strip()
        or (r["skill_effect"] or "").strip()
        or (r["restriction"] or "").strip()
    ]
    with_text.sort(key=lambda r: r["name"] or "")

    print(f"Found {len(with_text)} skills with description, skill_effect, or restriction\n")

    placeholder_errors = defaultdict(list)
    total_placeholder_issues = 0

    for row in with_text:
        display_name = row["display_name"]

        description = row["description"] or ""
        if description:
            desc_issues = check_placeholder_validity(
                sk_map, row, display_name, description, show_no_scaling_warnings
            )
            if desc_issues:
                placeholder_errors[display_name].extend(
                    [f"[Description] {issue}" for issue in desc_issues]
                )
                total_placeholder_issues += len(desc_issues)

        skill_effect = row["skill_effect"] or ""
        if skill_effect:
            eff_issues = check_placeholder_validity(
                sk_map, row, display_name, skill_effect, show_no_scaling_warnings
            )
            if eff_issues:
                placeholder_errors[display_name].extend(
                    [f"[Skill Effect] {issue}" for issue in eff_issues]
                )
                total_placeholder_issues += len(eff_issues)

        restriction = row["restriction"] or ""
        if restriction:
            rest_issues = check_placeholder_validity(
                sk_map, row, display_name, restriction, show_no_scaling_warnings
            )
            if rest_issues:
                placeholder_errors[display_name].extend(
                    [f"[Restriction] {issue}" for issue in rest_issues]
                )
                total_placeholder_issues += len(rest_issues)

    if placeholder_errors:
        print("=" * 80)
        print("PLACEHOLDER VALIDATION ERRORS")
        print("=" * 80)
        print()

        for skill_name, issues in sorted(placeholder_errors.items()):
            print(f"[X] {skill_name}")
            for issue in issues:
                print(f"    - {issue}")
            print()
    else:
        print("[OK] No placeholder validation errors found!")
        print()

    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"Total skills checked: {len(with_text)}")
    print(f"Skills with placeholder errors: {len(placeholder_errors)}")
    print(f"Total placeholder issues: {total_placeholder_issues}")
    print()

    return 1 if placeholder_errors else 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Validate skill placeholders against tree_data JSON"
    )
    parser.add_argument(
        "data_dir",
        nargs="?",
        default=None,
        help="tree_data version folder (required), e.g. public/tree_data/2_12",
    )
    parser.add_argument(
        "--no-scaling",
        action="store_true",
        help='Hide "No scaling data for stat X" warnings',
    )

    args = parser.parse_args()

    show_no_scaling_warnings = not args.no_scaling
    sys.exit(validate_skills(args.data_dir, show_no_scaling_warnings))
