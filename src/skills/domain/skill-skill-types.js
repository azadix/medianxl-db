/**
 * @file Skill type predicates (innate tab rows, oskill catalog class_id).
 * @module skills/domain/skill-skill-types
 */

/**
 * @param {import('./Skill.js').default | object | null | undefined} skill
 * @returns {boolean}
 */
export function isInnateSkill(skill) {
    if (!skill) return false;
    if (String(skill.tabName || '').toLowerCase() === 'innate') {
        return true;
    }
    const internal =
        typeof skill.id === 'string' && skill.id.trim() !== ''
            ? skill.id
            : typeof skill.name === 'string'
              ? skill.name
              : '';
    return internal.toLowerCase().includes('innate');
}

/**
 * Catalog row available to all classes (`class_id === 1`).
 * @param {import('./Skill.js').default | object} skill
 * @returns {boolean}
 */
export function isOSkillType(skill) {
    return skill.classId === 1;
}
