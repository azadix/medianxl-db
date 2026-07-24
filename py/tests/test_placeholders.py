"""Placeholder validation against stats.json and scaling data."""

from __future__ import annotations

from validate_skill_placeholders import check_placeholder_validity


def _skill_cases(merged_skills):
    cases = []
    for row in merged_skills:
        name = row.get("display_name") or row.get("name") or "?"
        for field in ("description", "skill_effect", "restriction"):
            text = row.get(field) or ""
            if isinstance(text, list):
                text = "\n".join("" if x is None else str(x) for x in text)
            if str(text).strip():
                cases.append((name, field, row, str(text)))
    return cases


def test_no_unknown_placeholder_stat_keys(merged_skills, stats_map):
    """Fail only on unknown stat keys; missing scaling is common and tracked separately."""
    failures = []
    for display_name, field, row, text in _skill_cases(merged_skills):
        issues = check_placeholder_validity(
            stats_map, row, display_name, text, show_no_scaling_warnings=False
        )
        for issue in issues:
            if issue.startswith("Unknown stat key"):
                failures.append(f"{display_name} [{field}]: {issue}")
    assert failures == [], "\n".join(failures[:40]) + (
        f"\n... and {len(failures) - 40} more" if len(failures) > 40 else ""
    )
