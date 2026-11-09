/**
 * @file Build-level damage summary for {@link PlannerDamagePanel.vue}.
 *
 * Resolves the allocated skills with the same level rules as the stat bucket, then
 * collects each one's per-hit damage. Kept out of the component so it can be tested
 * with a plain character instance.
 *
 * @module character/planner-damage
 */

import { computeSkillLevels } from '@/skills/skill-levels.js';
import { collectSkillDamage } from '@/skills/domain/skill-damage.js';
import { getSkillVariantKey } from '@/tree/skill-variants.js';
import { withBaseAttributeFormulaStats } from '@/shared/skill-data-store.js';
import { getTreeSkillsCache } from './planner-snapshot.js';

/**
 * @param {{
 *   character: object,
 *   store: object,
 *   effectiveLevel?: number,
 *   allSkillsBonus?: number,
 *   classSkillsBonus?: number,
 * }} input
 * @returns {Array<{
 *   id: string,
 *   name: string,
 *   level: number,
 *   stats: Record<string, number>,
 *   components: object[],
 *   weaponDamagePercent: number,
 *   totalMin: number,
 *   totalMax: number,
 * }>}
 */
export function collectPlannerDamageSkills(input) {
  const character = input?.character;
  const store = input?.store;
  if (!character || !store) return [];

  const levels = computeSkillLevels({
    character,
    effectiveLevel: input.effectiveLevel,
    allSkillsBonus: input.allSkillsBonus,
    classSkillsBonus: input.classSkillsBonus,
  });
  const rawStats =
    typeof character.getAllStats === 'function'
      ? character.getAllStats()
      : character.getAllRawStats();
  const stats = withBaseAttributeFormulaStats(rawStats || {}, character);
  const characterState = {
    level: levels.effectiveLevel,
    className: character.className ?? null,
    blvl: { ...levels.mergedBlvl },
    lvl: { ...levels.softLevels },
    treeSkillsCache: getTreeSkillsCache(),
    stats: { ...stats },
    oSkillIds: [],
    relicOSkillIds: [],
  };

  const out = [];
  for (const [internalKey, level] of Object.entries(levels.levels)) {
    const skillLevel = Math.max(0, Math.floor(Number(level) || 0));
    if (skillLevel <= 0) continue;
    const row = store.catalogByInternalId?.get?.(internalKey);
    if (!row?.id) continue;
    if (character.isSkillDisabled?.(String(row.id))) continue;
    const damage = collectSkillDamage({
      row,
      level: skillLevel,
      characterState,
      characterLevel: levels.effectiveLevel,
      variantKey: getSkillVariantKey(String(row.id)),
    });
    if (damage.components.length === 0 && damage.weaponDamagePercent === 0) continue;
    out.push({
      id: String(row.id),
      name: row.displayName || String(row.id),
      level: skillLevel,
      stats,
      ...damage,
    });
  }
  out.sort((a, b) => b.totalMax - a.totalMax || a.name.localeCompare(b.name));
  return out;
}
