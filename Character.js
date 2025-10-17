/**
 * Character class
 * Central place for character-related default values and constants
 */
export default class Character {
  // Level constraints
  static MIN_LEVEL = 1;
  static MAX_LEVEL = 150;
  static DEFAULT_LEVEL = 1;
  
  // Quest skill point rewards with level requirements
  // Format: { quest_id: { difficulty: { points: number, expectedLevel: number } } }
  static QUEST_SKILL_POINTS = {
    'den_of_evil': { 
      normal: { points: 1, expectedLevel: 5 },
      nightmare: { points: 1, expectedLevel: 60 },
      hell: { points: 1, expectedLevel: 105 }
    },
    'radament': { 
      normal: { points: 1, expectedLevel: 10 },
      nightmare: { points: 1, expectedLevel: 70 },
      hell: { points: 1, expectedLevel: 107 }
    },
    'izual': { 
      normal: { points: 2, expectedLevel: 20 },
      nightmare: { points: 2, expectedLevel: 90 },
      hell: { points: 2, expectedLevel: 110 }
    },
    'inquisitor_of_the_triune': { 
      hell: { points: 2, expectedLevel: 115 }
    }
  };

  /**
   * Get the default character level
   * @returns {number} Default character level
   */
  static getDefaultLevel() {
    return Character.DEFAULT_LEVEL;
  }

  /**
   * Clamp a character level to valid range
   * @param {number} level - Level to clamp
   * @returns {number} Clamped level
   */
  static clampLevel(level) {
    if (isNaN(level)) return Character.DEFAULT_LEVEL;
    return Math.max(Character.MIN_LEVEL, Math.min(Character.MAX_LEVEL, level));
  }

  /**
   * Validate if a level is within valid range
   * @param {number} level - Level to validate
   * @returns {boolean} True if valid
   */
  static isValidLevel(level) {
    return !isNaN(level) && level >= Character.MIN_LEVEL && level <= Character.MAX_LEVEL;
  }

  /**
   * Calculate base skill points based on character level
   * @param {number} level - Character level
   * @returns {number} Base skill points (level 1 = 0, level 150 = 149)
   */
  static getBaseSkillPoints(level) {
    const clampedLevel = Character.clampLevel(level);
    return Math.max(0, clampedLevel - 1);
  }
}
