/**
 * @file Item corruption catalog. Wiki Scosglen documents the system, not the full outcome pool.
 * @module items/corruptions
 */

import { formatAffixModLine } from '@/items/affix-templates.js';
import { itemHasInnateElemental, itemUpgradeSlotType } from '@/items/oils.js';
import { isRunewordItem } from '@/items/runeword-items.js';
import { isHandWeapon, isQuiverItem, isShieldItem, isTwoHandedWeapon } from '@/items/item-types.js';

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   category?: string,
 *   allPools?: boolean,
 *   pool?: string,
 *   restriction?: string,
 *   mods?: Array<{ affixId?: string, value?: number, text?: string }>,
 *   modifiers?: string[],
 *   setsEthereal?: boolean,
 *   isFailure?: boolean,
 * }} CorruptionCatalogRow
 */

/** @type {CorruptionCatalogRow[]} */
let catalog = [];
/** @type {Map<string, CorruptionCatalogRow>} */
let byId = new Map();
/** @type {Array<{ id: string, label: string }>} */
let categories = [];
let sacredUniqueLimit = 2;

export const CORRUPTION_RESTRICTION_LABELS = Object.freeze({
  weapon: 'Weapons only',
  non_weapon_shield: 'Non-weapon, non-shield only',
  jewelry: 'Jewelry only',
  non_jewelry: 'Not available on jewelry',
  non_elemental_weapon: 'Non-elemental weapons only',
  not_elemental_weapon: 'Not available on elemental weapons',
  not_non_elemental_weapon: 'Not available on non-elemental weapons',
  not_two_handed: 'Not available on sacred two-handers',
  non_jewelry_non_elemental: 'Not jewelry or elemental weapons',
  shield: 'Shields only',
});

/**
 * @param {unknown} data
 */
export function loadCorruptionsCatalog(data) {
  const rec = data && typeof data === 'object' && !Array.isArray(data) ? data : { entries: data };
  categories = Array.isArray(rec.categories) ? rec.categories.map((c) => ({ id: c.id, label: c.label })) : [];
  const limit = Math.floor(Number(rec.sacredUniqueCorruptionLimit));
  sacredUniqueLimit = Number.isFinite(limit) && limit > 0 ? limit : 2;
  const list = [];
  const map = new Map();
  for (const row of Array.isArray(rec.entries) ? rec.entries : []) {
    if (!row || typeof row !== 'object') continue;
    const id = String(row.id || '').trim();
    if (!id) continue;
    /** @type {CorruptionCatalogRow} */
    const entry = {
      id,
      label: String(row.label || id),
      category: row.category ? String(row.category) : 'utility',
    };
    if (row.allPools) entry.allPools = true;
    if (row.pool) entry.pool = String(row.pool);
    if (row.restriction) entry.restriction = String(row.restriction);
    if (Array.isArray(row.mods)) entry.mods = row.mods;
    if (Array.isArray(row.modifiers)) entry.modifiers = row.modifiers.map(String);
    if (row.setsEthereal) entry.setsEthereal = true;
    if (row.isFailure || id === 'nothing') entry.isFailure = true;
    list.push(entry);
    map.set(id, entry);
  }
  catalog = list;
  byId = map;
}

/**
 * @returns {Array<{ id: string, label: string }>}
 */
export function listCorruptionCategories() {
  return categories.slice();
}

/**
 * @returns {CorruptionCatalogRow[]}
 */
export function listCorruptionsCatalog() {
  return catalog.slice();
}

/**
 * @param {string|null|undefined} id
 * @returns {CorruptionCatalogRow|null}
 */
export function lookupCorruption(id) {
  const key = String(id || '').trim();
  return key ? byId.get(key) || null : null;
}

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
export function isSacredUniqueItem(def) {
  const kind = String(def?.uniqueKind || '').toLowerCase();
  return kind === 'su' || kind === 'ssu' || kind === 'sssu';
}

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
export function isItemCorruptible(def) {
  if (!def || typeof def !== 'object') return false;
  if (def.rarity === 'honorific' || def.customQuality === 'honorific') return false;
  if (def.category === 'charms' || def.category === 'relics') return false;
  return true;
}

/**
 * @param {object|null|undefined} def
 * @returns {number}
 */
export function corruptionSlotCount(def) {
  if (!isItemCorruptible(def)) return 0;
  return isSacredUniqueItem(def) ? sacredUniqueLimit : 1;
}

/**
 * @param {CorruptionCatalogRow} row
 * @param {object|null|undefined} def
 * @param {string|null|undefined} [equipSlot]
 * @returns {boolean}
 */
export function canUseCorruptionOnItem(row, def, equipSlot = null) {
  if (!row || !def) return false;
  if (row.isFailure || row.id === 'nothing') return true;
  const weapon = isHandWeapon(def);
  const shield = isShieldItem(def);
  const jewelry = itemUpgradeSlotType(def, equipSlot) === 'amulet' || itemUpgradeSlotType(def, equipSlot) === 'ring';
  const elemental = itemHasInnateElemental(def);
  const twoHand = isTwoHandedWeapon(def);
  const r = row.restriction;
  if (r === 'weapon' && !weapon) return false;
  if (r === 'elemental_weapon' && !(weapon && elemental)) return false;
  if (r === 'non_elemental_weapon' && !(weapon && !elemental)) return false;
  if (r === 'not_elemental_weapon' && weapon && elemental) return false;
  if (r === 'not_non_elemental_weapon' && weapon && !elemental) return false;
  if (r === 'not_two_handed' && weapon && twoHand) return false;
  if (r === 'shield' && !shield) return false;
  if (r === 'non_weapon_shield' && (weapon || shield)) return false;
  if (r === 'jewelry' && !jewelry) return false;
  if (r === 'non_jewelry' && jewelry) return false;
  if (r === 'non_jewelry_non_elemental' && (jewelry || (weapon && elemental))) return false;
  if (isQuiverItem(def) && r === 'weapon') return false;
  return true;
}

/**
 * @param {object|null|undefined} def
 * @param {string|null|undefined} [equipSlot]
 * @param {string} [category]
 * @returns {CorruptionCatalogRow[]}
 */
export function listCorruptionsForItem(def, equipSlot = null, category = 'all') {
  return catalog.filter((row) => {
    if (!canUseCorruptionOnItem(row, def, equipSlot)) return false;
    if (category && category !== 'all' && row.category !== category && !row.allPools) return false;
    return true;
  });
}

/**
 * @param {string|null|undefined} id
 * @returns {string[]}
 */
export function getCorruptionBonusLines(id) {
  const row = lookupCorruption(id);
  if (!row || row.isFailure) return [];
  if (row.setsEthereal || row.id === 'ethereal') return [];
  if (Array.isArray(row.modifiers) && row.modifiers.length) return row.modifiers.slice();
  return (row.mods || []).map((mod) => formatAffixModLine(mod)).filter(Boolean);
}

/**
 * @param {unknown} ids
 * @returns {string[]}
 */
export function normalizeCorruptions(ids) {
  if (!Array.isArray(ids)) {
    const one = String(ids || '').trim();
    return one ? [one] : [];
  }
  return ids.map((id) => String(id || '').trim()).filter(Boolean);
}

/**
 * Extra required level from applied corruptions (non-failed).
 * @param {unknown} ids
 * @returns {number}
 */
export function corruptionRequiredLevelBonus(ids) {
  let n = 0;
  for (const id of normalizeCorruptions(ids)) {
    const row = lookupCorruption(id);
    if (!row || row.isFailure) continue;
    n += 1;
  }
  return n;
}

/**
 * @param {string|null|undefined} restriction
 * @returns {string}
 */
export function corruptionRestrictionNote(restriction) {
  const key = String(restriction || '');
  return CORRUPTION_RESTRICTION_LABELS[key] || '';
}

/** Inventory icon stem for Corrupted Crystal. */
export function corruptionIcon() {
  return 'invfrag';
}

export { isRunewordItem };
