#!/usr/bin/env python3
"""Generate base damage scalingConstants for skills.json from mxl-extractor skills_full.tsv.

Reads skills_full.tsv (tab-separated) and the existing 2_14 skills.json, computes the
D2MOO base damage (lev_scaled_damage, piecewise-linear) for each skill, and reports /
merges the resulting scalingConstants entries.

Usage:
  python generate_skill_damage.py            # report only (stdout)
  python generate_skill_damage.py --apply    # write skills.json in place (backup first)
"""
import argparse
import json
import re

from formula_translate import (
    ETYPE_STATKEY,
    SKILLS_JSON,
    load_skills_full,
    write_skills_json,
)


def parse_int(raw):
    if isinstance(raw, int):
        return raw
    s = str(raw or "").strip()
    if not s:
        return 0
    try:
        return int(s)
    except ValueError:
        return 0


def damage_bonus_formula(p):
    """String formula for D2MOO SKILLS_CalculateDamageBonusByLevel (in `lvl`)."""
    p = list(p[:5])
    while len(p) < 5:
        p.append(0)
    p0, p1, p2, p3, p4 = p
    if not any(p):
        return "0"
    # All brackets equal -> the piecewise collapses to a simple linear ramp.
    if p0 == p1 == p2 == p3 == p4:
        return f"{p0}*(lvl-1)"
    # Linear-only (higher brackets 0) -> flat after lvl 8.
    if p1 == 0 and p2 == 0 and p3 == 0 and p4 == 0:
        return f"if(lvl<=8,{p0}*(lvl-1),7*{p0})"
    return (
        f"if(lvl<=1,0,"
        f"if(lvl<=8,{p0}*(lvl-1),"
        f"if(lvl<=16,7*{p0}+{p1}*(lvl-8),"
        f"if(lvl<=22,7*{p0}+8*{p1}+{p2}*(lvl-16),"
        f"if(lvl<=28,7*{p0}+8*{p1}+6*{p2}+{p3}*(lvl-22),"
        f"7*{p0}+8*{p1}+6*{p2}+6*{p3}+{p4}*(lvl-28))))))"
    )


def lev_scaled_formula(base, per_level):
    """Formula string for base + damage_bonus_by_level (raw table units).

    Emits the named `lev_scaled(base, per1..per5, lvl)` call rather than expanding
    the D2 level brackets, so the JSON stays short and hand-editable.
    """
    p = list(per_level[:5])
    while len(p) < 5:
        p.append(0)
    return f"lev_scaled({base},{p[0]},{p[1]},{p[2]},{p[3]},{p[4]},lvl)"


def display_formula(raw, hs, is_poison=False, elen=0, elen_expr=None):
    """Damage formula for a slot.

    Non-poison damage keeps the RAW table value: the HitShift is applied once per
    skill from the `hitShift` field (see Skill._applyHitShiftToResult), matching
    mxlplanner's separate `damageScale`. Poison totals over duration, so it keeps
    the shift folded in and multiplies by the LEVEL-SCALED elemental length
    (ELen + ELevLen1..3), not the flat ELen.
    """
    if is_poison:
        length = elen_expr or str(elen)
        if elen > 1 or (elen_expr and elen_expr not in ("0", "")):
            return f"hitshift({raw},{hs})*{length}"
        off = max(0, 8 - hs)
        shifted = f"hitshift({raw},{hs})"
        return f"({shifted})-{off}" if off else shifted
    return raw


ELEMENTAL_KEYS = {
    "fire_damage",
    "cold_damage",
    "lightning_damage",
    "magic_damage",
    "poison_dot",
    "fire_dot",
}


def attach_raw_fields(entry, raw0, raw1, hit_shift):
    entry["hitShift"] = hit_shift
    entry["rawValue0"] = raw0
    entry["rawValue1"] = raw1
    return entry


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write skills.json in place")
    ap.add_argument("--limit", type=int, default=0, help="only process first N skills (debug)")
    args = ap.parse_args()

    full = load_skills_full()
    data = json.loads(SKILLS_JSON.read_text(encoding="utf-8"))

    added = 0
    skipped_hitshift = 0
    skipped_etype = 0
    samples = []

    for skill in data:
        sid = skill.get("id", "")
        name = skill.get("displayName") or sid
        row = full.get(name)
        if row is None:
            continue

        etype = (row.get("EType") or "").strip().lower()
        element = (row.get("element") or "").strip()
        hit_shift = parse_int(row.get("HitShift", "")) or 8
        elen = parse_int(row.get("ELen", ""))
        # Elemental length scales by level (ELen + ELevLen1..3), same as the damage.
        elen_lev = [parse_int(row.get(f"ELevLen{i}", "")) for i in range(1, 4)]
        elen_expr = (
            f"lev_elen({elen},{elen_lev[0]},{elen_lev[1]},{elen_lev[2]},lvl)"
            if (elen or any(elen_lev))
            else None
        )

        existing_keys = {c.get("statKey") for c in skill.get("scalingConstants", [])}

        new_entries = []

        # --- elemental damage ---
        emin = parse_int(row.get("EMin", ""))
        emax = parse_int(row.get("EMax", ""))
        emin_lev = [parse_int(row.get(f"EMinLev{i}", "")) for i in range(1, 6)]
        emax_lev = [parse_int(row.get(f"EMaxLev{i}", "")) for i in range(1, 6)]
        if (emin or emax) and etype in ETYPE_STATKEY:
            key = ETYPE_STATKEY[etype]
            existing = next(
                (c for c in skill.get("scalingConstants", []) if c.get("statKey") == key),
                None,
            )
            # Always refresh: replaces old expanded level-bracket formulas with the
            # named lev_scaled(...)/hitshift(...) form.
            is_poison = key == "poison_dot"
            entry = {
                "statKey": key,
                "occurrenceIndex": 0,
                "variantKey": "",
                "value0": display_formula(
                    lev_scaled_formula(emin, emin_lev), hit_shift, is_poison, elen, elen_expr
                ),
                "value1": display_formula(
                    lev_scaled_formula(emax, emax_lev), hit_shift, is_poison, elen, elen_expr
                ),
            }
            if key == "poison_dot" and (elen > 1 or elen_expr):
                entry["value2"] = f"frames({elen_expr or elen})"
            attach_raw_fields(
                entry,
                lev_scaled_formula(emin, emin_lev),
                lev_scaled_formula(emax, emax_lev),
                hit_shift,
            )
            if existing is not None:
                existing.update(entry)
            else:
                new_entries.append(entry)
        elif (emin or emax) and etype not in ETYPE_STATKEY:
            skipped_etype += 1

        # --- physical damage ---
        mindam = parse_int(row.get("MinDam", ""))
        maxdam = parse_int(row.get("MaxDam", ""))
        mindam_lev = [parse_int(row.get(f"MinLevDam{i}", "")) for i in range(1, 6)]
        maxdam_lev = [parse_int(row.get(f"MaxLevDam{i}", "")) for i in range(1, 6)]
        if mindam or maxdam:
            phys_entry = attach_raw_fields(
                {
                    "statKey": "physical_damage",
                    "occurrenceIndex": 0,
                    "variantKey": "",
                    "value0": display_formula(lev_scaled_formula(mindam, mindam_lev), hit_shift),
                    "value1": display_formula(lev_scaled_formula(maxdam, maxdam_lev), hit_shift),
                },
                lev_scaled_formula(mindam, mindam_lev),
                lev_scaled_formula(maxdam, maxdam_lev),
                hit_shift,
            )
            existing_phys = next(
                (c for c in skill.get("scalingConstants", []) if c.get("statKey") == "physical_damage"),
                None,
            )
            if existing_phys is not None:
                existing_phys.update(phys_entry)
            else:
                new_entries.append(phys_entry)

        # --- weapon damage (SrcDam %) ---
        src_dam = (row.get("SrcDam") or "").strip()
        if src_dam and "weapon_damage" not in existing_keys:
            m = re.match(r"^\s*([\d.]+)\s*%", src_dam)
            if m:
                new_entries.append({
                    "statKey": "weapon_damage",
                    "occurrenceIndex": 0,
                    "variantKey": "",
                    "value0": str(int(float(m.group(1)))),
                })

        for c in skill.get("scalingConstants", []):
            key = c.get("statKey")
            if key in ELEMENTAL_KEYS:
                attach_raw_fields(
                    c,
                    lev_scaled_formula(emin, emin_lev),
                    lev_scaled_formula(emax, emax_lev),
                    hit_shift,
                )
            elif key == "physical_damage":
                attach_raw_fields(
                    c,
                    lev_scaled_formula(mindam, mindam_lev),
                    lev_scaled_formula(maxdam, maxdam_lev),
                    hit_shift,
                )

        if not new_entries:
            continue

        if hit_shift != 8:
            skipped_hitshift += 1

        added += 1
        if len(samples) < 30:
            samples.append((name, etype, element, hit_shift, new_entries))

        skill.setdefault("scalingConstants", []).extend(new_entries)

        if args.limit and added >= args.limit:
            break

    print(f"skills processed: {len(data)}")
    print(f"skills with damage added: {added}")
    print(f"elemental with unsupported EType skipped: {skipped_etype}")
    print(f"skills with HitShift != 8 (shift applied): {skipped_hitshift}")
    print()
    for name, etype, element, hs, entries in samples:
        for e in entries:
            print(f"{name} [{etype or element or 'phys'}] hitShift={hs}")
            print(f"    {json.dumps(e, ensure_ascii=False)}")

    if args.apply:
        write_skills_json(data)


if __name__ == "__main__":
    main()
