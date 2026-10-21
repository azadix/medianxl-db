/**
 * @file Collect chance-to-cast procs from active planner items and group by skill.
 * @module items/item-granted-procs
 */

import { useItemsStore } from '@/stores/items.js';
import { getCharacterInstance } from '@/character/planner-instance.js';
import { resolveCatalogRowBySkillRef } from '@/character/planner-build-io.js';
import {
  getCharmAffixSources,
  isCharmBonusActive,
  resolveCharmAffixText,
  defaultCharmRollsForDef,
} from '@/items/charm-items.js';
import {
  getRelicStatLines,
  isRelicBonusActive,
  defaultRelicAffixRolls,
} from '@/items/relic-items.js';
import {
  countEquippedSetPieces,
  resolveSetBonuses,
} from '@/items/item-overlays.js';
import { getItemStatLines } from '@/items/item-stats.js';
import {
  PROC_TRIGGERS,
  parseProcFromModifierLine,
  formatProcItemSourceLabel,
  formatProcSetBonusSourceLabel,
  procSourceRarityForItem,
} from '@/items/item-procs.js';
import { EQUIPMENT_SLOTS } from '@/items/item-types.js';
import { MISSING_IMAGE_NAME } from '@/shared/utils.js';
import { getFileSkillStore } from '@/shared/skill-data-store.js';

/**
 * @typedef {{
 *   skillId: string,
 *   skillName: string,
 *   displayName: string,
 *   skillImage: string|null,
 *   skillClass: string,
 *   level: number,
 *   condition: string,
 *   chance: number,
 *   chanceMax: number,
 *   chanceLabel: string,
 *   sources: Array<{
 *     sourceLabel: string,
 *     sourceKind: 'item'|'setBonus',
 *     sourceRarity: string,
 *     chance: number,
 *     chanceMax: number,
 *     itemDefId?: string,
 *     setId?: string,
 *     setRequired?: number|string,
 *   }>,
 * }} PlannerProcRow
 */

/**
 * @param {string} skillName
 * @returns {{ skillId: string, skillName: string, displayName: string, skillImage: string|null, skillClass: string }|null}
 */
function resolveProcSkillMeta(skillName) {
  const row = resolveCatalogRowBySkillRef(skillName);
  if (!row?.id) return null;
  const id = String(row.id);
  const displayName =
    row.displayName != null && String(row.displayName).trim() !== ''
      ? String(row.displayName).trim()
      : String(skillName).trim();
  const store = getFileSkillStore();
  const det = store?.getSkillDetail?.(id) ?? null;
  const skillClass = String(row.class || row.className || det?.className || '').trim();
  const skillImage =
    det?.image != null && String(det.image).trim() !== ''
      ? String(det.image)
      : row.image != null
        ? String(row.image)
        : MISSING_IMAGE_NAME;
  return {
    skillId: id,
    skillName: id,
    displayName,
    skillImage,
    skillClass,
  };
}

/**
 * @param {string|null|undefined} line
 * @param {{
 *   sourceLabel: string,
 *   sourceKind: 'item'|'setBonus',
 *   sourceRarity: string,
 *   itemDefId?: string,
 *   setId?: string,
 *   setRequired?: number|string,
 * }} source
 * @returns {PlannerProcRow|null}
 */
function procRowFromLine(line, source) {
  const parsed = parseProcFromModifierLine(line);
  if (!parsed) return null;
  const skill = resolveProcSkillMeta(parsed.skillName);
  if (!skill) return null;
  return {
    skillId: skill.skillId,
    skillName: skill.skillName,
    displayName: skill.displayName,
    skillImage: skill.skillImage,
    skillClass: skill.skillClass,
    level: parsed.level,
    condition: parsed.condition,
    chance: parsed.chance,
    chanceMax: parsed.chanceMax,
    chanceLabel: parsed.chanceLabel,
    sources: [
      {
        sourceLabel: source.sourceLabel,
        sourceKind: source.sourceKind,
        sourceRarity: source.sourceRarity,
        chance: parsed.chance,
        chanceMax: parsed.chanceMax,
        itemDefId: source.itemDefId,
        setId: source.setId,
        setRequired: source.setRequired,
      },
    ],
  };
}

/**
 * Sum chances for the same skill + level + trigger condition.
 * @param {PlannerProcRow[]} rows
 * @returns {PlannerProcRow[]}
 */
export function groupPlannerProcRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  /** @type {Map<string, PlannerProcRow>} */
  const groups = new Map();

  for (const row of list) {
    if (!row) continue;
    const key = [row.skillId, row.level, row.condition].join('|');
    let group = groups.get(key);
    if (!group) {
      group = {
        skillId: row.skillId,
        skillName: row.skillName,
        displayName: row.displayName,
        skillImage: row.skillImage,
        skillClass: row.skillClass,
        level: row.level,
        condition: row.condition,
        chance: 0,
        chanceMax: 0,
        chanceLabel: '0',
        sources: [],
      };
      groups.set(key, group);
    }
    group.chance += Number(row.chance) || 0;
    group.chanceMax += Number(row.chanceMax) || 0;
    const incoming = Array.isArray(row.sources) && row.sources.length ? row.sources : [];
    for (const src of incoming) {
      group.sources.push({ ...src });
    }
  }

  const out = [...groups.values()];
  for (const group of out) {
    group.chanceLabel =
      group.chance === group.chanceMax
        ? String(group.chance)
        : `${group.chance}-${group.chanceMax}`;
    group.sources.sort((a, b) =>
      String(a.sourceLabel).localeCompare(String(b.sourceLabel), undefined, {
        sensitivity: 'base',
      })
    );
  }
  out.sort((a, b) => {
    const aCond = procTriggerSortIndex(a.condition);
    const bCond = procTriggerSortIndex(b.condition);
    if (aCond !== bCond) return aCond - bCond;
    if (aCond >= PROC_TRIGGERS.length) {
      const byCond = String(a.condition).localeCompare(String(b.condition), undefined, {
        sensitivity: 'base',
      });
      if (byCond) return byCond;
    }
    const byName = a.displayName.localeCompare(b.displayName, undefined, {
      sensitivity: 'base',
    });
    if (byName) return byName;
    return a.level - b.level;
  });
  return out;
}

/**
 * @param {string|null|undefined} condition
 * @returns {number}
 */
function procTriggerSortIndex(condition) {
  const idx = PROC_TRIGGERS.indexOf(String(condition || ''));
  return idx === -1 ? PROC_TRIGGERS.length : idx;
}

/**
 * @param {string[]} lines
 * @param {{
 *   sourceLabel: string,
 *   sourceKind: 'item'|'setBonus',
 *   sourceRarity: string,
 *   itemDefId?: string,
 *   setId?: string,
 *   setRequired?: number|string,
 * }} source
 * @returns {PlannerProcRow[]}
 */
function collectProcsFromLines(lines, source) {
  /** @type {PlannerProcRow[]} */
  const out = [];
  for (const line of Array.isArray(lines) ? lines : []) {
    const row = procRowFromLine(line, source);
    if (row) out.push(row);
  }
  return out;
}

/**
 * @param {object} def
 * @param {Record<string, number>|null|undefined} rolls
 * @param {string|null} className
 * @param {number|null} characterLevel
 * @returns {string[]}
 */
function resolvedLinesForDef(
  def,
  rolls,
  className,
  characterLevel,
  extras = null,
  mysticOrbs = null,
  socketables = null
) {
  if (!def) return [];
  return getItemStatLines(def, rolls, {
    hideRollableRanges: false,
    showRollRanges: false,
    characterLevel,
    charmInInventory: true,
    className,
    extras,
    mysticOrbs,
    socketables,
  });
}

/**
 * Collect procs from active equipped gear, enabled charms/relics, and active set bonuses.
 * @param {{ className?: string|null }} [options]
 * @returns {PlannerProcRow[]}
 */
export function collectEnabledPlannerProcs(options = {}) {
  try {
    const itemsStore = useItemsStore();
    const character = getCharacterInstance();
    const className =
      (options.className != null ? String(options.className).trim() : '') ||
      (character?.className != null ? String(character.className).trim() : '') ||
      null;
    const characterLevel = character?.level ?? null;

    /** @type {PlannerProcRow[]} */
    const rows = [];

    for (const slot of EQUIPMENT_SLOTS) {
      if (!itemsStore.equipmentSlotContributesBonuses?.(slot)) continue;
      const instanceId = itemsStore.equipment?.[slot];
      if (instanceId == null) continue;
      const def = itemsStore.getDefForInstance?.(instanceId);
      if (!def) continue;
      const rolls = itemsStore.getRollsForInstance?.(instanceId) ?? null;
      const extras = itemsStore.getExtrasForInstance?.(instanceId) ?? [];
      const lines = resolvedLinesForDef(
        def,
        rolls,
        className,
        characterLevel,
        extras,
        itemsStore.getMysticOrbsForInstance?.(instanceId) ?? [],
        itemsStore.getSocketablesForInstance?.(instanceId) ?? []
      );
      rows.push(
        ...collectProcsFromLines(lines, {
          sourceKind: 'item',
          sourceLabel: formatProcItemSourceLabel(def),
          sourceRarity: procSourceRarityForItem(def),
          itemDefId: def.id != null ? String(def.id) : undefined,
        })
      );
    }

    for (const [defId, instanceId] of Object.entries(itemsStore.enabledCharms || {})) {
      const def = itemsStore.catalogById?.[defId];
      if (!def) continue;
      const rolls =
        itemsStore.getRollsForInstance?.(instanceId) ?? defaultCharmRollsForDef(def, className);
      if (!isCharmBonusActive(def, characterLevel, { inInventory: true, rolls })) continue;
      /** @type {string[]} */
      const lines = [];
      for (const source of getCharmAffixSources(def, rolls, className, { activeOnly: true })) {
        const text = resolveCharmAffixText(source.text, source.sourceKey, rolls, false);
        if (text == null) continue;
        lines.push(text);
      }
      rows.push(
        ...collectProcsFromLines(lines, {
          sourceKind: 'item',
          sourceLabel: formatProcItemSourceLabel(def),
          sourceRarity: procSourceRarityForItem(def),
          itemDefId: String(defId),
        })
      );
    }

    for (const [defId, instanceId] of Object.entries(itemsStore.enabledRelics || {})) {
      const def = itemsStore.catalogById?.[defId];
      if (!def) continue;
      if (!isRelicBonusActive(def, characterLevel, { inInventory: true })) continue;
      const rolls =
        itemsStore.getRollsForInstance?.(instanceId) ?? defaultRelicAffixRolls(def);
      const lines = getRelicStatLines(def, rolls, {
        hideRollableRanges: false,
        showRollRanges: false,
      });
      rows.push(
        ...collectProcsFromLines(lines, {
          sourceKind: 'item',
          sourceLabel: formatProcItemSourceLabel(def),
          sourceRarity: procSourceRarityForItem(def),
          itemDefId: String(defId),
        })
      );
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
        rows.push(
          ...collectProcsFromLines(bonus.modifiers, {
            sourceKind: 'setBonus',
            sourceLabel: formatProcSetBonusSourceLabel(setDef, bonus.required),
            sourceRarity: 'set',
            setId: String(setDef.id),
            setRequired: bonus.required,
          })
        );
      }
    }

    return groupPlannerProcRows(rows);
  } catch {
    return [];
  }
}

/**
 * @returns {boolean}
 */
export function hasAnyPlannerProcs() {
  return collectEnabledPlannerProcs().length > 0;
}
