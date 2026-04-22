/**
 * Skill-based modifiers to planner stats (life, mana, attributes, etc.).
 * Return rows here so stat tooltips can list them (e.g. Endurance: +10% maximum Life).
 *
 * Hook {@link recomputePlannerStatsFromSkillAllocations} runs when skill allocations change
 * so future data-driven skill -> stat contributions can update character.stats in one place.
 *
 * @typedef {'flat' | 'percent' | 'more'} PlannerStatModifierKind
 * @typedef {{
 *   skillId?: string | number,
 *   displayName: string,
 *   description: string,
 *   kind?: PlannerStatModifierKind,
 *   value?: number
 * }} PlannerStatModifier
 */

/**
 * Called after skill point totals change (tree debounce). Reserved for aggregating
 * skill effects into registered character stats once mapping data exists.
 */
export function recomputePlannerStatsFromSkillAllocations() {
  // Future: read allocations + balance rows, write deltas into registered stat keys.
}

/**
 * @param {string} statKey Planner base stat key (e.g. 'life', 'strength')
 * @returns {PlannerStatModifier[]}
 */
export function getPlannerStatSkillModifiers(statKey) {
  void statKey;
  return [];
}
