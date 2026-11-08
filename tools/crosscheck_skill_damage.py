#!/usr/bin/env python3
"""Crosscheck generated skills.json base-damage formulas vs the game's raw damage.

Evaluates each skill's damage formula at a level and compares it to the D2MOO
lev_scaled_damage + display_damage computed straight from skills_full.tsv columns.
Synergies are NOT applied (our data is base-only).
"""
import json
import math
import random

from formula_translate import SKILLS_JSON, load_skills_full

DAMAGE_KEYS = {
    "fire_damage", "cold_damage", "lightning_damage", "magic_damage",
    "physical_damage", "poison_dot", "fire_dot",
}


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


def damage_bonus(lvl, p):
    p = list(p[:5])
    while len(p) < 5:
        p.append(0)
    p0, p1, p2, p3, p4 = p
    if lvl <= 1:
        return 0
    if lvl > 28:
        return 7 * p0 + p4 * (lvl - 28) + 6 * (p2 + p3) + 8 * p1
    if lvl > 22:
        return 7 * p0 + p3 * (lvl - 22) + 6 * p2 + 8 * p1
    if lvl > 16:
        return 7 * p0 + p2 * (lvl - 16) + 8 * p1
    if lvl > 8:
        return 7 * p0 + p1 * (lvl - 8)
    return p0 * (lvl - 1)


def lev_scaled(base, p, lvl):
    return base + damage_bonus(lvl, p)


def display(value, hs, etype, elen):
    hs = hs if hs > 0 else 8
    if etype in ("pois", "poison"):
        length = elen if elen > 0 else 1
        if length <= 1:
            return max(0, value - max(0, 8 - hs))
        return (value << hs) * length // 256
    if hs >= 8:
        return value << (hs - 8)
    return (value << hs) >> 8


def _split_top(s):
    parts = []
    depth = 0
    cur = ""
    for ch in s:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append(cur.strip())
            cur = ""
        else:
            cur += ch
    if cur.strip():
        parts.append(cur.strip())
    return parts


def _to_py(s):
    out = []
    i = 0
    while i < len(s):
        if s.startswith("if(", i):
            depth = 0
            j = i + 3
            while j < len(s):
                if s[j] == "(":
                    depth += 1
                elif s[j] == ")":
                    if depth == 0:
                        break
                    depth -= 1
                j += 1
            body = s[i + 3 : j]
            parts = _split_top(body)
            if len(parts) == 3:
                cond, a, b = parts
                out.append(f"(({_to_py(a)}) if ({_to_py(cond)}) else ({_to_py(b)}))")
            else:
                out.append(s[i : j + 1])
            i = j + 1
        else:
            out.append(s[i])
            i += 1
    return "".join(out)


def eval_formula(formula, lvl):
    s = str(formula)
    s = s.replace("lvl", str(lvl))
    s = s.replace("floor(", "math.floor(").replace("frames(", "math.floor(")
    s = _to_py(s)
    try:
        return int(eval(s, {"__builtins__": {}}, {"math": math, "int": int, "min": min, "max": max}))
    except Exception:
        return None


def main():
    full = load_skills_full()
    skills = json.load(open(SKILLS_JSON, encoding="utf-8"))
    with_damage = []
    for s in skills:
        sc = {c["statKey"]: c for c in s.get("scalingConstants", [])}
        dmg = [k for k in DAMAGE_KEYS if k in sc]
        if dmg:
            with_damage.append((s, dmg))

    random.seed(42)
    sample = random.sample(with_damage, 10)

    print(f"{'skill':<26} {'stat':<17} {'lvl':<4} {'our min-max':<22} {'game min-max':<18} match")
    print("-" * 100)
    for s, dmg_keys in sample:
        row = full.get(s["displayName"])
        if row is None:
            continue
        etype = (row.get("EType") or "").strip().lower()
        elen = parse_int(row.get("ELen", ""))
        hs = parse_int(row.get("HitShift", "")) or 8
        emin = parse_int(row.get("EMin", ""))
        emax = parse_int(row.get("EMax", ""))
        emin_lev = [parse_int(row.get(f"EMinLev{i}", "")) for i in range(1, 6)]
        emax_lev = [parse_int(row.get(f"EMaxLev{i}", "")) for i in range(1, 6)]
        mindam = parse_int(row.get("MinDam", ""))
        maxdam = parse_int(row.get("MaxDam", ""))
        mindam_lev = [parse_int(row.get(f"MinLevDam{i}", "")) for i in range(1, 6)]
        maxdam_lev = [parse_int(row.get(f"MaxLevDam{i}", "")) for i in range(1, 6)]

        sc = {c["statKey"]: c for c in s.get("scalingConstants", [])}
        for key in dmg_keys:
            c = sc[key]
            for lvl in (1, 20):
                # our formula
                our_min = eval_formula(c.get("value0"), lvl)
                our_max = eval_formula(c.get("value1"), lvl)
                # game raw
                if key == "physical_damage":
                    g_min = display(lev_scaled(mindam, mindam_lev, lvl), hs, "", 0)
                    g_max = display(lev_scaled(maxdam, maxdam_lev, lvl), hs, "", 0)
                else:
                    g_min = display(lev_scaled(emin, emin_lev, lvl), hs, etype, elen)
                    g_max = display(lev_scaled(emax, emax_lev, lvl), hs, etype, elen)
                ok = (our_min == g_min and our_max == g_max)
                our = f"{our_min}-{our_max}"
                game = f"{g_min}-{g_max}"
                print(f"{s['displayName']:<26} {key:<17} {lvl:<4} {our:<22} {game:<18} {'OK' if ok else 'MISMATCH'}")


if __name__ == "__main__":
    main()
