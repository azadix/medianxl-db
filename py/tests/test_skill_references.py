"""Verify [[skill]] / ||subskill|| / compound references point to existing skills and stats."""

from __future__ import annotations

import re

# Referenced only at planner runtime via characterState.stats; not in character_stats.json.
# They evaluate to 0 unless the planner injects them. Add here consciously.
RUNTIME_ONLY_STAT_KEYS = {
    "base_dexterity",
    "life_steal",
    "mana_regeneration_rate",
    "maximum_spirits",
    "pmsd",
    "skill_duration",
}

COMPOUND_REF_RE = re.compile(
    r"\[\[([a-zA-Z_][a-zA-Z0-9_]*|id:\d+)\]\]\.\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}"
)
SKILL_REF_RE = re.compile(r"\[\[([a-zA-Z_][a-zA-Z0-9_]*|id:\d+)\]\]")
SUBSKILL_REF_RE = re.compile(r"\|\|([a-zA-Z_][a-zA-Z0-9_]*|id:\d+)\|\|")
STANDALONE_STAT_RE = re.compile(r"(?<!\]\]\.)\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}")

TEXT_FIELDS = ("description", "skillEffect", "restriction")
VALUE_SLOTS = ("value0", "value1", "value2", "value3")


def _as_text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return "\n".join("" if x is None else str(x) for x in value)
    return str(value)


def _catalog_lookups(skills_json, subskills_json):
    rows = list(skills_json) + list(subskills_json)
    internal_ids = {str(r.get("id")) for r in rows}
    numeric_ids = {r.get("numericId") for r in rows if r.get("numericId") is not None}
    return internal_ids, numeric_ids


def _ref_exists(ref: str, internal_ids: set, numeric_ids: set) -> bool:
    if ref.startswith("id:"):
        try:
            return int(ref[3:]) in numeric_ids
        except ValueError:
            return False
    return ref in internal_ids


def test_skill_refs_in_text_exist(skills_json, subskills_json):
    internal_ids, numeric_ids = _catalog_lookups(skills_json, subskills_json)
    failures = []
    for row in list(skills_json) + list(subskills_json):
        sid = row.get("id")
        for field in TEXT_FIELDS:
            text = _as_text(row.get(field))
            if not text:
                continue
            # Compound refs first so their skill part is not double-reported
            for skill_ref, stat_key in COMPOUND_REF_RE.findall(text):
                if not _ref_exists(skill_ref, internal_ids, numeric_ids):
                    failures.append(f"{sid} [{field}]: compound ref to unknown skill '{skill_ref}'")
            stripped = COMPOUND_REF_RE.sub("", text)
            for ref in SKILL_REF_RE.findall(stripped):
                if not _ref_exists(ref, internal_ids, numeric_ids):
                    failures.append(f"{sid} [{field}]: [[{ref}]] does not exist")
            for ref in SUBSKILL_REF_RE.findall(text):
                if not _ref_exists(ref, internal_ids, numeric_ids):
                    failures.append(f"{sid} [{field}]: ||{ref}|| does not exist")
    assert failures == [], "\n".join(failures[:40])


def test_compound_stat_refs_exist_in_stats(skills_json, subskills_json, stats_map):
    """[[skill]].{{stat}} resolves the stat from the referenced skill's stats.json entry."""
    failures = []
    for row in list(skills_json) + list(subskills_json):
        sid = row.get("id")
        sources = [(_as_text(row.get(f)), f) for f in TEXT_FIELDS]
        for sc in row.get("scalingConstants") or []:
            for slot in VALUE_SLOTS:
                sources.append((str(sc.get(slot) or ""), f"scaling:{sc.get('statKey')}.{slot}"))
        for text, origin in sources:
            if not text:
                continue
            for _skill_ref, stat_key in COMPOUND_REF_RE.findall(text):
                if stat_key.lower() not in stats_map:
                    failures.append(f"{sid} [{origin}]: compound stat '{stat_key}' not in stats.json")
    assert failures == [], "\n".join(failures[:40])


def test_skill_refs_in_formulas_exist(skills_json, subskills_json):
    internal_ids, numeric_ids = _catalog_lookups(skills_json, subskills_json)
    failures = []
    for row in list(skills_json) + list(subskills_json):
        sid = row.get("id")
        for sc in row.get("scalingConstants") or []:
            for slot in VALUE_SLOTS:
                value = str(sc.get(slot) or "")
                if not value:
                    continue
                stripped = COMPOUND_REF_RE.sub("", value)
                for ref in SKILL_REF_RE.findall(stripped):
                    if not _ref_exists(ref, internal_ids, numeric_ids):
                        failures.append(
                            f"{sid} [scaling:{sc.get('statKey')}.{slot}]: [[{ref}]] does not exist"
                        )
    assert failures == [], "\n".join(failures[:40])


def test_formula_character_stat_refs_are_known(skills_json, subskills_json, character_stats_json):
    """Standalone {{stat}} in formulas reads characterState.stats (character_stats.json registry).

    Unknown keys silently evaluate to 0 in the planner, so any new key must either be
    registered or consciously added to RUNTIME_ONLY_STAT_KEYS.
    """
    known = {str(r.get("key")).lower() for r in character_stats_json if r.get("key")}
    known |= RUNTIME_ONLY_STAT_KEYS
    failures = []
    for row in list(skills_json) + list(subskills_json):
        sid = row.get("id")
        for sc in row.get("scalingConstants") or []:
            for slot in VALUE_SLOTS:
                value = str(sc.get(slot) or "")
                if not value:
                    continue
                for stat_key in STANDALONE_STAT_RE.findall(value):
                    if stat_key.lower() not in known:
                        failures.append(
                            f"{sid} [scaling:{sc.get('statKey')}.{slot}]: "
                            f"{{{{{stat_key}}}}} not in character_stats.json (will always be 0)"
                        )
    assert failures == [], "\n".join(failures[:40])
