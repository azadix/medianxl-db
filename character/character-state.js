/**
 * Character State Management
 * Manages character build including skill points, level, and prerequisites
 */

import Character from './Character.js';

// Re-export getBaseSkillPoints for use in other modules
export { Character };
import { checkDevotionRestriction, calculateMaxLevel } from '../skills/skill-calculations.js';
import { getDatabase } from '../tree/tree-data.js';
import Mastery from '../skills/Mastery.js';
import Coven from '../skills/Coven.js';
import Proficiency from '../skills/Proficiency.js';
import Ultimate from '../skills/Ultimate.js';
import Paragon from '../skills/Paragon.js';

// Tree skills cache: maps tab_index (from classTabs.id) to array of skill names
let treeSkillsCache = {};

/**
 * Build cache of skills per tree for efficient tree() function
 * This maps tab_index values to arrays of skill names in that tree
 * @param {Object} db - SQL.js database instance
 */
export function buildTreeSkillsCache(db) {
  treeSkillsCache = {};
  
  if (!db) return;
  
  try {
    const stmt = db.prepare(`
      SELECT s.name, s.tab_index
      FROM skills s
      WHERE s.tab_index IS NOT NULL
    `);
    
    while (stmt.step()) {
      const row = stmt.get();
      const skillName = row[0];
      const tabIndex = row[1];
      
      if (!treeSkillsCache[tabIndex]) {
        treeSkillsCache[tabIndex] = [];
      }
      treeSkillsCache[tabIndex].push(skillName);
    }
    stmt.free();
  } catch (error) {
    console.error('Error building tree skills cache:', error);
  }
}

/**
 * Get the tree skills cache
 * @returns {Object} Cache mapping tab_index to array of skill names
 */
export function getTreeSkillsCache() {
  return treeSkillsCache;
}

// Skills that use OR logic for skill_level prerequisites (instead of AND)
// Format: skill display name
const OR_PREREQUISITE_SKILLS = [
  // Add skill display names here that require only ONE of their skill prerequisites
  // Example: 'Life From Death' requires ONE of: Voodoo Practice OR Debilitating Concoction
  "Life From Death",
  "Bloodthirst",
  "Nightwalker"
];

// Prerequisite display order (lower number = shown first)
const PREREQUISITE_ORDER = {
  'skill_level': 1,        // Required skills (e.g., "Requires Fire Bolt (5)")
  'skill_blocked_by': 2,   // Blocked by skills (e.g., "Cannot allocate while X has points")
  'tree_points': 3,        // Tab points (e.g., "Requires 10 points in Warmonger tree")
  'character_level': 4     // Character level (currently skipped)
};

// Character instance (singleton)
let characterInstance = null;

/**
 * Initialize character state for a class
 * @param {string} className - Class name
 * @param {number} level - Character level (for max level calculations and skill point pool)
 */
export function initializeCharacter(className, level = Character.DEFAULT_LEVEL) {
  characterInstance = new Character(className, level);
  return characterInstance;
}

/**
 * Get the current character instance
 * @returns {Character|null} Character instance
 */
export function getCharacterInstance() {
  return characterInstance;
}

/**
 * Set character level
 * @param {number} level - New character level
 */
export function setCharacterLevel(level) {
  if (!characterInstance) {
    console.warn('setCharacterLevel: Character instance not initialized');
    return false;
  }
  return characterInstance.setCharacterLevel(level);
}

/**
 * Get current character level
 * @returns {number} Character level
 */
export function getCharacterLevel() {
  return characterInstance ? characterInstance.level : Character.DEFAULT_LEVEL;
}

/**
 * Get skill points for a skill
 * @param {string} skillName - Skill name
 * @returns {number} Points allocated
 */
export function getSkillPoints(skillName) {
  return characterInstance ? characterInstance.getSkillPoints(skillName) : 0;
}

/**
 * Get all skill points (regular skills only, excludes oSkills)
 * @returns {Object} Map of skill_name -> points
 */
export function getAllSkillPoints() {
  return characterInstance ? characterInstance.getAllSkillPoints() : {};
}

/**
 * Get all regular skill points explicitly (excludes oSkills)
 * This ensures oSkills never affect regular skill calculations
 * @returns {Object} Map of skill_name -> points (regular skills only)
 */
export function getRegularSkillPoints() {
  // getAllSkillPoints already excludes oSkills since they're stored separately
  // But this function makes the intent explicit
  return getAllSkillPoints();
}

/**
 * Get all skill points with skill IDs as keys (for saving builds)
 * @returns {Object} Map of skill_id -> points
 */
export function getAllSkillPointsById() {
  if (!characterInstance) return {};
  
  const skillPoints = characterInstance.getAllSkillPoints();
  const skillPointsById = {};
  
  // Convert skill names to skill IDs
  const db = getDatabase();
  if (db) {
    for (const [skillName, points] of Object.entries(skillPoints)) {
      if (points > 0) {
        try {
          const stmt = db.prepare('SELECT id FROM skills WHERE name = ?');
          stmt.bind([skillName]);
          if (stmt.step()) {
            const skillId = stmt.get()[0];
            skillPointsById[skillId] = points;
          }
          stmt.free();
        } catch (error) {
          console.warn('Could not look up skill ID for:', skillName);
          // Fallback: use skill name as key
          skillPointsById[skillName] = points;
        }
      }
    }
  } else {
    // Fallback: use skill names as keys if database not available
    return skillPoints;
  }
  
  return skillPointsById;
}

/**
 * Set all skill points (used for loading builds)
 * @param {Object} skillPoints - Map of skill_name -> points
 */
export function setAllSkillPoints(skillPoints) {
  if (characterInstance) {
    characterInstance.setAllSkillPoints(skillPoints);
  }
}

/**
 * Set all skill points from skill IDs (used for loading builds)
 * @param {Object} skillPointsById - Map of skill_id -> points
 */
export function setAllSkillPointsById(skillPointsById) {
  if (!characterInstance) return;
  
  const skillPoints = {};
  
  // Convert skill IDs to skill names
  const db = getDatabase();
  if (db) {
    for (const [skillIdOrName, points] of Object.entries(skillPointsById)) {
      if (points > 0) {
        // Check if this is a numeric skill ID or a skill name
        if (/^\d+$/.test(skillIdOrName)) {
          // It's a skill ID, look up the skill name
          try {
            const stmt = db.prepare('SELECT name FROM skills WHERE id = ?');
            stmt.bind([parseInt(skillIdOrName)]);
            if (stmt.step()) {
              const skillName = stmt.get()[0];
              skillPoints[skillName] = points;
            }
            stmt.free();
          } catch (error) {
            console.warn('Could not look up skill name for ID:', skillIdOrName);
          }
        } else {
          // It's a skill name, use it directly (backward compatibility)
          skillPoints[skillIdOrName] = points;
        }
      }
    }
  } else {
    // Fallback: use the data as-is if database not available
    skillPoints = skillPointsById;
  }
  
  characterInstance.setAllSkillPoints(skillPoints);
}

/**
 * Calculate total quest skill points from completed quests
 * @param {number} characterLevel - Character level to check against quest requirements
 * @returns {number} Total quest skill points
 */
export function getTotalQuestSkillPoints(characterLevel = Character.MAX_LEVEL) {
  return characterInstance ? characterInstance.getTotalQuestSkillPoints(characterLevel) : 0;
}

/**
 * Calculate total available skill points based on max level and quests completed
 * Note: Always uses MAX_LEVEL for skill point pool, not the user's character level input
 * @param {number} characterLevel - Character level to check quest requirements against
 * @returns {number} Total available skill points
 */
export function getAvailableSkillPoints(characterLevel = Character.MAX_LEVEL) {
  return characterInstance ? characterInstance.getAvailableSkillPoints(characterLevel) : 0;
}

/**
 * Calculate total spent skill points
 * @returns {number} Total points spent
 */
export function getSpentSkillPoints() {
  return characterInstance ? characterInstance.getSpentSkillPoints() : 0;
}

/**
 * Calculate remaining skill points
 * @returns {number} Points remaining to spend
 */
export function getRemainingSkillPoints() {
  return characterInstance ? characterInstance.getRemainingSkillPoints() : 0;
}

/**
 * Calculate minimum character level required for current skill allocation
 * Takes into account spent skill points, quest rewards, and skill prerequisites
 * @param {Object} db - SQL.js database instance (optional)
 * @returns {number} Minimum character level needed
 */
export function getMinimumRequiredLevel(db = null) {
  return characterInstance ? characterInstance.getMinimumRequiredLevel(db) : Character.MIN_LEVEL;
}

/**
 * Check if prerequisites are met for a skill
 * @param {Object} skill - Skill object with prerequisites array
 * @param {Array} allSkills - Optional array of all skills for tree points validation
 * @returns {Object} { met: boolean, reasons: string[] }
 */
export function checkPrerequisites(skill, allSkills = []) {
  if (!skill.prerequisites || skill.prerequisites.length === 0) {
    return { met: true, reasons: [] };
  }

  // Collect reasons with their types for sorting
  const reasonsWithTypes = [];
  const useOrLogic = OR_PREREQUISITE_SKILLS.includes(skill.name);
  
  // Separate skill_level prerequisites from others
  const skillLevelPrereqs = [];
  const otherPrereqs = [];
  
  for (const prereq of skill.prerequisites) {
    const [type] = prereq.split(':');
    if (type === 'skill_level') {
      skillLevelPrereqs.push(prereq);
    } else {
      otherPrereqs.push(prereq);
    }
  }
  
  // Check non-skill_level prerequisites (always use AND logic)
  for (const prereq of otherPrereqs) {
    const [type, value, target] = prereq.split(':');
    
    // Skip character level checks - users can freely allocate points
    // Character level only affects max level calculations, not allocation
    if (type === 'character_level') {
      continue; // Skip level requirement checks
    } else if (type === 'skill_blocked_by') {
      // Blocked if target skill has more than specified points (typically 0)
      const maxAllowedPoints = parseInt(value, 10);
      const targetSkillName = target.toLowerCase().replace(/'/g, '').replace(/\s+/g, '_');
      const currentPoints = getSkillPoints(targetSkillName);
      
      if (currentPoints > maxAllowedPoints) {
        reasonsWithTypes.push({
          type: 'skill_blocked_by',
          message: `You cannot learn this skill if you have points in ${target}.`
        });
      }
    } else if (type === 'tree_points') {
      // Tree points check - requires counting points spent in a specific tab
      const requiredPoints = parseInt(value, 10);
      const targetTabName = target; // e.g., "Warmonger"
      
      const pointsInTab = countPointsInTab(targetTabName, allSkills);
      
      if (pointsInTab < requiredPoints) {
        reasonsWithTypes.push({
          type: 'tree_points',
          message: `Requires ${requiredPoints} point${requiredPoints > 1 ? 's' : ''} in ${targetTabName} tree`
        });
      }
    }
  }
  
  // Check skill_level prerequisites
  if (skillLevelPrereqs.length > 0) {
    if (useOrLogic) {
      // OR logic: At least ONE prerequisite must be met
      let anyMet = false;
      const orReasons = [];
      
      for (const prereq of skillLevelPrereqs) {
        const [, value, target] = prereq.split(':');
        const requiredPoints = parseInt(value, 10);
        const targetSkillName = target.toLowerCase().replace(/'/g, '').replace(/\s+/g, '_');
        const currentPoints = getSkillPoints(targetSkillName);
        
        if (currentPoints >= requiredPoints) {
          anyMet = true;
          break;
        } else {
          if (requiredPoints === 1) {
            orReasons.push(`${target}`);
          } else {
            orReasons.push(`${requiredPoints} points in ${target}`);
          }
        }
      }
      
      if (!anyMet) {
        reasonsWithTypes.push({
          type: 'skill_level',
          message: `Requires one of: ${orReasons.join(' OR ')}`
        });
      }
    } else {
      // AND logic: ALL prerequisites must be met (default)
      for (const prereq of skillLevelPrereqs) {
        const [, value, target] = prereq.split(':');
        const requiredPoints = parseInt(value, 10);
        const targetSkillName = target.toLowerCase().replace(/'/g, '').replace(/\s+/g, '_');
        const currentPoints = getSkillPoints(targetSkillName);
        
        if (currentPoints < requiredPoints) {
          const message = requiredPoints === 1 
            ? `Requires ${target}` 
            : `Requires ${requiredPoints} points in ${target}`;
          
          reasonsWithTypes.push({
            type: 'skill_level',
            message: message
          });
        }
      }
    }
  }
  
  // Sort reasons by prerequisite order
  reasonsWithTypes.sort((a, b) => {
    const orderA = PREREQUISITE_ORDER[a.type] || 999;
    const orderB = PREREQUISITE_ORDER[b.type] || 999;
    return orderA - orderB;
  });
  
  // Extract just the messages
  const reasons = reasonsWithTypes.map(r => r.message);
  
  return { met: reasons.length === 0, reasons };
}

/**
 * Count total points spent in a specific tab/tree
 * @param {string} tabName - Name of the tab (e.g., "Warmonger")
 * @param {Array} allSkills - Array of all skills
 * @returns {number} Total points spent in the tab
 */
function countPointsInTab(tabName, allSkills) {
  let totalPoints = 0;
  
  if (!characterInstance) return totalPoints;
  
  // Iterate through all allocated skill points
  for (const [skillName, points] of Object.entries(characterInstance.skillPoints)) {
    // Find the skill in allSkills to get its tab
    const skill = allSkills.find(s => s.id === skillName);
    
    if (skill && skill.tabName === tabName) {
      totalPoints += points;
    }
  }
  
  return totalPoints;
}

/**
 * Check if adding a point to an Ultimate skill is allowed
 * Only one Ultimate skill per class can have points
 * @param {Object} skill - Skill to check
 * @param {Array} allSkills - Array of all skills
 * @returns {Object} { allowed: boolean, reason: string }
 */
function checkUltimateRestriction(skill, allSkills) {
  // Check if this skill has the Ultimate tag
  const isUltimate = skill.hasTag('Ultimate');
  
  if (!isUltimate) {
    return { allowed: true, reason: '' };
  }
  
  // Find all Ultimate skills from the same class
  const classUltimateSkills = allSkills.filter(s => 
    s.class === skill.class && 
    s.hasTag('Ultimate')
  );
  
  // Check if any other Ultimate skill from this class has points
  for (const ultimateSkill of classUltimateSkills) {
    if (ultimateSkill.id !== skill.id) {
      const points = getSkillPoints(ultimateSkill.id);
      if (points > 0) {
        return { 
          allowed: false, 
          reason: `Cannot add points to multiple Ultimate skills. ${ultimateSkill.name} already has points allocated.` 
        };
      }
    }
  }
  
  return { allowed: true, reason: '' };
}

/**
 * Check if adding a point to a Mastery skill is allowed
 * Maximum 3 different Mastery skills can have points
 * @param {Object} skill - Skill to check
 * @param {Array} allSkills - Array of all skills
 * @returns {Object} { allowed: boolean, reason: string }
 */
export function checkMasteryRestriction(skill, allSkills) {
  // Only apply mastery restrictions to mastery skills
  if (!Mastery.isMasterySkill(skill)) {
    return { allowed: true, reason: '' };
  }
  
  // If this skill already has points, it's allowed to add more
  const currentPoints = getSkillPoints(skill.id);
  if (currentPoints > 0) {
    return { allowed: true, reason: '' };
  }
  
  // Use Mastery class method for restriction checking
  const masterySkill = new Mastery(skill);
  return masterySkill.checkRestriction(allSkills);
}

/**
 * Check if adding a point to a Coven skill is allowed
 * Maximum 2 different exclusive Coven skills can have points (Sorceress only)
 * Only applies to: Living Flame, Warp Armor, Snow Queen, Vengeful Power
 * @param {Object} skill - Skill to check
 * @param {Array} allSkills - Array of all skills
 * @returns {Object} { allowed: boolean, reason: string }
 */
export function checkCovenRestriction(skill, allSkills) {
  // If this skill already has points, it's allowed to add more
  const currentPoints = getSkillPoints(skill.id);
  if (currentPoints > 0) {
    return { allowed: true, reason: '' };
  }
  
  // Use Coven class method for restriction checking
  const covenSkill = new Coven(skill);
  return covenSkill.checkRestriction(allSkills);
}

/**
 * Check if adding a point to a Proficiency skill is allowed
 * Maximum 2 different exclusive Proficiency skills can have points (Barbarian only)
 * Only applies to: Mighty Vigor, Aptitude, Pillage, Warder, Unyielding
 * @param {Object} skill - Skill to check
 * @param {Array} allSkills - Array of all skills
 * @returns {Object} { allowed: boolean, reason: string }
 */
export function checkProficiencyRestriction(skill, allSkills) {
  // If this skill already has points, it's allowed to add more
  const currentPoints = getSkillPoints(skill.id);
  if (currentPoints > 0) {
    return { allowed: true, reason: '' };
  }
  
  // Use Proficiency class method for restriction checking
  const proficiencySkill = new Proficiency(skill);
  return proficiencySkill.checkRestriction(allSkills);
}

/**
 * Add a point to a skill
 * @param {string} skillName - Skill name
 * @param {Object} skill - Skill object with prerequisites
 * @param {number} maxLevel - Maximum level for this skill
 * @param {Array} allSkills - Array of all skills for prerequisite validation
 * @returns {Object} { success: boolean, reason: string }
 */
export function addSkillPoint(skillName, skill, maxLevel, allSkills = [], skipEvent = false) {
  const currentPoints = getSkillPoints(skillName);
  
  // Check if at max level BEFORE adding the point
  // Note: For self-scaling skills, the caller should recalculate maxLevel in the loop
  if (currentPoints >= maxLevel) {
    return { success: false, reason: 'Skill is at maximum level' };
  }
  
  // Check if we have skill points available
  const remainingPoints = getRemainingSkillPoints();
  if (remainingPoints <= 0) {
    return { success: false, reason: 'No skill points remaining' };
  }
  
  // Check prerequisites (only for first point)
  if (currentPoints === 0) {
    const prereqCheck = checkPrerequisites(skill, allSkills);
    if (!prereqCheck.met) {
      return { success: false, reason: prereqCheck.reasons.join(', ') };
    }
    
    // Check Ultimate skill restriction (only when adding first point)
    const ultimateCheck = checkUltimateRestriction(skill, allSkills);
    if (!ultimateCheck.allowed) {
      return { success: false, reason: ultimateCheck.reason };
    }
    
    // Check Mastery skill restriction (only when adding first point)
    const masteryCheck = checkMasteryRestriction(skill, allSkills);
    if (!masteryCheck.allowed) {
      return { success: false, reason: masteryCheck.reason };
    }
    
    // Check Coven skill restriction (only when adding first point, Sorceress only)
    const covenCheck = checkCovenRestriction(skill, allSkills);
    if (!covenCheck.allowed) {
      return { success: false, reason: covenCheck.reason };
    }
    
    // Check Proficiency skill restriction (only when adding first point, Barbarian only)
    const proficiencyCheck = checkProficiencyRestriction(skill, allSkills);
    if (!proficiencyCheck.allowed) {
      return { success: false, reason: proficiencyCheck.reason };
    }
    
    // Check Devotion restriction (only when adding first point, Paladin and Amazon)
    const db = getDatabase();
    if (db && characterInstance) {
      const devotionCheck = checkDevotionRestriction(skill.skillId, characterInstance.skillPoints, db);
      if (!devotionCheck.canAllocate) {
        return { success: false, reason: devotionCheck.reason };
      }
    }
  }
  
  // Add the point
  if (characterInstance) {
    characterInstance.skillPoints[skillName] = currentPoints + 1;
    characterInstance.maxLevels = {}; // Clear cache as max levels may change
    
    // Auto-add required stats to input field
    autoAddStatsToInput(skill.skillId);
    
    // Dispatch event for UI updates (unless skipped for batch operations)
    if (!skipEvent) {
      window.dispatchEvent(new CustomEvent('skillPointsChanged', { 
        detail: { skillName, action: 'add' } 
      }));
    }
  }
  
  return { success: true, reason: '' };
}

/**
 * Add multiple skill points at once (for batch operations like shift-click)
 * @param {string} skillName - Skill name
 * @param {Object} skill - Skill object
 * @param {number} amount - Number of points to add
 * @param {Array} allSkills - Array of all skills
 * @param {Function} getMaxLevelFn - Function to get current max level (may change during batch)
 * @returns {Object} { success: boolean, pointsAdded: number, reason: string }
 */
export function addSkillPointsBatch(skillName, skill, amount, allSkills = [], getMaxLevelFn = null) {
  if (!characterInstance) {
    return { success: false, pointsAdded: 0, reason: 'Character not initialized' };
  }
  
  let pointsAdded = 0;
  const db = getDatabase();
  
  for (let i = 0; i < amount; i++) {
    const currentPoints = getSkillPoints(skillName);
    
    // Get current max level (may change for self-scaling skills)
    const maxLevel = getMaxLevelFn ? getMaxLevelFn() : (skill.baseMaxLevel || 150);
    
    // Check if at max level
    if (currentPoints >= maxLevel) {
      break; // Can't add more points
    }
    
    // Check if we have skill points available
    const remainingPoints = getRemainingSkillPoints();
    if (remainingPoints <= 0) {
      break; // No more skill points available
    }
    
    // Check prerequisites and restrictions (only for first point)
    if (currentPoints === 0) {
      const prereqCheck = checkPrerequisites(skill, allSkills);
      if (!prereqCheck.met) {
        return { success: pointsAdded > 0, pointsAdded, reason: prereqCheck.reasons.join(', ') };
      }
      
      const ultimateCheck = checkUltimateRestriction(skill, allSkills);
      if (!ultimateCheck.allowed) {
        return { success: pointsAdded > 0, pointsAdded, reason: ultimateCheck.reason };
      }
      
      const masteryCheck = checkMasteryRestriction(skill, allSkills);
      if (!masteryCheck.allowed) {
        return { success: pointsAdded > 0, pointsAdded, reason: masteryCheck.reason };
      }
      
      const covenCheck = checkCovenRestriction(skill, allSkills);
      if (!covenCheck.allowed) {
        return { success: pointsAdded > 0, pointsAdded, reason: covenCheck.reason };
      }
      
      const proficiencyCheck = checkProficiencyRestriction(skill, allSkills);
      if (!proficiencyCheck.allowed) {
        return { success: pointsAdded > 0, pointsAdded, reason: proficiencyCheck.reason };
      }
      
      if (db) {
        const devotionCheck = checkDevotionRestriction(skill.skillId, characterInstance.skillPoints, db);
        if (!devotionCheck.canAllocate) {
          return { success: pointsAdded > 0, pointsAdded, reason: devotionCheck.reason };
        }
      }
    }
    
    // Add the point (skip event dispatch during batch)
    characterInstance.skillPoints[skillName] = currentPoints + 1;
    characterInstance.maxLevels = {}; // Clear cache as max levels may change
    
    // Auto-add required stats to input field (only need to do this once)
    if (pointsAdded === 0) {
      autoAddStatsToInput(skill.skillId);
    }
    
    pointsAdded++;
  }
  
  // Dispatch single event after all points are added
  if (pointsAdded > 0) {
    window.dispatchEvent(new CustomEvent('skillPointsChanged', { 
      detail: { skillName, action: 'add', amount: pointsAdded } 
    }));
  }
  
  return { success: pointsAdded > 0, pointsAdded, reason: pointsAdded === 0 ? 'No points could be added' : '' };
}

/**
 * Check if removing a point from a skill would cause other skills to exceed their max level
 * This prevents removing points from skills like Specialization when it would break other skills
 * @param {string} skillName - Skill name being removed
 * @param {Array} allSkills - Array of all skills
 * @returns {Object} { allowed: boolean, reason: string }
 */
function checkMaxLevelDependencies(skillName, allSkills = []) {
  // Skills that affect max levels: specialization, noxious_mastery, elemental_command
  const maxLevelAffectingSkills = ['specialization', 'noxious_mastery', 'elemental_command'];
  
  if (!maxLevelAffectingSkills.includes(skillName)) {
    return { allowed: true, reason: '' };
  }
  
  const db = getDatabase();
  if (!db) {
    return { allowed: true, reason: '' };
  }
  
  if (!characterInstance) return { allowed: true, reason: '' };
  
  // Simulate removing the point
  const simulatedSkillPoints = { ...characterInstance.skillPoints };
  const currentPoints = simulatedSkillPoints[skillName] || 0;
  if (currentPoints > 1) {
    simulatedSkillPoints[skillName] = currentPoints - 1;
  } else {
    delete simulatedSkillPoints[skillName];
  }
  
  // Check all skills that have points allocated
  for (const [allocatedSkillName, allocatedPoints] of Object.entries(characterInstance.skillPoints)) {
    if (allocatedPoints === 0) continue;
    
    // Find the skill object
    const skill = allSkills.find(s => s.id === allocatedSkillName);
    if (!skill) continue;
    
    // Calculate what the new max level would be with the simulated removal
    const newMaxLevel = calculateMaxLevel(skill.skillId, simulatedSkillPoints, characterInstance.level, db);
    
    // Check if current points would exceed new max
    if (allocatedPoints > newMaxLevel) {
      // Find the skill display name for better error message
      const skillDisplayName = skill.name || allocatedSkillName;
      return {
        allowed: false,
        reason: `Cannot remove: ${skillDisplayName} has ${allocatedPoints} point${allocatedPoints > 1 ? 's' : ''} but would have max of ${newMaxLevel}`
      };
    }
  }
  
  return { allowed: true, reason: '' };
}

/**
 * Remove a point from a skill
 * @param {string} skillName - Skill name
 * @param {Array} allSkills - Array of all skills to check dependencies
 * @returns {Object} { success: boolean, reason: string }
 */
export function removeSkillPoint(skillName, allSkills = [], skipEvent = false) {
  const currentPoints = getSkillPoints(skillName);
  
  if (currentPoints === 0) {
    return { success: false, reason: 'No points to remove' };
  }
  
  // Check if removing this point would break any dependent skills
  const blockingInfo = getMinimumRequiredPointsWithBlockingSkills(skillName, allSkills);
  
  if (currentPoints - 1 < blockingInfo.minRequired) {
    const skillNames = blockingInfo.blockingSkills.join(', ');
    return { 
      success: false, 
      reason: `Cannot remove: ${skillNames} require${blockingInfo.blockingSkills.length > 1 ? '' : 's'} at least ${blockingInfo.minRequired} point${blockingInfo.minRequired > 1 ? 's' : ''} in this skill` 
    };
  }
  
  // Check if this skill affects max levels of other skills
  const maxLevelCheck = checkMaxLevelDependencies(skillName, allSkills);
  if (!maxLevelCheck.allowed) {
    return { success: false, reason: maxLevelCheck.reason };
  }
  
  // Remove the point
  if (characterInstance) {
    characterInstance.skillPoints[skillName] = currentPoints - 1;
    if (characterInstance.skillPoints[skillName] === 0) {
      delete characterInstance.skillPoints[skillName];
    }
    
    characterInstance.maxLevels = {}; // Clear cache as max levels may change
    
    // Dispatch event for UI updates (unless skipped for batch operations)
    if (!skipEvent) {
      window.dispatchEvent(new CustomEvent('skillPointsChanged', { 
        detail: { skillName, action: 'remove' } 
      }));
    }
  }
  
  return { success: true, reason: '' };
}

/**
 * Remove multiple skill points at once (for batch operations like shift-click)
 * @param {string} skillName - Skill name
 * @param {number} amount - Number of points to remove
 * @param {Array} allSkills - Array of all skills
 * @returns {Object} { success: boolean, pointsRemoved: number, reason: string }
 */
export function removeSkillPointsBatch(skillName, amount, allSkills = []) {
  if (!characterInstance) {
    return { success: false, pointsRemoved: 0, reason: 'Character not initialized' };
  }
  
  let pointsRemoved = 0;
  
  for (let i = 0; i < amount; i++) {
    const currentPoints = getSkillPoints(skillName);
    
    if (currentPoints === 0) {
      break; // No more points to remove
    }
    
    // Check if removing this point would break any dependent skills
    const blockingInfo = getMinimumRequiredPointsWithBlockingSkills(skillName, allSkills);
    
    if (currentPoints - 1 < blockingInfo.minRequired) {
      if (pointsRemoved === 0) {
        const skillNames = blockingInfo.blockingSkills.join(', ');
        return { 
          success: false, 
          pointsRemoved: 0,
          reason: `Cannot remove: ${skillNames} require${blockingInfo.blockingSkills.length > 1 ? '' : 's'} at least ${blockingInfo.minRequired} point${blockingInfo.minRequired > 1 ? 's' : ''} in this skill` 
        };
      }
      break; // Some points were removed successfully
    }
    
    // Check if this skill affects max levels of other skills (only check on first removal)
    if (pointsRemoved === 0) {
      const maxLevelCheck = checkMaxLevelDependencies(skillName, allSkills);
      if (!maxLevelCheck.allowed) {
        return { success: false, pointsRemoved: 0, reason: maxLevelCheck.reason };
      }
    }
    
    // Remove the point (skip event dispatch during batch)
    characterInstance.skillPoints[skillName] = currentPoints - 1;
    if (characterInstance.skillPoints[skillName] === 0) {
      delete characterInstance.skillPoints[skillName];
    }
    
    characterInstance.maxLevels = {}; // Clear cache as max levels may change
    
    pointsRemoved++;
  }
  
  // Dispatch single event after all points are removed
  if (pointsRemoved > 0) {
    window.dispatchEvent(new CustomEvent('skillPointsChanged', { 
      detail: { skillName, action: 'remove', amount: pointsRemoved } 
    }));
  }
  
  return { success: pointsRemoved > 0, pointsRemoved, reason: pointsRemoved === 0 ? 'No points could be removed' : '' };
}

/**
 * Check for skills that exceed their maximum level
 * @param {Array} allSkills - Array of all skills to check
 * @returns {Array} Array of skills that exceed their max level
 */
export function checkSkillsExceedingMaxLevel(allSkills = []) {
  const db = getDatabase();
  if (!db) return [];
  
  if (!characterInstance) return [];
  
  // Use minimum required level instead of characterInstance.level to ensure we have the correct level
  const actualCharacterLevel = getMinimumRequiredLevel(db);
  const skillLevels = getAllSkillPoints();
  const exceedingSkills = [];
  
  // Check each skill that has points allocated
  for (const [skillName, currentPoints] of Object.entries(characterInstance.skillPoints)) {
    if (currentPoints === 0) continue;
    
    // Find the skill object
    const skill = allSkills.find(s => s.id === skillName);
    if (!skill) continue;
    
    // Calculate the current maximum level for this skill
    const effectiveMaxLevel = calculateMaxLevel(skill.skillId, skillLevels, actualCharacterLevel, db);
    
    // If current points exceed the maximum, add to list
    if (currentPoints > effectiveMaxLevel) {
      exceedingSkills.push({
        skillName: skill.name || skillName,
        currentPoints,
        maxLevel: effectiveMaxLevel,
        excess: currentPoints - effectiveMaxLevel
      });
    }
  }
  
  return exceedingSkills;
}

/**
 * Get minimum required points and which skills are blocking removal
 * @param {string} skillName - Skill to check
 * @param {Array} allSkills - All available skills
 * @returns {Object} {minRequired: number, blockingSkills: Array}
 */
function getMinimumRequiredPointsWithBlockingSkills(skillName, allSkills) {
  let minRequired = 0;
  const blockingSkills = [];
  
  if (!characterInstance) return { minRequired: 0, blockingSkills: [] };
  
  // Check all skills that have points allocated
  for (const [allocatedSkillName, points] of Object.entries(characterInstance.skillPoints)) {
    if (points === 0) continue;
    
    // Find the skill object
    const skill = allSkills.find(s => s.id === allocatedSkillName);
    if (!skill || !skill.prerequisites) continue;
    
    // Check if this skill depends on the skill we're checking
    for (const prereq of skill.prerequisites) {
      const [type, value, target] = prereq.split(':');
      
      if (type === 'skill_level') {
        // Convert target display name to skill_name format
        const targetSkillName = target.toLowerCase().replace(/'/g, '').replace(/\s+/g, '_');
        
        if (targetSkillName === skillName) {
          const requiredPoints = parseInt(value, 10);
          if (requiredPoints > minRequired) {
            minRequired = requiredPoints;
            // Clear previous blocking skills since we found a higher requirement
            blockingSkills.length = 0;
          }
          if (requiredPoints === minRequired) {
            blockingSkills.push(skill.name || allocatedSkillName);
          }
        }
      }
    }
  }
  
  return { minRequired, blockingSkills };
}

/**
 * Reset all skill points
 */
export function resetAllSkillPoints() {
  if (characterInstance) {
    characterInstance.resetAllSkillPoints();
  }
}

/**
 * Get total skill points allocated
 * @returns {number} Total points
 */
export function getTotalSkillPoints() {
  return characterInstance ? characterInstance.getTotalSkillPoints() : 0;
}

/**
 * Export character state for saving
 * @returns {Object} Character state
 */
export function exportCharacterState() {
  return characterInstance ? characterInstance.exportState() : {
    level: Character.DEFAULT_LEVEL,
    className: null,
    skillPoints: {}
  };
}

/**
 * Update quest completion status
 * @param {string} questId - Quest identifier
 * @param {Object} difficulties - Object with normal, nightmare, hell boolean values
 */
export function updateQuestCompletion(questId, difficulties) {
  if (characterInstance) {
    characterInstance.updateQuestCompletion(questId, difficulties);
  }
}

/**
 * Get quest completion status
 * @param {string} questId - Quest identifier
 * @returns {Object} Object with normal, nightmare, hell boolean values
 */
export function getQuestCompletion(questId) {
  return characterInstance ? characterInstance.getQuestCompletion(questId) : { normal: false, nightmare: false, hell: false };
}

/**
 * Import character state from save
 * @param {Object} state - Saved character state
 */
export function importCharacterState(state) {
  if (characterInstance) {
    characterInstance.importState(state);
  }
}

/**
 * oSkills Management
 * oSkills are virtual skills (from items/gear) with 150 level cap
 */

/**
 * Get all oSkills
 * @returns {Array} Array of oSkill objects
 */
export function getAllOSkills() {
  return characterInstance ? characterInstance.getAllOSkills() : [];
}

/**
 * Get points for a specific oSkill
 * @param {string} skillName - Internal skill name
 * @returns {number} Points allocated (0 if not found)
 */
export function getOSkillPoints(skillName) {
  return characterInstance ? characterInstance.getOSkillPoints(skillName) : 0;
}

/**
 * Add an oSkill or increment if it exists
 * @param {number} skillId - Database skill ID
 * @param {string} displayName - Display name
 * @param {string} skillName - Internal skill name
 * @param {string} image - Image filename
 * @param {string} className - Class name
 */
export function addOSkill(skillId, displayName, skillName, image, className, hasDetails = false, description = null, skillEffect = null) {
  if (characterInstance) {
    characterInstance.addOSkill(skillId, displayName, skillName, image, className, hasDetails, description, skillEffect);
  } else {
    console.error('[OSkills] No character instance available!');
  }
}

/**
 * Remove an oSkill
 * @param {string} skillName - Internal skill name
 */
export function removeOSkill(skillName) {
  if (characterInstance) {
    characterInstance.removeOSkill(skillName);
  }
}

/**
 * Change oSkill points (positive to add, negative to remove)
 * @param {string} skillName - Internal skill name
 * @param {number} amount - Amount to change (can be negative)
 */
export function changeOSkillPoints(skillName, amount) {
  if (characterInstance) {
    // Get current allSkillsBonus for hard cap enforcement
    const allSkillsBonusInput = document.getElementById('allSkillsBonus');
    const allSkillsBonus = allSkillsBonusInput ? Math.max(0, parseInt(allSkillsBonusInput.value) || 0) : 0;
    
    characterInstance.changeOSkillPoints(skillName, amount, allSkillsBonus);
  }
}

/**
 * Clear all oSkills
 */
export function clearOSkills() {
  if (characterInstance) {
    characterInstance.clearOSkills();
  }
}

/**
 * Set all oSkills (for loading builds)
 * @param {Array} oSkills - Array of oSkill objects
 */
export function setAllOSkills(oSkills) {
  if (characterInstance) {
    characterInstance.setAllOSkills(oSkills);
  }
}

/**
 * Stats Management
 * Character stats that can be referenced in skill calculations
 */

/**
 * Get stat value for a given stat key
 * @param {string} statKey - Stat key (e.g., 'strength', 'dexterity')
 * @returns {number} Stat value, or 0 if not set
 */
export function getStat(statKey) {
  return characterInstance ? characterInstance.getStat(statKey) : 0;
}

/**
 * Set stat value for a given stat key
 * @param {string} statKey - Stat key (e.g., 'strength', 'dexterity')
 * @param {number} value - Stat value
 */
export function setStat(statKey, value) {
  if (characterInstance) {
    characterInstance.setStat(statKey, value);
  }
}

/**
 * Get all stats
 * @returns {Object} Map of stat_key -> value
 */
export function getAllStats() {
  return characterInstance ? characterInstance.getAllStats() : {};
}

/**
 * Set all stats (used for loading builds)
 * @param {Object} stats - Map of stat_key -> value
 */
export function setAllStats(stats) {
  if (characterInstance) {
    characterInstance.setAllStats(stats);
  }
}

/**
 * Clear all stats
 */
export function clearAllStats() {
  if (characterInstance) {
    characterInstance.clearAllStats();
  }
}

/**
 * Parse and set stats from a text field (one stat per line)
 * Format: {{statKey}}=value or statKey=value
 * @param {string} text - Text containing stat definitions (one per line)
 * @returns {Array} Array of error messages, empty if no errors
 */
export function parseStatsFromText(text) {
  if (!characterInstance) return ['Character not initialized'];
  return characterInstance.parseStatsFromText(text);
}

/**
 * Export stats to text format (one stat per line)
 * Format: {{statKey}}=value
 * @returns {string} Text representation of stats
 */
export function exportStatsToText() {
  return characterInstance ? characterInstance.exportStatsToText() : '';
}

/**
 * Get all formulas used by a skill for auto-adding stats
 * @param {number} skillId - Database skill ID
 * @returns {Array<string>} Array of formula strings
 */
async function getSkillFormulas(skillId) {
  const db = getDatabase();
  if (!db) return [];
  
  const formulas = [];
  
  try {
    // Get formulas from skill_scaling table
    const stmt = db.prepare(`
      SELECT DISTINCT value0, value1, value2, value3
      FROM skill_scaling
      WHERE skill_id = ?
    `);
    stmt.bind([skillId]);
    
    while (stmt.step()) {
      const [v0, v1, v2, v3] = stmt.get();
      if (v0) formulas.push(v0);
      if (v1) formulas.push(v1);
      if (v2) formulas.push(v2);
      if (v3) formulas.push(v3);
    }
    stmt.free();
    
    // Get formulas from skill_scaling_constants table
    const constantsStmt = db.prepare(`
      SELECT DISTINCT value0, value1, value2, value3
      FROM skill_scaling_constants
      WHERE skill_id = ?
    `);
    constantsStmt.bind([skillId]);
    
    while (constantsStmt.step()) {
      const [v0, v1, v2, v3] = constantsStmt.get();
      if (v0) formulas.push(v0);
      if (v1) formulas.push(v1);
      if (v2) formulas.push(v2);
      if (v3) formulas.push(v3);
    }
    constantsStmt.free();
  } catch (error) {
    console.warn('Error getting skill formulas:', error);
  }
  
  return formulas;
}

/**
 * Add required stats to Character Stats input field
 * @param {number} skillId - Skill ID to get formulas from
 */
async function autoAddStatsToInput(skillId) {
  // Get all formulas for this skill
  const formulas = await getSkillFormulas(skillId);
  if (formulas.length === 0) return;
  
  // Import the extractStatReferences function
  const { extractStatReferences } = await import('../skills/formula-evaluator.js');
  
  // Extract all stat references from all formulas
  const statRefsSet = new Set();
  for (const formula of formulas) {
    const stats = extractStatReferences(formula);
    stats.forEach(stat => statRefsSet.add(stat));
  }
  
  if (statRefsSet.size === 0) return; // No stat references found
  
  const characterStatsInput = document.getElementById('characterStats');
  if (!characterStatsInput) return;
  
  // Get current stats from character instance
  const currentStats = characterInstance?.stats || {};
  
  // Find stats that need to be added
  const statsToAdd = Array.from(statRefsSet).filter(statName => !currentStats.hasOwnProperty(statName));
  
  if (statsToAdd.length === 0) return; // All stats already exist
  
  // Get all stats text
  const currentText = characterStatsInput.value;
  
  // Add new stats to the text field
  const newStats = statsToAdd.map(statName => `{{${statName}}}=0`).join('\n');
  
  // Append to existing text (with newline if not empty)
  const updatedText = currentText ? `${currentText}\n${newStats}` : newStats;
  characterStatsInput.value = updatedText;
  
  // Parse the updated text to update character instance
  if (characterInstance) {
    const errors = characterInstance.parseStatsFromText(updatedText);
    if (errors.length > 0) {
      console.warn('Stats parsing errors:', errors);
    }
  }
}

/**
 * Filter skill levels to exclude oSkills
 * Ensures oSkill points never affect regular skill calculations
 * @param {Object} skillLevels - Object mapping skill_name/ID to points
 * @param {Object} db - SQL.js database instance
 * @returns {Object} Filtered skill levels with only regular skills
 */
function filterRegularSkillsOnly(skillLevels, db) {
  if (!db) {
    return skillLevels; // Can't filter without database
  }

  const oSkills = getAllOSkills();
  const oSkillKeys = new Set();

  // Collect oSkill identifiers (both IDs and names)
  if (Array.isArray(oSkills)) {
    oSkills.forEach(oskill => {
      if (oskill.skillName) oSkillKeys.add(oskill.skillName);
      if (oskill.skillId) oSkillKeys.add(oskill.skillId.toString());
    });
  } else if (typeof oSkills === 'object') {
    // oSkills is an object with skill IDs/names as keys
    Object.keys(oSkills).forEach(key => {
      oSkillKeys.add(key);
    });
  }

  // Filter out oSkills from skillLevels
  const filtered = {};
  for (const [key, value] of Object.entries(skillLevels)) {
    // Skip if this key matches any oSkill identifier
    if (!oSkillKeys.has(key)) {
      filtered[key] = value;
    }
  }

  return filtered;
}

/**
 * Calculate effective max level for a skill (works for both regular skills and oSkills)
 * Consolidated from SkillService
 * @param {number} skillId - Skill ID (database ID for regular, identifier for oSkill)
 * @param {string} skillType - 'regular' | 'oskill'
 * @param {Object} skillLevels - Object mapping skill_name to current skill level (should only contain regular skills, not oSkills)
 * @param {number} characterLevel - Current character level
 * @param {Object} db - SQL.js database instance (optional)
 * @returns {number} Effective max level (capped at 150)
 */
export function calculateEffectiveMaxLevel(skillId, skillType, skillLevels = {}, characterLevel = Character.DEFAULT_LEVEL, db = null) {
  // oSkills always have a hard cap of 150
  if (skillType === 'oskill') {
    return 150;
  }

  // For regular skills, ensure we only use regular skill points (not oSkills)
  const regularSkillLevels = filterRegularSkillsOnly(skillLevels, db);

  // For regular skills, use the calculation system
  if (!db) {
    db = getDatabase();
  }

  if (!db) {
    console.warn('calculateEffectiveMaxLevel: Database not available for max level calculation');
    return 0;
  }

  return calculateMaxLevel(skillId, regularSkillLevels, characterLevel, db);
}

/**
 * Get all restrictions for a skill
 * Consolidated from SkillValidationService
 * @param {Object} skill - Skill object (for regular skills) or skill metadata (for oSkills)
 * @param {string} skillType - 'regular' | 'oskill'
 * @param {number} currentPoints - Current points allocated
 * @param {Array} allSkills - Array of all skills (for regular skills only)
 * @param {Object} skillLevels - Object mapping skill_name to current skill level (should exclude oSkills for regular skills)
 * @param {Object} db - SQL.js database instance
 * @returns {Array} Array of {type: string, reason: string} restriction objects
 */
export function getSkillRestrictions(skill, skillType, currentPoints, allSkills = [], skillLevels = {}, db = null) {
  const restrictions = [];

  // oSkills don't have prerequisites or most restrictions - they're simpler
  if (skillType === 'oskill') {
    return restrictions;
  }

  // For regular skills, ensure skillLevels excludes oSkills
  const regularSkillLevels = filterRegularSkillsOnly(skillLevels, db);

  // Skip all checks if skill already has points (can always add more)
  if (currentPoints > 0) {
    return restrictions;
  }

  // Check prerequisites
  const prereqCheck = checkPrerequisites(skill, allSkills);
  if (!prereqCheck.met) {
    prereqCheck.reasons.forEach(reason => {
      restrictions.push({
        type: 'prerequisite',
        reason: reason
      });
    });
  }

  // Check Ultimate restriction (use Ultimate class)
  const currentPointsCheck = getSkillPoints(skill.id);
  if (currentPointsCheck === 0) {
    const ultimateSkill = new Ultimate(skill);
    const ultimateRestriction = ultimateSkill.checkRestriction(allSkills);
    if (ultimateRestriction.blocked) {
      restrictions.push({
        type: 'ultimate',
        reason: ultimateRestriction.reason
      });
    }

    // Check Paragon restriction (use Paragon class)
    const paragonSkill = new Paragon(skill);
    const paragonRestriction = paragonSkill.checkRestriction(allSkills);
    if (paragonRestriction.blocked) {
      restrictions.push({
        type: 'paragon',
        reason: paragonRestriction.reason
      });
    }
  }

  // Check Mastery restriction
  const masteryRestriction = checkMasteryRestriction(skill, allSkills);
  if (!masteryRestriction.allowed) {
    restrictions.push({
      type: 'mastery',
      reason: masteryRestriction.reason
    });
  }

  // Check Coven restriction
  const covenRestriction = checkCovenRestriction(skill, allSkills);
  if (!covenRestriction.allowed) {
    restrictions.push({
      type: 'coven',
      reason: covenRestriction.reason
    });
  }

  // Check Proficiency restriction
  const proficiencyRestriction = checkProficiencyRestriction(skill, allSkills);
  if (!proficiencyRestriction.allowed) {
    restrictions.push({
      type: 'proficiency',
      reason: proficiencyRestriction.reason
    });
  }

  // Check Devotion restriction (use filtered skill levels)
  const devotionRestriction = checkDevotionRestriction(skill.skillId, regularSkillLevels, db);
  if (!devotionRestriction.canAllocate) {
    restrictions.push({
      type: 'devotion',
      reason: devotionRestriction.reason
    });
  }

  return restrictions;
}

/**
 * Check if a skill can have points allocated
 * Consolidated from SkillService/SkillValidationService
 * @param {Object} skill - Skill object or skill metadata
 * @param {string} skillType - 'regular' | 'oskill'
 * @param {number} currentPoints - Current points allocated
 * @param {number} maxPoints - Maximum points allowed
 * @param {Array} allSkills - Array of all skills (for regular skills only)
 * @param {Object} skillLevels - Object mapping skill_name to current skill level
 * @param {Object} db - SQL.js database instance
 * @returns {boolean} True if skill can have points allocated
 */
export function canAllocateSkillPoints(skill, skillType, currentPoints, maxPoints, allSkills = [], skillLevels = {}, db = null) {
  // Check if already at max
  if (currentPoints >= maxPoints) {
    return false;
  }

  // If skill already has points, it can always add more
  if (currentPoints > 0) {
    return true;
  }

  // For oSkills, only check max level (handled above)
  if (skillType === 'oskill') {
    return true;
  }

  // For regular skills, check restrictions
  const regularSkillLevels = filterRegularSkillsOnly(skillLevels, db);
  const restrictions = getSkillRestrictions(skill, skillType, currentPoints, allSkills, regularSkillLevels, db);
  return restrictions.length === 0;
}