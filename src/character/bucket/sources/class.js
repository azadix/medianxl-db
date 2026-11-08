/**
 * @file Class / level / quest / derived sources for the character bucket.
 *
 * These replace the base half of `applyClassBaselineStatsToCharacter()` and
 * `recomputeClassDerivedLifeMana()`. The class source emits base attributes and the
 * class/level pool; the derived source adds vitality→life and energy→mana once the
 * attribute totals are known.
 *
 * @module character/bucket/sources/class
 */

import {
  getClassPlannerStatDefaults,
} from '@/character/class-baselines.js';
import { createContribution, createSource } from '@/character/bucket/contributions.js';

const ATTRIBUTES = Object.freeze(['strength', 'dexterity', 'vitality', 'energy']);
const RAW_STAT_SKIP = new Set([
  'strength',
  'dexterity',
  'vitality',
  'energy',
  'life',
  'mana',
  'current_life',
  'current_mana',
  'base_life',
  'base_mana',
]);

/**
 * @param {object} bucket
 * @param {{
 *   character: object,
 *   registry: import('@/character/bucket/registry.js').StatRegistry,
 * }} input
 * @returns {{ contributions: number, level: number }}
 */
export function applyClassSources(bucket, input) {
  const character = input.character;
  if (!bucket) throw new Error('applyClassSources requires a bucket');
  if (!character) throw new Error('applyClassSources requires a character');
  const row = getClassPlannerStatDefaults(character.className);
  if (!row) {
    bucket.removeSource('base', 'class:attributes');
    bucket.removeSource('base', 'class:life');
    bucket.removeSource('base', 'class:mana');
    bucket.removeSource('base', 'allocation');
    bucket.removeSource('base', 'quests');
    return { contributions: 0, level: Number(character.level) || 1 };
  }
  const level = Math.max(
    1,
    Math.floor(Number(input.effectiveLevel) || Number(character.level) || 1)
  );
  const classSource = createSource({
    kind: 'class',
    id: 'class',
    label: 'Class & level',
  });
  const allocationSource = createSource({
    kind: 'class',
    id: 'allocation',
    label: 'Allocated / saved',
  });
  const questSource = createSource({ kind: 'quest', id: 'quests', label: 'Quests' });

  /** @type {object[]} */
  const attributeContributions = [];
  /** @type {object[]} */
  const allocationContributions = [];
  /** @type {object[]} */
  const questContributions = [];
  const add = (list, stat, value, source, id, stage = 'pre') => {
    if (!Number.isFinite(value) || value === 0) return;
    list.push(
      createContribution({
        id,
        stat,
        op: 'base',
        stage,
        value,
        source,
      })
    );
  };

  for (const stat of ATTRIBUTES) {
    add(attributeContributions, stat, Number(row[stat]) || 0, classSource, `class:${stat}`);
  }
  const poolLife = createContribution({
    id: 'class:life',
    stat: 'life',
    op: 'base',
    stage: 'pre',
    value: Number(row.base_life) || 0,
    source: classSource,
  });
  const poolMana = createContribution({
    id: 'class:mana',
    stat: 'mana',
    op: 'base',
    stage: 'pre',
    value: Number(row.base_mana) || 0,
    source: classSource,
  });

  for (const stat of ATTRIBUTES) {
    const raw = character.getRawStat(stat);
    const delta = raw - (Number(row[stat]) || 0);
    add(allocationContributions, stat, delta, allocationSource, `allocation:${stat}`);
  }

  const questLife =
    typeof character.getTotalQuestLifeBonus === 'function'
      ? Number(character.getTotalQuestLifeBonus()) || 0
      : 0;
  add(questContributions, 'life', questLife, questSource, 'quest:life');

  bucket.setSource('base', 'class:attributes', { contributions: attributeContributions });
  bucket.setSource('base', 'class:life', { contributions: [poolLife] });
  bucket.setSource('base', 'class:mana', { contributions: [poolMana] });
  bucket.setSource('base', 'allocation', { contributions: allocationContributions });
  bucket.setSource('base', 'quests', { contributions: questContributions });
  return {
    contributions:
      attributeContributions.length +
      2 +
      allocationContributions.length +
      questContributions.length,
    level,
  };
}

/**
 * Manual/saved raw values for stats that are not class-derived. These are explicit
 * user inputs (the Character panel writes `stats[key]`), not item/skill bonuses.
 * @param {object} bucket
 * @param {{ character: object, enabled?: boolean }} input
 * @returns {{ contributions: number }}
 */
export function applyManualStats(bucket, input) {
  if (!bucket) throw new Error('applyManualStats requires a bucket');
  const character = input.character;
  if (!character || input.enabled === false) {
    bucket.removeSource('base', 'manual');
    return { contributions: 0 };
  }
  const source = createSource({ kind: 'manual', id: 'manual', label: 'Manual / saved' });
  /** @type {object[]} */
  const contributions = [];
  for (const [key, rawValue] of Object.entries(character.getAllRawStats?.() || {})) {
    if (RAW_STAT_SKIP.has(key)) continue;
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value === 0) continue;
    contributions.push(
      createContribution({
        id: `manual:${key}`,
        stat: key,
        op: 'base',
        stage: 'pre',
        value,
        source,
      })
    );
  }
  bucket.setSource('base', 'manual', { contributions });
  return { contributions: contributions.length };
}

/**
 * @param {object} bucket
 * @param {{ character: object }} input
 * @returns {{ contributions: number, vitality: number, energy: number }}
 */
export function applyDerivedSources(bucket, input) {
  const character = input.character;
  if (!bucket) throw new Error('applyDerivedSources requires a bucket');
  const row = getClassPlannerStatDefaults(character?.className);
  if (!row) {
    bucket.removeSource('base', 'derived:vitality');
    bucket.removeSource('base', 'derived:energy');
    return { contributions: 0, vitality: 0, energy: 0 };
  }
  const values = bucket.getSnapshot().values || {};
  const totalVitality = Number(values.vitality) || 0;
  const totalEnergy = Number(values.energy) || 0;
  const rawVitality = Number(character.getRawStat?.('vitality')) || 0;
  const rawEnergy = Number(character.getRawStat?.('energy')) || 0;
  const baseVitality = Number(row.vitality) || 0;
  const baseEnergy = Number(row.energy) || 0;
  // Spent/base attributes are baked into the pool base (op 11 applies to them);
  // item/skill/Paragon bonuses are the op 8/9 delta and are added after `%`.
  const allocatedVitality = Math.max(0, rawVitality - baseVitality);
  const allocatedEnergy = Math.max(0, rawEnergy - baseEnergy);
  const bonusVitality = Math.max(0, totalVitality - rawVitality);
  const bonusEnergy = Math.max(0, totalEnergy - rawEnergy);
  const level = Number(input.effectiveLevel) || Number(character.level) || 1;
  const levelsAbove1 = Math.max(0, level - 1);
  const lifePerVitality = Number(row.life_per_vitality) || 0;
  const manaPerEnergy = Number(row.mana_per_energy) || 0;
  const levelLife = levelsAbove1 * (Number(row.life_per_level) || 0);
  const levelMana = levelsAbove1 * (Number(row.mana_per_level) || 0);

  const vitaSource = createSource({
    kind: 'derived',
    id: 'vitality',
    label: 'Vitality (allocated)',
  });
  const vitaBonusSource = createSource({
    kind: 'derived',
    id: 'vitality-bonus',
    label: 'Vitality (bonus)',
  });
  const energySource = createSource({
    kind: 'derived',
    id: 'energy',
    label: 'Energy (allocated)',
  });
  const energyBonusSource = createSource({
    kind: 'derived',
    id: 'energy-bonus',
    label: 'Energy (bonus)',
  });
  const levelSource = createSource({ kind: 'derived', id: 'level', label: 'Level' });

  /** @type {object[]} */
  const lifeContributions = [];
  /** @type {object[]} */
  const manaContributions = [];
  const add = (list, id, stage, value, source) => {
    if (!Number.isFinite(value) || value === 0) return;
    list.push(createContribution({ id, stat: 'life', op: 'base', stage, value, source }));
  };
  add(lifeContributions, 'derived:vitality:allocated', 'pre', allocatedVitality * lifePerVitality, vitaSource);
  add(lifeContributions, 'derived:vitality:bonus', 'post', bonusVitality * lifePerVitality, vitaBonusSource);
  add(lifeContributions, 'derived:level:life', 'pre', levelLife, levelSource);

  const addMana = (id, stage, value, source) => {
    if (!Number.isFinite(value) || value === 0) return;
    manaContributions.push(
      createContribution({ id, stat: 'mana', op: 'base', stage, value, source })
    );
  };
  addMana('derived:energy:allocated', 'pre', allocatedEnergy * manaPerEnergy, energySource);
  addMana('derived:energy:bonus', 'post', bonusEnergy * manaPerEnergy, energyBonusSource);
  addMana('derived:level:mana', 'pre', levelMana, levelSource);

  bucket.setSource('base', 'derived:vitality', { contributions: lifeContributions });
  bucket.setSource('base', 'derived:energy', { contributions: manaContributions });
  return {
    contributions: lifeContributions.length + manaContributions.length,
    vitality: allocatedVitality + bonusVitality,
    energy: allocatedEnergy + bonusEnergy,
  };
}
