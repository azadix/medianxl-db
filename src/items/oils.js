/**
 * @file Oil catalogs from wiki Cube Recipes (Luck, Conjuration, Lottery).
 * @module items/oils
 */

import { formatAffixModLine } from '@/items/affix-templates.js';
import { isCustomItemDef } from '@/items/custom-items.js';
import { isRunewordItem } from '@/items/runeword-items.js';
import { isHandWeapon, isQuiverItem, isShieldItem } from '@/items/item-types.js';

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   slotType: string|null,
 *   extraSlotTypes?: string[],
 *   oilKind?: 'luck'|'lottery'|'conjuration'|'fail',
 *   requiresUnique?: boolean,
 *   notOnSets?: boolean,
 *   notOnRunewords?: boolean,
 *   notOnHonorifics?: boolean,
 *   notOnRegular?: boolean,
 *   mods?: Array<{ affixId?: string, value?: number }>,
 *   modifiers?: string[],
 * }} OilCatalogRow
 */

/** @type {OilCatalogRow[]} */
let catalog = [];
/** @type {Map<string, OilCatalogRow>} */
let byId = new Map();

/**
 * @param {unknown} rows
 */
export function loadOilsCatalog(rows) {
  const list = [];
  const map = new Map();
  const src = Array.isArray(rows) ? rows : Array.isArray(rows?.oils) ? rows.oils : [];
  for (const row of src) {
    if (!row || typeof row !== 'object') continue;
    const id = String(row.id || '').trim();
    if (!id) continue;
    /** @type {OilCatalogRow} */
    const entry = {
      id,
      label: String(row.label || id),
      slotType: row.slotType == null ? null : String(row.slotType),
      requiresUnique: row.requiresUnique === true,
    };
    if (row.oilKind === 'luck' || row.oilKind === 'lottery' || row.oilKind === 'conjuration' || row.oilKind === 'fail') {
      entry.oilKind = row.oilKind;
    }
    if (Array.isArray(row.extraSlotTypes) && row.extraSlotTypes.length) {
      entry.extraSlotTypes = row.extraSlotTypes.map(String);
    }
    if (row.notOnSets) entry.notOnSets = true;
    if (row.notOnRunewords) entry.notOnRunewords = true;
    if (row.notOnHonorifics) entry.notOnHonorifics = true;
    if (row.notOnRegular) entry.notOnRegular = true;
    if (Array.isArray(row.mods)) entry.mods = row.mods;
    if (Array.isArray(row.modifiers)) entry.modifiers = row.modifiers.map(String);
    list.push(entry);
    map.set(id, entry);
  }
  catalog = list;
  byId = map;
}

/**
 * @returns {OilCatalogRow[]}
 */
export function listOilsCatalog() {
  return catalog.slice();
}

/**
 * @param {string|null|undefined} id
 * @returns {OilCatalogRow|null}
 */
export function lookupOil(id) {
  const key = String(id || '').trim();
  return key ? byId.get(key) || null : null;
}

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
export function itemHasInnateElemental(def) {
  if (!def || typeof def !== 'object') return false;
  if (def.innate) return true;
  const blob = [def.innate, def.adds, ...(Array.isArray(def.modifiers) ? def.modifiers : [])]
    .map((v) => String(v || ''))
    .join('\n');
  return /innate elemental/i.test(blob);
}

/**
 * Planner oil slot group for a host item.
 * @param {object|null|undefined} def
 * @param {string|null|undefined} [equipSlot]
 * @returns {'weapon'|'elemental_weapon'|'armor'|'amulet'|'ring'|'quiver'|'jewel'|null}
 */
export function itemUpgradeSlotType(def, equipSlot = null) {
  if (!def || typeof def !== 'object') return null;
  const slot = String(equipSlot || def.slot || '').toLowerCase();
  if (slot === 'ring' || slot === 'rrin' || slot === 'lrin') return 'ring';
  if (def.category === 'jewelry' || slot === 'neck') return 'amulet';
  if (isQuiverItem(def)) return 'quiver';
  if (/jewel/i.test(String(def.group || def.type || def.name || ''))) return 'jewel';
  if (isHandWeapon(def)) {
    return itemHasInnateElemental(def) ? 'elemental_weapon' : 'weapon';
  }
  if (
    def.category === 'armor' ||
    isShieldItem(def) ||
    ['head', 'tors', 'glov', 'feet', 'belt', 'armor'].includes(slot)
  ) {
    return 'armor';
  }
  if (def.category === 'weapons') {
    return itemHasInnateElemental(def) ? 'elemental_weapon' : 'weapon';
  }
  return null;
}

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
function isUniqueOrSet(def) {
  const rarity = String(def?.rarity || '');
  return rarity === 'unique' || rarity === 'set';
}

/**
 * @param {OilCatalogRow} oil
 * @param {object|null|undefined} def
 * @param {string|null|undefined} [equipSlot]
 * @returns {boolean}
 */
export function canUseOilOnItem(oil, def, equipSlot = null) {
  if (!oil || !def) return false;
  if (oil.id === 'nothing') return true;
  const slotType = itemUpgradeSlotType(def, equipSlot);
  if (!slotType) return false;
  if (oil.slotType && oil.slotType !== slotType && !(oil.extraSlotTypes || []).includes(slotType)) {
    return false;
  }
  if (oil.requiresUnique && !isUniqueOrSet(def)) return false;
  if (oil.notOnSets && def.rarity === 'set') return false;
  if (oil.notOnRunewords && isRunewordItem(def)) return false;
  if (oil.notOnHonorifics && (def.rarity === 'honorific' || def.customQuality === 'honorific')) {
    return false;
  }
  if (oil.notOnRegular) {
    const rarity = String(def.rarity || def.quality || '').toLowerCase();
    if (rarity === 'normal' || rarity === 'regular' || rarity === 'superior' || rarity === 'white') {
      return false;
    }
  }
  if (isCustomItemDef(def) && def.customQuality === 'honorific' && oil.notOnHonorifics) return false;
  return true;
}

/**
 * @param {object|null|undefined} def
 * @param {string|null|undefined} [equipSlot]
 * @returns {OilCatalogRow[]}
 */
export function listOilsForItem(def, equipSlot = null) {
  return catalog.filter((row) => canUseOilOnItem(row, def, equipSlot));
}

/**
 * @param {string|null|undefined} id
 * @returns {string[]}
 */
export function getOilBonusLines(id) {
  const row = lookupOil(id);
  if (!row || row.id === 'nothing') return [];
  if (Array.isArray(row.modifiers) && row.modifiers.length) return row.modifiers.slice();
  return (row.mods || []).map((mod) => formatAffixModLine(mod)).filter(Boolean);
}

/**
 * Inventory icon for an oil outcome (Oil of Luck vs Oil of Enhancement).
 * @param {string|OilCatalogRow|null|undefined} oil
 * @returns {string}
 */
export function oilIcon(oil) {
  const row = typeof oil === 'string' ? lookupOil(oil) : oil && typeof oil === 'object' ? oil : null;
  if (!row || row.id === 'nothing' || row.oilKind === 'fail') return 'oil_disjunction';
  if (row.oilKind === 'luck' || row.oilKind === 'lottery' || row.requiresUnique) return 'oil_luck';
  return 'oil_enhancement';
}
