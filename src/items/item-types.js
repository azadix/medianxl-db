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
  { id: 'runewords', name: 'Runewords' },
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

/** Opposite weapon/off-hand slot in the same set, or null. */
const PAIRED_WEAPON_SLOTS = Object.freeze({
  rarm: 'larm',
  larm: 'rarm',
  rarm2: 'larm2',
  larm2: 'rarm2',
});

/** Weapon groups that always occupy both hands (no 1h damage). */
const STRICT_TWO_HAND_GROUPS = new Set([
  'Amazon Bows',
  'Amazon Spears',
  'Assassin Naginatas',
  'Barbarian Two-Handed Axes',
  'Bows',
  'Crossbows',
  'Druid Bows',
  'Druid Staves',
  'Necromancer Crossbows',
  'Necromancer Scythes',
  'Necromancer Staves',
  'Paladin Hammers',
  'Paladin Spears',
  'Scythes',
  'Spears',
  'Staves',
  'Two-Handed Axes',
]);

/**
 * @param {string} slot
 * @returns {string|null}
 */
export function pairedWeaponSlot(slot) {
  return PAIRED_WEAPON_SLOTS[String(slot)] ?? null;
}

/**
 * @param {string|null|undefined} className
 * @returns {boolean}
 */
function isBarbarianClass(className) {
  return String(className || '').replace(/\s+only\s*$/i, '').trim() === 'Barbarian';
}

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
function hasOneHandDamage(def) {
  return !!(def?.damage1h || def?.damage1hDisplay);
}

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
function hasTwoHandDamage(def) {
  return !!(def?.damage2h || def?.damage2hDisplay);
}

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
export function isShieldItem(def) {
  if (!def) return false;
  return /shield/i.test(String(def.group || ''));
}

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
function isStaffItem(def) {
  if (!def) return false;
  if (/staves/i.test(String(def.group || ''))) return true;
  return /staf|stf/i.test(String(def.type || ''));
}

/**
 * Weapon that occupies a hand slot (not a shield).
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
export function isHandWeapon(def) {
  if (!def || isShieldItem(def)) return false;
  if (def.category === 'weapons') return true;
  if (hasOneHandDamage(def) || hasTwoHandDamage(def)) return true;
  const group = String(def.group || '');
  return /staves|bows|crossbows|spears|naginatas|scythes|swords|axes|hammers|maces|claws|daggers|javelins|orbs|wands|scepters|knives/i.test(
    group
  );
}

/**
 * True two-hander (staff, bow, spear, 2h axe, …). Cannot pair with a shield except for Barbarian.
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
export function isStrictTwoHandedWeapon(def) {
  if (!def || isShieldItem(def)) return false;
  if (isStaffItem(def)) return true;
  if (STRICT_TWO_HAND_GROUPS.has(String(def.group || ''))) return true;
  return hasTwoHandDamage(def) && !hasOneHandDamage(def);
}

/**
 * Two-handed weapon, including versatile two-handed swords (1h+2h).
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
export function isTwoHandedWeapon(def) {
  if (!def || isShieldItem(def)) return false;
  if (isStrictTwoHandedWeapon(def)) return true;
  if (String(def.group || '') === 'Two-Handed Swords') return true;
  return hasOneHandDamage(def) && hasTwoHandDamage(def);
}

/**
 * Whether two items may occupy paired weapon slots together.
 * Only Barbarian may dual-wield when either item is two-handed. Staves are two-handed.
 * @param {object|null|undefined} a
 * @param {object|null|undefined} b
 * @param {string|null|undefined} [className]
 * @returns {boolean}
 */
export function canDualWieldPair(a, b, className) {
  if (!a || !b) return true;
  const barb = isBarbarianClass(className);
  if (isStrictTwoHandedWeapon(a) || isStrictTwoHandedWeapon(b)) return barb;
  if (isHandWeapon(a) && isHandWeapon(b) && (isTwoHandedWeapon(a) || isTwoHandedWeapon(b))) {
    return barb;
  }
  return true;
}

/**
 * Whether a catalog item can go in an equipment slot.
 * Catalog uses `arms` / `ring` for interchangeable slots; equipment uses rarm/larm and rrin/lrin.
 * @param {{ slot?: string|string[], type?: string, classRestriction?: string }} def
 * @param {string} equipSlot
 * @param {string|null|undefined} [className] - When provided, enforces class restrictions
 * @param {{ otherHandDef?: object|null, className?: string|null }} [options]
 * @returns {boolean}
 */
export function canEquipInSlot(def, equipSlot, className = undefined, options = {}) {
  if (!def) return false;
  if (isCharmItem(def) || isRelicItem(def)) return false;
  const allowed = def.slot;
  if (allowed == null) return false;
  const list = Array.isArray(allowed) ? allowed : [allowed];
  const targetGroup = equipSlotGroup(equipSlot);
  const slotOk = list.some((s) => equipSlotGroup(String(s)) === targetGroup);
  if (!slotOk) return false;
  if (className !== undefined && !canEquipForClass(def, className)) return false;
  const other = options?.otherHandDef;
  if (other) {
    const pairClass = className !== undefined ? className : options.className;
    if (!canDualWieldPair(def, other, pairClass)) return false;
  }
  return true;
}

/**
 * Why an item cannot go in an equipment slot, or null if it can.
 * @param {object|null|undefined} def
 * @param {string} equipSlot
 * @param {string|null|undefined} [className]
 * @param {{ otherHandDef?: object|null, className?: string|null }} [options]
 * @returns {string|null}
 */
export function equipBlockedReason(def, equipSlot, className = undefined, options = {}) {
  if (!def) return 'Select an item first.';
  if (isCharmItem(def) || isRelicItem(def)) {
    return 'Charms and relics cannot go in this slot.';
  }
  const allowed = def.slot;
  if (allowed == null) return 'This item cannot be equipped.';
  const list = Array.isArray(allowed) ? allowed : [allowed];
  const targetGroup = equipSlotGroup(equipSlot);
  const slotOk = list.some((s) => equipSlotGroup(String(s)) === targetGroup);
  if (!slotOk) {
    const label = EQUIPMENT_SLOT_LABELS[normalizeEquipSlot(equipSlot)] || 'this slot';
    return `Does not fit the ${label} slot.`;
  }
  if (className !== undefined && !canEquipForClass(def, className)) {
    const restriction = String(def.classRestriction || '').trim();
    return restriction || 'Not usable by this class.';
  }
  const other = options?.otherHandDef;
  if (other) {
    const pairClass = className !== undefined ? className : options.className;
    if (!canDualWieldPair(def, other, pairClass)) {
      return 'Only Barbarian can dual-wield with a two-handed weapon.';
    }
  }
  return null;
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
 * Whether a catalog def belongs in the Runewords picker tab (templates only).
 * @param {object|null|undefined} item
 * @returns {boolean}
 */
export function isRunewordPickerItem(item) {
  if (!item || typeof item !== 'object') return false;
  return item.rarity === 'runeword' && !item.baseId;
}

/**
 * Whether a catalog def belongs in the Relics picker tab.
 * @param {object|null|undefined} item
 * @returns {boolean}
 */
export function isRelicPickerItem(item) {
  return isRelicItem(item);
}

/**
 * Haystack for the item picker search box (name, base, type family).
 * @param {object|null|undefined} item
 * @returns {string}
 */
export function itemPickerSearchText(item) {
  if (!item || typeof item !== 'object') return '';
  const runes = Array.isArray(item.runes) ? item.runes.map(String) : [];
  return [
    item.name,
    item.id,
    item.type,
    item.baseName,
    item.baseType,
    item.baseId,
    item.setName,
    item.group,
    item.runeCode,
    runes.join(' '),
    runes.join(''),
    itemPickerQualityAlias(item),
  ]
    .filter((v) => v != null && String(v).trim() !== '')
    .join(' ')
    .toLowerCase();
}

/**
 * Search aliases for unique quality (TU/SU), kept as standalone tokens.
 * @param {object} item
 * @returns {string}
 */
function itemPickerQualityAlias(item) {
  const kind = item.uniqueKind;
  if (kind === 'tiered') {
    if (item.tier != null && String(item.tier).trim() !== '') {
      return `TU T${item.tier} t${item.tier}`;
    }
    return 'TU';
  }
  if (kind === 'su') return 'SU';
  if (kind === 'ssu') return 'SSU';
  if (kind === 'sssu') return 'SSSU';
  if (kind === 'runeword') return 'RW runeword';
  return '';
}

/**
 * Whether an item should appear for the given picker search query.
 * Every whitespace-separated token must match.
 * @param {object|null|undefined} item
 * @param {string} query
 * @returns {boolean}
 */
export function matchesItemPickerSearch(item, query) {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return true;
  const text = itemPickerSearchText(item);
  return q.split(/\s+/).every((tok) => text.includes(tok));
}
