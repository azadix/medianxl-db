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
 * Sacred catalog base that has a matching Angelic counterpart.
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
export function isAngelicEligibleBase(def) {
  if (!def || typeof def !== 'object') return false;
  if (def.rarity === 'unique' || def.rarity === 'set' || def.rarity === 'runeword') return false;
  if (isAngelicBaseItem(def)) return false;
  if (!isSacredBaseItem(def)) return false;
  const family = baseNameWithoutTier(def.baseName || def.name).toLowerCase();
  return FAMILY_SET.has(family);
}

/**
 * Standalone Angelic catalog base (not a Sacred rarity overlay).
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
export function isAngelicBaseItem(def) {
  if (!def || typeof def !== 'object') return false;
  if (def.rarity === 'unique' || def.rarity === 'set' || def.rarity === 'runeword') return false;
  if (def.angelicBase === true) return true;
  return /\(Angelic\)\s*$/i.test(String(def.name || def.baseName || ''));
}

/**
 * @param {string|number|null|undefined} sacredId
 * @returns {string}
 */
export function angelicCloneId(sacredId) {
  return `${String(sacredId || '').trim()}:angelic`;
}

/**
 * @param {object|null|undefined} def
 * @returns {object|null}
 */
export function toAngelicBaseItem(def) {
  if (!isAngelicEligibleBase(def) || def?.id == null) return null;
  const name = angelicBaseDisplayName(def);
  return {
    ...def,
    id: angelicCloneId(def.id),
    name,
    baseName: undefined,
    sacredBaseId: def.id,
    angelicBase: true,
    angelic: true,
  };
}

/**
 * @param {object[]|null|undefined} catalog
 * @returns {object[]}
 */
export function listAngelicBaseItems(catalog) {
  const list = Array.isArray(catalog) ? catalog : [];
  const existing = new Set(list.map((row) => String(row?.id || '')));
  /** @type {object[]} */
  const out = [];
  for (const def of list) {
    const clone = toAngelicBaseItem(def);
    if (!clone || existing.has(String(clone.id))) continue;
    existing.add(String(clone.id));
    out.push(clone);
  }
  return out;
}

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
export function isAngelicItemDef(def) {
  if (!def || typeof def !== 'object') return false;
  if (def.angelic === true || def.angelicBase === true) return true;
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
