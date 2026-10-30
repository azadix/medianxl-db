import Character from '@/character/Character.js';

/** localStorage key: when true (default), planner level follows max(stored, min required by build). */
const AUTO_LEVEL_STORAGE_KEY = 'medianxl-planner-auto-level-from-spent-skill-points';

/** localStorage key: when true (default), raise str/dex to highest active item requirements. */
const AUTO_STAT_REQS_STORAGE_KEY = 'medianxl-planner-auto-match-highest-stat-requirements';

/** localStorage key: when true, gear bonuses apply only if allocated+skill str/dex meet reqs. */
const REQUIRE_STAT_REQS_FOR_ITEM_BONUSES_STORAGE_KEY =
  'medianxl-planner-require-str-dex-for-item-bonuses';

/** @type {Record<string, boolean>} */
const memoryFlags = {};

/**
 * @param {string} key
 * @returns {boolean}
 */
function readDefaultTrueFlag(key) {
  if (Object.prototype.hasOwnProperty.call(memoryFlags, key)) return memoryFlags[key];
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
  memoryFlags[key] = value === true;
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(key, value ? '1' : '0');
}

/**
 * @param {string} key
 * @returns {boolean}
 */
function readDefaultFalseFlag(key) {
  if (Object.prototype.hasOwnProperty.call(memoryFlags, key)) return memoryFlags[key];
  if (typeof localStorage === 'undefined') return false;
  const v = localStorage.getItem(key);
  if (v === null) return false;
  return v === '1' || v === 'true';
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
 * Level cap used when applying mystic orbs.
 * Auto-level raises the character to item reqs up to MAX_LEVEL; manual level cannot be exceeded.
 * @param {number|null|undefined} currentLevel
 * @returns {number|null}
 */
export function getPlannerItemReqLevelCap(currentLevel) {
  if (getPlannerAutoLevelFromSpentSkillPoints()) return Character.MAX_LEVEL;
  const n = Number(currentLevel);
  return Number.isFinite(n) && n > 0 ? n : null;
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

/**
 * @returns {boolean}
 */
export function getPlannerRequireStrDexForItemBonuses() {
  return readDefaultFalseFlag(REQUIRE_STAT_REQS_FOR_ITEM_BONUSES_STORAGE_KEY);
}

/**
 * @param {boolean} value
 */
export function setPlannerRequireStrDexForItemBonuses(value) {
  writeBoolFlag(REQUIRE_STAT_REQS_FOR_ITEM_BONUSES_STORAGE_KEY, value);
}
