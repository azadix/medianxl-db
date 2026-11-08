/**
 * @file Item source adapter for the character bucket.
 * Collects active worn gear, charms, relics and set bonuses, resolves their modifiers
 * once per source, and replaces the bucket's `items` compartment.
 *
 * @module character/bucket/sources/items
 */

import { EQUIPMENT_SLOTS } from '@/items/item-types.js';
import {
  resolveItemModifiers,
  resolveModifierLines,
} from '@/items/item-modifier-resolver.js';
import { defaultCharmRollsForDef, isCharmBonusActive } from '@/items/charm-items.js';
import { defaultRelicAffixRolls, isRelicBonusActive } from '@/items/relic-items.js';
import {
  countEquippedSetPieces,
  formatSetBonusLabel,
  resolveSetBonuses,
} from '@/items/item-overlays.js';

/**
 * Flatten socketable description lines into normalized text keys.
 * @param {Array<object>|null|undefined} socketables
 * @returns {string[]}
 */
function socketDescriptionKeys(socketables) {
  /** @type {string[]} */
  const out = [];
  for (const socket of Array.isArray(socketables) ? socketables : []) {
    for (const rawLine of socket?.description_lines || socket?.lines || []) {
      let text = '';
      if (typeof rawLine === 'string') text = rawLine;
      else if (Array.isArray(rawLine)) {
        text = rawLine
          .map((segment) => (Array.isArray(segment) ? segment[0] : segment))
          .join('');
      }
      text = String(text).trim();
      if (text) out.push(text.toLowerCase().replace(/^\+\s*/, '').replace(/\s+/g, ' '));
    }
  }
  return out;
}

/**
 * Remove one extra copy of each socketable line from the description extras so
 * socketed jewels are not double-counted as character stats.
 * @param {string[]|null|undefined} extras
 * @param {Array<object>|null|undefined} socketables
 * @returns {string[]}
 */
function stripSocketEchoes(extras, socketables) {
  const remaining = [...(Array.isArray(extras) ? extras : [])];
  for (const key of socketDescriptionKeys(socketables)) {
    const index = remaining.findIndex(
      (line) =>
        String(line)
          .toLowerCase()
          .replace(/^\{[^}]+\}/, '')
          .replace(/^\+\s*/, '')
          .replace(/\s+/g, ' ')
          .trim() === key
    );
    if (index >= 0) remaining.splice(index, 1);
  }
  return remaining;
}

/**
 * @param {object} itemsStore
 * @param {object|null|undefined} character
 * @param {number} instanceId
 * @returns {object}
 */
function instanceOptions(itemsStore, character, instanceId) {
  const upgradeOptions = itemsStore.getItemBonusOptionsForInstance?.(instanceId) || {};
  return {
    ...upgradeOptions,
    extras: stripSocketEchoes(upgradeOptions.extras, upgradeOptions.socketables),
    mysticOrbs: [],
    characterLevel: character?.level ?? null,
    className: character?.className ?? null,
    charmInInventory: true,
    // Socketable bonuses are shown on the item but do not contribute to character
    // stats in the current game state.
    socketables: null,
    hideRollableRanges: false,
    showRollRanges: false,
  };
}

/**
 * @param {object} itemsStore
 * @param {object|null|undefined} character
 * @returns {Array<{
 *   sourceId: string,
 *   label: string,
 *   slot?: string,
 *   def: object,
 *   rolls: Record<string, number>|null,
 *   options: object,
 * }>}
 */
function collectWornSources(itemsStore, character) {
  const className = character?.className ?? null;
  const characterLevel = character?.level ?? null;
  /** @type {Array<object>} */
  const sources = [];

  for (const slot of EQUIPMENT_SLOTS) {
    if (!itemsStore.equipmentSlotContributesBonuses?.(slot)) continue;
    const instanceId = itemsStore.equipment?.[slot];
    if (instanceId == null) continue;
    const def = itemsStore.getDefForInstance?.(instanceId);
    if (!def) continue;
    sources.push({
      sourceId: `slot:${slot}:${instanceId}`,
      label: def.name || slot,
      slot,
      def,
      rolls: itemsStore.getRollsForInstance?.(instanceId) ?? null,
      options: instanceOptions(itemsStore, character, instanceId),
    });
  }

  for (const [defId, instanceId] of Object.entries(itemsStore.enabledCharms || {})) {
    const def = itemsStore.catalogById?.[defId];
    if (!def) continue;
    const rolls =
      itemsStore.getRollsForInstance?.(instanceId) ?? defaultCharmRollsForDef(def, className);
    if (!isCharmBonusActive(def, characterLevel, { inInventory: true, rolls })) continue;
    sources.push({
      sourceId: `charm:${defId}`,
      label: def.name || defId,
      def,
      rolls,
      options: {
        ...instanceOptions(itemsStore, character, instanceId),
        className,
        characterLevel,
      },
    });
  }

  for (const [defId, instanceId] of Object.entries(itemsStore.enabledRelics || {})) {
    const def = itemsStore.catalogById?.[defId];
    if (!def) continue;
    if (!isRelicBonusActive(def, characterLevel, { inInventory: true })) continue;
    const rolls = itemsStore.getRollsForInstance?.(instanceId) ?? defaultRelicAffixRolls(def);
    sources.push({
      sourceId: `relic:${defId}`,
      label: def.name || defId,
      def,
      rolls,
      options: instanceOptions(itemsStore, character, instanceId),
    });
  }

  return sources;
}

/**
 * @param {object} bucket
 * @param {{
 *   itemsStore: object,
 *   character?: object|null,
 * }} input
 * @returns {{
 *   sources: number,
 *   contributions: number,
 *   reports: number,
 *   uniqueMods: number,
 * }}
 */
export function applyItemSources(bucket, input) {
  const itemsStore = input.itemsStore;
  const character = input.character || null;
  if (!bucket) throw new Error('applyItemSources requires a bucket');
  if (!itemsStore) throw new Error('applyItemSources requires the items store');

  bucket.clearCompartment('items');
  bucket.clearUniqueMods();

  const sources = collectWornSources(itemsStore, character);
  let contributionCount = 0;
  let reportCount = 0;
  let uniqueCount = 0;

  for (const source of sources) {
    const resolved = resolveItemModifiers(source.def, source.rolls, source.options, {
      sourceKind: 'item',
      sourceId: source.sourceId,
      label: source.label,
      slot: source.slot,
      characterLevel: character?.level ?? null,
    });
    bucket.setSource('items', source.sourceId, {
      contributions: resolved.contributions,
      reports: resolved.reports,
    });
    if (resolved.uniqueMods.length) {
      bucket.setUniqueMods(source.sourceId, resolved.uniqueMods);
      uniqueCount += resolved.uniqueMods.length;
    }
    contributionCount += resolved.contributions.length;
    reportCount += resolved.reports.length;
  }

  const equippedDefs = itemsStore.activeEquippedDefs || [];
  const counts = countEquippedSetPieces(equippedDefs);
  const catalog = Array.isArray(itemsStore.catalog) ? itemsStore.catalog : [];
  for (const setDef of itemsStore.sets || []) {
    if (!setDef?.id) continue;
    const equippedCount = counts[setDef.id] || 0;
    if (equippedCount <= 0) continue;
    const totalPieces = catalog.filter((def) => def.setId === setDef.id).length;
    for (const bonus of resolveSetBonuses(setDef, equippedCount, totalPieces)) {
      if (!bonus.active) continue;
      const sourceId = `set:${setDef.id}:${bonus.required}`;
      const label = `${String(setDef.name || setDef.id).trim()} (${formatSetBonusLabel(bonus.required)})`;
      const resolved = resolveModifierLines(bonus.modifiers, {
        sourceKind: 'set',
        sourceId,
        label,
        characterLevel: character?.level ?? null,
      });
      bucket.setSource('items', sourceId, {
        contributions: resolved.contributions,
        reports: resolved.reports,
      });
      contributionCount += resolved.contributions.length;
      reportCount += resolved.reports.length;
    }
  }

  return {
    sources: sources.length,
    contributions: contributionCount,
    reports: reportCount,
    uniqueMods: uniqueCount,
  };
}

