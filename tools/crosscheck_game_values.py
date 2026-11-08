#!/usr/bin/env python3
"""Crosscheck: compute the GAME's elemental damage (edmn/edmx) and synergy % for a set of
skills at several hard/soft-point level combinations, using the mxl-extractor formula VM.
This is the ground truth mxlplanner reproduces.
"""
import json
import struct
import sys

from formula_translate import SKILLS_JSON, load_skills_full, skills_full_path

EXPORTS = skills_full_path().parent
EXTRACTOR_ROOT = EXPORTS.parent
sys.path.insert(0, str(EXTRACTOR_ROOT))
from mxl_extractor.skill_params import SkillParamContext, resolve_param_id

SKILLS_BIN = EXTRACTOR_ROOT / "excel 2.14.6" / "skills.bin"
RECORD_SIZE = 0x23C

# raw calc-offset field positions in skills.bin (SkillsTxt)
RAW_OFFSETS = {
    "auralencalc": 0x60, "aurarangecalc": 0x64, "delay": 0x190,
    "calc1": 0x138, "calc2": 0x13C, "calc3": 0x140, "calc4": 0x144,
    "ToHitCalc": 0x1A0, "petmax": 0xC0,
    "DmgSymPerCalc": 0x1D8, "EDmgSymPerCalc": 0x210, "ELenSymPerCalc": 0x224,
}
for i in range(1, 7):
    RAW_OFFSETS[f"aurastatcalc{i}"] = 0x68 + (i - 1) * 4
for i in range(1, 6):
    RAW_OFFSETS[f"passivecalc{i}"] = 0xA4 + (i - 1) * 4


def read_raw_offsets(skill_id):
    data = SKILLS_BIN.read_bytes()
    off = 4 + skill_id * RECORD_SIZE
    rec = data[off:off + RECORD_SIZE]
    out = {}
    for key, field_off in RAW_OFFSETS.items():
        v = struct.unpack_from("<I", rec, field_off)[0]
        out[key] = 0 if v == 0xFFFFFFFF else v
    return out


skills_code = (EXPORTS / "skills_code.bin").read_bytes()
skilldesc_code = (EXPORTS / "skilldesc_code.bin").read_bytes()
skills2_code = (EXPORTS / "skills2_code.bin").read_bytes()

SKILLS = [
    "Apocalypse", "Blizzard", "Discharge", "Catapult Shot", "Abyss",
    "Arcane Torrent", "Earth Talons", "Bloodstar", "Disintegrate", "Solar Flare",
    "Amatoxin", "Curare", "Miasma", "Pestilence",
    "Arachnomancy", "Death Star", "Hyena Strike", "Lorenado", "Veil King Plague Grasp",
    "Venomcloud Totem", "Venomous Spirit", "Vine Companion", "Virulence",
]

# (blvl, slvl) hard/soft point combos; character level fixed at 120, no character stats.
LEVELS = [(1, 0), (20, 0), (1, 19), (20, 20)]
ULVL = 120
STATS = {12: ULVL}  # stat 12 = character level


def main():
    by_name = load_skills_full()

    # our base-damage scaling constants (for later comparison)
    our = json.loads(SKILLS_JSON.read_text(encoding="utf-8"))
    our_by_name = {}
    for s in our:
        nm = s.get("displayName")
        if nm:
            our_by_name[nm] = s

    print("skill\tblvl\tslvl\tgame_edmn\tgame_edmx\tgame_syn")
    for name in SKILLS:
        row = by_name.get(name)
        if row is None:
            print(f"# {name}: NOT FOUND")
            continue
        sid = int(row.get("Id"))
        etype = (row.get("EType") or "").strip()
        for blvl, slvl in LEVELS:
            lvl = blvl + slvl
            ctx = SkillParamContext.from_skills_full_row(
                sid, lvl, row,
                skills_code=skills_code, skilldesc_code=skilldesc_code, skills2_code=skills2_code,
                player_stats=STATS, skill_levels={sid: lvl},
                base_skill_level=blvl, base_skill_levels={sid: blvl},
                exports_dir=EXPORTS,
            )
            ctx.calc_offsets.update(read_raw_offsets(sid))
            edmn = resolve_param_id(ctx, 17, lvl)  # elemental min (base x synergy, shifted)
            edmx = resolve_param_id(ctx, 18, lvl)  # elemental max
            syn_off = ctx.calc_offsets.get("EDmgSymPerCalc", 0)
            syn = ctx.eval_skills_calc(syn_off, lvl) if syn_off else 0
            print(f"{name}\t{blvl}\t{slvl}\t{edmn}\t{edmx}\t{syn}\t# EType={etype}")


if __name__ == "__main__":
    main()
