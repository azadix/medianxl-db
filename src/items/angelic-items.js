/**
 * Angelic bases from wiki.median-xl.com/Angelic_Items.
 * Angelic is a base tier (above Sacred). Items on these bases can be magic,
 * rare, crafted, or honorific — never a normal white base, so never a runeword.
 * @module items/angelic-items
 */

import { baseNameWithoutTier } from '@/items/runeword-type-families.js';

/** Catalog family names (no tier suffix) that can spawn as Angelic. */
export const ANGELIC_BASE_FAMILIES = Object.freeze([
  'Military Pick',
  'Dagger',
  'Light Crossbow',
  'Trident',
  'Morning Star',
  'Giant Sword',
  'War Sword',
  'Large Axe',
  'Light Plated Boots',
  'Light Belt',
  'Full Helm',
  'Light Plate',
  'Long Staff',
  'Battle Staff',
  'Scepter',
  'Light Gauntlets',
  'Kite Shield',
]);

const FAMILY_SET = new Set(ANGELIC_BASE_FAMILIES.map((name) => name.toLowerCase()));

export const ANGELIC_RARITIES = Object.freeze(['magic', 'rare', 'crafted', 'honorific']);

/**
 * @param {string|null|undefined} value
 * @returns {'magic'|'rare'|'crafted'|'honorific'}
 */
export function normalizeAngelicRarity(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'magic' || key === 'crafted' || key === 'honorific' || key === 'rare') return key;
  if (key === 'angelic') return 'rare';
  return 'rare';
}

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
export function isSacredBaseItem(def) {
  if (!def || typeof def !== 'object') return false;
  return /\(Sacred\)\s*$/i.test(String(def.name || def.baseName || ''));
}

/**
 * Sacred catalog base that can be used as an Angelic item.
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
export function isAngelicEligibleBase(def) {
  if (!def || typeof def !== 'object') return false;
  if (def.rarity === 'unique' || def.rarity === 'set' || def.rarity === 'runeword') return false;
  if (!isSacredBaseItem(def)) return false;
  const family = baseNameWithoutTier(def.baseName || def.name).toLowerCase();
  return FAMILY_SET.has(family);
}

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
export function isAngelicItemDef(def) {
  if (!def || typeof def !== 'object') return false;
  if (def.angelic === true) return true;
  if (def.rarity === 'angelic' || def.customQuality === 'angelic') return true;
  return /\(Angelic\)/i.test(String(def.baseName || def.name || ''));
}

/**
 * @param {object|null|undefined} def
 * @returns {string}
 */
export function angelicBaseDisplayName(def) {
  const family = baseNameWithoutTier(def?.baseName || def?.name);
  return family ? `${family} (Angelic)` : 'Angelic';
}
