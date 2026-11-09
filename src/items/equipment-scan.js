/**
 * @file Scan the active equipment for conditions used by item stat conversions
 * ("for each Jewel in your gear", "while holding a shield").
 * @module items/equipment-scan
 */

import { EQUIPMENT_SLOTS, isShieldItem } from './item-types.js';
import { isJewelSocketable } from './socketables.js';

/**
 * Active (contributing) equipment slots with their catalog def and instance.
 * Inactive weapon-swap slots are skipped, matching `activeEquippedDefs`.
 *
 * @param {{ equipment?: Record<string, unknown>, instances?: Record<string, object>, equipmentSlotContributesBonuses?: (slot: string) => boolean }|null|undefined} itemsStore
 * @returns {Array<{ slot: string, id: unknown, def: object|null, instance: object|null }>}
 */
export function listActiveEquippedInstances(itemsStore) {
  if (!itemsStore || typeof itemsStore !== 'object') return [];
  /** @type {Array<{ slot: string, id: unknown, def: object|null, instance: object|null }>} */
  const out = [];
  for (const slot of EQUIPMENT_SLOTS) {
    if (
      typeof itemsStore.equipmentSlotContributesBonuses === 'function' &&
      !itemsStore.equipmentSlotContributesBonuses(slot)
    ) {
      continue;
    }
    const id = itemsStore.equipment?.[slot];
    if (id == null) continue;
    out.push({
      slot,
      id,
      def: itemsStore.getDefForInstance?.(id) ?? null,
      instance: itemsStore.instances?.[id] ?? null,
    });
  }
  return out;
}

/**
 * @param {object|null|undefined} itemsStore
 * @returns {boolean}
 */
export function hasEquippedShield(itemsStore) {
  return listActiveEquippedInstances(itemsStore).some(({ def }) => isShieldItem(def));
}

/**
 * Count jewels in one item's socketables (runes/gems do not count).
 * @param {Array<object>|null|undefined} socketables
 * @returns {number}
 */
export function countJewelsInSocketables(socketables) {
  let count = 0;
  for (const socketable of Array.isArray(socketables) ? socketables : []) {
    if (isJewelSocketable(socketable)) count += 1;
  }
  return count;
}

/**
 * Count jewels socketed into active equipment (runes/gems do not count).
 * @param {object|null|undefined} itemsStore
 * @returns {number}
 */
export function countEquippedJewels(itemsStore) {
  let count = 0;
  for (const { instance } of listActiveEquippedInstances(itemsStore)) {
    count += countJewelsInSocketables(instance?.socketables);
  }
  return count;
}

/**
 * Whether an item doubles the value of its own socketed jewels
 * ("(Doubled for Jewels socketed in the Crown itself)").
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
export function doublesOwnJewelCount(def) {
  const modifiers = Array.isArray(def?.modifiers) ? def.modifiers : [];
  return modifiers.some((line) => /doubled for jewels socketed/i.test(String(line || '')));
}
