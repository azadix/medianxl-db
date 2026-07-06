/**
 * @file Skill prerequisite validation for planner allocation.
 * @module character/planner-prereqs
 */

import {
  normalizePrereqSkillTargetKey,
  displayNameForPrereqSkillTarget,
} from './prereq-utils.js';
import { getCharacterInstance } from './planner-instance.js';

/** Skills that use OR logic for skill_level prerequisites (instead of AND). */
const OR_PREREQUISITE_SKILLS = [
  'Life From Death',
  'Bloodthirst',
  'Nightwalker',
];

const PREREQUISITE_ORDER = {
  skill_level: 1,
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
 * @param {object} skill
 * @param {object[]} [allSkills]
 * @returns {{ met: boolean, reasons: string[] }}
 */
export function checkPrerequisites(skill, allSkills = []) {
  if (!skill.prerequisites || skill.prerequisites.length === 0) {
    return { met: true, reasons: [] };
  }

  const reasonsWithTypes = [];
  const useOrLogic = OR_PREREQUISITE_SKILLS.includes(skill.name);

  const skillLevelPrereqs = [];
  const otherPrereqs = [];

  for (const prereq of skill.prerequisites) {
    const [type] = prereq.split(':');
    if (type === 'skill_level') {
      skillLevelPrereqs.push(prereq);
    } else {
      otherPrereqs.push(prereq);
    }
  }

  for (const prereq of otherPrereqs) {
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
    }
  }

  if (skillLevelPrereqs.length > 0) {
    if (useOrLogic) {
      let anyMet = false;
      const orReasons = [];

      for (const prereq of skillLevelPrereqs) {
        const [, value, target] = prereq.split(':');
        const requiredPoints = parseInt(value, 10);
        const targetSkillName = normalizePrereqSkillTargetKey(target);
        const currentPoints = getSkillPointsForPrereqs(targetSkillName);
        const targetLabel = displayNameForPrereqSkillTarget(target, allSkills);

        if (currentPoints >= requiredPoints) {
          anyMet = true;
          break;
        }
        if (requiredPoints === 1) {
          orReasons.push(`${targetLabel}`);
        } else {
          orReasons.push(`${requiredPoints} points in ${targetLabel}`);
        }
      }

      if (!anyMet) {
        reasonsWithTypes.push({
          type: 'skill_level',
          message: `Requires one of: ${orReasons.join(' OR ')}`,
        });
      }
    } else {
      for (const prereq of skillLevelPrereqs) {
        const [, value, target] = prereq.split(':');
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
