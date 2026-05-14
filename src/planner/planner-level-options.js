/** localStorage key: when true (default), planner level follows max(stored, min required by build). */
const STORAGE_KEY = 'medianxl-planner-auto-level-from-spent-skill-points';

/**
 * @returns {boolean}
 */
export function getPlannerAutoLevelFromSpentSkillPoints() {
  if (typeof localStorage === 'undefined') return true;
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === null) return true;
  return v !== '0' && v !== 'false';
}

/**
 * @param {boolean} value
 */
export function setPlannerAutoLevelFromSpentSkillPoints(value) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
}
