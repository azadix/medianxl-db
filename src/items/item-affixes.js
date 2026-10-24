/**
 * Wiki rare-affix pool for magic / rare / crafted items.
 * @module items/item-affixes
 */

import { isAngelicItemDef } from '@/items/angelic-items.js';
import {
  isBowOrCrossbow,
  isHandWeapon,
  isQuiverItem,
  isTwoHandedWeapon,
} from '@/items/item-types.js';
import { wikiTypeMatchesBaseFields } from '@/items/runeword-type-families.js';

const INNATE_ELEMENTAL_RE =
  /Innate\s+(Elemental|Fire|Cold|Lightning|Poison|Magic|Shadow|Tri-Elemental)\s+Damage/i;

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
function itemHasInnateElemental(def) {
  if (!def || typeof def !== 'object') return false;
  const blob = [def.innate, def.adds].map((v) => String(v || '')).join('\n');
  return INNATE_ELEMENTAL_RE.test(blob);
}

/**
 * @typedef {{
 *   id: string,
 *   kind: 'prefix'|'suffix',
 *   properties: string,
 *   minAlvl: number,
 *   maxAlvl: number,
 *   reqLevel: number,
 *   group: number,
 *   foundOn: string[],
 *   exceptOn: string[],
 *   oskill?: boolean,
 *   proc?: boolean,
 * }} ItemAffixDef
 *
 * @typedef {{ id: string, properties?: string }} PickedItemAffix
 *
 * @typedef {{ prefixes: PickedItemAffix[], suffixes: PickedItemAffix[] }} PickedItemAffixes
 */

/** @type {ItemAffixDef[]} */
let affixes = [];
/** @type {Map<string, ItemAffixDef>} */
let byId = new Map();

const DEFAULT_ILVL = 99;

/**
 * @param {unknown} rows
 */
export function loadItemAffixes(rows) {
  const list = [];
  const map = new Map();
  const source = Array.isArray(rows) ? rows : rows && typeof rows === 'object' ? rows.entries : null;
  if (Array.isArray(source)) {
    for (const row of source) {
      if (!row || typeof row !== 'object') continue;
      const id = String(row.id || '').trim();
      const kind = row.kind === 'suffix' ? 'suffix' : row.kind === 'prefix' ? 'prefix' : '';
      const properties = String(row.properties || '').trim();
      const minAlvl = Number(row.minAlvl);
      const maxAlvl = Number(row.maxAlvl);
      const reqLevel = Number(row.reqLevel);
      const group = Number(row.group);
      if (!id || !kind || !properties) continue;
      if (![minAlvl, maxAlvl, reqLevel, group].every(Number.isFinite)) continue;
      /** @type {ItemAffixDef} */
      const entry = {
        id,
        kind,
        properties,
        minAlvl,
        maxAlvl,
        reqLevel,
        group,
        foundOn: Array.isArray(row.foundOn) ? row.foundOn.map(String).filter(Boolean) : [],
        exceptOn: Array.isArray(row.exceptOn) ? row.exceptOn.map(String).filter(Boolean) : [],
      };
      if (row.oskill === true) entry.oskill = true;
      if (row.proc === true) entry.proc = true;
      list.push(entry);
      map.set(id, entry);
    }
  }
  affixes = list;
  byId = map;
}

/**
 * @returns {ItemAffixDef[]}
 */
export function listItemAffixes() {
  return affixes;
}

/**
 * @param {string|null|undefined} id
 * @returns {ItemAffixDef|null}
 */
export function lookupItemAffix(id) {
  const key = String(id || '').trim();
  return key ? byId.get(key) || null : null;
}

/**
 * @param {unknown} value
 * @returns {number}
 */
export function clampItemLevel(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_ILVL;
  return Math.max(1, Math.min(99, Math.floor(n)));
}

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
export function isJewelAffixBase(def) {
  if (!def || typeof def !== 'object') return false;
  if (String(def.type || '') === 'jewl') return true;
  return /^jewel$/i.test(String(def.name || def.group || ''));
}

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
function isRingItem(def) {
  if (!def) return false;
  const type = String(def.type || '');
  const slot = String(def.slot || '');
  return type === 'ring' || slot === 'ring' || slot === 'rrin' || slot === 'lrin';
}

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
function isAmuletItem(def) {
  if (!def) return false;
  return String(def.type || '') === 'amul' || String(def.slot || '') === 'neck';
}

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
function isRangedWeapon(def) {
  if (!def || !isHandWeapon(def)) return false;
  if (isBowOrCrossbow(def)) return true;
  return /javelins|throwing/i.test(String(def.group || ''));
}

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
function isMeleeWeapon(def) {
  return isHandWeapon(def) && !isRangedWeapon(def);
}

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
function isOneHandMelee(def) {
  return isMeleeWeapon(def) && !isTwoHandedWeapon(def);
}

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
function isTwoHandMelee(def) {
  return isMeleeWeapon(def) && isTwoHandedWeapon(def);
}

/**
 * @param {object|null|undefined} def
 * @returns {number}
 */
export function itemQualityLevel(def) {
  const qlvl = Number(def?.qlvl);
  if (Number.isFinite(qlvl) && qlvl >= 0) return qlvl;
  if (isQuiverItem(def)) return 0;
  if (isJewelAffixBase(def) || isRingItem(def) || isAmuletItem(def) || def?.category === 'jewelry') {
    return 1;
  }
  return 1;
}

/**
 * Rare / magic affix level.
 * @param {number} ilvl
 * @param {number} qlvl
 * @returns {number}
 */
export function calcRareAffixLevel(ilvl, qlvl) {
  let itemLevel = Number(ilvl);
  let qualityLevel = Number(qlvl);
  if (!Number.isFinite(itemLevel)) itemLevel = DEFAULT_ILVL;
  if (!Number.isFinite(qualityLevel)) qualityLevel = 1;
  itemLevel = Math.max(1, Math.min(99, Math.floor(itemLevel)));
  qualityLevel = Math.max(0, Math.floor(qualityLevel));
  if (itemLevel < qualityLevel) itemLevel = qualityLevel;
  if (itemLevel > 99) itemLevel = 99;
  if (itemLevel === 99) return 99;
  const half = Math.floor(qualityLevel / 2);
  const alvl = itemLevel < 99 - half ? itemLevel - half : 2 * itemLevel - 99;
  return Math.max(1, Math.min(99, alvl));
}

/**
 * @param {number} ilvl
 * @param {number} qlvl
 * @param {{ jewel?: boolean }} [options]
 * @returns {number}
 */
export function calcCraftedAffixLevel(ilvl, qlvl, options = {}) {
  let itemLevel = Number(ilvl);
  if (!Number.isFinite(itemLevel)) itemLevel = DEFAULT_ILVL;
  itemLevel = Math.max(1, Math.floor(itemLevel));
  if (options.jewel) {
    itemLevel = Math.max(1, Math.floor(itemLevel * 0.95));
    return calcRareAffixLevel(Math.min(99, itemLevel), 1);
  }
  let qualityLevel = Number(qlvl);
  if (!Number.isFinite(qualityLevel)) qualityLevel = 71;
  qualityLevel = Math.max(71, Math.min(90, Math.floor(qualityLevel)));
  return calcRareAffixLevel(Math.min(99, itemLevel), qualityLevel);
}

/**
 * @param {string|null|undefined} quality
 * @param {object|null|undefined} def
 * @param {number} ilvl
 * @returns {number}
 */
export function calcItemAffixLevel(quality, def, ilvl) {
  const qlvl = itemQualityLevel(def);
  if (String(quality || '') === 'crafted') {
    return calcCraftedAffixLevel(ilvl, qlvl, { jewel: isJewelAffixBase(def) });
  }
  return calcRareAffixLevel(ilvl, qlvl);
}

/**
 * @param {string} wikiType
 * @param {object} def
 * @returns {boolean}
 */
function matchBaseAffixWikiType(wikiType, def) {
  const group = String(def.group || '');
  if (wikiType === 'Armors') return def.category === 'armor';
  if (wikiType === 'Rings') return isRingItem(def);
  if (wikiType === 'Amulets') return isAmuletItem(def);
  if (wikiType === 'Jewels') return isJewelAffixBase(def);
  if (wikiType === 'Quivers') return isQuiverItem(def);
  if (wikiType === 'Jewelry') return def.category === 'jewelry' || isRingItem(def) || isAmuletItem(def);
  if (wikiType === 'One-Handed Melee Weapons') return isOneHandMelee(def);
  if (wikiType === 'Two-Handed Melee Weapons') return isTwoHandMelee(def);

  if (wikiType === 'Elemental Weapons') return itemHasInnateElemental(def) && isHandWeapon(def);
  if (wikiType === 'Elemental One-Handed Melee Weapons') {
    return itemHasInnateElemental(def) && isOneHandMelee(def);
  }
  if (wikiType === 'Elemental Two-Handed Melee Weapons') {
    return itemHasInnateElemental(def) && isTwoHandMelee(def);
  }
  if (wikiType === 'Elemental Ranged Weapons') {
    return itemHasInnateElemental(def) && isRangedWeapon(def);
  }

  if (wikiType === 'Clubs') return /clubs/i.test(group);
  if (wikiType === 'Polearms') return /polearms|naginatas/i.test(group);

  return wikiTypeMatchesBaseFields(wikiType, def);
}

/**
 * @param {string} type
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
export function affixWikiTypeMatches(type, def) {
  if (!def || typeof def !== 'object') return false;
  const wikiType = String(type || '').trim();
  if (!wikiType) return false;
  const angelic = isAngelicItemDef(def);

  if (wikiType === 'Angelic Items') return angelic;
  if (wikiType === 'Any Angelic Armor') return angelic && def.category === 'armor';
  if (wikiType.startsWith('Angelic ')) {
    if (!angelic) return false;
    const rest = wikiType.slice('Angelic '.length).trim();
    if (rest === 'Weapons') return isHandWeapon(def);
    return matchBaseAffixWikiType(rest, def);
  }

  return matchBaseAffixWikiType(wikiType, def);
}

/**
 * @param {ItemAffixDef} affix
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
export function affixMatchesItemTypes(affix, def) {
  const foundOn = Array.isArray(affix?.foundOn) ? affix.foundOn : [];
  if (!foundOn.length) return false;
  if (!foundOn.some((type) => affixWikiTypeMatches(type, def))) return false;
  const exceptOn = Array.isArray(affix?.exceptOn) ? affix.exceptOn : [];
  return !exceptOn.some((type) => affixWikiTypeMatches(type, def));
}

/**
 * @param {ItemAffixDef} affix
 * @param {number} alvl
 * @returns {boolean}
 */
export function affixMatchesAlvl(affix, alvl) {
  const level = Number(alvl);
  if (!Number.isFinite(level)) return false;
  return level >= affix.minAlvl && level <= affix.maxAlvl;
}

/**
 * Extra random rare affixes on crafted items (wiki Crafted items).
 * Shrine / jewelcraft presets are separate from this count.
 * @param {number} ilvl
 * @returns {{ minTotal: number, maxTotal: number }}
 */
export function craftedAffixCountRange(ilvl) {
  const level = clampItemLevel(ilvl);
  if (level >= 71) return { minTotal: 4, maxTotal: 4 };
  if (level >= 51) return { minTotal: 3, maxTotal: 4 };
  if (level >= 31) return { minTotal: 2, maxTotal: 4 };
  return { minTotal: 1, maxTotal: 4 };
}

/**
 * @param {number} ilvl
 * @returns {string}
 */
export function craftedAffixOddsLabel(ilvl) {
  const level = clampItemLevel(ilvl);
  if (level >= 71) return '100% chance of 4 random rare affixes';
  if (level >= 51) return '80% chance of 3 affixes, 20% chance of 4 affixes';
  if (level >= 31) return '60% chance of 2 affixes, 20% chance each of 3 or 4 affixes';
  return '40% chance of 1 affix, 20% chance each of 2, 3 or 4 affixes';
}

/**
 * @param {string|null|undefined} quality
 * @param {object|null|undefined} def
 * @param {number} [ilvl]
 * @returns {{ maxPrefix: number, maxSuffix: number, maxTotal: number }}
 */
export function affixSlotCaps(quality, def, ilvl) {
  const key = String(quality || '').toLowerCase();
  const jewel = isJewelAffixBase(def);
  if (key === 'magic') return { maxPrefix: 1, maxSuffix: 1, maxTotal: 2 };
  if (key === 'crafted') {
    return { maxPrefix: 3, maxSuffix: 3, maxTotal: craftedAffixCountRange(ilvl).maxTotal };
  }
  if (key === 'rare') {
    return { maxPrefix: 3, maxSuffix: 3, maxTotal: jewel ? 4 : 6 };
  }
  return { maxPrefix: 0, maxSuffix: 0, maxTotal: 0 };
}

/**
 * @param {unknown} raw
 * @returns {PickedItemAffixes}
 */
export function parsePickedAffixes(raw) {
  /** @type {PickedItemAffix[]} */
  const prefixes = [];
  /** @type {PickedItemAffix[]} */
  const suffixes = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { prefixes, suffixes };
  }
  const rec = /** @type {Record<string, unknown>} */ (raw);
  const take = (list, bucket) => {
    if (!Array.isArray(list)) return;
    for (const row of list) {
      if (!row || typeof row !== 'object') continue;
      const id = String(row.id || '').trim();
      if (!id) continue;
      /** @type {PickedItemAffix} */
      const pick = { id };
      const properties = String(row.properties || '').trim();
      if (properties) pick.properties = properties;
      bucket.push(pick);
    }
  };
  take(rec.prefixes, prefixes);
  take(rec.suffixes, suffixes);
  return { prefixes, suffixes };
}

/**
 * @param {PickedItemAffixes|null|undefined} picked
 * @returns {PickedItemAffix[]}
 */
export function flattenPickedAffixes(picked) {
  const parsed = parsePickedAffixes(picked);
  return [...parsed.prefixes, ...parsed.suffixes];
}

/**
 * @param {PickedItemAffixes|null|undefined} picked
 * @returns {string[]}
 */
export function modifiersFromPickedAffixes(picked) {
  /** @type {string[]} */
  const lines = [];
  for (const pick of flattenPickedAffixes(picked)) {
    const catalog = lookupItemAffix(pick.id);
    const text = String(pick.properties || catalog?.properties || '').trim();
    if (text) lines.push(text);
  }
  return lines;
}

/**
 * @param {object|null|undefined} def
 * @param {PickedItemAffixes|null|undefined} picked
 * @param {string|null|undefined} quality
 * @returns {number|undefined}
 */
export function requiredLevelFromPickedAffixes(def, picked, quality) {
  const rows = flattenPickedAffixes(picked)
    .map((pick) => lookupItemAffix(pick.id))
    .filter(Boolean);
  if (!rows.length) return undefined;
  const highest = Math.max(...rows.map((row) => Number(row.reqLevel) || 0));
  const base = Number(def?.reqLevel) || 0;
  if (String(quality || '') === 'crafted') {
    const count = rows.length;
    return Math.max(base, highest + 10 + 3 * count);
  }
  return Math.max(base, highest);
}

/**
 * @param {ItemAffixDef} affix
 * @param {object|null|undefined} def
 * @param {number} alvl
 * @param {PickedItemAffixes|null|undefined} picked
 * @param {string|null|undefined} quality
 * @returns {boolean}
 */
export function canPickItemAffix(affix, def, alvl, picked, quality, ilvl) {
  if (!affix) return false;
  if (!affixMatchesAlvl(affix, alvl)) return false;
  if (!affixMatchesItemTypes(affix, def)) return false;
  const caps = affixSlotCaps(quality, def, ilvl);
  const current = parsePickedAffixes(picked);
  const usedGroups = new Set(
    flattenPickedAffixes(current)
      .map((pick) => lookupItemAffix(pick.id)?.group)
      .filter((g) => g != null)
  );
  if (usedGroups.has(affix.group)) return false;
  const total = current.prefixes.length + current.suffixes.length;
  if (total >= caps.maxTotal) return false;
  if (affix.kind === 'prefix' && current.prefixes.length >= caps.maxPrefix) return false;
  if (affix.kind === 'suffix' && current.suffixes.length >= caps.maxSuffix) return false;
  return true;
}

/**
 * @param {object|null|undefined} def
 * @param {{ quality?: string, ilvl?: number, picked?: PickedItemAffixes, kind?: 'prefix'|'suffix'|null, query?: string }} options
 * @returns {ItemAffixDef[]}
 */
export function listAffixesForItem(def, options = {}) {
  const alvl = calcItemAffixLevel(options.quality, def, options.ilvl ?? DEFAULT_ILVL);
  const kind = options.kind === 'prefix' || options.kind === 'suffix' ? options.kind : null;
  const query = String(options.query || '')
    .trim()
    .toLowerCase();
  return affixes.filter((row) => {
    if (kind && row.kind !== kind) return false;
    if (!canPickItemAffix(row, def, alvl, options.picked, options.quality, options.ilvl)) {
      return false;
    }
    if (query && !`${row.properties} ${row.group}`.toLowerCase().includes(query)) return false;
    return true;
  });
}

export const JEWEL_AFFIX_BASE = Object.freeze({
  id: 'jew',
  name: 'Jewel',
  type: 'jewl',
  category: 'jewelry',
  slot: null,
  rarity: 'normal',
  qlvl: 1,
});

export { DEFAULT_ILVL as DEFAULT_ITEM_AFFIX_ILVL };
