#!/usr/bin/env python3
"""Fill missing skill scaling stats from the mxl-extractor exports.

Sources (our own extractor):
  skilldesc_line_stats.tsv -> stat_key / stat_key_source / value_kind / calc_present
  skilldesc_lines.tsv      -> calca/calcb + literal_value
  skills_full.tsv          -> elem_*_avg, elem_length*, mana_*

Usage:
  python implement_from_extractor.py --check   # report export availability
  python implement_from_extractor.py           # dry run
  python implement_from_extractor.py --apply   # write skills.json
"""
import argparse
import csv
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import formula_translate as ft  # noqa: E402

EXPORTS = Path(r"C:\Users\barto\Documents\GitHub\mxl-extractor\exports")
SKILLS_JSON = Path(r"C:\Users\barto\Documents\GitHub\medianxl-db\public\tree_data\2_14\skills.json")
MISSINGNO = Path(r"C:\Users\barto\Documents\GitHub\medianxl-db\missingno.md")

LINE_STATS = EXPORTS / "skilldesc_line_stats.tsv"
DESC_LINES = EXPORTS / "skilldesc_lines.tsv"
DESC_FULL = EXPORTS / "skilldesc_full.tsv"
SKILLS_FULL = EXPORTS / "skills_full.tsv"

REQUIRED = {
    LINE_STATS: ["skilldesc", "line_name", "stat_key", "stat_key_source", "value_kind", "calc_present"],
    DESC_LINES: ["skilldesc", "line_name", "calca", "calcb", "literal_value"],
    SKILLS_FULL: ["skill", "skilldesc", "elem_min_avg", "elem_max_avg", "mana_base", "mana_per_level", "mana_shift", "mana_min"],
}


def norm(s):
    s = (s or "").lower()
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return " ".join(s.split())


def int_or(s, d=0):
    try:
        return int(float(str(s).strip()))
    except (TypeError, ValueError):
        return d


def lev_scaled(base, per, var="lvl"):
    p = list(per or []) + [0] * (5 - len(per or []))
    if not any(p):
        return str(base)
    return (
        f"({base}+if({var}<=1,0,if({var}<=8,{p[0]}*({var}-1),"
        f"if({var}<=16,7*{p[0]}+{p[1]}*({var}-8),"
        f"if({var}<=22,7*{p[0]}+8*{p[1]}+{p[2]}*({var}-16),"
        f"if({var}<=28,7*{p[0]}+8*{p[1]}+6*{p[2]}+{p[3]}*({var}-22),"
        f"7*{p[0]}+8*{p[1]}+6*{p[2]}+6*{p[3]}+{p[4]}*({var}-28)))))))"
    )


def check():
    ok = True
    for path, cols in REQUIRED.items():
        if not path.exists():
            print(f"  MISSING {path.name}")
            ok = False
            continue
        with open(path, encoding="utf-8", newline="") as f:
            header = next(csv.reader(f, delimiter="\t"))
        missing = [c for c in cols if c not in header]
        status = "OK" if not missing else f"missing {missing}"
        print(f"  {path.name}: {status}")
        ok = ok and not missing
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    print("== extractor exports ==")
    available = check()
    if args.check:
        print("all required columns present:", available)
        return

    # ---- line -> stat mapping -------------------------------------------------
    line_stats = {}
    keys_by_sd = {}
    with open(LINE_STATS, encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f, delimiter="\t"):
            sd = (r.get("skilldesc") or "").strip()
            key = (r.get("stat_key") or "").strip().lower()
            if not sd or not key:
                continue
            has_calc = (r.get("calc_present") or "0") == "1"
            prev = line_stats.get((sd, key))
            if prev is None or (has_calc and not prev["has_calc"]):
                line_stats[(sd, key)] = {
                    "line_name": (r.get("line_name") or "").strip(),
                    "value_kind": (r.get("value_kind") or "").strip(),
                    "source": (r.get("stat_key_source") or "").strip(),
                    "has_calc": has_calc,
                }
            keys_by_sd.setdefault(sd, set()).add(key)

    def lookup_line(sd, effect_key):
        """Exact match, else the effect token as a suffix of the extractor's key.

        The extractor names lines from their display label (monster_flee_duration)
        while a skill effect may use a shorter token (flee_duration).
        """
        if (sd, effect_key) in line_stats:
            return line_stats[(sd, effect_key)]
        cands = [k for k in keys_by_sd.get(sd, ()) if k.endswith("_" + effect_key)]
        if not cands:
            return None
        cands.sort(key=lambda k: (not line_stats[(sd, k)]["has_calc"], len(k)))
        return line_stats[(sd, cands[0])]

    # ---- desc lines -----------------------------------------------------------
    desc_lines = {}
    with open(DESC_LINES, encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f, delimiter="\t"):
            desc_lines[((r.get("skilldesc") or "").strip(), (r.get("line_name") or "").strip())] = {
                "calca": (r.get("calca") or "").strip(),
                "calcb": (r.get("calcb") or "").strip(),
                "literal_value": (r.get("literal_value") or "").strip(),
            }

    # ---- skill -> skilldesc ---------------------------------------------------
    sd_name = {}
    with open(DESC_FULL, encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f, delimiter="\t"):
            nm = (r.get("str_name") or "").strip()
            if nm:
                sd = (r.get("skilldesc") or "").strip()
                sd_name[nm] = sd
                sd_name.setdefault(norm(nm), sd)

    rows = {}
    with open(SKILLS_FULL, encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f, delimiter="\t"):
            nm = (r.get("skill") or "").strip()
            if nm:
                rows[nm] = r
                rows.setdefault(norm(nm), r)

    missing = {}
    if MISSINGNO.exists():
        for sid, name, kk in re.findall(
            r"^\| `([^`]+)` \| ([^|]+) \| (.+?) \|$", MISSINGNO.read_text(encoding="utf-8"), re.M
        ):
            missing[sid] = (name.strip(), re.findall(r"`([^`]+)` \((?:no scalingConstant|empty value)\)", kk))

    data = json.loads(SKILLS_JSON.read_text(encoding="utf-8"))
    by_id = {s.get("id"): s for s in data}
    stat_id_to_key = ft.load_stat_id_to_key()
    name_to_id = ft.build_name_to_id(data)

    added = 0
    skipped = []
    samples = []
    for sid, (display, keys) in missing.items():
        skill = by_id.get(sid)
        if not skill:
            continue
        row = rows.get(display) or rows.get(norm(display))
        sdid = sd_name.get(display) or sd_name.get(norm(display))
        if row is None or not sdid:
            skipped.append((sid, "*", "no skills_full/skilldesc row"))
            continue
        sc = skill.setdefault("scalingConstants", [])
        have = {c.get("statKey") for c in sc}

        elem = None
        if (row.get("elem_min_avg") or "").strip():
            elem = (
                int_or(row.get("elem_min_avg")),
                int_or(row.get("elem_max_avg")),
                [int_or(row.get(f"elem_avg_lev{i}")) for i in range(1, 6)],
            )
        mana_base = int_or(row.get("mana_base"))
        mana_per = int_or(row.get("mana_per_level"))
        mana_shift = int_or(row.get("mana_shift"), 5)
        mana_min = int_or(row.get("mana_min"))

        for key in keys:
            if key in have:
                continue
            meta = lookup_line(sdid, key.lower())
            value0 = None

            # 1) literal count straight from the desc line
            if meta and meta["value_kind"] == "count":
                dl = desc_lines.get((sdid, meta["line_name"])) or {}
                lit = dl.get("literal_value") or ""
                if re.fullmatch(r"-?\d+", lit):
                    value0 = lit

            # 2) average elemental damage (fire/poison dots)
            if value0 is None and key.startswith("average_") and elem:
                emin, emax, per = elem
                value0 = f"truncdiv(({lev_scaled(emin, per)})+({lev_scaled(emax, per)}),2)"

            # 3) mana cost
            if value0 is None and key == "mana_cost" and (mana_base or mana_per):
                value0 = f"truncdiv(({mana_base}+{mana_per}*max(lvl,1)-{mana_per})*(2^{mana_shift}),256)"
                if mana_min:
                    value0 = f"max({mana_min},{value0})"

            # 4) translated desc formula
            if value0 is None and meta and meta["has_calc"]:
                dl = desc_lines.get((sdid, meta["line_name"])) or {}
                calca = dl.get("calca") or ""
                calc1 = (row.get("calc1") or "").strip() or "0"
                mnhp = (
                    "truncdiv((par3+(lvl-1)*par4)*(100+par2)"
                    f"*(100+({calc1}))*(100+truncdiv(ulvl,2)),1000000)"
                )
                calca = re.sub(r"\bmnhp\b", f"({mnhp})", calca)
                calca = re.sub(r"\bmnar\b", "(par5*max(lvl-1,0))", calca)
                if calca and not re.search(r"\b(pets|skcd|rng|len|edln)\b", calca):
                    try:
                        params = ft.row_params(row)
                        t = ft.translate_formula(
                            calca, params, stat_id_to_key, ft.build_damage_map(skill, row), name_to_id
                        )
                        t = re.sub(r"\bpar(\d+)\b", lambda m: str(params.get(int(m.group(1))) or 0), t)
                        if t and not re.search(r"\b(state|rng)\s*\(?", t):
                            value0 = t
                    except Exception:
                        pass

            if value0 is None:
                skipped.append((sid, key, "unresolved"))
                continue
            sc.append({"statKey": key, "occurrenceIndex": 0, "variantKey": "", "value0": value0})
            have.add(key)
            added += 1
            if len(samples) < 12:
                samples.append((sid, key, value0[:105]))

    print(f"\nadded: {added}, skipped: {len(skipped)}")
    for sid, key, v in samples:
        print(f"  {sid}.{key} = {v}")
    from collections import Counter
    for why, n in Counter(s[2] for s in skipped).most_common(6):
        print(f"  skip[{why}]: {n}")
    if args.apply:
        SKILLS_JSON.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print("Wrote skills.json")


if __name__ == "__main__":
    main()
