/**
 * @file Shrine / honorific blessing catalogs (wiki Shrine Bonuses).
 * @module items/blessings
 */

import { isHandWeapon, isQuiverItem, isShieldItem, isTwoHandedWeapon } from '@/items/item-types.js';
import { formatAffixIdLine } from '@/items/affix-templates.js';

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   variants: Array<{
 *     appliesTo: string[],
 *     bonuses: Array<{ text?: string, affixId?: string, min?: number, max?: number, isFixed?: boolean }>,
 *   }>,
 * }} ShrineCatalogRow
 */

/** @type {ShrineCatalogRow[]} */
let shrines = [];
/** @type {Map<string, ShrineCatalogRow>} */
let shrineById = new Map();
/** @type {Record<string, Array<{ text?: string, affixId?: string, min?: number, max?: number }>>} */
let honorificBonuses = {};

/**
 * @param {unknown} rows
 */
export function loadShrinesCatalog(rows) {
  const list = [];
  const map = new Map();
  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const id = String(row.id || '').trim();
      const name = String(row.name || id).trim();
      if (!id) continue;
      const variants = Array.isArray(row.variants) ? row.variants : [];
      const entry = { id, name, variants };
      list.push(entry);
      map.set(id, entry);
    }
  }
  shrines = list;
  shrineById = map;
}

/**
 * Honorific blessing uses the same shrine table on the wiki.
 * `blessings.json` is optional extra overrides.
 * @param {unknown} data
 */
export function loadHonorificBlessings(data) {
  honorificBonuses = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
}

/**
 * @param {object|null|undefined} def
 * @returns {'1h_weapon'|'2h_weapon'|'body_armor'|'armor_non_body'|'jewelry'|null}
 */
export function shrineItemType(def) {
  if (!def || typeof def !== 'object') return null;
  const slot = String(def.slot || '').toLowerCase();
  if (slot === 'neck' || slot === 'ring' || slot === 'rrin' || slot === 'lrin' || def.category === 'jewelry') {
    return 'jewelry';
  }
  if (isQuiverItem(def)) return 'jewelry';
  if (isHandWeapon(def)) return isTwoHandedWeapon(def) ? '2h_weapon' : '1h_weapon';
  if (slot === 'tors' || /body|armor/i.test(String(def.group || '')) && slot === 'tors') return 'body_armor';
  if (slot === 'tors') return 'body_armor';
  if (isShieldItem(def) || def.category === 'armor') return 'armor_non_body';
  return 'armor_non_body';
}

/**
 * @param {ShrineCatalogRow} row
 * @param {string|null} itemType
 */
function variantFor(row, itemType) {
  if (!itemType) return row.variants[0] || null;
  return row.variants.find((v) => (v.appliesTo || []).includes(itemType)) || null;
}

/**
 * @param {object|null|undefined} def
 * @returns {ShrineCatalogRow[]}
 */
export function listShrinesForItem(def) {
  const itemType = shrineItemType(def);
  return shrines.filter((row) => variantFor(row, itemType));
}

/**
 * @param {string|null|undefined} id
 * @returns {ShrineCatalogRow|null}
 */
export function lookupShrine(id) {
  const key = String(id || '').trim();
  return key ? shrineById.get(key) || null : null;
}

/**
 * @param {{ text?: string, affixId?: string, min?: number, max?: number, isFixed?: boolean }} bonus
 * @returns {string}
 */
function formatBonus(bonus) {
  const text = String(bonus?.text || '').trim();
  if (text) return text;
  const value = Number.isFinite(Number(bonus?.max))
    ? Number(bonus.max)
    : Number.isFinite(Number(bonus?.min))
      ? Number(bonus.min)
      : null;
  return formatAffixIdLine(bonus?.affixId, value, '');
}

/**
 * @param {string|null|undefined} id
 * @param {object|null|undefined} def
 * @param {boolean} [honorific]
 * @returns {string[]}
 */
export function getShrineBonusLines(id, def, honorific = false) {
  if (honorific) {
    const extra = honorificBonuses[String(id || '')];
    if (Array.isArray(extra) && extra.length) {
      return extra.map((bonus) => formatBonus(bonus)).filter(Boolean);
    }
  }
  const row = lookupShrine(id);
  if (!row) return [];
  const variant = variantFor(row, shrineItemType(def));
  if (!variant) return [];
  return (variant.bonuses || []).map((bonus) => formatBonus(bonus)).filter(Boolean);
}

/**
 * @returns {ShrineCatalogRow[]}
 */
export function listShrinesCatalog() {
  return shrines.slice();
}
