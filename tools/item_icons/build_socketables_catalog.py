"""Build public/items/<version>/socketables.json from icons + rune name map.

Run from repo root:
  python tools/item_icons/build_socketables_catalog.py --version 2.14
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent
ICONS_DIR = REPO_ROOT / "public" / "icons" / "item_icons"

# Only items listed on https://docs.median-xl.com/doc/items/socketables
# Codes from gems.txt / misc.txt; icons from game MPQ stems.
RUNE_ROWS: list[dict] = [
    # Classic runes
    {
        "name": "El",
        "code": "r01",
        "icon": "invrEl",
        "level": 6,
        "weapon": "+3 to all Attributes",
        "armor": "+3 to all Attributes",
        "shield": "+3 to all Attributes",
    },
    {
        "name": "Eld",
        "code": "r02",
        "icon": "invrEld",
        "level": 8,
        "weapon": "+5 to Maximum Damage",
        "armor": "+3 to Maximum Damage",
        "shield": "+3 to Maximum Damage",
    },
    {
        "name": "Tir",
        "code": "r03",
        "icon": "invrTir",
        "level": 10,
        "weapon": "+3% to Fire Spell Damage",
        "armor": "+3% to Fire Spell Damage",
        "shield": "+3% to Fire Spell Damage",
    },
    {
        "name": "Nef",
        "code": "r04",
        "icon": "invrNef",
        "level": 13,
        "weapon": "+3% to Lightning Spell Damage",
        "armor": "+3% to Lightning Spell Damage",
        "shield": "+3% to Lightning Spell Damage",
    },
    {
        "name": "Eth",
        "code": "r05",
        "icon": "invrEth",
        "level": 15,
        "weapon": "+3% to Cold Spell Damage",
        "armor": "+3% to Cold Spell Damage",
        "shield": "+3% to Cold Spell Damage",
    },
    {
        "name": "Ith",
        "code": "r06",
        "icon": "invrIth",
        "level": 18,
        "weapon": "+3% to Poison Spell Damage",
        "armor": "+3% to Poison Spell Damage",
        "shield": "+3% to Poison Spell Damage",
    },
    {
        "name": "Tal",
        "code": "r07",
        "icon": "invrTal",
        "level": 20,
        "weapon": "+3% to Physical/Magic Spell Damage",
        "armor": "+3% to Physical/Magic Spell Damage",
        "shield": "+3% to Physical/Magic Spell Damage",
    },
    {
        "name": "Ral",
        "code": "r08",
        "icon": "invrRal",
        "level": 23,
        "weapon": "Fire Resist +30%",
        "armor": "Fire Resist +25%",
        "shield": "Fire Resist +25%",
    },
    {
        "name": "Ort",
        "code": "r09",
        "icon": "invrOrt",
        "level": 25,
        "weapon": "Lightning Resist +30%",
        "armor": "Lightning Resist +25%",
        "shield": "Lightning Resist +25%",
    },
    {
        "name": "Thul",
        "code": "r10",
        "icon": "invrThul",
        "level": 28,
        "weapon": "Cold Resist +30%",
        "armor": "Cold Resist +25%",
        "shield": "Cold Resist +25%",
    },
    {
        "name": "Amn",
        "code": "r11",
        "icon": "invrAmn",
        "level": 30,
        "weapon": "Poison Resist +30%",
        "armor": "Poison Resist +25%",
        "shield": "Poison Resist +25%",
    },
    {
        "name": "Sol",
        "code": "r12",
        "icon": "invrSol",
        "level": 33,
        "weapon": "+60 to Mana",
        "armor": "+40 to Mana",
        "shield": "+40 to Mana",
    },
    {
        "name": "Shael",
        "code": "r13",
        "icon": "invrShae",
        "level": 35,
        "weapon": "+15% Bonus to Poison Skill Duration",
        "armor": "+10% Bonus to Poison Skill Duration",
        "shield": "+10% Bonus to Poison Skill Duration",
    },
    {
        "name": "Dol",
        "code": "r14",
        "icon": "invrDol",
        "level": 38,
        "weapon": "+10% to Summon Life",
        "armor": "+10% to Summon Life",
        "shield": "+10% to Summon Life",
    },
    {
        "name": "Hel",
        "code": "r15",
        "icon": "invrHel",
        "level": 40,
        "weapon": "+5% to Summon Damage",
        "armor": "+5% to Summon Damage",
        "shield": "+5% to Summon Damage",
    },
    {
        "name": "Io",
        "code": "r16",
        "icon": "invrIo",
        "level": 43,
        "weapon": "+50% to Summon Attack Rating",
        "armor": "+50% to Summon Attack Rating",
        "shield": "+50% to Summon Attack Rating",
    },
    {
        "name": "Lum",
        "code": "r17",
        "icon": "invrLum",
        "level": 45,
        "weapon": "+5% to Summon Elemental Resistances",
        "armor": "+5% to Summon Elemental Resistances",
        "shield": "+5% to Summon Elemental Resistances",
    },
    {
        "name": "Ko",
        "code": "r18",
        "icon": "invrKo",
        "level": 48,
        "weapon": "5% to Strength",
        "armor": "5% to Strength",
        "shield": "5% to Strength",
    },
    {
        "name": "Fal",
        "code": "r19",
        "icon": "invrFal",
        "level": 50,
        "weapon": "5% to Dexterity",
        "armor": "5% to Dexterity",
        "shield": "5% to Dexterity",
    },
    {
        "name": "Lem",
        "code": "r20",
        "icon": "invrLem",
        "level": 53,
        "weapon": "4% to Vitality",
        "armor": "4% to Vitality",
        "shield": "4% to Vitality",
    },
    {
        "name": "Pul",
        "code": "r21",
        "icon": "invrPul",
        "level": 55,
        "weapon": "5% to Energy",
        "armor": "5% to Energy",
        "shield": "5% to Energy",
    },
    {
        "name": "Um",
        "code": "r22",
        "icon": "invrUm",
        "level": 58,
        "weapon": "Elemental Resists +10%",
        "armor": "Elemental Resists +10%",
        "shield": "Elemental Resists +10%",
    },
    {
        "name": "Mal",
        "code": "r23",
        "icon": "invrMal",
        "level": 60,
        "weapon": "3% to All Attributes",
        "armor": "3% to All Attributes",
        "shield": "3% to All Attributes",
    },
    {
        "name": "Ist",
        "code": "r24",
        "icon": "invrIst",
        "level": 63,
        "weapon": "10% Magic Find",
        "armor": "7% Magic Find",
        "shield": "7% Magic Find",
    },
    {
        "name": "Gul",
        "code": "r25",
        "icon": "invrGul",
        "level": 65,
        "weapon": "15% Attack Speed",
        "armor": "15% Attack Speed",
        "shield": "15% Attack Speed",
    },
    {
        "name": "Vex",
        "code": "r26",
        "icon": "invrvex",
        "level": 68,
        "weapon": "15% Cast Speed",
        "armor": "15% Cast Speed",
        "shield": "15% Cast Speed",
    },
    {
        "name": "Ohm",
        "code": "r27",
        "icon": "invrOhm",
        "level": 70,
        "weapon": "15% Hit Recovery",
        "armor": "15% Hit Recovery",
        "shield": "15% Hit Recovery",
    },
    {
        "name": "Lo",
        "code": "r28",
        "icon": "invrLo",
        "level": 73,
        "weapon": "15% Block Speed",
        "armor": "15% Block Speed",
        "shield": "15% Block Speed",
    },
    {
        "name": "Sur",
        "code": "r29",
        "icon": "invrSur",
        "level": 75,
        "weapon": "Regenerate Mana +15%",
        "armor": "Regenerate Mana +5%",
        "shield": "Regenerate Mana +5%",
    },
    {
        "name": "Ber",
        "code": "r30",
        "icon": "invrBer",
        "level": 78,
        "weapon": "Slow Target 3%",
        "armor": "Slows Attacker by 2%",
        "shield": "Slows Attacker by 2%",
    },
    {
        "name": "Jah",
        "code": "r31",
        "icon": "invrJo",
        "level": 80,
        "weapon": "+15% Enhanced Damage",
        "armor": "+15% Enhanced Defense",
        "shield": "+15% Enhanced Defense",
    },
    {
        "name": "Cham",
        "code": "r32",
        "icon": "invrCham",
        "level": 83,
        "weapon": "Maximum Mana +3%",
        "armor": "Maximum Mana +2%",
        "shield": "Maximum Mana +2%",
    },
    {
        "name": "Zod",
        "code": "r33",
        "icon": "invrZod",
        "level": 85,
        "weapon": "+15 Life after each Kill",
        "armor": "+15 Life after each Kill",
        "shield": "+15 Life after each Kill",
    },
    # Enchanted runes use Median xis* invfiles (yellow rune art), not invr* / *C.
    {
        "name": "Ol",
        "code": "rx01",
        "icon": "xisEl",
        "level": 90,
        "weapon": "+13 to all Attributes",
        "armor": "+13 to all Attributes",
        "shield": "+13 to all Attributes",
    },
    {
        "name": "Elq",
        "code": "rx02",
        "icon": "xisEld",
        "level": 90,
        "weapon": "+20 to Maximum Damage",
        "armor": "+10 to Maximum Damage",
        "shield": "+10 to Maximum Damage",
    },
    {
        "name": "Tyr",
        "code": "rx03",
        "icon": "xisTir",
        "level": 90,
        "weapon": "+5% to Fire Spell Damage",
        "armor": "+5% to Fire Spell Damage",
        "shield": "+5% to Fire Spell Damage",
    },
    {
        "name": "Nif",
        "code": "rx04",
        "icon": "xisNef",
        "level": 95,
        "weapon": "+5% to Lightning Spell Damage",
        "armor": "+5% to Lightning Spell Damage",
        "shield": "+5% to Lightning Spell Damage",
    },
    {
        "name": "Xeth",
        "code": "rx05",
        "icon": "xisEth",
        "level": 95,
        "weapon": "+5% to Cold Spell Damage",
        "armor": "+5% to Cold Spell Damage",
        "shield": "+5% to Cold Spell Damage",
    },
    {
        "name": "Xith",
        "code": "rx06",
        "icon": "xisIth",
        "level": 95,
        "weapon": "+5% to Poison Spell Damage",
        "armor": "+5% to Poison Spell Damage",
        "shield": "+5% to Poison Spell Damage",
    },
    {
        "name": "Thal",
        "code": "rx07",
        "icon": "xisTal",
        "level": 100,
        "weapon": "+5% to Physical/Magic Spell Damage",
        "armor": "+5% to Physical/Magic Spell Damage",
        "shield": "+5% to Physical/Magic Spell Damage",
    },
    {
        "name": "Rhal",
        "code": "rx08",
        "icon": "xisRal",
        "level": 100,
        "weapon": "Fire Resist +35%",
        "armor": "Fire Resist +35%",
        "shield": "Fire Resist +45%",
    },
    {
        "name": "Urt",
        "code": "rx09",
        "icon": "xisOrt",
        "level": 100,
        "weapon": "Lightning Resist +35%",
        "armor": "Lightning Resist +35%",
        "shield": "Lightning Resist +45%",
    },
    {
        "name": "Tuul",
        "code": "rx10",
        "icon": "xisThul",
        "level": 100,
        "weapon": "Cold Resist +35%",
        "armor": "Cold Resist +35%",
        "shield": "Cold Resist +45%",
    },
    {
        "name": "Ahmn",
        "code": "rx11",
        "icon": "xisAmn",
        "level": 100,
        "weapon": "Poison Resist +35%",
        "armor": "Poison Resist +35%",
        "shield": "Poison Resist +45%",
    },
    {
        "name": "Zol",
        "code": "rx12",
        "icon": "xisSol",
        "level": 100,
        "weapon": "+100 to Mana",
        "armor": "+75 to Mana",
        "shield": "+75 to Mana",
    },
    {
        "name": "Shaen",
        "code": "rx13",
        "icon": "xisShael",
        "level": 105,
        "weapon": "+20% Bonus to Poison Skill Duration",
        "armor": "+13% Bonus to Poison Skill Duration",
        "shield": "+13% Bonus to Poison Skill Duration",
    },
    {
        "name": "Doj",
        "code": "rx14",
        "icon": "xisDol",
        "level": 105,
        "weapon": "+20% to Summon Life",
        "armor": "+20% to Summon Life",
        "shield": "+20% to Summon Life",
    },
    {
        "name": "Hem",
        "code": "rx15",
        "icon": "xisHel",
        "level": 105,
        "weapon": "+10% to Summon Damage",
        "armor": "+10% to Summon Damage",
        "shield": "+10% to Summon Damage",
    },
    {
        "name": "Iu",
        "code": "rx16",
        "icon": "xisIo",
        "level": 105,
        "weapon": "+70% to Summon Attack Rating",
        "armor": "+70% to Summon Attack Rating",
        "shield": "+70% to Summon Attack Rating",
    },
    {
        "name": "Lux",
        "code": "rx17",
        "icon": "xisLum",
        "level": 105,
        "weapon": "+7% to Summon Elemental Resistances",
        "armor": "+7% to Summon Elemental Resistances",
        "shield": "+7% to Summon Elemental Resistances",
    },
    {
        "name": "Ka",
        "code": "rx18",
        "icon": "xisKo",
        "level": 105,
        "weapon": "7% to Strength",
        "armor": "7% to Strength",
        "shield": "7% to Strength",
    },
    {
        "name": "Fel",
        "code": "rx19",
        "icon": "xisFal",
        "level": 110,
        "weapon": "7% to Dexterity",
        "armor": "7% to Dexterity",
        "shield": "7% to Dexterity",
    },
    {
        "name": "Lew",
        "code": "rx20",
        "icon": "xisLem",
        "level": 110,
        "weapon": "6% to Vitality",
        "armor": "6% to Vitality",
        "shield": "6% to Vitality",
    },
    {
        "name": "Phul",
        "code": "rx21",
        "icon": "xisPul",
        "level": 110,
        "weapon": "7% to Energy",
        "armor": "7% to Energy",
        "shield": "7% to Energy",
    },
    {
        "name": "Un",
        "code": "rx22",
        "icon": "xisUm",
        "level": 110,
        "weapon": "Elemental Resists +13%",
        "armor": "Elemental Resists +13%",
        "shield": "Elemental Resists +13%",
    },
    {
        "name": "Mhal",
        "code": "rx23",
        "icon": "xisMal",
        "level": 110,
        "weapon": "4% to All Attributes",
        "armor": "4% to All Attributes",
        "shield": "4% to All Attributes",
    },
    {
        "name": "Yst",
        "code": "rx24",
        "icon": "xisIst",
        "level": 110,
        "weapon": "13% Magic Find",
        "armor": "10% Magic Find",
        "shield": "10% Magic Find",
    },
    {
        "name": "Gur",
        "code": "rx25",
        "icon": "xisGul",
        "level": 115,
        "weapon": "40% Attack Speed",
        "armor": "30% Attack Speed",
        "shield": "30% Attack Speed",
    },
    {
        "name": "Vez",
        "code": "rx26",
        "icon": "xisVex",
        "level": 115,
        "weapon": "40% Cast Speed",
        "armor": "30% Cast Speed",
        "shield": "30% Cast Speed",
    },
    {
        "name": "Ohn",
        "code": "rx27",
        "icon": "xisOhm",
        "level": 115,
        "weapon": "30% Hit Recovery",
        "armor": "30% Hit Recovery",
        "shield": "40% Hit Recovery",
    },
    {
        "name": "Loz",
        "code": "rx28",
        "icon": "xisLo",
        "level": 115,
        "weapon": "+4% to Summon Physical Resist",
        "armor": "+3% to Summon Physical Resist",
        "shield": "60% Block Speed",
    },
    {
        "name": "Zur",
        "code": "rx29",
        "icon": "xisSur",
        "level": 115,
        "weapon": "Regenerate Mana +22%",
        "armor": "Regenerate Mana +11%",
        "shield": "Regenerate Mana +11%",
    },
    {
        "name": "Bur",
        "code": "rx30",
        "icon": "xisBer",
        "level": 115,
        "weapon": "Slow Target 5%",
        "armor": "Slows Attacker by 4%",
        "shield": "Slows Attacker by 5%",
    },
    {
        "name": "Iah",
        "code": "rx31",
        "icon": "xisJah",
        "level": 120,
        "weapon": "+25% Enhanced Damage",
        "armor": "+25% Enhanced Defense",
        "shield": "+25% Enhanced Defense",
    },
    {
        "name": "Yham",
        "code": "rx32",
        "icon": "xisCham",
        "level": 120,
        "weapon": "Maximum Mana +5%",
        "armor": "Maximum Life and Mana +2%",
        "shield": "Maximum Life +3%",
    },
    {
        "name": "Xod",
        "code": "rx33",
        "icon": "xisZod",
        "level": 120,
        "weapon": "+1 to All Skills",
        "armor": "+1 to All Skills",
        "shield": "+1 to All Skills",
    },
    # Fauztinville great runes
    {
        "name": "Taha",
        "code": "r51",
        "icon": "r-d-02",
        "level": 100,
        "weapon": "-3% to Enemy Elemental Resistances",
        "armor": "-2% to Enemy Elemental Resistances",
        "shield": "-2% to Enemy Elemental Resistances",
    },
    {
        "name": "Ghal",
        "code": "r52",
        "icon": "r-d-05",
        "level": 100,
        "weapon": "+25 Spell Focus",
        "armor": "+15 Spell Focus",
        "shield": "+15 Spell Focus",
    },
    {
        "name": "Qor",
        "code": "r53",
        "icon": "r-d-11",
        "level": 100,
        "weapon": "3% Deadly Strike",
        "armor": "2% Deadly Strike",
        "shield": "2% Deadly Strike",
    },
    # Secret elemental runes
    {
        "name": "Fire",
        "code": "r57",
        "icon": "fire-rune",
        "level": 100,
        "weapon": "-5% to Enemy Fire Resistance",
        "armor": "-3% to Enemy Fire Resistance",
        "shield": "Fire Absorb 1%",
    },
    {
        "name": "Stone",
        "code": "r58",
        "icon": "phys-rune",
        "level": 100,
        "weapon": "Adds 8-12 Damage",
        "armor": "Adds 4-6 Damage",
        "shield": "Physical Resist 1%",
    },
    {
        "name": "Arcane",
        "code": "r59",
        "icon": "magic-rune",
        "level": 100,
        "weapon": "+4% Bonus to Spell Focus",
        "armor": "+2% Bonus to Spell Focus",
        "shield": "Magic Resist +1%",
    },
    {
        "name": "Poison",
        "code": "r60",
        "icon": "pois-rune",
        "level": 100,
        "weapon": "-5% to Enemy Poison Resistance",
        "armor": "-3% to Enemy Poison Resistance",
        "shield": "Poison Length Reduction 15%",
    },
    {
        "name": "Light",
        "code": "r61",
        "icon": "ltng-rune",
        "level": 100,
        "weapon": "-5% to Enemy Lightning Resistance",
        "armor": "-3% to Enemy Lightning Resistance",
        "shield": "Lightning Absorb 1%",
    },
    {
        "name": "Ice",
        "code": "r62",
        "icon": "cold-rune",
        "level": 100,
        "weapon": "-5% to Enemy Cold Resistance",
        "armor": "-3% to Enemy Cold Resistance",
        "shield": "Cold Absorb 1%",
    },
]

# Display names / codes / icons / socket bonuses from Median gems+runes guide + misc.txt.
# weapon / armor / shield are the in-game socketed bonuses for that slot.
GEM_ROWS: list[dict] = [
    # Diamond
    {
        "name": "Diamond",
        "code": "gsw",
        "icon": "invgswc",
        "level": 12,
        "weapon": "+2% to Spell Damage",
        "armor": "3% to Strength",
        "shield": "Elemental Resists +3%",
    },
    {
        "name": "Flawless Diamond",
        "code": "glw",
        "icon": "invgswd",
        "level": 15,
        "weapon": "+2% to Spell Damage",
        "armor": "4% to Strength",
        "shield": "Elemental Resists +4%",
    },
    {
        "name": "Perfect Diamond",
        "code": "gpw",
        "icon": "invgswe",
        "level": 18,
        "weapon": "+3% to Spell Damage",
        "armor": "5% to Strength",
        "shield": "Elemental Resists +5%",
    },
    # Amethyst
    {
        "name": "Amethyst",
        "code": "gsv",
        "icon": "invgsvc",
        "level": 12,
        "weapon": "30% Bonus to Attack Rating",
        "armor": "3% to Dexterity",
        "shield": "+3 Mana when Struck by an Enemy",
    },
    {
        "name": "Flawless Amethyst",
        "code": "gzv",
        "icon": "invgsvd",
        "level": 15,
        "weapon": "40% Bonus to Attack Rating",
        "armor": "4% to Dexterity",
        "shield": "+4 Mana when Struck by an Enemy",
    },
    {
        "name": "Perfect Amethyst",
        "code": "gpv",
        "icon": "invgsve",
        "level": 18,
        "weapon": "50% Bonus to Attack Rating",
        "armor": "5% to Dexterity",
        "shield": "+5 Mana when Struck by an Enemy",
    },
    # Ruby
    {
        "name": "Ruby",
        "code": "gsr",
        "icon": "invgsrc",
        "level": 12,
        "weapon": "+6 Life after each Kill",
        "armor": "2% to Vitality",
        "shield": "Fire Resist +18%",
    },
    {
        "name": "Flawless Ruby",
        "code": "glr",
        "icon": "invgsrd",
        "level": 15,
        "weapon": "+8 Life after each Kill",
        "armor": "3% to Vitality",
        "shield": "Fire Resist +24%",
    },
    {
        "name": "Perfect Ruby",
        "code": "gpr",
        "icon": "invgsre",
        "level": 18,
        "weapon": "+10 Life after each Kill",
        "armor": "4% to Vitality",
        "shield": "Fire Resist +30%",
    },
    # Topaz
    {
        "name": "Topaz",
        "code": "gsy",
        "icon": "invgsyc",
        "level": 12,
        "weapon": "+8 Spell Focus",
        "armor": "3% to Energy",
        "shield": "Lightning Resist +18%",
    },
    {
        "name": "Flawless Topaz",
        "code": "gly",
        "icon": "invgsyd",
        "level": 15,
        "weapon": "+9 Spell Focus",
        "armor": "4% to Energy",
        "shield": "Lightning Resist +24%",
    },
    {
        "name": "Perfect Topaz",
        "code": "gpy",
        "icon": "invgsye",
        "level": 18,
        "weapon": "+10 Spell Focus",
        "armor": "5% to Energy",
        "shield": "Lightning Resist +30%",
    },
    # Bloodstone
    {
        "name": "Bloodstone",
        "code": "9$c",
        "icon": "invgscc",
        "level": 12,
        "weapon": "+6% to Summon Life",
        "armor": "Fire Resist +12%",
        "shield": "+3% to Summon Elemental Resistances",
    },
    {
        "name": "Flawless Bloodstone",
        "code": "9$d",
        "icon": "invgscd",
        "level": 15,
        "weapon": "+8% to Summon Life",
        "armor": "Fire Resist +16%",
        "shield": "+4% to Summon Elemental Resistances",
    },
    {
        "name": "Perfect Bloodstone",
        "code": "9$e",
        "icon": "invgsce",
        "level": 18,
        "weapon": "+10% to Summon Life",
        "armor": ["Fire Resist +20%", "Maximum Fire Resist +1%"],
        "shield": "+5% to Summon Elemental Resistances",
    },
    # Onyx
    {
        "name": "Onyx",
        "code": "g$c",
        "icon": "invgsoc",
        "level": 12,
        "weapon": "+3% to Summon Damage",
        "armor": "Cold Resist +12%",
        "shield": "Slow Target 1%",
    },
    {
        "name": "Flawless Onyx",
        "code": "g$d",
        "icon": "invgsod",
        "level": 15,
        "weapon": "+4% to Summon Damage",
        "armor": "Cold Resist +16%",
        "shield": "Slow Target 2%",
    },
    {
        "name": "Perfect Onyx",
        "code": "g$e",
        "icon": "invgsoe",
        "level": 18,
        "weapon": "+5% to Summon Damage",
        "armor": ["Cold Resist +20%", "Maximum Cold Resist +1%"],
        "shield": "Slow Target 2%",
    },
    # Amber
    {
        "name": "Amber",
        "code": "5$c",
        "icon": "invgsac",
        "level": 12,
        "weapon": "1% Reanimate as: Walker",
        "armor": "Lightning Resist +12%",
        "shield": "Slows Attacker by 1%",
    },
    {
        "name": "Flawless Amber",
        "code": "5$d",
        "icon": "invgsad",
        "level": 15,
        "weapon": "1% Reanimate as: Walker",
        "armor": "Lightning Resist +16%",
        "shield": "Slows Attacker by 2%",
    },
    {
        "name": "Perfect Amber",
        "code": "5$e",
        "icon": "invgsae",
        "level": 18,
        "weapon": "2% Reanimate as: Walker",
        "armor": ["Lightning Resist +20%", "Maximum Lightning Resist +1%"],
        "shield": "Slows Attacker by 2%",
    },
    # Turquoise
    {
        "name": "Turquoise",
        "code": "7$c",
        "icon": "invgstc",
        "level": 12,
        "weapon": "Regenerate Mana +6%",
        "armor": "Poison Resist +12%",
        "shield": "4% Magic Find",
    },
    {
        "name": "Flawless Turquoise",
        "code": "7$d",
        "icon": "invgstd",
        "level": 15,
        "weapon": "Regenerate Mana +8%",
        "armor": "Poison Resist +16%",
        "shield": "6% Magic Find",
    },
    {
        "name": "Perfect Turquoise",
        "code": "7$e",
        "icon": "invgste",
        "level": 18,
        "weapon": "Regenerate Mana +10%",
        "armor": ["Poison Resist +20%", "Maximum Poison Resist +1%"],
        "shield": "8% Magic Find",
    },
    # Sapphire
    {
        "name": "Sapphire",
        "code": "gsb",
        "icon": "invgsbc",
        "level": 12,
        "weapon": "+5 Mana after each Kill",
        "armor": "Cold Resist +12%",
        "shield": "Cold Resist +18%",
    },
    {
        "name": "Flawless Sapphire",
        "code": "glb",
        "icon": "invgsbd",
        "level": 15,
        "weapon": "+6 Mana after each Kill",
        "armor": "Cold Resist +16%",
        "shield": "Cold Resist +24%",
    },
    {
        "name": "Perfect Sapphire",
        "code": "gpb",
        "icon": "invgsbe",
        "level": 18,
        "weapon": "+8 Mana after each Kill",
        "armor": "Cold Resist +20%",
        "shield": "Cold Resist +30%",
    },
    # Emerald
    {
        "name": "Emerald",
        "code": "gsg",
        "icon": "invgsgc",
        "level": 12,
        "weapon": "+3 to Maximum Damage",
        "armor": "+6 Life Regenerated per Second",
        "shield": "Poison Resist +18%",
    },
    {
        "name": "Flawless Emerald",
        "code": "glg",
        "icon": "invgsgd",
        "level": 15,
        "weapon": "+4 to Maximum Damage",
        "armor": "+8 Life Regenerated per Second",
        "shield": "Poison Resist +24%",
    },
    {
        "name": "Perfect Emerald",
        "code": "gpg",
        "icon": "invgsge",
        "level": 18,
        "weapon": "+5 to Maximum Damage",
        "armor": "+10 Life Regenerated per Second",
        "shield": "Poison Resist +30%",
    },
    # Rainbow Stone
    {
        "name": "Rainbow Stone",
        "code": "yo3",
        "icon": "og3",
        "level": 12,
        "weapon": "2% Innate Elemental Damage",
        "armor": "4% Gold Find",
        "shield": "Curse Length Reduction 4%",
    },
    {
        "name": "Flawless Rainbow Stone",
        "code": "yo4",
        "icon": "og4",
        "level": 15,
        "weapon": "2% Innate Elemental Damage",
        "armor": "6% Gold Find",
        "shield": "Curse Length Reduction 5%",
    },
    {
        "name": "Perfect Rainbow Stone",
        "code": "yo5",
        "icon": "og5",
        "level": 18,
        "weapon": "3% Innate Elemental Damage",
        "armor": "8% Gold Find",
        "shield": "Curse Length Reduction 6%",
    },
    # Skull
    {
        "name": "Skull",
        "code": "sku",
        "icon": "invsku",
        "level": 12,
        "weapon": "+7% Enhanced Damage",
        "armor": "+7% Enhanced Defense",
        "shield": "Poison Length Reduction 3%",
    },
    {
        "name": "Flawless Skull",
        "code": "skl",
        "icon": "invskl",
        "level": 15,
        "weapon": "+8% Enhanced Damage",
        "armor": "+8% Enhanced Defense",
        "shield": "Poison Length Reduction 4%",
    },
    {
        "name": "Perfect Skull",
        "code": "skz",
        "icon": "invskz",
        "level": 18,
        "weapon": "+10% Enhanced Damage",
        "armor": "+10% Enhanced Defense",
        "shield": "Poison Length Reduction 5%",
    },
]


def _version_folder(version: str) -> str:
    return version.strip().replace(".", "_")


def _icon_exists(stem: str, available: set[str]) -> bool:
    low = stem.lower()
    return low in available or stem in available


def _resolve_existing(stem: str, available: set[str], available_exact: dict[str, str]) -> str:
    if stem in available_exact:
        return available_exact[stem]
    low = stem.lower()
    if low in available_exact:
        return available_exact[low]
    # case-insensitive scan
    for exact in available_exact.values():
        if exact.lower() == low:
            return exact
    return stem


def _normalize_slot_bonus(value: object) -> str | list[str] | None:
    """Single stat -> string; 2+ stats -> list of strings."""
    if value is None:
        return None
    if isinstance(value, (list, tuple)):
        parts = [str(x).strip() for x in value if str(x).strip()]
    elif isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        # Split accidental comma-joined multi-stats from older rows.
        if ", " in raw and raw.count("+") + raw.count("%") >= 2 and ", Maximum " in raw:
            parts = [p.strip() for p in raw.split(", ") if p.strip()]
        else:
            parts = [raw]
    else:
        return None
    if not parts:
        return None
    if len(parts) == 1:
        return parts[0]
    return parts


def _socketable_entry(
    row: dict,
    *,
    type_name: str,
    display_name: str,
    available: set[str],
    available_exact: dict[str, str],
) -> dict:
    icon = _resolve_existing(row["icon"], available, available_exact)
    entry = {
        "name": display_name,
        "type": type_name,
        "icon": icon,
        "code": row["code"],
    }
    if row.get("level") is not None:
        entry["level"] = row["level"]
    for key in ("weapon", "armor", "shield"):
        bonus = _normalize_slot_bonus(row.get(key))
        if bonus is not None:
            entry[key] = bonus
    return entry


def main() -> int:
    parser = argparse.ArgumentParser(description="Build socketables.json for the planner.")
    parser.add_argument("--version", default="2.14")
    args = parser.parse_args()
    folder = _version_folder(args.version)
    out_path = REPO_ROOT / "public" / "items" / folder / "socketables.json"

    available_exact: dict[str, str] = {}
    for p in ICONS_DIR.glob("*.webp"):
        available_exact[p.stem] = p.stem
        available_exact[p.stem.lower()] = p.stem
    available = set(available_exact)

    rows: list[dict] = []
    missing: list[str] = []

    for row in RUNE_ROWS:
        if not _icon_exists(row["icon"], available):
            missing.append(f"{row['name']} -> {row['icon']}")
        rows.append(
            _socketable_entry(
                row,
                type_name="Rune",
                display_name=f"{row['name']} Rune",
                available=available,
                available_exact=available_exact,
            )
        )

    for row in GEM_ROWS:
        if not _icon_exists(row["icon"], available):
            missing.append(f"{row['name']} -> {row['icon']}")
        rows.append(
            _socketable_entry(
                row,
                type_name="Gem",
                display_name=row["name"],
                available=available,
                available_exact=available_exact,
            )
        )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(rows, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(rows)} socketables -> {out_path}")
    if missing:
        print(f"WARNING: {len(missing)} icon(s) missing on disk:", file=sys.stderr)
        for m in missing:
            print(f"  - {m}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
