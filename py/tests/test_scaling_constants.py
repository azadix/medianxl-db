"""Validate scalingConstants rows: stat keys, variants, formula syntax, tree() tab ids."""

from __future__ import annotations

import re

KNOWN_FUNCTIONS = {
    "floor", "ceil", "round", "min", "max", "pow",
    "frames", "range", "bool", "tree", "if", "ln", "dm",
}
KNOWN_VARIABLES = {"lvl", "blvl", "slvl", "ulvl", "calc", "calc1", "calc2", "calc3", "calc4", "calc5", "calc6"}

VALUE_SLOTS = ("value0", "value1", "value2", "value3")
FUNC_CALL_RE = re.compile(r"([a-zA-Z_][a-zA-Z0-9_]*)\s*\(")
TREE_CALL_RE = re.compile(r"\btree\((\d+)\)")
FORMULA_HINT_RE = re.compile(
    r"\[\[|\{\{|\b(?:lvl|blvl|slvl|ulvl|calc[1-6]?)\b|"
    r"\b(?:floor|ceil|round|min|max|pow|frames|range|bool|tree|if|ln|dm)\s*\("
)


def _rows(skills_json, subskills_json):
    for row in list(skills_json) + list(subskills_json):
        for sc in row.get("scalingConstants") or []:
            yield row, sc


def looks_like_formula(value: str) -> bool:
    return bool(FORMULA_HINT_RE.search(value))


def test_scaling_stat_keys_exist(skills_json, subskills_json, stats_map):
    failures = []
    for row, sc in _rows(skills_json, subskills_json):
        key = str(sc.get("statKey") or "")
        if not key:
            failures.append(f"{row.get('id')}: scalingConstants row with empty statKey")
        elif key.lower() not in stats_map:
            failures.append(f"{row.get('id')}: unknown scaling statKey '{key}'")
    assert failures == [], "\n".join(failures[:40])


def test_scaling_variant_keys_exist(skills_json, subskills_json):
    failures = []
    for row, sc in _rows(skills_json, subskills_json):
        variant_key = sc.get("variantKey") or ""
        if not variant_key:
            continue
        variant_keys = {v.get("variant_key") for v in row.get("variants") or []}
        if variant_key not in variant_keys:
            failures.append(
                f"{row.get('id')}: scaling row for '{sc.get('statKey')}' references "
                f"unknown variantKey '{variant_key}'"
            )
    assert failures == [], "\n".join(failures)


def test_scaling_rows_have_content(skills_json, subskills_json):
    """Every scaling row must provide at least one value slot or band damage fields."""
    failures = []
    for row, sc in _rows(skills_json, subskills_json):
        has_value = any(str(sc.get(slot) or "").strip() for slot in VALUE_SLOTS)
        has_band = sc.get("baseMin") is not None or sc.get("baseMax") is not None or sc.get("damageModel")
        if not has_value and not has_band:
            failures.append(f"{row.get('id')}: empty scaling row for '{sc.get('statKey')}'")
    assert failures == [], "\n".join(failures[:40])


def test_formula_syntax(skills_json, subskills_json):
    """Formulas must have balanced parentheses/braces/brackets and use only known functions."""
    failures = []
    for row, sc in _rows(skills_json, subskills_json):
        for slot in VALUE_SLOTS:
            value = str(sc.get(slot) or "")
            if not value or not looks_like_formula(value):
                continue
            origin = f"{row.get('id')} [scaling:{sc.get('statKey')}.{slot}]"
            for open_ch, close_ch, label in (("(", ")", "()"), ("{", "}", "{}"), ("[", "]", "[]")):
                if value.count(open_ch) != value.count(close_ch):
                    failures.append(f"{origin}: unbalanced {label} in '{value}'")
            for func in FUNC_CALL_RE.findall(value):
                if func not in KNOWN_FUNCTIONS and func not in KNOWN_VARIABLES:
                    failures.append(f"{origin}: unknown function '{func}(' in '{value}'")
    assert failures == [], "\n".join(failures[:40])


def test_tree_calls_reference_existing_tabs(skills_json, subskills_json, game_meta):
    tab_ids = {t.get("id") for t in game_meta.get("classTabs") or []}
    failures = []
    for row, sc in _rows(skills_json, subskills_json):
        for slot in VALUE_SLOTS:
            value = str(sc.get(slot) or "")
            for tab_id in TREE_CALL_RE.findall(value):
                if int(tab_id) not in tab_ids:
                    failures.append(
                        f"{row.get('id')} [scaling:{sc.get('statKey')}.{slot}]: "
                        f"tree({tab_id}) references unknown tab id"
                    )
    assert failures == [], "\n".join(failures)


def test_occurrence_indexes_are_sane(skills_json, subskills_json):
    failures = []
    for row, sc in _rows(skills_json, subskills_json):
        occ = sc.get("occurrenceIndex")
        if occ is None:
            continue
        if not isinstance(occ, int) or occ < 0:
            failures.append(
                f"{row.get('id')}: invalid occurrenceIndex {occ!r} for '{sc.get('statKey')}'"
            )
    assert failures == [], "\n".join(failures)
