/**
 * Build planner upgrade catalogs from wiki.median-xl.com and docs.median-xl.com.
 *
 * Usage:
 *   node tools/item_generation/generate-upgrade-catalogs.mjs [2.14] [--check]
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_VERSION = '2.14';
const SUPPORTED_FOLDER = '2_14';

export const CUBE_RECIPES_URL = 'https://wiki.median-xl.com/Cube_Recipes';
export const SHRINE_BONUSES_URL = 'https://wiki.median-xl.com/Shrine_Bonuses';
export const UMOS_DOCS_URL = 'https://docs.median-xl.com/doc/wiki/umos';
export const MYSTIC_ORBS_URL = 'https://wiki.median-xl.com/Mystic_Orbs';
export const NEPHALEM_RIFTS_URL = 'https://wiki.median-xl.com/Nephalem_Rifts';

/**
 * @param {string} url
 * @returns {Promise<string>}
 */
async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/html',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
  return response.text();
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function pretty(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * @param {string} version
 * @returns {string}
 */
function versionToFolder(version) {
  const [major = '0', minor = '0'] = String(version).trim().split('.');
  return `${major}_${minor}`;
}

/**
 * @param {string} html
 * @returns {string}
 */
function stripTags(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

/**
 * @param {string} html
 * @returns {string[][]}
 */
function tableRowCells(html) {
  const rows = [];
  for (const match of String(html || '').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...match[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) =>
      stripTags(cell[1])
    );
    if (cells.length) rows.push(cells);
  }
  return rows;
}

/**
 * Cube Recipes: Luck, Conjuration, Lottery.
 * @returns {object[]}
 */
export function cubeRecipeOils() {
  const luck = { oilKind: 'luck', notOnHonorifics: true, notOnRegular: true, requiresUnique: false };
  const lottery = { oilKind: 'lottery', requiresUnique: true };
  const jewelAttrs = [
    ['str', 'Strength', 'str'],
    ['dex', 'Dexterity', 'dex'],
    ['egy', 'Energy', 'egy'],
    ['vit', 'Vitality', 'vit'],
  ];
  /** @type {object[]} */
  const oils = [
    oilRow('oil_weapon_ed', '+20% Enhanced Damage', 'weapon', luck, [
      { affixId: 'edmg', value: 20 },
    ]),
    oilRow('oil_weapon_ar', '100% Bonus to Attack Rating', 'weapon', luck, [
      { affixId: 'arPercent', value: 100 },
    ]),
    oilRow('oil_weapon_ed_ar', '+20% Enhanced Damage; 100% Bonus to Attack Rating', 'weapon', luck, [
      { affixId: 'edmg', value: 20 },
      { affixId: 'arPercent', value: 100 },
    ]),
    oilRow('oil_weapon_spelldmg', '+10% to Spell Damage', 'weapon', { oilKind: 'conjuration' }, [
      { affixId: 'spellDmg', value: 10 },
    ], ['elemental_weapon']),
    oilRow('oil_elemwep_ias', '+20% Attack Speed', 'elemental_weapon', luck, [
      { affixId: 'ias', value: 20 },
    ]),
    oilRow('oil_elemwep_ar', '100% Bonus to Attack Rating', 'elemental_weapon', luck, [
      { affixId: 'arPercent', value: 100 },
    ]),
    oilRow(
      'oil_elemwep_ias_ar',
      '+20% Attack Speed; 100% Bonus to Attack Rating',
      'elemental_weapon',
      luck,
      [
        { affixId: 'ias', value: 20 },
        { affixId: 'arPercent', value: 100 },
      ]
    ),
    oilRow('oil_armor_ed', '+20% Enhanced Defense', 'armor', luck, [
      { affixId: 'defPercent', value: 20 },
    ]),
    oilRow('oil_armor_dr', 'Physical Resist +1%', 'armor', luck, [
      { affixId: 'physResist', value: 1 },
    ]),
    oilRow('oil_armor_ed_dr', '+20% Enhanced Defense; Physical Resist +1%', 'armor', luck, [
      { affixId: 'defPercent', value: 20 },
      { affixId: 'physResist', value: 1 },
    ]),
    oilRow('oil_amulet_skills', '+1 to All Skills', 'amulet', luck, [
      { affixId: 'allSkills', value: 1 },
    ]),
    oilRow('oil_ring_spelldmg', '+5% to Spell Damage', 'ring', luck, [
      { affixId: 'spellDmg', value: 5 },
    ]),
    oilRow('oil_quiver_attributes', '5% Bonus to All Attributes', 'quiver', luck, [
      { affixId: 'strPercent', value: 5 },
      { affixId: 'dexPercent', value: 5 },
      { affixId: 'vitPercent', value: 5 },
      { affixId: 'egyPercent', value: 5 },
    ]),
  ];

  const n = jewelAttrs.length;
  for (let mask = 1; mask < 1 << n; mask += 1) {
    const picked = jewelAttrs.filter((_, i) => mask & (1 << i));
    const id = `oil_jewel_${picked.map((row) => row[0]).join('_')}`;
    const label = picked.map((row) => `+2 to ${row[1]}`).join('; ');
    oils.push(
      oilRow(
        id,
        label,
        'jewel',
        luck,
        picked.map((row) => ({ affixId: row[2], value: 2 }))
      )
    );
  }

  oils.push(
    oilRow(
      'oil_unique_wep_ar_lvl',
      '2% Attack Rating per Character Level',
      'weapon',
      lottery,
      [{ affixId: 'arPercent', value: 2, basedOnLevel: true }],
      ['elemental_weapon']
    ),
    oilRow('oil_unique_armor_life', 'Increase Maximum Life 3%', 'armor', lottery, [
      { affixId: 'lifePercent', value: 3 },
    ]),
    oilRow('oil_unique_amulet_mr', 'Magic Resist +5%', 'amulet', lottery, [
      { affixId: 'resMagic', value: 5 },
    ]),
    oilRow(
      'oil_unique_ring_skills',
      '+1 to All Skills',
      'ring',
      { ...lottery, notOnSets: true },
      [{ affixId: 'allSkills', value: 1 }]
    ),
    oilRow(
      'oil_unique_quiver_mf',
      '50% Better Chance of Getting Magic Items',
      'quiver',
      { ...lottery, notOnSets: true },
      [{ affixId: 'magicFind', value: 50 }]
    ),
    oilRow(
      'oil_unique_jewel_allres',
      'All Resists +10%',
      'jewel',
      { ...lottery, notOnSets: true },
      [{ affixId: 'resElem', value: 10 }]
    ),
    {
      id: 'nothing',
      label: 'Nothing',
      slotType: null,
      oilKind: 'fail',
      requiresUnique: false,
      mods: [],
      modifiers: [],
    }
  );
  return oils;
}

/**
 * @param {string} id
 * @param {string} label
 * @param {string} slotType
 * @param {object} flags
 * @param {object[]} mods
 * @param {string[]} [extraSlotTypes]
 */
function oilRow(id, label, slotType, flags, mods, extraSlotTypes) {
  const modifiers = mods.map((mod) => {
    if (mod.affixId === 'edmg') return `+${mod.value}% Enhanced Damage`;
    if (mod.affixId === 'arPercent' && mod.basedOnLevel) return `+${mod.value}% Bonus to Attack Rating`;
    if (mod.affixId === 'arPercent') return `+${mod.value}% Bonus to Attack Rating`;
    if (mod.affixId === 'ias') return `+${mod.value}% Attack Speed`;
    if (mod.affixId === 'defPercent') return `+${mod.value}% Enhanced Defense`;
    if (mod.affixId === 'physResist') return `Physical Resist +${mod.value}%`;
    if (mod.affixId === 'allSkills') return `+${mod.value} to All Skills`;
    if (mod.affixId === 'spellDmg') return `+${mod.value}% Spell Damage`;
    if (mod.affixId === 'strPercent') return `+${mod.value}% to Strength`;
    if (mod.affixId === 'dexPercent') return `+${mod.value}% to Dexterity`;
    if (mod.affixId === 'vitPercent') return `+${mod.value}% to Vitality`;
    if (mod.affixId === 'egyPercent') return `+${mod.value}% to Energy`;
    if (mod.affixId === 'lifePercent') return `+${mod.value}% Maximum Life`;
    if (mod.affixId === 'resMagic') return `+${mod.value}% Magic Resistance`;
    if (mod.affixId === 'magicFind') return `+${mod.value}% Magic Find`;
    if (mod.affixId === 'resElem') return `+${mod.value}% Elemental Resistances`;
    if (mod.affixId === 'str') return `+${mod.value} to Strength`;
    if (mod.affixId === 'dex') return `+${mod.value} to Dexterity`;
    if (mod.affixId === 'egy') return `+${mod.value} to Energy`;
    if (mod.affixId === 'vit') return `+${mod.value} to Vitality`;
    return label;
  });
  const row = {
    id,
    label,
    slotType,
    oilKind: flags.oilKind,
    requiresUnique: flags.requiresUnique === true,
    mods,
    modifiers,
  };
  if (extraSlotTypes?.length) row.extraSlotTypes = extraSlotTypes;
  if (flags.notOnSets) row.notOnSets = true;
  if (flags.notOnHonorifics) row.notOnHonorifics = true;
  if (flags.notOnRegular) row.notOnRegular = true;
  return row;
}

/**
 * @param {string} line
 * @returns {object}
 */
function parseShrineBonusLine(line) {
  const text = String(line || '').trim();
  const range = /\((\d+)\s+to\s+(\d+)\)/.exec(text);
  const min = range ? Number(range[1]) : /(\d+)/.test(text) ? Number(/(\d+)/.exec(text)[1]) : null;
  const max = range ? Number(range[2]) : min;
  /** @type {string|undefined} */
  let affixId;
  if (/Bonus to Attack Rating/i.test(text)) affixId = 'arPercent';
  else if (/% to Dexterity/i.test(text)) affixId = 'dexPercent';
  else if (/to Dexterity/i.test(text)) affixId = 'dex';
  else if (/% to Strength/i.test(text)) affixId = 'strPercent';
  else if (/to Strength/i.test(text)) affixId = 'str';
  else if (/% to Energy/i.test(text)) affixId = 'egyPercent';
  else if (/to Energy/i.test(text)) affixId = 'egy';
  else if (/% to Vitality/i.test(text)) affixId = 'vitPercent';
  else if (/to Vitality/i.test(text)) affixId = 'vit';
  else if (/Spell Focus/i.test(text)) affixId = 'spellFocus';
  else if (/Enhanced Damage/i.test(text)) affixId = 'edmg';
  else if (/Enhanced Defense/i.test(text)) affixId = 'defPercent';
  else if (/Crushing Blow/i.test(text)) affixId = 'crushingBlow';
  else if (/Deadly Strike/i.test(text)) affixId = 'deadlyStrike';
  else if (/Physical Resist/i.test(text)) affixId = 'physResist';
  else if (/Cast Speed/i.test(text)) affixId = 'fcr';
  else if (/Maximum Mana/i.test(text)) affixId = 'manaPercent';
  else if (/Regenerate Mana/i.test(text)) affixId = 'regenMana';
  else if (/Summon Damage/i.test(text)) affixId = 'summonDmg';
  else if (/Summon Attack Rating/i.test(text)) affixId = 'summonAr';
  else if (/Summon Life/i.test(text)) affixId = 'summonLife';
  else if (/Summon Elemental Resistances/i.test(text)) affixId = 'summonElemRes';
  else if (/Cold Spell Damage/i.test(text)) affixId = 'coldSpellDmg';
  else if (/Fire Spell Damage/i.test(text)) affixId = 'fireSpellDmg';
  else if (/Lightning Spell Damage/i.test(text)) affixId = 'lightSpellDmg';
  else if (/Poison Spell Damage/i.test(text)) affixId = 'poisonSpellDmg';
  else if (/Physical\/Magic Spell Damage/i.test(text)) affixId = 'physMagicSpellDmg';
  else if (/Enemy Cold Resistance/i.test(text)) affixId = 'enemyColdRes';
  else if (/Enemy Fire Resistance/i.test(text)) affixId = 'enemyFireRes';
  else if (/Enemy Lightning Resistance/i.test(text)) affixId = 'enemyLightRes';
  else if (/Enemy Poison Resistance/i.test(text)) affixId = 'enemyPoisRes';
  else if (/Magic Resist/i.test(text)) affixId = 'resMagic';
  else if (/Innate Elemental Damage/i.test(text)) affixId = 'innateElem';
  else if (/% to All Attributes/i.test(text)) affixId = 'allAttrPercent';
  else if (/to all Attributes/i.test(text)) affixId = 'allAttr';
  else if (/Life Regenerated/i.test(text)) affixId = 'lifeRegen';
  else if (/Requirements/i.test(text)) affixId = 'reqPercent';
  const bonus = { text };
  if (affixId) bonus.affixId = affixId;
  if (Number.isFinite(min)) bonus.min = min;
  if (Number.isFinite(max)) bonus.max = max;
  if (Number.isFinite(min) && min === max) bonus.isFixed = true;
  return bonus;
}

/**
 * @param {string} items
 * @returns {string[]}
 */
function shrineAppliesTo(items) {
  const text = String(items || '');
  /** @type {string[]} */
  const out = [];
  if (/One-Handed Weapons/i.test(text)) out.push('1h_weapon');
  if (/Two-Handed Weapons/i.test(text)) out.push('2h_weapon');
  if (/Body Armors/i.test(text) && !/except Body Armors/i.test(text)) out.push('body_armor');
  if (/Armors \(except Body Armors\)/i.test(text)) out.push('armor_non_body');
  return out;
}

/**
 * @param {string} html
 * @returns {object[]}
 */
export function parseShrineBonusesWiki(html) {
  const byId = new Map();
  for (const cells of tableRowCells(html)) {
    const name = cells.find((cell) =>
      /^(Abandoned|Weird|Tainted|Eerie|Sacred|Fascinating|Ornate|Shimmering|Spiritual|Magical|Hidden|Trinity|Creepy|Intimidating|Quiet|Enchanted)$/i.test(
        cell.trim()
      )
    );
    if (!name) continue;
    const items = cells[cells.length - 1] || '';
    const props = cells.find((cell) => /%|\+|Adds |Reanimate/i.test(cell) && cell !== items) || '';
    const id = name.trim().toLowerCase();
    const appliesTo = shrineAppliesTo(items);
    const bonuses = props
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map(parseShrineBonusLine);
    if (!appliesTo.length || !bonuses.length) continue;
    if (!byId.has(id)) byId.set(id, { id, name: name.trim(), variants: [] });
    byId.get(id).variants.push({ appliesTo, bonuses });
  }
  if (byId.size < 16) throw new Error(`Parsed too few shrines: ${byId.size}`);
  return [...byId.values()];
}

/**
 * @param {string} label
 * @returns {'all'|'weapon'|'armor'|'jewelry'}
 */
function slotsFromUmoSection(label) {
  const text = String(label || '').trim();
  if (/Ring|Amulet|Quiver/i.test(text)) return 'jewelry';
  if (/^Weapon$/i.test(text)) return 'weapon';
  if (/^Armor$/i.test(text)) return 'armor';
  return 'all';
}

/**
 * @param {string} html
 * @returns {object[]}
 */
export function parseUniqueMysticOrbsDocs(html) {
  const page = String(html || '');
  /** @type {object[]} */
  const out = [];
  let section = 'all';
  const tokenRe = /<p class="genbig uindex">\s*([^<]+)\s*<\/p>|<td\b[^>]*>([\s\S]*?)<\/td>/gi;
  let match;
  while ((match = tokenRe.exec(page))) {
    if (match[1]) {
      section = slotsFromUmoSection(match[1]);
      continue;
    }
    const cell = match[2] || '';
    if (!/Mystic Orb/i.test(cell) || !/Right-Click to Apply/i.test(cell)) continue;
    const lines = stripTags(cell)
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    const name = lines.find((line) => line && !/^Mystic Orb$/i.test(line)) || '';
    if (!name) continue;
    out.push(umoFromLines(name, lines, section));
  }
  return out;
}

/**
 * @param {string} name
 * @param {string[]} lines
 * @param {string} section
 */
function umoFromLines(name, lines, section) {
  const blob = `${name}\n${lines.join('\n')}`;
  const mods = lines.filter(
    (line) =>
      line &&
      !/^mystic orb$/i.test(line) &&
      !/^right-click to apply$/i.test(line) &&
      !/^limit per item/i.test(line) &&
      !/\+?\d+\s+Required Level/i.test(line) &&
      !/^\([^)]*only\)$/i.test(line) &&
      line !== name
  );
  const req = Number((/\+?(\d+)\s+Required Level/i.exec(lines.join('\n')) || [])[1] || 10);
  const limit = Number((/Limit per item:\s*(\d+)/i.exec(lines.join('\n')) || [])[1] || 2);
  /** @type {object} */
  const row = {
    name,
    modifiers: mods,
    kind: 'umo',
    slots: section === 'weapon' || section === 'armor' || section === 'jewelry' ? section : 'all',
    maxStacks: limit,
    reqLevelPerStack: req,
    aliases: [name],
  };
  if (/helm only/i.test(blob)) row.restrictToSlot = 'head';
  if (/Body Armors only|body armor only/i.test(blob) || /Weight of Talent/i.test(name)) {
    if (/Weight of Talent/i.test(name)) row.restrictToSlot = 'tors';
  }
  if (/Shields Only|on Block/i.test(blob) && /Eye of Beholder/i.test(name)) {
    row.restrictToCategory = 'shield';
  }
  if (/Apple of Discord/i.test(name) && /Maximum Mana \+2%/i.test(mods.join('\n'))) {
    row.aliases.push('Apple of Discord (Life)');
  }
  if (/Apple of Discord/i.test(name) && /Maximum Life \+2%/i.test(mods.join('\n'))) {
    row.name = 'Apple of Discord 2';
    row.aliases.push('Apple of Discord (Mana)', 'Apple of Discord 2');
  }
  if (/Imperfect Sphere/i.test(name)) {
    if (/Maximum Cold Resist -1%/i.test(mods.join('\n'))) {
      row.name = 'Imperfect Sphere (Fire/Lightning)';
      row.aliases.push('Imperfect Sphere - no cold', 'Imperfect Sphere');
    } else if (/Maximum Fire Resist -1%/i.test(mods.join('\n'))) {
      row.name = 'Imperfect Sphere (Lightning/Cold)';
      row.aliases.push('Imperfect Sphere - no fire');
    } else if (/Maximum Lightning Resist -1%/i.test(mods.join('\n'))) {
      row.name = 'Imperfect Sphere (Fire/Cold)';
      row.aliases.push('Imperfect Sphere - no light');
    }
  }
  return row;
}

/**
 * Wiki Mystic Orbs SMO table.
 * @param {string} html
 * @returns {object[]}
 */
/** Wiki first-stat line -> in-game / TSW mysticorb name. */
const SOULFORGED_MO_NAMES = Object.freeze({
  'Physical Resist +1%': 'Rare MO - Physical Resist',
  'Cannot be Frozen': 'Rare MO - No Freeze',
  'Max Fire Resist +1%': 'Rare MO - Fire Resist',
  'Max Cold Resist +1%': 'Rare MO - Cold Resist',
  'Max Lightning Resist +1%': 'Rare MO - Lightning Resist',
  'Max Poison Resist +1%': 'Rare MO - Poison Resist',
  '+1% Innate Elemental Damage': 'Rare MO - IED',
  '+1% Base Block Chance': 'Rare MO - Block Up',
  '-2% Base Block Chance': 'Rare MO - Block Down',
  'Maximum Life +1%': 'Rare MO - Max Life',
  '-1% to Enemy Fire Resistance': 'Rare MO - Pierce Fire',
  '-1% to Enemy Cold Resistance': 'Rare MO - Pierce Cold',
  '-1% to Enemy Lightning Resistance': 'Rare MO - Pierce Lightning',
  '-1% to Enemy Poison Resistance': 'Rare MO - Pierce Poison',
  '+15% Damage to Demons': 'Rare MO - Demon Damage',
  '+15% Damage to Undead': 'Rare MO - Undead Damage',
});

export function parseSoulforgedMysticOrbsWiki(html) {
  /** @type {object[]} */
  const out = [];
  for (const cells of tableRowCells(html)) {
    if (cells.length < 4) continue;
    const [stat, req, item, limit] = cells;
    if (!stat || /Required Level/i.test(stat) || /^stat$/i.test(stat)) continue;
    if (!/Rare /i.test(item)) continue;
    const modifiers = stat
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const reqLevelPerStack = Number((/\+?(\d+)/.exec(req) || [])[1] || 5);
    const maxStacks = Number((/(\d+)/.exec(limit) || [])[1] || 1);
    const wikiName = modifiers[0];
    const name = SOULFORGED_MO_NAMES[wikiName] || wikiName;
    /** @type {string[]} */
    const aliases = [name];
    if (wikiName && wikiName !== name) aliases.push(wikiName);
    /** @type {object} */
    const row = {
      name,
      modifiers,
      kind: 'smo',
      slots: /Shield/i.test(item) ? 'armor' : /Body Armor/i.test(item) ? 'armor' : 'armor',
      maxStacks,
      reqLevelPerStack,
      requiresRare: true,
      aliases,
    };
    if (/Shield/i.test(item)) row.restrictToCategory = 'shield';
    if (/Body Armor/i.test(item)) row.restrictToSlot = 'tors';
    out.push(row);
  }
  return out;
}

/**
 * Occult Effigies from Nephalem Rifts (Dimensional Labyrinth).
 * @returns {object[]}
 */
export function occultEffigiesFromWiki() {
  return [
    {
      name: "Craftsman's Brand",
      modifiers: ['Orb Effects Applied to this Item are Doubled'],
      kind: 'effigy',
      slots: 'jewelry',
      maxStacks: 1,
      reqLevelPerStack: 18,
      restrictToCategory: 'quiver',
      requiresMagic: true,
      aliases: ["Craftsman's Brand"],
    },
    {
      name: 'Celestial Wind',
      modifiers: ['Set Movement Speed to 40%', '15% Faster Stamina Drain'],
      kind: 'effigy',
      slots: 'armor',
      maxStacks: 1,
      reqLevelPerStack: 0,
      restrictToSlot: 'feet',
      aliases: ['Celestial Wind'],
    },
    {
      name: 'Sigil of Absolution',
      modifiers: ['Requirements +25%'],
      kind: 'effigy',
      slots: 'gear',
      maxStacks: 2,
      reqLevelPerStack: -5,
      minHostReqLevel: 5,
      notOnRunewords: true,
      aliases: ['Sigil of Absolution'],
    },
    {
      name: 'Path of Brutality',
      modifiers: [
        'Transforms every +1 to All Skills to +3% Deadly Strike',
        'Item Becomes (Your Class Only)',
      ],
      kind: 'effigy',
      slots: 'jewelry',
      maxStacks: 1,
      reqLevelPerStack: 10,
      restrictToCategory: 'jewelry',
      requiresUnique: true,
      aliases: ['Path of Brutality'],
    },
    {
      name: 'Empyrean Touch',
      modifiers: ['Item Becomes Ethereal'],
      kind: 'effigy',
      slots: 'gear',
      maxStacks: 1,
      reqLevelPerStack: 10,
      aliases: ['Empyrean Touch'],
    },
    {
      name: 'Elemental Ire',
      modifiers: ['1% Chance to cast level 4 Life Spark on Striking'],
      kind: 'effigy',
      slots: 'weapon',
      maxStacks: 2,
      reqLevelPerStack: 5,
      baseKind: 'elemental_ranged',
      aliases: ['Elemental Ire'],
    },
    {
      name: 'Breath of Thaumaturgy',
      modifiers: ['Item can be blessed Again'],
      kind: 'effigy',
      slots: 'gear',
      maxStacks: 1,
      reqLevelPerStack: 25,
      requiresCrafted: true,
      requiresShrine: true,
      aliases: ['Breath of Thaumaturgy'],
    },
    {
      name: 'Elemental Dominion',
      modifiers: ['4% Chance to cast level 5 Life Spark on Melee Attack'],
      kind: 'effigy',
      slots: 'weapon',
      maxStacks: 2,
      reqLevelPerStack: 5,
      baseKind: 'elemental_melee',
      aliases: ['Elemental Dominion'],
    },
    {
      name: 'Arcane Hunger',
      modifiers: ['All Life Leech transformed to +20% Spell Damage', 'Item Cannot be Unsocketed'],
      kind: 'effigy',
      slots: 'weapon',
      maxStacks: 1,
      reqLevelPerStack: 10,
      requiresOneHanded: true,
      minLifeLeech: 15,
      aliases: ['Arcane Hunger'],
    },
    {
      name: 'Northern Winds',
      modifiers: [
        'Half Freeze Duration',
        'If armor already has Half Freeze Duration: Upgrade it to Cannot Be Frozen',
        'If armor already has Cannot be Frozen: Maximum Cold Resist +1%',
      ],
      kind: 'effigy',
      slots: 'armor',
      maxStacks: 3,
      reqLevelPerStack: 8,
      forbidMaxColdResist: true,
      aliases: ['Northern Winds'],
    },
  ];
}

/**
 * Restore mechanics from unique-stats-db wiki dump.
 * @param {{ uniques?: object[] }} db
 */
export function itemMechanicsFromUniqueStats(db) {
  const restore = {};
  const dynamo = {};
  const entries = Array.isArray(db?.entries) ? db.entries : Array.isArray(db) ? db : [];
  for (const entry of entries) {
    const stats = String(entry?.stats || '');
    const name = String(entry?.name || '').trim();
    if (!name) continue;
    const slug = name.toLowerCase().replace(/['']/g, '').replace(/[^a-z0-9]+/g, '_');
    const restoreMatch = /Cube with Heavenly Soul:\s*Restore \+(\d+)%/i.exec(stats);
    if (restoreMatch) {
      const step = Number(restoreMatch[1]);
      const block = /\{grey\}([\s\S]*?)Cube with Heavenly Soul/i.exec(stats)?.[1] || '';
      const lines = [
        ...block.split('\n'),
        ...stats
          .split('\n')
          .filter((line) => line.startsWith('{grey}')),
      ]
        .map((line) => line.replace(/^\{grey\}/, '').trim())
        .filter((line) => line && !/Based on Restore/i.test(line) && !/^\{/.test(line));
      const uniqueLines = [...new Set(lines)];
      restore[`su_${slug}`] = {
        itemId: `su_${slug}`,
        label: 'Restore',
        step,
        maxApplications: Math.round(100 / step),
        hint: `Repeatable · ${Math.round(100 / step)} reaches the listed values`,
        outputs: restoreOutputsFromLines(uniqueLines),
      };
    }
    if (/Movement accumulates Dynamo charges/i.test(stats)) {
      dynamo[`su_${slug}`] = { itemId: `su_${slug}`, label: 'Dynamo charges' };
    }
  }
  return { restore, wintry: {}, dynamo };
}

/**
 * @param {string[]} lines
 * @returns {Array<{ affixId: string, coefficient: number }>}
 */
function restoreOutputsFromLines(lines) {
  /** @type {Array<{ affixId: string, coefficient: number }>} */
  const out = [];
  for (const line of lines) {
    const n = Number((/(\d+)/.exec(line) || [])[1] || 0);
    if (!n) continue;
    if (/Combat Speeds/i.test(line)) {
      out.push(
        { affixId: 'fhr', coefficient: n },
        { affixId: 'fbr', coefficient: n },
        { affixId: 'fcr', coefficient: n },
        { affixId: 'ias', coefficient: n }
      );
    } else if (/Physical Resist/i.test(line)) out.push({ affixId: 'physResist', coefficient: n });
    else if (/Maximum Life/i.test(line)) out.push({ affixId: 'lifePercent', coefficient: n });
    else if (/All Skills/i.test(line)) out.push({ affixId: 'allSkills', coefficient: n });
    else if (/Bonus to Defense/i.test(line)) out.push({ affixId: 'defBonus', coefficient: n });
    else if (/Maximum Elemental Resists/i.test(line)) {
      out.push(
        { affixId: 'maxResFire', coefficient: n },
        { affixId: 'maxResLight', coefficient: n },
        { affixId: 'maxResCold', coefficient: n },
        { affixId: 'maxResPois', coefficient: n }
      );
    }
  }
  return out;
}

/**
 * @param {string} html
 * @param {string} needle
 */
function assertPageContains(html, needle) {
  if (!String(html || '').includes(needle)) {
    throw new Error(`Wiki page missing expected text: ${needle}`);
  }
}

/**
 * @param {string} outPath
 * @param {unknown} next
 * @param {boolean} check
 */
function writeOrCheck(outPath, next, check) {
  const body = pretty(next);
  if (check) {
    const prev = existsSync(outPath) ? readFileSync(outPath, 'utf8') : '';
    if (prev !== body) throw new Error(`Catalog drift: ${path.relative(ROOT, outPath)}`);
    console.log(`OK ${path.relative(ROOT, outPath)}`);
    return;
  }
  writeFileSync(outPath, body);
  console.log(`Wrote ${path.relative(ROOT, outPath)}`);
}

export async function main(argv = process.argv.slice(2)) {
  const flags = new Set(argv.filter((arg) => arg.startsWith('--')));
  const version = argv.find((arg) => !arg.startsWith('--')) || DEFAULT_VERSION;
  const folder = versionToFolder(version);
  if (folder !== SUPPORTED_FOLDER) {
    throw new Error(`Only 2.14 wiki item data is available; received ${version}.`);
  }
  const outDir = path.join(ROOT, 'public', 'items', folder);
  const check = flags.has('--check');

  console.log(`Fetching ${CUBE_RECIPES_URL}...`);
  const cubeHtml = await fetchHtml(CUBE_RECIPES_URL);
  assertPageContains(cubeHtml, 'Oil of Luck');
  assertPageContains(cubeHtml, 'Oil of Conjuration');
  assertPageContains(cubeHtml, 'Legacy of Blood');
  const oils = cubeRecipeOils();

  console.log(`Fetching ${SHRINE_BONUSES_URL}...`);
  const shrineHtml = await fetchHtml(SHRINE_BONUSES_URL);
  const shrines = parseShrineBonusesWiki(shrineHtml);

  console.log(`Fetching ${UMOS_DOCS_URL}...`);
  const umoHtml = await fetchHtml(UMOS_DOCS_URL);
  const umos = parseUniqueMysticOrbsDocs(umoHtml);
  if (umos.length < 20) throw new Error(`Parsed too few unique mystic orbs: ${umos.length}`);

  console.log(`Fetching ${MYSTIC_ORBS_URL}...`);
  const moHtml = await fetchHtml(MYSTIC_ORBS_URL);
  const smos = parseSoulforgedMysticOrbsWiki(moHtml);
  if (smos.length < 10) throw new Error(`Parsed too few soulforged mystic orbs: ${smos.length}`);

  console.log(`Fetching ${NEPHALEM_RIFTS_URL}...`);
  const riftHtml = await fetchHtml(NEPHALEM_RIFTS_URL);
  assertPageContains(riftHtml, 'Occult Effigies');
  assertPageContains(riftHtml, 'Celestial Wind');
  const effigies = occultEffigiesFromWiki();

  const existingOrbs = JSON.parse(readFileSync(path.join(outDir, 'mystic-orbs.json'), 'utf8'));
  const vendorMos = (Array.isArray(existingOrbs) ? existingOrbs : []).filter((row) => row?.kind === 'mo');
  const mysticOrbs = [...vendorMos, ...umos, ...smos, ...effigies];

  const uniqueStats = JSON.parse(readFileSync(path.join(outDir, 'unique-stats-db.json'), 'utf8'));
  const mechanics = itemMechanicsFromUniqueStats(uniqueStats);
  if (!mechanics.restore.su_arrogance || !mechanics.restore.su_endless_pride) {
    throw new Error('Restore mechanics missing Arrogance or Endless Pride');
  }

  writeOrCheck(path.join(outDir, 'oils.json'), oils, check);
  writeOrCheck(path.join(outDir, 'shrines.json'), shrines, check);
  writeOrCheck(path.join(outDir, 'blessings.json'), {}, check);
  writeOrCheck(path.join(outDir, 'item-mechanics.json'), mechanics, check);
  writeOrCheck(path.join(outDir, 'mystic-orbs.json'), mysticOrbs, check);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
