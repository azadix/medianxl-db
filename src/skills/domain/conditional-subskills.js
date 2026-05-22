/**
 * Conditional subskills: optional `activeWhenSkillPoints` on subskill catalog rows.
 * When set, the subskill is active only if that skill has at least one base point allocated.
 *
 * @module skills/domain/conditional-subskills
 */

/**
 * @param {object|null|undefined} subskillRow
 * @returns {string|null}
 */
export function getSubskillActivationSkillId(subskillRow) {
    const raw =
        subskillRow?.activeWhenSkillPoints ??
        subskillRow?.active_when_skill_points ??
        null;
    if (raw == null || String(raw).trim() === '') {
        return null;
    }
    return String(raw).trim();
}

/**
 * @param {object|null|undefined} subskillRow
 * @param {{ blvl?: Record<string, number> }|null|undefined} characterState
 * @returns {boolean}
 */
export function isSubskillActive(subskillRow, characterState) {
    const activationSkillId = getSubskillActivationSkillId(subskillRow);
    if (!activationSkillId) {
        return true;
    }
    if (!characterState?.blvl) {
        return true;
    }

    const blvl = characterState.blvl[activationSkillId] ?? 0;
    return Math.max(0, Math.floor(Number(blvl) || 0)) > 0;
}
