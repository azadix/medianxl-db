/** localStorage key: when true (default), planner level follows max(stored, min required by build). */
const AUTO_LEVEL_STORAGE_KEY = 'medianxl-planner-auto-level-from-spent-skill-points';

/** localStorage key: when true (default), raise str/dex to highest active item requirements. */
const AUTO_STAT_REQS_STORAGE_KEY = 'medianxl-planner-auto-match-highest-stat-requirements';

/**
 * @param {string} key
 * @returns {boolean}
 */
function readDefaultTrueFlag(key) {
  if (typeof localStorage === 'undefined') return true;
  const v = localStorage.getItem(key);
  if (v === null) return true;
  return v !== '0' && v !== 'false';
}

/**
 * @param {string} key
 * @param {boolean} value
 */
function writeBoolFlag(key, value) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(key, value ? '1' : '0');
}

/**
 * @returns {boolean}
 */
export function getPlannerAutoLevelFromSpentSkillPoints() {
  return readDefaultTrueFlag(AUTO_LEVEL_STORAGE_KEY);
}

/**
 * @param {boolean} value
 */
export function setPlannerAutoLevelFromSpentSkillPoints(value) {
  writeBoolFlag(AUTO_LEVEL_STORAGE_KEY, value);
}

/**
 * @returns {boolean}
 */
export function getPlannerAutoMatchHighestStatRequirements() {
  return readDefaultTrueFlag(AUTO_STAT_REQS_STORAGE_KEY);
}

/**
 * @param {boolean} value
 */
export function setPlannerAutoMatchHighestStatRequirements(value) {
  writeBoolFlag(AUTO_STAT_REQS_STORAGE_KEY, value);
}
