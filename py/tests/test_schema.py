"""Structural / schema checks for tree_data skill files."""

from __future__ import annotations

import re
from collections import Counter

REQUIRED_SKILL_FIELDS = ("id", "numericId", "displayName", "classId")
REQUIRED_SUBSKILL_FIELDS = ("id", "numericId", "displayName", "parentSkillId")
IMAGE_RE = re.compile(r"^.+\.(png|webp)$", re.IGNORECASE)


def _as_text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return "\n".join("" if x is None else str(x) for x in value)
    return str(value)


def _brace_balance_issues(text: str) -> list[str]:
    issues = []
    if text.count("{{") != text.count("}}"):
        issues.append("unbalanced {{ }}")
    if text.count("[[") != text.count("]]"):
        issues.append("unbalanced [[ ]]")
    return issues


def test_required_fields_present(skills_json, subskills_json):
    failures = []
    for row in skills_json:
        sid = row.get("id", "<missing id>")
        for field in REQUIRED_SKILL_FIELDS:
            if field not in row or row[field] is None or row[field] == "":
                failures.append(f"{sid}: missing {field}")
    for row in subskills_json:
        sid = row.get("id", "<missing id>")
        for field in REQUIRED_SUBSKILL_FIELDS:
            if field not in row or row[field] is None or row[field] == "":
                failures.append(f"{sid}: missing {field}")
    assert failures == [], "\n".join(failures[:40])


def test_unique_ids(skills_json, subskills_json):
    """String ids must be unique across skills+subskills; numericIds unique within skills.json."""
    all_ids = [row.get("id") for row in list(skills_json) + list(subskills_json)]
    skill_numeric = [row.get("numericId") for row in skills_json]
    sub_ids = [row.get("id") for row in subskills_json]

    dup_ids = sorted({i for i, c in Counter(all_ids).items() if i is not None and c > 1})
    dup_skill_numeric = sorted(
        {n for n, c in Counter(skill_numeric).items() if n is not None and c > 1}
    )
    dup_sub_ids = sorted({i for i, c in Counter(sub_ids).items() if i is not None and c > 1})

    assert dup_ids == [], f"duplicate id values: {dup_ids[:20]}"
    assert dup_skill_numeric == [], f"duplicate skills.json numericId values: {dup_skill_numeric[:20]}"
    assert dup_sub_ids == [], f"duplicate subskills.json id values: {dup_sub_ids[:20]}"


def test_subskill_parents_exist(skills_json, subskills_json):
    skill_ids = {row.get("id") for row in skills_json}
    failures = []
    for row in subskills_json:
        parent = row.get("parentSkillId")
        if parent is None or str(parent).strip() == "":
            failures.append(f"{row.get('id')}: missing parentSkillId")
        elif parent not in skill_ids:
            failures.append(f"{row.get('id')}: parentSkillId '{parent}' not found")
    assert failures == [], "\n".join(failures)


def test_tree_struct_prerequisites_exist(skills_json, tree_struct):
    if tree_struct is None:
        return
    skill_ids = {row.get("id") for row in skills_json}
    failures = []

    def check_skill_ref(ref, context):
        if not isinstance(ref, str) or not ref.strip():
            return
        if ref not in skill_ids:
            failures.append(f"{context}: unknown skill id '{ref}'")

    if not isinstance(tree_struct, dict):
        return

    for class_name, tabs in tree_struct.items():
        if not isinstance(tabs, dict):
            continue
        for tab_name, tab_data in tabs.items():
            if not isinstance(tab_data, dict):
                continue
            details = tab_data.get("skill_details") or []
            if not isinstance(details, list):
                continue
            for node in details:
                if not isinstance(node, dict):
                    continue
                sid = node.get("id")
                for parent in node.get("layoutParents") or []:
                    check_skill_ref(parent, f"{class_name}/{tab_name}/{sid}.layoutParents")
                prereqs = node.get("prerequisites") or {}
                if isinstance(prereqs, dict):
                    skill_level = prereqs.get("skill_level")
                    if isinstance(skill_level, list) and skill_level:
                        # Format: [skillId, level, skillId, level, ...] or [skillId, level]
                        for i in range(0, len(skill_level), 2):
                            check_skill_ref(
                                skill_level[i],
                                f"{class_name}/{tab_name}/{sid}.prerequisites.skill_level",
                            )

    assert failures == [], "\n".join(failures[:40])


def test_image_field_shape(skills_json, subskills_json):
    """Icons live in atlases; only validate filename shape when image is set."""
    failures = []
    for row in list(skills_json) + list(subskills_json):
        image = row.get("image")
        if image is None or image == "":
            continue
        if not isinstance(image, str) or not IMAGE_RE.match(image):
            failures.append(f"{row.get('id')}: invalid image '{image}'")
    assert failures == [], "\n".join(failures[:40])


def test_class_and_tab_ids_exist(skills_json, game_meta):
    class_ids = {c.get("id") for c in game_meta.get("classes") or []}
    tab_ids = {t.get("id") for t in game_meta.get("classTabs") or []}
    failures = []
    for row in skills_json:
        sid = row.get("id")
        if row.get("classId") not in class_ids:
            failures.append(f"{sid}: classId {row.get('classId')} not in game_meta classes")
        if row.get("tab") not in tab_ids:
            failures.append(f"{sid}: tab {row.get('tab')} not in game_meta classTabs")
    assert failures == [], "\n".join(failures[:40])


def test_skill_tags_exist(skills_json, subskills_json, game_meta):
    known_tags = {t.get("name") for t in game_meta.get("skilltags") or []}
    failures = []
    for row in list(skills_json) + list(subskills_json):
        for tag in row.get("tags") or []:
            if tag not in known_tags:
                failures.append(f"{row.get('id')}: unknown tag '{tag}'")
    assert failures == [], "\n".join(failures[:40])


def test_balanced_placeholder_braces(merged_skills):
    failures = []
    for row in merged_skills:
        name = row.get("display_name") or row.get("name")
        for field in ("description", "skill_effect", "restriction"):
            text = _as_text(row.get(field))
            for issue in _brace_balance_issues(text):
                failures.append(f"{name} [{field}]: {issue}")
    assert failures == [], "\n".join(failures[:40])
