/**
 * First-point skill allocation restriction checks (prereqs, tag rules, devotion).
 * @module character/first-point-allocation-checks
 */
import {
  checkUltimateRestriction,
  checkParagonRestriction,
  checkMasteryRestriction,
  checkCovenRestriction,
  checkProficiencyRestriction,
  checkSoulchainTotemRestriction,
} from '@/skills/domain/skill-restrictions.js';
import { checkDevotionRestriction } from '@/skills/domain/skill-calculations.js';

/**
 * @typedef {'block' | 'list'} FirstPointCheckMode
 */

/**
 * @param {object} skill
 * @param {Array} allSkills
 * @param {object} skillLevels - skill_name -> points (for devotion)
 * @param {(skill: object, allSkills: Array) => { met: boolean, reasons: string[] }} checkPrerequisites
 * @param {{ mode?: FirstPointCheckMode }} [options]
 * @returns {{ blocked: boolean, reason: string, restrictions: Array<{ type: string, reason: string }> }}
 */
export function runFirstPointAllocationChecks(
  skill,
  allSkills,
  skillLevels,
  checkPrerequisites,
  options = {}
) {
  const mode = options.mode || 'block';
  /** @type {Array<{ type: string, reason: string }>} */
  const restrictions = [];

  const prereqCheck = checkPrerequisites(skill, allSkills);
  if (!prereqCheck.met) {
    if (mode === 'list') {
      prereqCheck.reasons.forEach((reason) => {
        restrictions.push({ type: 'prerequisite', reason });
      });
    } else {
      return { blocked: true, reason: prereqCheck.reasons.join(', '), restrictions: [] };
    }
  }

  /** @type {Array<{ runCheck: () => { allowed: boolean, reason: string }, type: string }>} */
  const tagRestrictionChecks = [
    { runCheck: () => checkUltimateRestriction(skill, allSkills), type: 'ultimate' },
    { runCheck: () => checkParagonRestriction(skill, allSkills), type: 'paragon' },
    { runCheck: () => checkMasteryRestriction(skill, allSkills), type: 'mastery' },
    { runCheck: () => checkCovenRestriction(skill, allSkills), type: 'coven' },
    { runCheck: () => checkProficiencyRestriction(skill, allSkills), type: 'proficiency' },
    { runCheck: () => checkSoulchainTotemRestriction(skill, allSkills), type: 'soulchain_totem' },
  ];

  for (const { runCheck, type } of tagRestrictionChecks) {
    const result = runCheck();
    if (!result.allowed) {
      if (mode === 'list') {
        restrictions.push({ type, reason: result.reason });
      } else {
        return { blocked: true, reason: result.reason, restrictions: [] };
      }
    }
  }

  const devotionCheck = checkDevotionRestriction(skill.skillId, skillLevels);
  if (!devotionCheck.canAllocate) {
    if (mode === 'list') {
      restrictions.push({ type: 'devotion', reason: devotionCheck.reason });
    } else {
      return { blocked: true, reason: devotionCheck.reason, restrictions: [] };
    }
  }

  if (mode === 'list') {
    return { blocked: restrictions.length > 0, reason: '', restrictions };
  }
  return { blocked: false, reason: '', restrictions: [] };
}
