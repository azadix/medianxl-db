/**
 * Character class
 * Central place for character-related default values, constants, and instance management
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
      normal: { points: 1, expectedLevel: 18 },
      nightmare: { points: 1, expectedLevel: 70 },
      hell: { points: 1, expectedLevel: 107 }
    },
    'izual': { 
      normal: { points: 2, expectedLevel: 35 },
      nightmare: { points: 2, expectedLevel: 90 },
      hell: { points: 2, expectedLevel: 110 }
    },
    'inquisitor_of_the_triune': { 
      hell: { points: 2, expectedLevel: 115 }
    }
  };

  /**
   * Create a new Character instance
   * @param {string} className - Character class name
   * @param {number} level - Character level
   */
  constructor(className = null, level = Character.DEFAULT_LEVEL) {
    this.level = level;
    this.className = className;
    this.skillPoints = {}; // Map of skill_id -> points allocated
    this.maxLevels = {}; // Cached max levels for skills
    this.questsCompleted = { // Map of quest_id -> {normal, nightmare, hell}
      'den_of_evil': { normal: true, nightmare: true, hell: true },
      'radament': { normal: true, nightmare: true, hell: true },
      'izual': { normal: true, nightmare: true, hell: true },
      'inquisitor_of_the_triune': { hell: true}
    };
    this.oSkills = []; // Array of {skillId, skillName, displayName, image, className, points}
  }

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

  // ===== QUEST MANAGEMENT METHODS =====

  /**
   * Calculate total quest skill points from completed quests
   * @param {number} characterLevel - Character level to check against quest requirements
   * @returns {number} Total quest skill points
   */
  getTotalQuestSkillPoints(characterLevel = Character.MAX_LEVEL) {
    let total = 0;
    
    for (const [questId, difficulties] of Object.entries(this.questsCompleted)) {
      const questRewards = Character.QUEST_SKILL_POINTS[questId];
      if (questRewards) {
        if (difficulties.normal && questRewards.normal) {
          if (characterLevel >= questRewards.normal.expectedLevel) {
            total += questRewards.normal.points;
          }
        }
        if (difficulties.nightmare && questRewards.nightmare) {
          if (characterLevel >= questRewards.nightmare.expectedLevel) {
            total += questRewards.nightmare.points;
          }
        }
        if (difficulties.hell && questRewards.hell) {
          if (characterLevel >= questRewards.hell.expectedLevel) {
            total += questRewards.hell.points;
          }
        }
      }
    }
    
    return total;
  }

  /**
   * Calculate total available skill points based on max level and quests completed
   * Note: Always uses MAX_LEVEL for skill point pool, not the user's character level input
   * @param {number} characterLevel - Character level to check quest requirements against
   * @returns {number} Total available skill points
   */
  getAvailableSkillPoints(characterLevel = Character.MAX_LEVEL) {
    let total = Character.getBaseSkillPoints(Character.MAX_LEVEL);
    total += this.getTotalQuestSkillPoints(characterLevel);
    return total;
  }

  /**
   * Calculate total spent skill points
   * @returns {number} Total points spent
   */
  getSpentSkillPoints() {
    let total = 0;
    for (const points of Object.values(this.skillPoints)) {
      total += points;
    }
    return total;
  }

  /**
   * Calculate remaining skill points
   * @returns {number} Points remaining to spend
   */
  getRemainingSkillPoints() {
    // Use MAX_LEVEL for both base and quest calculations to get maximum available points
    const basePoints = Character.getBaseSkillPoints(Character.MAX_LEVEL);
    const questPoints = this.getTotalQuestSkillPoints(Character.MAX_LEVEL);
    const totalAvailable = basePoints + questPoints;
    return totalAvailable - this.getSpentSkillPoints();
  }

  /**
   * Calculate minimum character level required for current skill allocation
   * Takes into account spent skill points, quest rewards, and skill prerequisites
   * @param {Object} db - SQL.js database instance (optional)
   * @returns {number} Minimum character level needed
   */
  getMinimumRequiredLevel(db = null) {
    const spentPoints = this.getSpentSkillPoints();

    // Use binary search to find minimum level efficiently
    let minLevel = Character.MIN_LEVEL;
    let left = Character.MIN_LEVEL;
    let right = Character.MAX_LEVEL;
    
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const questPoints = this.getTotalQuestSkillPoints(mid);
      const basePoints = Character.getBaseSkillPoints(mid);
      const totalAvailable = basePoints + questPoints;
      
      if (totalAvailable >= spentPoints) {
        minLevel = mid;
        right = mid - 1; // Try lower levels
      } else {
        left = mid + 1; // Need higher level
      }
    }
    
    // Check skill prerequisites for character level requirements
    let minLevelFromPrerequisites = Character.MIN_LEVEL;
    
    if (db && spentPoints > 0) {
      // Get all skills that have points allocated
      const skillLevels = this.getAllSkillPoints();
      const allocatedSkillNames = [];
      
      // Collect skill names that have points allocated
      for (const [skillName, points] of Object.entries(skillLevels)) {
        if (points > 0) {
          allocatedSkillNames.push(skillName);
        }
      }
      
      // Check character level prerequisites for allocated skills in a single query
      if (allocatedSkillNames.length > 0) {
        const placeholders = allocatedSkillNames.map(() => '?').join(',');
        const stmt = db.prepare(`
          SELECT sp.requirement_value 
          FROM skill_prerequisites sp
          JOIN skills s ON sp.skill_id = s.id
          WHERE s.name IN (${placeholders}) 
          AND sp.requirement_type = 'character_level'
        `);
        stmt.bind(allocatedSkillNames);
        
        while (stmt.step()) {
          const requiredLevel = stmt.get()[0];
          minLevelFromPrerequisites = Math.max(minLevelFromPrerequisites, requiredLevel);
        }
        stmt.free();
      }
    }
    
    // Take the maximum of both requirements
    const finalMinLevel = Math.max(minLevel, minLevelFromPrerequisites);
    
    // Clamp to valid range
    return Math.max(Character.MIN_LEVEL, Math.min(Character.MAX_LEVEL, finalMinLevel));
  }

  /**
   * Update quest completion status
   * @param {string} questId - Quest identifier
   * @param {Object} difficulties - Object with normal, nightmare, hell boolean values
   */
  updateQuestCompletion(questId, difficulties) {
    if (!this.questsCompleted[questId]) {
      this.questsCompleted[questId] = {};
    }
    
    this.questsCompleted[questId] = {
      normal: difficulties.normal || false,
      nightmare: difficulties.nightmare || false,
      hell: difficulties.hell || false
    };
  }

  /**
   * Get quest completion status
   * @param {string} questId - Quest identifier
   * @returns {Object} Object with normal, nightmare, hell boolean values
   */
  getQuestCompletion(questId) {
    return this.questsCompleted[questId] || { normal: false, nightmare: false, hell: false };
  }

  // ===== SKILL POINT MANAGEMENT METHODS =====

  /**
   * Get skill points for a skill
   * @param {string} skillName - Skill name
   * @returns {number} Points allocated
   */
  getSkillPoints(skillName) {
    return this.skillPoints[skillName] || 0;
  }

  /**
   * Get skill points by skill ID
   * @param {number} skillId - The skill ID
   * @returns {number} Points allocated
   */
  getSkillPointsById(skillId) {
    return this.skillPoints[skillId] || 0;
  }

  /**
   * Get all skill points
   * @returns {Object} Map of skill_id -> points
   */
  getAllSkillPoints() {
    return { ...this.skillPoints };
  }

  /**
   * Set all skill points (used for loading builds)
   * @param {Object} skillPoints - Map of skill_name or skill_id -> points
   */
  setAllSkillPoints(skillPoints) {
    this.skillPoints = { ...skillPoints };
    this.maxLevels = {}; // Clear cache
  }

  /**
   * Reset all skill points
   */
  resetAllSkillPoints() {
    this.skillPoints = {};
    this.maxLevels = {};
  }

  /**
   * Get total skill points allocated
   * @returns {number} Total points
   */
  getTotalSkillPoints() {
    return Object.values(this.skillPoints).reduce((sum, points) => sum + points, 0);
  }

  // ===== STATE MANAGEMENT METHODS =====

  /**
   * Set character level
   * @param {number} level - New character level
   */
  setCharacterLevel(level) {
    this.level = level;
    this.maxLevels = {}; // Clear cache
  }

  /**
   * Export character state for saving
   * @returns {Object} Character state
   */
  exportState() {
    return {
      level: this.level,
      className: this.className,
      skillPoints: { ...this.skillPoints }
    };
  }

  /**
   * Import character state from save
   * @param {Object} state - Saved character state
   */
  importState(state) {
    this.level = state.level || Character.DEFAULT_LEVEL;
    this.className = state.className || null;
    this.skillPoints = { ...state.skillPoints } || {};
    this.maxLevels = {};
  }

  // ===== OSKILLS MANAGEMENT METHODS =====

  /**
   * Get all oSkills in simplified format (ID and points only)
   * @returns {Object} Object with skill IDs as keys and points as values
   */
  getAllOSkills() {
    const oSkillsObj = {};
    this.oSkills.forEach(oskill => {
      // Use skillId if available, otherwise fall back to skillName
      const key = oskill.skillId || oskill.skillName;
      oSkillsObj[key] = oskill.points;
    });
    return oSkillsObj;
  }

  /**
   * Get points for a specific oSkill
   * @param {string} skillName - Internal skill name
   * @returns {number} Points allocated (0 if not found)
   */
  getOSkillPoints(skillIdOrName) {
    const oskill = this.oSkills.find(s => 
      s.skillId === parseInt(skillIdOrName) || s.skillName === skillIdOrName
    );
    return oskill ? oskill.points : 0;
  }

  /**
   * Add an oSkill or increment if it exists
   * @param {number} skillId - Database skill ID
   * @param {string} displayName - Display name
   * @param {string} skillName - Internal skill name
   * @param {string} image - Image filename
   * @param {string} className - Class name
   * @param {boolean} hasDetails - Whether skill has details
   * @param {string} description - Skill description
   * @param {string} skillEffect - Skill effect
   */
  addOSkill(skillId, displayName, skillName, image, className, hasDetails = false, description = null, skillEffect = null) {
    const existing = this.oSkills.find(s => s.skillName === skillName);
    if (existing) {
      existing.points++;
    } else {
      const oskillData = {
        skillId,
        displayName,
        skillName,
        image,
        className,
        points: 1,
        hasDetails,
        description,
        skillEffect
      };
      
      this.oSkills.push(oskillData);
    }
    
    // Dispatch event for UI updates
    window.dispatchEvent(new CustomEvent('oskillsUpdated'));
  }

  /**
   * Remove an oSkill
   * @param {string} skillName - Internal skill name
   */
  removeOSkill(skillIdOrName) {
    const index = this.oSkills.findIndex(s => 
      s.skillId === parseInt(skillIdOrName) || s.skillName === skillIdOrName
    );
    if (index > -1) {
      this.oSkills.splice(index, 1);
      window.dispatchEvent(new CustomEvent('oskillsUpdated'));
    }
  }

  /**
   * Change oSkill points (positive to add, negative to remove)
   * @param {string} skillName - Internal skill name
   * @param {number} amount - Amount to change (can be negative)
   */
  changeOSkillPoints(skillIdOrName, amount) {
    // Find skill by ID or name
    const skill = this.oSkills.find(s => 
      s.skillId === parseInt(skillIdOrName) || s.skillName === skillIdOrName
    );
    if (!skill) return;
    
    const newPoints = skill.points + amount;
    
    // Apply 150 level cap for oSkills
    if (newPoints > 150) {
      skill.points = 150;
    } else {
      skill.points = newPoints;
    }
    
    // Remove skill if points drop to 0 or below
    if (skill.points <= 0) {
      this.removeOSkill(skillIdOrName);
    } else {
      window.dispatchEvent(new CustomEvent('oskillsUpdated'));
    }
  }

  /**
   * Clear all oSkills
   */
  clearOSkills() {
    this.oSkills = [];
    window.dispatchEvent(new CustomEvent('oskillsUpdated'));
  }

  /**
   * Set all oSkills (for loading builds)
   * @param {Array|Object} oSkills - Array of oSkill objects (old format) or Object with skill IDs/names as keys (new format)
   */
  setAllOSkills(oSkills) {
    if (!oSkills) {
      this.oSkills = [];
    } else if (Array.isArray(oSkills)) {
      // Old format: array of objects with full metadata
      this.oSkills = oSkills;
    } else if (typeof oSkills === 'object') {
      // New format: object with skill IDs or names as keys and points as values
      this.oSkills = [];
      Object.entries(oSkills).forEach(([skillIdOrName, points]) => {
        if (points > 0) {
          this.oSkills.push({
            skillId: /^\d+$/.test(skillIdOrName) ? parseInt(skillIdOrName) : null,
            skillName: /^\d+$/.test(skillIdOrName) ? null : skillIdOrName,
            points
          });
        }
      });
    }
    window.dispatchEvent(new CustomEvent('oskillsUpdated'));
  }
}
