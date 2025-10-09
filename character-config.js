/**
 * Character Configuration
 * Central place for character-related default values and constants
 */

export const CHARACTER_CONFIG = {
  // Level constraints
  MIN_LEVEL: 1,
  MAX_LEVEL: 150,
  DEFAULT_LEVEL: 1,
  
  // Skill constraints
  MIN_SKILL_LEVEL: 0,
  MAX_SKILL_LEVEL: 99,
  
  // Max level constraints
  MIN_BASE_MAX_LEVEL: 0,
  DEFAULT_BASE_MAX_LEVEL: 1,
  
  // Quest skill point rewards
  QUEST_SKILL_POINTS: {
    'den_of_evil': { normal: 1, nightmare: 1, hell: 1 },
    'radament': { normal: 1, nightmare: 1, hell: 1 },
    'izual': { normal: 2, nightmare: 2, hell: 2 },
    'inquisitor_of_the_triune': { hell: 2}
  },
  
  // Skill restrictions
  MAX_MASTERY_SKILLS: 3, // Maximum number of different Mastery skills that can have points
  MAX_COVEN_SKILLS: 2, // Maximum number of different Coven skills that can have points (Sorceress)
  
  // Specific Coven skills that are mutually exclusive (pick 2 of 4)
  COVEN_EXCLUSIVE_SKILLS: ['living_flame', 'warp_armor', 'snow_queen', 'vengeful_power']
};

/**
 * Get the default character level
 * @returns {number} Default character level
 */
export function getDefaultCharacterLevel() {
  return CHARACTER_CONFIG.DEFAULT_LEVEL;
}

/**
 * Clamp a character level to valid range
 * @param {number} level - Level to clamp
 * @returns {number} Clamped level
 */
export function clampCharacterLevel(level) {
  if (isNaN(level)) return CHARACTER_CONFIG.DEFAULT_LEVEL;
  return Math.max(CHARACTER_CONFIG.MIN_LEVEL, Math.min(CHARACTER_CONFIG.MAX_LEVEL, level));
}

/**
 * Validate if a level is within valid range
 * @param {number} level - Level to validate
 * @returns {boolean} True if valid
 */
export function isValidCharacterLevel(level) {
  return !isNaN(level) && level >= CHARACTER_CONFIG.MIN_LEVEL && level <= CHARACTER_CONFIG.MAX_LEVEL;
}

/**
 * Calculate base skill points based on character level
 * @param {number} level - Character level
 * @returns {number} Base skill points (level 1 = 0, level 150 = 149)
 */
export function getBaseSkillPoints(level) {
  const clampedLevel = clampCharacterLevel(level);
  return Math.max(0, clampedLevel - 1);
}

