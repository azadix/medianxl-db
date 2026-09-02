/**
 * @file Item planner types and equipment slot constants.
 * @module items/item-types
 */

import { isCharmItem } from '@/items/charm-items.js';
import { isRelicItem } from '@/items/relic-items.js';

/** Inventory grid: 15 columns x 10 rows (150 cells). */
export const INV_COLUMNS = 15;
export const INV_ROWS = 10;
export const INV_CELL_COUNT = INV_COLUMNS * INV_ROWS;

/** Fallback cell size in px when grid rect is unavailable. */
export const INV_CELL_PX = 25;

/**
 * Equipment slot keys matching paperdoll layout.
 * Weapon sets: rarm/larm = set I, rarm2/larm2 = set II.
 * @type {readonly string[]}
 */
export const EQUIPMENT_SLOTS = Object.freeze([
  'head',
  'tors',
  'belt',
  'glov',
  'feet',
  'rarm',
  'larm',
  'rarm2',
  'larm2',
  'neck',
  'rrin',
  'lrin',
]);

/** Display labels for equipment slot keys. */
export const EQUIPMENT_SLOT_LABELS = Object.freeze({
  head: 'Head',
  tors: 'Torso',
  belt: 'Belt',
  glov: 'Gloves',
  feet: 'Boots',
  rarm: 'Weapon',
  larm: 'Off-hand',
  rarm2: 'Weapon',
  larm2: 'Off-hand',
  neck: 'Amulet',
  rrin: 'Ring',
  lrin: 'Ring',
});

/**
 * Inventory cell footprint for each equipment slot (matches MXL base sizes).
 * Weapon/off-hand use 2x4 to fit the largest shields.
 * @type {Readonly<Record<string, { w: number, h: number }>>}
 */
export const EQUIPMENT_SLOT_CELLS = Object.freeze({
  head: { w: 2, h: 2 },
  tors: { w: 2, h: 3 },
  belt: { w: 2, h: 1 },
  glov: { w: 2, h: 2 },
  feet: { w: 2, h: 2 },
  neck: { w: 1, h: 1 },
  rrin: { w: 1, h: 1 },
  lrin: { w: 1, h: 1 },
  rarm: { w: 2, h: 4 },
  larm: { w: 2, h: 4 },
  rarm2: { w: 2, h: 4 },
  larm2: { w: 2, h: 4 },
});

/**
 * Catalog categories for the item picker.
 * @type {readonly { id: string, name: string }[]}
 */
export const ITEM_CATEGORIES = Object.freeze([
  { id: 'all', name: 'All Items' },
  { id: 'weapons', name: 'Weapons' },
  { id: 'armor', name: 'Armor' },
  { id: 'jewelry', name: 'Jewelry' },
  { id: 'uniques', name: 'Uniques' },
  { id: 'sets', name: 'Sets' },
]);

/**
 * @returns {Record<string, null>}
 */
export function emptyEquipment() {
  /** @type {Record<string, null>} */
  const out = {};
  for (const slot of EQUIPMENT_SLOTS) out[slot] = null;
  return out;
}

/**
 * @returns {(number|null)[]}
 */
export function emptyInventory() {
  return Array.from({ length: INV_CELL_COUNT }, () => null);
}

/**
 * Map UI equipment labels / panel keys to store slot keys for the active weapon set.
 * @param {string} panelKey - 'Weapon' | 'Off-hand' | 'Head' | ...
 * @param {0|1} weaponSet
 * @returns {string|null}
 */
export function panelKeyToSlot(panelKey, weaponSet = 0) {
  const map = {
    Head: 'head',
    Amulet: 'neck',
    Torso: 'tors',
    Belt: 'belt',
    Gloves: 'glov',
    Boots: 'feet',
    'Ring Left': 'lrin',
    'Ring Right': 'rrin',
    Weapon: weaponSet === 1 ? 'rarm2' : 'rarm',
    'Off-hand': weaponSet === 1 ? 'larm2' : 'larm',
  };
  return map[panelKey] ?? null;
}

/**
 * Normalize equipment slot for comparison (weapon set II → set I keys).
 * @param {string} slot
 * @returns {string}
 */
export function normalizeEquipSlot(slot) {
  if (slot === 'rarm2') return 'rarm';
  if (slot === 'larm2') return 'larm';
  return slot;
}

/**
 * Interchangeable slot groups (rings; either hand).
 * @param {string} slot
 * @returns {string}
 */
export function equipSlotGroup(slot) {
  const s = normalizeEquipSlot(slot);
  if (s === 'lrin' || s === 'rrin' || s === 'ring') return 'ring';
  if (s === 'rarm' || s === 'larm' || s === 'arms') return 'hand';
  return s;
}

/**
 * Whether the character class may equip this item.
 * @param {{ classRestriction?: string }} def
 * @param {string|null|undefined} className
 * @returns {boolean}
 */
export function canEquipForClass(def, className) {
  const restriction = def?.classRestriction;
  if (!restriction) return true;
  if (!className) return false;
  const required = String(restriction).replace(/\s+only\s*$/i, '').trim();
  return required === String(className).trim();
}

/**
 * Whether a catalog item can go in an equipment slot.
 * Catalog uses `arms` / `ring` for interchangeable slots; equipment uses rarm/larm and rrin/lrin.
 * @param {{ slot?: string|string[], type?: string, classRestriction?: string }} def
 * @param {string} equipSlot
 * @param {string|null|undefined} [className] - When provided, enforces class restrictions
 * @returns {boolean}
 */
export function canEquipInSlot(def, equipSlot, className = undefined) {
  if (!def) return false;
  if (isCharmItem(def) || isRelicItem(def)) return false;
  const allowed = def.slot;
  if (allowed == null) return false;
  const list = Array.isArray(allowed) ? allowed : [allowed];
  const targetGroup = equipSlotGroup(equipSlot);
  const slotOk = list.some((s) => equipSlotGroup(String(s)) === targetGroup);
  if (!slotOk) return false;
  if (className !== undefined) return canEquipForClass(def, className);
  return true;
}

/**
 * Whether a catalog item can be placed in inventory (charms and most gear).
 * @param {{ type?: string }} def
 * @returns {boolean}
 */
export function canPlaceInInventory(def) {
  return !!def;
}

/**
 * Whether a catalog def belongs in the Uniques picker tab (not charms).
 * @param {object|null|undefined} item
 * @returns {boolean}
 */
export function isUniquePickerItem(item) {
  if (!item || typeof item !== 'object') return false;
  return item.rarity === 'unique' && !isCharmItem(item) && !isRelicItem(item);
}

/**
 * Whether a catalog def belongs in the Relics picker tab.
 * @param {object|null|undefined} item
 * @returns {boolean}
 */
export function isRelicPickerItem(item) {
  return isRelicItem(item);
}
