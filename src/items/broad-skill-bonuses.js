/**
 * @file Live all-skills / class-skills totals from equipped gear, charms, and relics.
 * Overview inputs track these via {@link syncOverviewBroadSkillBonuses}.
 * @module items/broad-skill-bonuses
 */

import { useItemsStore } from '@/stores/items.js';
import { getCharacterInstance } from '@/character/planner-instance.js';
import {
  defaultCharmRollsForDef,
  getCharmAffixSources,
  isCharmBonusActive,
  resolveCharmAffixText,
} from '@/items/charm-items.js';
import {
  defaultRelicAffixRolls,
  getRelicStatLines,
  isRelicBonusActive,
} from '@/items/relic-items.js';
import { resolvedEquipmentModifierLines } from '@/items/item-granted-oskills.js';
import { EQUIPMENT_SLOTS } from '@/items/item-types.js';
import { countEquippedSetPieces, resolveSetBonuses } from '@/items/item-overlays.js';
import { sumBroadSkillBonusesFromModifierLines } from '@/items/skill-bonus-from-modifiers.js';

/**
 * @param {string|null|undefined} className
 * @param {number|null|undefined} characterLevel
 * @returns {{ all: number, class: number }}
 */
export function collectLiveBroadSkillBonuses(className = null, characterLevel = null) {
  /** @type {{ all: number, class: number }} */
  const total = { all: 0, class: 0 };
  const wantClass = String(className || '').trim();

  /**
   * @param {string[]} lines
   */
  const addLines = (lines) => {
    const part = sumBroadSkillBonusesFromModifierLines(lines, wantClass);
    total.all += part.all;
    total.class += part.class;
  };

  try {
    const itemsStore = useItemsStore();
    const character = getCharacterInstance();
    const resolvedClass =
      wantClass ||
      (character?.className != null ? String(character.className).trim() : '');
    const level =
      characterLevel != null && Number.isFinite(Number(characterLevel))
        ? Number(characterLevel)
        : (character?.level ?? null);

    for (const slot of EQUIPMENT_SLOTS) {
      if (!itemsStore.equipmentSlotContributesBonuses?.(slot)) continue;
      const instanceId = itemsStore.equipment?.[slot];
      if (instanceId == null) continue;
      const def = itemsStore.getDefForInstance?.(instanceId);
      if (!def) continue;
      const rolls = itemsStore.getRollsForInstance?.(instanceId) ?? null;
      addLines(resolvedEquipmentModifierLines(def, rolls));
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
        addLines(bonus.modifiers || []);
      }
    }

    for (const [defId, instanceId] of Object.entries(itemsStore.enabledCharms || {})) {
      const def = itemsStore.catalogById?.[defId];
      if (!def) continue;
      if (!isCharmBonusActive(def, level, { inInventory: true })) continue;
      const rolls =
        itemsStore.getRollsForInstance?.(instanceId) ??
        defaultCharmRollsForDef(def, resolvedClass);
      /** @type {string[]} */
      const lines = [];
      for (const source of getCharmAffixSources(def, rolls, resolvedClass, { activeOnly: true })) {
        const text = resolveCharmAffixText(source.text, source.sourceKey, rolls, false);
        if (text == null) continue;
        lines.push(text);
      }
      addLines(lines);
    }

    for (const [defId, instanceId] of Object.entries(itemsStore.enabledRelics || {})) {
      const def = itemsStore.catalogById?.[defId];
      if (!def) continue;
      if (!isRelicBonusActive(def, level, { inInventory: true })) continue;
      const rolls =
        itemsStore.getRollsForInstance?.(instanceId) ?? defaultRelicAffixRolls(def);
      addLines(
        getRelicStatLines(def, rolls, {
          hideRollableRanges: false,
          showRollRanges: false,
        })
      );
    }
  } catch {
    return { all: 0, class: 0 };
  }

  return {
    all: Math.max(0, Math.floor(total.all)),
    class: Math.max(0, Math.floor(total.class)),
  };
}

/** Last live all/class totals already folded into Overview inputs. */
let lastLiveAllSkillsBonus = 0;
let lastLiveClassSkillsBonus = 0;

/**
 * @param {string} elementId
 * @returns {number}
 */
function readOverviewBonusInput(elementId) {
  if (typeof document === 'undefined') return 0;
  const el = document.getElementById(elementId);
  if (!(el instanceof HTMLInputElement)) return 0;
  return Math.max(0, Math.floor(parseInt(el.value, 10) || 0));
}

/**
 * @param {string} elementId
 * @param {number} value
 */
function writeOverviewBonusInput(elementId, value) {
  if (typeof document === 'undefined') return;
  const el = document.getElementById(elementId);
  if (!(el instanceof HTMLInputElement)) return;
  const next = Math.max(0, Math.floor(Number(value) || 0));
  if (Math.max(0, Math.floor(parseInt(el.value, 10) || 0)) === next) return;
  el.value = String(next);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Fold live gear/charm/relic all-skills and class-skills into Overview inputs.
 * Use `{ seed: true }` after import/load so existing Overview values are kept as-is.
 *
 * @param {{
 *   seed?: boolean,
 *   className?: string|null,
 *   characterLevel?: number|null,
 * }} [options]
 */
export function syncOverviewBroadSkillBonuses(options = {}) {
  const character = getCharacterInstance();
  let className =
    options.className != null && String(options.className).trim() !== ''
      ? String(options.className).trim()
      : character?.className != null
        ? String(character.className).trim()
        : '';
  if (!className && typeof document !== 'undefined') {
    const classSelect = document.getElementById('classSelect');
    if (classSelect instanceof HTMLSelectElement) {
      className = String(classSelect.value || '').trim();
    }
  }
  const characterLevel =
    options.characterLevel != null && Number.isFinite(Number(options.characterLevel))
      ? Number(options.characterLevel)
      : (character?.level ?? null);
  const live = collectLiveBroadSkillBonuses(className, characterLevel);

  if (options.seed) {
    lastLiveAllSkillsBonus = live.all;
    lastLiveClassSkillsBonus = live.class;
    return;
  }

  const curAll = readOverviewBonusInput('allSkillsBonus');
  const curClass = readOverviewBonusInput('classSkillsBonus');
  const nextAll = Math.max(0, curAll - lastLiveAllSkillsBonus + live.all);
  const nextClass = Math.max(0, curClass - lastLiveClassSkillsBonus + live.class);
  lastLiveAllSkillsBonus = live.all;
  lastLiveClassSkillsBonus = live.class;

  writeOverviewBonusInput('allSkillsBonus', nextAll);
  writeOverviewBonusInput('classSkillsBonus', nextClass);
}

/** Reset live-tracking (tests / full planner reset). */
export function resetOverviewBroadSkillBonusTracking() {
  lastLiveAllSkillsBonus = 0;
  lastLiveClassSkillsBonus = 0;
}
