/**
 * @file Orchestrate character sources into one bucket snapshot.
 *
 * Order:
 *   1. class / level / quests / allocated attributes
 *   2. items (including the unique compartment)
 *   3. derived attribute pools (so skill formulas can read life/mana)
 *   4. skills
 *   5. derived pools again (skill/item attribute bonuses now included)
 *
 * @module character/bucket/engine
 */

import { applyClassSources, applyDerivedSources, applyManualStats } from './sources/class.js';
import { applyItemDerivedSources } from './sources/item-derived.js';
import { applyItemSources } from './sources/items.js';
import { applyImportedStats } from './sources/imports.js';
import { applySkillSources } from './sources/skills.js';

/**
 * @param {object} bucket
 * @param {{
 *   character: object,
 *   itemsStore?: object|null,
 *   effectiveLevel?: number,
 *   allSkillsBonus?: number,
 *   classSkillsBonus?: number,
 *   includeSkills?: boolean,
 *   includeItems?: boolean,
 *   importText?: string|null,
 *   importMode?: 'totals'|'base',
 * }} input
 * @returns {{
 *   snapshot: object,
 *   classContributions: number,
 *   itemSources: number,
 *   skillSources: number,
 *   derivedContributions: number,
 *   importedStats: number,
 * }}
 */
export function applyCharacterSources(bucket, input) {
  if (!bucket) throw new Error('applyCharacterSources requires a bucket');
  const character = input.character;
  if (!character) throw new Error('applyCharacterSources requires a character');

  const classResult = applyClassSources(bucket, {
    character,
    registry: null,
    effectiveLevel: input.effectiveLevel,
  });
  applyManualStats(bucket, {
    character,
    enabled: input.importText == null,
  });

  let itemSources = 0;
  /** @type {object[]} */
  let itemDerived = [];
  if (input.includeItems !== false && input.itemsStore) {    const items = applyItemSources(bucket, {
      itemsStore: input.itemsStore,
      character,
    });
    itemSources = items.sources;
    itemDerived = Array.isArray(items.derived) ? items.derived : [];
  }

  bucket.commit();

  let importedStats = 0;
  if (input.importText != null) {
    const imported = applyImportedStats(bucket, {
      text: input.importText,
      mode: input.importMode || 'totals',
    });
    importedStats = imported.stats;
  }

  let derived = applyDerivedSources(bucket, {
    character,
    effectiveLevel: input.effectiveLevel,
  });
  bucket.commit();

  // Item conversions (`X% of <source> added as <target>`) read the finished item /
  // derived stats, then feed the second derived pass because they can change vitality.
  // Rules can chain (minion life -> bonus defense -> vitality), so iterate until the
  // stats they read stop moving (bounded; the supported set converges in 2 passes).
  if (itemDerived.length > 0) {
    const sourceKeys = [...new Set(itemDerived.map((rule) => rule.sourceKey))];
    let previousSignature = '';
    for (let pass = 0; pass < 3; pass += 1) {
      applyItemDerivedSources(bucket, { rules: itemDerived });
      bucket.commit();
      const values = bucket.getSnapshot().values;
      const signature = sourceKeys
        .map((key) => Math.round((Number(values[key]) || 0) * 1000))
        .join('|');
      if (signature === previousSignature) break;
      previousSignature = signature;
    }
    derived = applyDerivedSources(bucket, {
      character,
      effectiveLevel: input.effectiveLevel,
    });
    bucket.commit();
  }

  let skillSources = 0;
  if (input.includeSkills !== false) {
    const values = bucket.getSnapshot().values;
    const skills = applySkillSources(bucket, {
      character,
      registry: input.registry,
      effectiveLevel: input.effectiveLevel ?? character.level,
      allSkillsBonus: input.allSkillsBonus,
      classSkillsBonus: input.classSkillsBonus,
      stats: values,
    });
    skillSources = skills.skills + skills.subskills;
    bucket.commit();
    derived = applyDerivedSources(bucket, {
      character,
      effectiveLevel: input.effectiveLevel,
    });
  }

  const snapshot = bucket.commit();
  return {
    snapshot,
    classContributions: classResult.contributions,
    itemSources,
    skillSources,
    derivedContributions: derived.contributions,
    importedStats,
  };
}
