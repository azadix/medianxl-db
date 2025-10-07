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
      if (targetSkillData.skill_name === 'barkskin') {
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
      if (targetSkillData.skill_name === 'curare') {
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
      if (targetSkillData.skill_name === 'sanctity') {
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
      if (targetSkillData.skill_name === 'consecration') {
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
      if (targetSkillData.skill_name === 'holy_fire') {
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
    description: 'When active, increases Trinity Arrow and Barrage max level by 1 for every 4 character levels',
    calculateBonus: function(sourceSkillLevel, targetSkillData, characterLevel = CHARACTER_CONFIG.DEFAULT_LEVEL) {
      // Only applies if Elemental Command has at least 1 point invested
      if (sourceSkillLevel > 0 && this.targetSkillNames.includes(targetSkillData.skill_name)) {
        return Math.floor(characterLevel / this.characterLevelDivisor);
      }
      return 0;
    }
  }
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
    const bonus = modifier.calculateBonus(sourceSkillLevel, targetSkillData, characterLevel);
    effectiveMaxLevel += bonus;
  }

  return effectiveMaxLevel;
}

/**
 * Get all modifiers that affect a specific skill
 * @param {number} skillId - The skill ID to check
 * @param {Object} db - SQL.js database instance
 * @returns {Array} Array of applicable modifiers with descriptions
 */
export function getModifiersForSkill(skillId, db = null) {
  if (!db) return [];

  // Get skill data with skill name
  const stmt = db.prepare(`
    SELECT s.name, sml.base_max_level, sml.affected_by_specialization, sml.can_add_points
    FROM skill_max_levels sml
    JOIN skills s ON s.id = sml.skill_id
    WHERE sml.skill_id = ?
  `);
  stmt.bind([skillId]);
  
  if (!stmt.step()) {
    stmt.free();
    return [];
  }
  
  const [skill_name, base_max_level, affected_by_specialization, can_add_points] = stmt.get();
  stmt.free();
  
  const targetSkillData = {
    skill_name,
    base_max_level,
    affected_by_specialization: affected_by_specialization === 1,
    can_add_points: can_add_points === 1
  };

  // Find applicable modifiers
  const applicableModifiers = [];
  
  for (const modifier of MAX_LEVEL_MODIFIERS) {
    // Test if this modifier affects the skill (with 1 point as test)
    const testBonus = modifier.calculateBonus(1, targetSkillData, 99);
    if (testBonus > 0) {
      applicableModifiers.push({
        sourceSkillName: modifier.sourceSkillName,
        type: modifier.type,
        description: modifier.description,
        pointsDivisor: modifier.pointsDivisor,
        characterLevelDivisor: modifier.characterLevelDivisor
      });
    }
  }

  return applicableModifiers;
}

/**
 * Add a new max level modifier rule
 * @param {Object} modifierConfig - Configuration for the new modifier
 */
export function addMaxLevelModifier(modifierConfig) {
  MAX_LEVEL_MODIFIERS.push(modifierConfig);
}

/**
 * Get all max level modifiers
 * @returns {Array} All modifier rules
 */
export function getAllMaxLevelModifiers() {
  return MAX_LEVEL_MODIFIERS;
}

/**
 * Format max level display with modifiers
 * @param {number} baseMaxLevel - Base max level
 * @param {number} effectiveMaxLevel - Calculated effective max level
 * @returns {string} Formatted string
 */
export function formatMaxLevelDisplay(baseMaxLevel, effectiveMaxLevel) {
  if (effectiveMaxLevel === baseMaxLevel) {
    return `${baseMaxLevel}`;
  }
  return `${baseMaxLevel} (+${effectiveMaxLevel - baseMaxLevel}) = ${effectiveMaxLevel}`;
}

