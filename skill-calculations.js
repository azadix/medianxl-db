/**
 * Skill Calculations
 * Handles dynamic calculations for skill max levels and other modifiers
 */

import { CHARACTER_CONFIG } from './character-config.js';

/**
 * Max Level Modifier Rules
 * Each rule defines how a skill affects max levels
 * Uses skill names instead of IDs for better maintainability
 */
const MAX_LEVEL_MODIFIERS = [
  {
    sourceSkillName: 'specialization', // Specialization
    type: 'affected_by_specialization',
    pointsDivisor: 2, // +1 max level for every 2 points
    description: 'Increases max level of all Active Skills by 1 for each 2 points',
    calculateBonus: function(sourceSkillLevel, targetSkillData) {
      // Only affects skills marked as affected_by_specialization
      if (targetSkillData.affected_by_specialization) {
        return Math.floor(sourceSkillLevel / this.pointsDivisor);
      }
      return 0;
    }
  },
  {
    sourceSkillName: null, // Barkskin doesn't need a source skill
    type: 'self_character_level',
    targetSkillName: 'barkskin', // itself
    characterLevelDivisor: 5, // +1 max level for every 5 character levels
    description: 'Increases its own max level by 1 for every 4 character levels',
    calculateBonus: function(sourceSkillLevel, targetSkillData, characterLevel = CHARACTER_CONFIG.DEFAULT_LEVEL) {
      // Only affects itself, based on character level only
      if (targetSkillData.skill_name === this.targetSkillName) {
        // BUG: i think that this skill is bugged in game since the scaling starts counting from level 1 and not 10
        // should be copied from other ones when the mod fixes it
        return Math.floor(characterLevel / this.characterLevelDivisor);
      }
      return 0;
    }
  },
  {
    sourceSkillName: 'noxious_mastery', // Noxious Mastery
    type: 'affects_specific_skill',
    targetSkillName: 'curare', // Curare
    pointsDivisor: 2, // +1 max level for each 2 points
    description: 'Increases Curare max level by 1 for each 2 points',
    calculateBonus: function(sourceSkillLevel, targetSkillData) {
      // Only affects Curare
      if (targetSkillData.skill_name === this.targetSkillName) {
        return Math.floor(sourceSkillLevel / this.pointsDivisor);
      }
      return 0;
    }
  },
  {
    sourceSkillName: null, // Sanctity doesn't need a source skill
    type: 'self_character_level',
    targetSkillName: 'sanctity', // itself
    characterLevelDivisor: 5, // +1 max level for every 5 character levels
    maxBonus: 5, // Maximum of 5 bonus levels
    description: 'Increases its own max level by 1 for every 5 character levels (max +5)',
    calculateBonus: function(sourceSkillLevel, targetSkillData, characterLevel = CHARACTER_CONFIG.DEFAULT_LEVEL) {
      // Only affects itself, based on character level only
      if (targetSkillData.skill_name === this.targetSkillName) {
        const bonus = Math.floor(characterLevel / this.characterLevelDivisor);
        return Math.min(bonus, this.maxBonus);
      }
      return 0;
    }
  },
  {
    sourceSkillName: null, // Consecration doesn't need a source skill
    type: 'self_character_level',
    targetSkillName: 'consecration', // itself
    characterLevelDivisor: 5, // +1 max level for every 5 character levels
    maxBonus: 5, // Maximum of 5 bonus levels
    description: 'Increases its own max level by 1 for every 5 character levels (max +5)',
    calculateBonus: function(sourceSkillLevel, targetSkillData, characterLevel = CHARACTER_CONFIG.DEFAULT_LEVEL) {
      // Only affects itself, based on character level only
      if (targetSkillData.skill_name === this.targetSkillName) {
        const bonus = Math.floor(characterLevel / this.characterLevelDivisor);
        return Math.min(bonus, this.maxBonus);
      }
      return 0;
    }
  },
  {
    sourceSkillName: null, // Holy Fire doesn't need a source skill
    type: 'self_character_level',
    targetSkillName: 'holy_fire', // itself
    characterLevelDivisor: 2, // +1 max level for every 2 character levels
    maxBonus: 25, // Maximum of 25 bonus levels
    description: 'Increases its own max level by 1 for every 2 character levels (max +25)',
    calculateBonus: function(sourceSkillLevel, targetSkillData, characterLevel = CHARACTER_CONFIG.DEFAULT_LEVEL) {
      // Only affects itself, based on character level only
      if (targetSkillData.skill_name === this.targetSkillName) {
        const bonus = Math.floor(characterLevel / this.characterLevelDivisor);
        return Math.min(bonus, this.maxBonus);
      }
      return 0;
    }
  },
  {
    sourceSkillName: 'elemental_command', // Elemental Command needs at least 1 point to activate
    type: 'affects_multiple_skills_by_character_level',
    targetSkillNames: ['trinity_arrow', 'barrage'], // Trinity Arrow and Barrage
    characterLevelDivisor: 4, // +1 max level for every 4 character levels
    maxBonus: 20, // Maximum of 20 bonus levels
    startLevel: 15, // Skill becomes available at level 15
    description: 'When active, increases Trinity Arrow and Barrage max level by 1 for every 4 character levels',
    calculateBonus: function(sourceSkillLevel, targetSkillData, characterLevel = CHARACTER_CONFIG.DEFAULT_LEVEL) {
      // Only applies if Elemental Command has at least 1 point invested
      if (sourceSkillLevel > 0 && this.targetSkillNames.includes(targetSkillData.skill_name)) {
        const effectiveLevel = Math.max(0, characterLevel - this.startLevel);
        return Math.min(Math.floor(effectiveLevel / this.characterLevelDivisor), this.maxBonus);;
      }
      return 0;
    }
  },
  {
    sourceSkillName: null, // Spiritual Alignment doesn't need a source skill
    type: 'self_character_level',
    targetSkillName: 'spiritual_alignment', // itself
    characterLevelDivisor: 4, // +1 max level for every 4 character levels
    startLevel: 11, // Skill becomes available at level 15
    description: 'Increases its own max level by 1 for every 4 character levels (starting from level 15)',
    calculateBonus: function(sourceSkillLevel, targetSkillData, characterLevel = CHARACTER_CONFIG.DEFAULT_LEVEL) {
      // Only affects itself, based on character level only
      if (targetSkillData.skill_name === this.targetSkillName) {
        const effectiveLevel = Math.max(0, characterLevel - this.startLevel);
        return Math.floor(effectiveLevel / this.characterLevelDivisor);
      }
      return 0;
    }
  },
  {
    sourceSkillName: null, // Lioness doesn't need a source skill
    type: 'self_tab_points',
    targetSkillName: 'lioness', // itself
    tabSkills: ['fend', 'great_hunt', 'hunters_prowess', 'hyena_strike', 'pounce', 'takedown'], // All Spear tab skills except Lioness
    pointsDivisor: 3, // +1 max level for every 3 points in Spear tab
    description: 'Increases its own max level by 1 for every 3 points spent on other skills in Spear tab',
    calculateBonus: function(sourceSkillLevel, targetSkillData, characterLevel = CHARACTER_CONFIG.DEFAULT_LEVEL, skillLevels = {}) {
      // Only affects Lioness itself
      if (targetSkillData.skill_name === this.targetSkillName) {
        // Count total points in Spear tab (excluding Lioness)
        let totalTabPoints = 0;
        for (const skillName of this.tabSkills) {
          totalTabPoints += skillLevels[skillName] || 0;
        }
        return Math.floor(totalTabPoints / this.pointsDivisor);
      }
      return 0;
    }
  },
  {
    sourceSkillName: 'galvanism', // Galvanism needs at least 1 point to activate
    type: 'affects_specific_skill_by_character_level',
    targetSkillName: 'iron_spiral', // Iron Spiral
    characterLevelThreshold: 90, // Start counting above level 90
    characterLevelDivisor: 5, // +2 max levels for every 5 character levels above 90
    bonusPerIncrement: 2, // +2 max levels per increment
    description: 'When active, increases Iron Spiral max level by 2 for every 5 character levels above 90',
    calculateBonus: function(sourceSkillLevel, targetSkillData, characterLevel = CHARACTER_CONFIG.DEFAULT_LEVEL) {
      // Only applies if Galvanism has at least 1 point invested
      if (sourceSkillLevel > 0 && targetSkillData.skill_name === this.targetSkillName) {
        if (characterLevel > this.characterLevelThreshold) {
          const effectiveLevel = characterLevel - this.characterLevelThreshold;
          const increments = Math.floor(effectiveLevel / this.characterLevelDivisor);
          return increments * this.bonusPerIncrement;
        }
      }
      return 0;
    }
  },
];

/**
 * Calculate the effective max level for a skill
 * @param {number} skillId - The skill ID to calculate max level for
 * @param {Object} skillLevels - Object mapping skill_name to current skill level
 * @param {number} characterLevel - Current character level (by default we assume max level)
 * @param {Object} db - SQL.js database instance
 * @returns {number} The calculated max level
 */
export function calculateMaxLevel(skillId, skillLevels = {}, characterLevel = CHARACTER_CONFIG.DEFAULT_LEVEL, db = null) {
  if (!db) {
    return 0;
  }

  // Get base max level data and skill name for the target skill
  const stmt = db.prepare(`
    SELECT s.name, sml.base_max_level, sml.affected_by_specialization, sml.can_add_points
    FROM skill_max_levels sml
    JOIN skills s ON s.id = sml.skill_id
    WHERE sml.skill_id = ?
  `);
  stmt.bind([skillId]);
  
  if (!stmt.step()) {
    stmt.free();
    
    // Check if this skill is innate by looking at the skill name
    // Innate skills shouldn't have max level data, so this is expected
    const skillStmt = db.prepare('SELECT name FROM skills WHERE id = ?');
    skillStmt.bind([skillId]);
    if (skillStmt.step()) {
      const skillName = skillStmt.get()[0];
      skillStmt.free();
      
      // Only log if it's not an innate skill (innate skills shouldn't have max level data)
      if (!skillName.includes('innate') && !skillName.includes('Innate')) {
        console.log(`calculateMaxLevel: No max level data found for skillId ${skillId} (${skillName})`);
      }
    } else {
      skillStmt.free();
      console.log(`calculateMaxLevel: Skill ${skillId} does not exist`);
    }
    
    return 0; // No max level data found
  }
  
  const [skill_name, base_max_level, affected_by_specialization, can_add_points] = stmt.get();
  stmt.free();
  
  const targetSkillData = {
    skill_name,
    base_max_level,
    affected_by_specialization: affected_by_specialization === 1,
    can_add_points: can_add_points === 1
  };

  // Start with base max level
  let effectiveMaxLevel = base_max_level;

  // Apply all applicable modifiers
  for (const modifier of MAX_LEVEL_MODIFIERS) {
    // For character-level based modifiers, sourceSkillName can be null
    const sourceSkillLevel = modifier.sourceSkillName ? (skillLevels[modifier.sourceSkillName] || 0) : 0;
    
    // Calculate bonus from this modifier
    const bonus = modifier.calculateBonus(sourceSkillLevel, targetSkillData, characterLevel, skillLevels);
    effectiveMaxLevel += bonus;
  }

  
  return effectiveMaxLevel;
}

/**
 * Devotion System
 * Devotions are mutually exclusive paths for Paladin and Amazon
 */

// Define devotion types
export const DEVOTION_TYPES = {
  NONE: 'none',
  // Paladin devotions
  HOLY: 'holy',
  NEUTRAL: 'neutral',
  UNHOLY: 'unholy',
  // Amazon devotions
  BOW: 'bow',
  JAVELIN: 'javelin',
  SPEAR: 'spear',
  STORM: 'storm',
  BLOOD: 'blood'
};

// Define which tabs belong to which devotion for Paladin (class_id = 5)
const PALADIN_DEVOTION_TABS = {
  [DEVOTION_TYPES.HOLY]: [30, 31],     // Templar (30), Incarnation (31)
  [DEVOTION_TYPES.NEUTRAL]: [32],      // Nephalem (32)
  [DEVOTION_TYPES.UNHOLY]: [33, 34]    // Ritualist (33), Warlock (34)
};

// Define which tabs belong to which devotion for Amazon (class_id = 2)
const AMAZON_DEVOTION_TABS = {
  [DEVOTION_TYPES.BOW]: [2],           // Bow (2)
  [DEVOTION_TYPES.JAVELIN]: [3],       // Javelin (3)
  [DEVOTION_TYPES.SPEAR]: [4],         // Spear (4)
  [DEVOTION_TYPES.STORM]: [5],         // Storm (5)
  [DEVOTION_TYPES.BLOOD]: [6]          // Blood (6)
};

// Define which ultimate skills belong to which devotion (Paladin only)
const PALADIN_DEVOTION_ULTIMATE_SKILLS = {
  'dragons_blessing': DEVOTION_TYPES.HOLY,
  'resurrect': DEVOTION_TYPES.NEUTRAL,
  'superbeast': DEVOTION_TYPES.UNHOLY
};

/**
 * Get the devotion type for a skill based on its tab or name
 * @param {number} skillId - The skill ID
 * @param {Object} db - SQL.js database instance
 * @returns {string} The devotion type (DEVOTION_TYPES constant)
 */
export function getSkillDevotion(skillId, db = null) {
  if (!db) return DEVOTION_TYPES.NONE;

  // Get skill data
  const stmt = db.prepare(`
    SELECT s.name, s.tab_index, s.class_id
    FROM skills s
    WHERE s.id = ?
  `);
  stmt.bind([skillId]);
  
  if (!stmt.step()) {
    stmt.free();
    return DEVOTION_TYPES.NONE;
  }
  
  const [skillName, tabIndex, classId] = stmt.get();
  stmt.free();
  
  // Handle Paladin devotion system (class_id = 5)
  if (classId === 5) {
    // Check if this is a Paladin ultimate skill
    if (PALADIN_DEVOTION_ULTIMATE_SKILLS[skillName]) {
      return PALADIN_DEVOTION_ULTIMATE_SKILLS[skillName];
    }

    // Check if the tab belongs to a Paladin devotion
    for (const [devotion, tabs] of Object.entries(PALADIN_DEVOTION_TABS)) {
      if (tabs.includes(tabIndex)) {
        return devotion;
      }
    }
  }
  
  // Handle Amazon devotion system (class_id = 2)
  if (classId === 2) {
    // Check if the tab belongs to an Amazon devotion
    for (const [devotion, tabs] of Object.entries(AMAZON_DEVOTION_TABS)) {
      if (tabs.includes(tabIndex)) {
        return devotion;
      }
    }
    // Note: Amazon ultimates are NOT restricted by devotion
  }

  return DEVOTION_TYPES.NONE;
}

/**
 * Determine the current devotion based on allocated skills
 * @param {Object} skillLevels - Object mapping skill_name to current skill level
 * @param {Object} db - SQL.js database instance
 * @returns {string} The current devotion type (DEVOTION_TYPES constant)
 */
export function getCurrentDevotion(skillLevels = {}, db = null) {
  if (!db) return DEVOTION_TYPES.NONE;

  // Check all skills with points allocated
  for (const [skillName, level] of Object.entries(skillLevels)) {
    if (level > 0) {
      // Get skill ID from name
      const stmt = db.prepare(`
        SELECT id FROM skills WHERE name = ?
      `);
      stmt.bind([skillName]);
      
      if (stmt.step()) {
        const [skillId] = stmt.get();
        stmt.free();
        
        const devotion = getSkillDevotion(skillId, db);
        if (devotion !== DEVOTION_TYPES.NONE) {
          return devotion; // First devotion found locks the character
        }
      } else {
        stmt.free();
      }
    }
  }

  return DEVOTION_TYPES.NONE;
}

/**
 * Check if a skill can be allocated based on devotion restrictions
 * @param {number} skillId - The skill ID to check
 * @param {Object} skillLevels - Object mapping skill_name to current skill level
 * @param {Object} db - SQL.js database instance
 * @returns {Object} { canAllocate: boolean, reason: string }
 */
export function checkDevotionRestriction(skillId, skillLevels = {}, db = null) {
  if (!db) {
    return { canAllocate: true, reason: '' };
  }

  const currentDevotion = getCurrentDevotion(skillLevels, db);
  const skillDevotion = getSkillDevotion(skillId, db);

  // If no devotion is active or skill has no devotion, allow allocation
  if (currentDevotion === DEVOTION_TYPES.NONE || skillDevotion === DEVOTION_TYPES.NONE) {
    return { canAllocate: true, reason: '' };
  }

  // If devotions match, allow allocation
  if (currentDevotion === skillDevotion) {
    return { canAllocate: true, reason: '' };
  }

  // Devotions conflict - prevent allocation
  const devotionNames = {
    [DEVOTION_TYPES.HOLY]: 'Holy Devotion',
    [DEVOTION_TYPES.NEUTRAL]: 'Neutral Devotion',
    [DEVOTION_TYPES.UNHOLY]: 'Unholy Devotion',
    [DEVOTION_TYPES.BOW]: 'Bow Devotion',
    [DEVOTION_TYPES.JAVELIN]: 'Javelin Devotion',
    [DEVOTION_TYPES.SPEAR]: 'Spear Devotion',
    [DEVOTION_TYPES.STORM]: 'Storm Devotion',
    [DEVOTION_TYPES.BLOOD]: 'Blood Devotion'
  };

  return {
    canAllocate: false,
    reason: `Cannot allocate skill: You are locked into ${devotionNames[currentDevotion]}. This skill requires ${devotionNames[skillDevotion]}.`
  };
}

/**
 * Get the devotion name for display
 * @param {string} devotionType - The devotion type constant
 * @returns {string} Display name
 */
export function getDevotionDisplayName(devotionType) {
  const names = {
    [DEVOTION_TYPES.NONE]: 'No Devotion',
    [DEVOTION_TYPES.HOLY]: 'Holy Devotion',
    [DEVOTION_TYPES.NEUTRAL]: 'Neutral Devotion',
    [DEVOTION_TYPES.UNHOLY]: 'Unholy Devotion',
    [DEVOTION_TYPES.BOW]: 'Bow Devotion',
    [DEVOTION_TYPES.JAVELIN]: 'Javelin Devotion',
    [DEVOTION_TYPES.SPEAR]: 'Spear Devotion',
    [DEVOTION_TYPES.STORM]: 'Storm Devotion',
    [DEVOTION_TYPES.BLOOD]: 'Blood Devotion'
  };
  return names[devotionType] || 'Unknown';
}

