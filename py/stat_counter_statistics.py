#!/usr/bin/env python3
"""
Count placeholder stat-key usage across skill text fields.

Output is intentionally minimal:
- PLACEHOLDER STATISTICS header
- stat usage counts
"""

import argparse
import re
import sys
from pathlib import Path

_PY = Path(__file__).resolve().parent
if str(_PY) not in sys.path:
    sys.path.insert(0, str(_PY))

from tree_data_loader import load_merged_skills, load_stats_json, resolve_data_dir


def _extract_placeholders(text: str) -> list[str]:
    return re.findall(r"\{\{[^}]+\}\}", text)


def build_placeholder_stats(data_dir_arg: str | None) -> dict[str, int]:
    data_dir = resolve_data_dir(data_dir_arg)
    if not data_dir.is_dir():
        print(f"Error: Data directory not found: {data_dir}")
        return {}

    try:
        merged = load_merged_skills(data_dir)
    except Exception as exc:
        print(f"Error: {exc}")
        return {}

    stats = load_stats_json()
    placeholder_stats = {str(row.get("key", "")).lower(): 0 for row in stats if row.get("key")}

    for row in merged:
        all_text = f"{row.get('description') or ''} {row.get('skill_effect') or ''} {row.get('restriction') or ''}"
        for placeholder in _extract_placeholders(all_text):
            stat_key = placeholder.replace("{{", "").replace("}}", "").split(":")[0].strip().lower()
            if stat_key in placeholder_stats:
                placeholder_stats[stat_key] += 1

    return placeholder_stats


def main() -> None:
    parser = argparse.ArgumentParser(description="Show placeholder stat usage counts")
    parser.add_argument(
        "data_dir",
        nargs="?",
        default=None,
        help="tree_data version folder (required), e.g. public/tree_data/2_13",
    )
    args = parser.parse_args()

    placeholder_stats = build_placeholder_stats(args.data_dir)

    print("=" * 60)
    print("PLACEHOLDER STATISTICS")
    print("=" * 60)

    sorted_stats = sorted(placeholder_stats.items(), key=lambda item: (-item[1], item[0]))
    for stat_key, count in sorted_stats:
        print(f"  {stat_key}: {count} times")


if __name__ == "__main__":
    main()
