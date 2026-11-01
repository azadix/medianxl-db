#!/usr/bin/env python3
"""Extract engine calcs and damage synergies from skills_full.tsv into skills.json.

Usage:
  python extract_skill_formulas.py            # report only
  python extract_skill_formulas.py --apply    # write skills.json (backup first)
"""
import argparse
import json

from formula_translate import (
    ZERO,
    SKILLS_JSON,
    build_damage_map,
    build_name_to_id,
    load_skills_full,
    load_stat_id_to_key,
    resolve_skill_id,
    row_params,
    translate_formula,
    write_skills_json,
)


def engine_for(skill, row, stat_id_to_key, name_to_id):
    params = row_params(row)
    damage_map = build_damage_map(skill, row)
    engine = {}
    for i in range(1, 5):
        v = (row.get(f"calc{i}") or "").strip()
        if v and v not in ZERO:
            engine[f"calc{i}"] = translate_formula(v, params, stat_id_to_key, damage_map, name_to_id)
    for i in range(1, 7):
        v = (row.get(f"aurastatcalc{i}") or "").strip()
        if v and v not in ZERO:
            engine[f"ast{i}"] = translate_formula(v, params, stat_id_to_key, damage_map, name_to_id)
    for i in range(1, 6):
        v = (row.get(f"passivecalc{i}") or "").strip()
        if v and v not in ZERO:
            engine[f"pst{i}"] = translate_formula(v, params, stat_id_to_key, damage_map, name_to_id)
    slots = {}
    for i in range(1, 4):
        sk = (row.get(f"sumskill{i}") or "").strip() or (row.get(f"reqskill{i}") or "").strip()
        if not sk:
            continue
        sid = resolve_skill_id(sk, name_to_id)
        if sid:
            slots[f"syn{i + 1}"] = sid
    if slots:
        engine["synergySlots"] = slots
    return engine


def synergy_for(skill, row, stat_id_to_key, name_to_id):
    params = row_params(row)
    damage_map = build_damage_map(skill, row)
    synergy = {}
    dmg = (row.get("DmgSymPerCalc") or "").strip()
    edmg = (row.get("EDmgSymPerCalc") or "").strip()
    base = (row.get("BaseSynergy") or "").strip()
    if dmg and dmg not in ZERO:
        synergy["physical"] = translate_formula(dmg, params, stat_id_to_key, damage_map, name_to_id)
    if edmg and edmg not in ZERO:
        synergy["elemental"] = translate_formula(edmg, params, stat_id_to_key, damage_map, name_to_id)
    if base and base not in ZERO:
        synergy["baseSynergy"] = base
    return synergy


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    full = load_skills_full()
    stat_id_to_key = load_stat_id_to_key()
    data = json.loads(SKILLS_JSON.read_text(encoding="utf-8"))
    name_to_id = build_name_to_id(data)

    n_engine = 0
    n_synergy = 0
    for s in data:
        row = full.get(s.get("displayName") or s.get("id"))
        if row is None:
            continue
        engine = engine_for(s, row, stat_id_to_key, name_to_id)
        if engine:
            s["engine"] = engine
            n_engine += 1
        synergy = synergy_for(s, row, stat_id_to_key, name_to_id)
        if synergy:
            s["synergy"] = synergy
            n_synergy += 1

    print(f"skills with engine: {n_engine}")
    print(f"skills with synergy: {n_synergy}")
    if args.apply:
        write_skills_json(data)


if __name__ == "__main__":
    main()
