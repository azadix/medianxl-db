/**
 * @file Skill prerequisite validation for planner allocation.
 * @module character/planner-prereqs
 */

import {
  normalizePrereqSkillTargetKey,
  displayNameForPrereqSkillTarget,
} from './prereq-utils.js';
import { getCharacterInstance } from './planner-instance.js';

const PREREQUISITE_ORDER = {
  skill_level: 1,
  skill_level_any: 1,
  skill_blocked_by: 2,
  tree_points: 3,
  character_level: 4,
};

/**
 * @param {string} skillName
 * @returns {number}
 */
export function getSkillPointsForPrereqs(skillName) {
  const character = getCharacterInstance();
  return character ? character.getSkillPoints(skillName) : 0;
}

/**
 * @param {string} prereq
 * @param {object[]} allSkills
 * @returns {{ met: boolean, message: string|null }}
 */
function evaluateSkillLevelAny(prereq, allSkills) {
  const [, value, target] = prereq.split(':');
  const requiredPoints = parseInt(value, 10);
  const ids = String(target || '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);

  const orReasons = [];
  for (const id of ids) {
    const targetSkillName = normalizePrereqSkillTargetKey(id);
    const currentPoints = getSkillPointsForPrereqs(targetSkillName);
    if (currentPoints >= requiredPoints) {
      return { met: true, message: null };
    }
    const targetLabel = displayNameForPrereqSkillTarget(id, allSkills);
    if (requiredPoints === 1) {
      orReasons.push(`${targetLabel}`);
    } else {
      orReasons.push(`${requiredPoints} points in ${targetLabel}`);
    }
  }

  return {
    met: false,
    message: `Requires one of: ${orReasons.join(' OR ')}`,
  };
}

/**
 * @param {object} skill
 * @param {object[]} [allSkills]
 * @returns {{ met: boolean, reasons: string[] }}
 */
export function checkPrerequisites(skill, allSkills = []) {
  if (!skill.prerequisites || skill.prerequisites.length === 0) {
    return { met: true, reasons: [] };
  }

  const reasonsWithTypes = [];

  for (const prereq of skill.prerequisites) {
    const [type, value, target] = prereq.split(':');

    if (type === 'character_level') {
      continue;
    }
    if (type === 'skill_blocked_by') {
      const maxAllowedPoints = parseInt(value, 10);
      const targetSkillName = normalizePrereqSkillTargetKey(target);
      const currentPoints = getSkillPointsForPrereqs(targetSkillName);

      if (currentPoints > maxAllowedPoints) {
        const targetLabel = displayNameForPrereqSkillTarget(target, allSkills);
        reasonsWithTypes.push({
          type: 'skill_blocked_by',
          message: `You cannot learn this skill if you have points in ${targetLabel}.`,
        });
      }
    } else if (type === 'tree_points') {
      const requiredPoints = parseInt(value, 10);
      const targetTabName = target;
      const pointsInTab = countPointsInTab(targetTabName, allSkills);

      if (pointsInTab < requiredPoints) {
        reasonsWithTypes.push({
          type: 'tree_points',
          message: `Requires ${requiredPoints} point${requiredPoints > 1 ? 's' : ''} in ${targetTabName} tree`,
        });
      }
    } else if (type === 'skill_level_any') {
      const result = evaluateSkillLevelAny(prereq, allSkills);
      if (!result.met) {
        reasonsWithTypes.push({
          type: 'skill_level_any',
          message: result.message,
        });
      }
    } else if (type === 'skill_level') {
      const requiredPoints = parseInt(value, 10);
      const targetSkillName = normalizePrereqSkillTargetKey(target);
      const currentPoints = getSkillPointsForPrereqs(targetSkillName);
      const targetLabel = displayNameForPrereqSkillTarget(target, allSkills);

      if (currentPoints < requiredPoints) {
        const message =
          requiredPoints === 1
            ? `Requires ${targetLabel}`
            : `Requires ${requiredPoints} points in ${targetLabel}`;

        reasonsWithTypes.push({
          type: 'skill_level',
          message,
        });
      }
    }
  }

  reasonsWithTypes.sort((a, b) => {
    const orderA = PREREQUISITE_ORDER[a.type] || 999;
    const orderB = PREREQUISITE_ORDER[b.type] || 999;
    return orderA - orderB;
  });

  const reasons = reasonsWithTypes.map((r) => r.message);
  return { met: reasons.length === 0, reasons };
}

/**
 * @param {string} tabName
 * @param {object[]} allSkills
 * @returns {number}
 */
function countPointsInTab(tabName, allSkills) {
  let totalPoints = 0;
  const character = getCharacterInstance();
  if (!character) return totalPoints;

  for (const [skillName, points] of Object.entries(character.skillPoints)) {
    const skill = allSkills.find((s) => s.id === skillName);
    if (skill && skill.tabName === tabName) {
      totalPoints += points;
    }
  }

  return totalPoints;
}
