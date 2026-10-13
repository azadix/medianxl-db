/**
 * Collect planner showCondition keys from active/enabled items.
 * @module items/item-modifier-conditions
 */

import { useItemsStore } from '@/stores/items.js';
import { getCharacterInstance } from '@/character/planner-instance.js';
import { collectShowConditionKeysFromModifierLines } from '@/items/item-modifier-line.js';
import { isCharmBonusActive } from '@/items/charm-items.js';
import { isRelicBonusActive } from '@/items/relic-items.js';
import { EQUIPMENT_SLOTS } from '@/items/item-types.js';
import { countEquippedSetPieces, resolveSetBonuses } from '@/items/item-overlays.js';

/**
 * @returns {string[]}
 */
export function collectShowConditionKeysFromEnabledItems() {
  /** @type {string[]} */
  const keys = [];
  const seen = new Set();
  const addLines = (lines) => {
    for (const key of collectShowConditionKeysFromModifierLines(lines)) {
      const lower = String(key).toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      keys.push(key);
    }
  };

  try {
    const itemsStore = useItemsStore();
    const character = getCharacterInstance();
    const characterLevel = character?.level ?? null;

    for (const slot of EQUIPMENT_SLOTS) {
      if (!itemsStore.equipmentSlotContributesBonuses?.(slot)) continue;
      const instanceId = itemsStore.equipment?.[slot];
      if (instanceId == null) continue;
      const def = itemsStore.getDefForInstance?.(instanceId);
      if (!def || !Array.isArray(def.modifiers)) continue;
      addLines(def.modifiers.filter((m) => typeof m === 'string'));
    }

    const equippedDefs = itemsStore.activeEquippedDefs || [];
    const counts = countEquippedSetPieces(equippedDefs);
    for (const setDef of itemsStore.sets || []) {
      if (!setDef?.id) continue;
      const equippedCount = counts[setDef.id] || 0;
      if (equippedCount <= 0) continue;
      const totalPieces = (itemsStore.catalog || []).filter((d) => d.setId === setDef.id).length;
      for (const bonus of resolveSetBonuses(setDef, equippedCount, totalPieces)) {
        if (!bonus.active) continue;
        addLines((bonus.modifiers || []).filter((m) => typeof m === 'string'));
      }
    }

    for (const [defId, instanceId] of Object.entries(itemsStore.enabledCharms || {})) {
      const def = itemsStore.catalogById?.[defId];
      if (!def) continue;
      const rolls = itemsStore.getRollsForInstance?.(instanceId) ?? null;
      if (!isCharmBonusActive(def, characterLevel, { inInventory: true, rolls })) continue;
      if (!Array.isArray(def.modifiers)) continue;
      addLines(def.modifiers.filter((m) => typeof m === 'string'));
    }

    for (const defId of Object.keys(itemsStore.enabledRelics || {})) {
      const def = itemsStore.catalogById?.[defId];
      if (!def) continue;
      if (!isRelicBonusActive(def, characterLevel, { inInventory: true })) continue;
      if (!Array.isArray(def.modifiers)) continue;
      addLines(def.modifiers.filter((m) => typeof m === 'string'));
    }
  } catch {
    return keys;
  }

  return keys;
}
