/**
 * @file Builds and caches the bucket snapshot for the live planner character.
 * UI/event wiring calls `refreshCharacterStatsSnapshot()`; Character reads through
 * `stats-snapshot.js` so it never imports this module.
 *
 * @module character/stats-provider
 */

import { getCharacterInstance } from '@/character/planner-instance.js';
import { getEffectivePlannerLevel } from '@/character/planner-core.js';
import { getPlannerCharacterStatDefs } from '@/character/planner-stats-config.js';
import { createCharacterBucket, createStatRegistry } from '@/character/bucket/index.js';
import { applyCharacterSources } from '@/character/bucket/engine.js';
import { setCharacterSnapshotProvider } from '@/character/stats-snapshot.js';
import { useItemsStore } from '@/stores/items.js';

/** @type {object|null} */
let cachedSnapshot = null;
let dirty = true;
let building = false;
/** @type {{ text: string|null, mode: 'totals'|'base' }} */
let importedSource = { text: null, mode: 'totals' };

/**
 * @param {string|null|undefined} text
 * @param {'totals'|'base'} [mode]
 */
export function setImportedStatsSource(text, mode = 'totals') {
  importedSource = {
    text: text == null ? null : String(text),
    mode: mode === 'base' ? 'base' : 'totals',
  };
  dirty = true;
}

/** Remove imported overrides (new character / class change). */
export function clearImportedStatsSource() {
  importedSource = { text: null, mode: 'totals' };
  dirty = true;
}

export function invalidateCharacterStats() {
  dirty = true;
}

/**
 * @returns {string}
 */
function readSkillBonusInput(id) {
  if (typeof document === 'undefined') return '0';
  const input = document.getElementById(id);
  return input && typeof input.value === 'string' ? input.value : '0';
}

/**
 * @returns {object|null}
 */
export function refreshCharacterStatsSnapshot() {
  if (building) return cachedSnapshot;
  if (!dirty && cachedSnapshot) return cachedSnapshot;
  const character = getCharacterInstance();
  if (!character) {
    cachedSnapshot = null;
    dirty = false;
    return null;
  }
  const registry = createStatRegistry(getPlannerCharacterStatDefs());
  if (!registry.size) {
    // Skill data not loaded yet: keep the legacy path alive.
    return null;
  }
  building = true;
  try {
    /** @type {object|null} */
    let itemsStore = null;
    try {
      itemsStore = useItemsStore();
    } catch {
      itemsStore = null;
    }
    let effectiveLevel = Number(character.level) || 1;
    try {
      effectiveLevel = getEffectivePlannerLevel();
    } catch {
      // Keep the stored level.
    }
    const bucket = createCharacterBucket({ registry });
    const result = applyCharacterSources(bucket, {
      character,
      registry,
      itemsStore,
      effectiveLevel,
      allSkillsBonus: Number(readSkillBonusInput('allSkillsBonus')) || 0,
      classSkillsBonus: Number(readSkillBonusInput('classSkillsBonus')) || 0,
      importText: importedSource.text,
      importMode: importedSource.mode,
    });
    cachedSnapshot = result.snapshot;
    dirty = false;
    return cachedSnapshot;
  } finally {
    building = false;
  }
}

/**
 * @param {string} stat
 * @returns {number}
 */
export function getBucketStat(stat) {
  const snapshot = refreshCharacterStatsSnapshot();
  return snapshot ? snapshot.getValue(stat) : 0;
}

/**
 * @returns {Record<string, number>}
 */
export function getBucketStats() {
  const snapshot = refreshCharacterStatsSnapshot();
  return snapshot ? { ...snapshot.values } : {};
}

// Character.getStat()/getAllStats() call this lazily; the provider rebuilds only
// after an explicit invalidation.
setCharacterSnapshotProvider(refreshCharacterStatsSnapshot, () => {
  dirty = true;
});
