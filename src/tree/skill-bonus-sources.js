/**
 * @file Allocate skill tooltip SOURCES amounts after the 150 cap.
 * @module tree/skill-bonus-sources
 */

const OSKILL_LEVEL_CAP = 150;

/**
 * @typedef {{
 *   baseLevel?: number,
 *   allSkillsBonus?: number,
 *   classSkillsBonus?: number,
 *   itemPoints?: number,
 *   relicSoft?: number,
 *   relicOSkillGrant?: number,
 *   isOSkill?: boolean,
 * }} SkillBonusSourceInput
 *
 * @typedef {{
 *   effectiveLevel: number,
 *   appliedAllSkillsBonus: number,
 *   appliedClassSkillsBonus: number,
 *   appliedItemBonus: number,
 *   appliedRelicBonus: number,
 * }} SkillBonusSourceAmounts
 */

/**
 * @param {unknown} value
 * @returns {number}
 */
function nonNegInt(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

/**
 * Allocate displayed SOURCES amounts. Level math still uses total itemPoints
 * (charms + relics) plus relic soft. Display split:
 * Item = charm/gear oSkill slvl; Relic = relic oSkill slvl + relic soft.
 *
 * Cap leftover order: All skills, Class skills (tree only), Item, Relic remainder.
 *
 * @param {SkillBonusSourceInput} [input]
 * @returns {SkillBonusSourceAmounts}
 */
export function computeSkillBonusSourceAmounts(input = {}) {
  const baseLevel = nonNegInt(input.baseLevel);
  const allSkillsBonus = nonNegInt(input.allSkillsBonus);
  const classSkillsBonus = nonNegInt(input.classSkillsBonus);
  const itemPoints = nonNegInt(input.itemPoints);
  const relicSoft = nonNegInt(input.relicSoft);
  const relicOSkillGrant = nonNegInt(input.relicOSkillGrant);
  const isOSkill = Boolean(input.isOSkill);

  const itemGrant = isOSkill ? Math.max(0, itemPoints - relicOSkillGrant) : 0;
  const softTotal = isOSkill
    ? allSkillsBonus + relicSoft + itemPoints
    : allSkillsBonus + classSkillsBonus + relicSoft;
  const effectiveLevel = isOSkill
    ? Math.min(OSKILL_LEVEL_CAP, baseLevel + softTotal)
    : baseLevel + softTotal;

  let remainingSoft = Math.max(0, effectiveLevel - baseLevel);
  const appliedAllSkillsBonus = Math.min(allSkillsBonus, remainingSoft);
  remainingSoft -= appliedAllSkillsBonus;

  const appliedClassSkillsBonus = isOSkill ? 0 : Math.min(classSkillsBonus, remainingSoft);
  if (!isOSkill) remainingSoft -= appliedClassSkillsBonus;

  const appliedItemBonus = isOSkill ? Math.min(itemGrant, remainingSoft) : 0;
  remainingSoft -= appliedItemBonus;

  const appliedRelicBonus = isOSkill ? Math.max(0, remainingSoft) : relicSoft;

  return {
    effectiveLevel,
    appliedAllSkillsBonus,
    appliedClassSkillsBonus,
    appliedItemBonus,
    appliedRelicBonus,
  };
}
