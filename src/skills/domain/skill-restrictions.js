/**
 * First-point allocation rules (beyond tree prerequisites and devotion).
 *
 * Architecture:
 * - {@link Skill} is the runtime model for planner rows (see tree-data / Skill.fromCatalogRow).
 * - Allocation rule classes in `skill-allocation-rules.js` add predicates and `checkRestriction`.
 * - Innate / oskill catalog predicates live in `skill-skill-types.js`.
 * - All `checkRestriction` implementations return `{ allowed: boolean, reason: string }`.
 *
 * To add a new rule see `docs/ADDING_SKILL_RULES.md`:
 * 1. Create or extend a subclass with `static is…(skill)` and `checkRestriction`.
 * 2. Export a thin `check…Restriction(skill, allSkills)` wrapper here.
 * 3. Register the check in character-state `addSkillPoint` / `addSkillPointsBatch` (order matters).
 * 4. If the rule should show in the skill card warning UI, add it to `getSkillRestrictions` there.
 *
 * @module skills/skill-restrictions
 * @see docs/ADDING_SKILL_RULES.md
 */

import { Mastery, Coven, Proficiency, Ultimate, Paragon } from './skill-allocation-rules.js';

/** @typedef {{ allowed: boolean, reason: string }} AllocationCheckResult */

/**
 * @param {import('./Skill.js').default | object} skill
 * @param {object[]} allSkills
 * @returns {AllocationCheckResult}
 */
export function checkUltimateRestriction(skill, allSkills) {
    return new Ultimate(skill).checkRestriction(allSkills);
}

/**
 * @param {import('./Skill.js').default | object} skill
 * @param {object[]} allSkills
 * @returns {AllocationCheckResult}
 */
export function checkParagonRestriction(skill, allSkills) {
    return new Paragon(skill).checkRestriction(allSkills);
}

/**
 * @param {import('./Skill.js').default | object} skill
 * @param {object[]} allSkills
 * @returns {AllocationCheckResult}
 */
export function checkMasteryRestriction(skill, allSkills) {
    return new Mastery(skill).checkRestriction(allSkills);
}

/**
 * @param {import('./Skill.js').default | object} skill
 * @param {object[]} allSkills
 * @returns {AllocationCheckResult}
 */
export function checkCovenRestriction(skill, allSkills) {
    return new Coven(skill).checkRestriction(allSkills);
}

/**
 * @param {import('./Skill.js').default | object} skill
 * @param {object[]} allSkills
 * @returns {AllocationCheckResult}
 */
export function checkProficiencyRestriction(skill, allSkills) {
    return new Proficiency(skill).checkRestriction(allSkills);
}

/**
 * Human-readable summary for tooling / new contributors (not used at runtime).
 * Order in {@link src/character/character-state.js} `addSkillPoint` may differ slightly (e.g. devotion last).
 */
export const FIRST_POINT_RULE_SUMMARY = Object.freeze([
    {
        id: 'ultimate',
        classRef: 'Ultimate',
        predicate: "skill.hasTag('Ultimate')",
        rule: 'At most one Ultimate-tagged skill per class may have points.'
    },
    {
        id: 'mastery',
        classRef: 'Mastery',
        predicate: "skill.tabName === 'Mastery'",
        rule: 'At most three different Mastery-tab skills may have points.'
    },
    {
        id: 'coven',
        classRef: 'Coven',
        predicate: 'exclusive Sorceress coven ids (see Coven.EXCLUSIVE_SKILLS)',
        rule: 'At most two of the exclusive Coven skills may have points.'
    },
    {
        id: 'proficiency',
        classRef: 'Proficiency',
        predicate: 'exclusive Barbarian proficiency ids (see Proficiency.EXCLUSIVE_SKILLS)',
        rule: 'At most two of the exclusive Proficiency skills may have points.'
    },
    {
        id: 'paragon',
        classRef: 'Paragon',
        predicate: "skill.hasTag('Paragon')",
        rule: 'At most one Paragon-tagged skill per class may have points.'
    }
]);
