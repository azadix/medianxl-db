/**
 * Conditional subskills:
 * - `activeWhenSkillPoints` — active when that skill has at least one base point
 * - `activeWhenTabPoints` — active when that classTabs id tree has at least one point
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
 * @returns {number|null}
 */
export function getSubskillActivationTabId(subskillRow) {
    const raw =
        subskillRow?.activeWhenTabPoints ??
        subskillRow?.active_when_tab_points ??
        null;
    if (raw == null || String(raw).trim() === '') {
        return null;
    }
    const tabId = Number(raw);
    return Number.isFinite(tabId) ? tabId : null;
}

/**
 * @param {number} tabId classTabs id (same as tree() argument)
 * @param {{ blvl?: Record<string, number>, treeSkillsCache?: Record<string | number, string[]> }|null|undefined} characterState
 * @returns {number}
 */
export function countTabPoints(tabId, characterState) {
    if (!characterState?.blvl) {
        return 0;
    }

    const treeSkillsCache = characterState.treeSkillsCache || {};
    const treeSkills = treeSkillsCache[tabId] || treeSkillsCache[String(tabId)] || [];
    let total = 0;
    for (const skillName of treeSkills) {
        total += Math.max(0, Math.floor(Number(characterState.blvl[skillName]) || 0));
    }
    return total;
}

/**
 * @param {object|null|undefined} subskillRow
 * @param {{ blvl?: Record<string, number>, treeSkillsCache?: Record<string | number, string[]> }|null|undefined} characterState
 * @returns {boolean}
 */
export function isSubskillActive(subskillRow, characterState) {
    const activationTabId = getSubskillActivationTabId(subskillRow);
    if (activationTabId != null) {
        if (!characterState?.blvl) {
            return true;
        }
        return countTabPoints(activationTabId, characterState) > 0;
    }

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
