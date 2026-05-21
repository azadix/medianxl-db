/**
 * Skill Calculations
 * Handles dynamic calculations for skill max levels and other modifiers
 */

import Character from '@/character/Character.js';
import { getFileSkillStore } from '../../../tree/skill-data-store.js';
import { isInnateSkill } from './skill-skill-types.js';

export { D2_CALC_BUCKETS, getCalcBucketIndex } from './calc-buckets.js';

/**
 * Max Level Modifier Rules
 * Each rule defines how a skill affects max levels
 * Uses skill names instead of IDs for better maintainability
 */
const MAX_LEVEL_MODIFIERS = [
  {
    sourceSkillName: 'specialization',
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
    sourceSkillName: null,
    type: 'self_character_level',
    targetSkillName: 'barkskin',
    characterLevelDivisor: 5, // +1 max level for every 5 character levels
    description: 'Increases its own max level by 1 for every 5 character levels',
    startLevel: 10,
    calculateBonus: function(sourceSkillLevel, targetSkillData, characterLevel = Character.DEFAULT_LEVEL) {
      if (targetSkillData.skill_name === this.targetSkillName) {
        // Intentionally matches in-game Barkskin: max-level bonus uses full character level / divisor
        // (starts from level 1), not (level - startLevel) / divisor. When the mod matches the intended
        // design, switch to the commented block below.
        return Math.floor(characterLevel / this.characterLevelDivisor);
      }

      // Intended design (not used until game data matches):
      // if (targetSkillData.skill_name === this.targetSkillName) {
      //   const effectiveLevel = Math.max(0, characterLevel - this.startLevel);
      //   return Math.floor(effectiveLevel / this.characterLevelDivisor);
      // }
      return 0;
    }
  },
  {
    sourceSkillName: 'noxious_mastery',
    type: 'affects_specific_skill',
    targetSkillName: 'curare',
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
    sourceSkillName: null,
    type: 'self_character_level',
    targetSkillName: 'sanctity',
    characterLevelDivisor: 5, // +1 max level for every 5 character levels
    maxBonus: 5,
    description: 'Increases its own max level by 1 for every 5 character levels (max +5)',
    calculateBonus: function(sourceSkillLevel, targetSkillData, characterLevel = Character.DEFAULT_LEVEL) {
      if (targetSkillData.skill_name === this.targetSkillName) {
        const bonus = Math.floor(characterLevel / this.characterLevelDivisor);
        return Math.min(bonus, this.maxBonus);
      }
      return 0;
    }
  },
  {
    sourceSkillName: null,
    type: 'self_character_level',
    targetSkillName: 'consecration',
    characterLevelDivisor: 5, // +1 max level for every 5 character levels
    maxBonus: 5,
    description: 'Increases its own max level by 1 for every 5 character levels (max +5)',
    calculateBonus: function(sourceSkillLevel, targetSkillData, characterLevel = Character.DEFAULT_LEVEL) {
      if (targetSkillData.skill_name === this.targetSkillName) {
        const bonus = Math.floor(characterLevel / this.characterLevelDivisor);
        return Math.min(bonus, this.maxBonus);
      }
      return 0;
    }
  },
  {
    sourceSkillName: null,
    type: 'self_character_level',
    targetSkillName: 'holy_fire',
    characterLevelDivisor: 2, // +1 max level for every 2 character levels
    maxBonus: 25,
    description: 'Increases its own max level by 1 for every 2 character levels (max +25)',
    calculateBonus: function(sourceSkillLevel, targetSkillData, characterLevel = Character.DEFAULT_LEVEL) {
      if (targetSkillData.skill_name === this.targetSkillName) {
        const bonus = Math.floor(characterLevel / this.characterLevelDivisor);
        return Math.min(bonus, this.maxBonus);
      }
      return 0;
    }
  },
  {
    sourceSkillName: 'elemental_command',
    type: 'affects_multiple_skills_by_character_level',
    targetSkillNames: ['trinity_arrow', 'barrage'],
    characterLevelDivisor: 4, // +1 max level for every 4 character levels
    maxBonus: 20,
    startLevel: 15,
    description: 'Increases Trinity Arrow and Barrage max level by 1 for every 4 character levels',
    calculateBonus: function(sourceSkillLevel, targetSkillData, characterLevel = Character.DEFAULT_LEVEL) {
      if (sourceSkillLevel > 0 && this.targetSkillNames.includes(targetSkillData.skill_name)) {
        const effectiveLevel = Math.max(0, characterLevel - this.startLevel);
        return Math.min(Math.floor(effectiveLevel / this.characterLevelDivisor), this.maxBonus);
      }
      return 0;
    }
  },
  {
    sourceSkillName: null,
    type: 'self_character_level',
    targetSkillName: 'spiritual_alignment',
    characterLevelDivisor: 4, // +1 max level for every 4 character levels
    startLevel: 11, // Skill becomes available at level 15
    description: 'Increases its own max level by 1 for every 4 character levels (starting from level 15)',
    calculateBonus: function(sourceSkillLevel, targetSkillData, characterLevel = Character.DEFAULT_LEVEL) {
      if (targetSkillData.skill_name === this.targetSkillName) {
        const effectiveLevel = Math.max(0, characterLevel - this.startLevel);
        return Math.floor(effectiveLevel / this.characterLevelDivisor);
      }
      return 0;
    }
  },
  {
    sourceSkillName: null,
    type: 'self_tab_points',
    targetSkillName: 'lioness',
    tabSkills: ['fend', 'great_hunt', 'hunters_prowess', 'hyena_strike', 'pounce', 'takedown'], // All Spear tab skills except Lioness
    pointsDivisor: 3, // +1 max level for every 3 points in Spear tab
    description: 'Increases its own max level by 1 for every 3 points spent on other skills in Spear tab',
    calculateBonus: function(sourceSkillLevel, targetSkillData, _characterLevel = Character.DEFAULT_LEVEL, skillLevels = {}) {
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
    sourceSkillName: 'galvanism',
    type: 'affects_specific_skill_by_character_level',
    targetSkillName: 'iron_spiral',
    characterLevelThreshold: 90,
    characterLevelDivisor: 5, // +2 max levels for every 5 character levels above 90
    bonusPerIncrement: 2, // +2 max levels per increment
    description: 'Increases Iron Spiral max level by 2 for every 5 character levels above 90',
    calculateBonus: function(sourceSkillLevel, targetSkillData, characterLevel = Character.DEFAULT_LEVEL) {
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
  {
    sourceSkillName: 'soulchain', // Elemental Command needs at least 1 point to activate
    type: 'affects_multiple_skills',
    targetSkillNames: ['fireheart_totem', 'stormeye_totem', 'frostclaw_totem', 'dark_gathering'],
    description: 'Increases Soulchained totems and Dark Gathering max level by 1 for each base level',
    calculateBonus: function(sourceSkillLevel, targetSkillData, _characterLevel = Character.DEFAULT_LEVEL) {
      if (sourceSkillLevel > 0 && this.targetSkillNames.includes(targetSkillData.skill_name)) {
        return sourceSkillLevel;
      }
      return 0;
    }
  },
  {
    sourceSkillName: null,
    type: 'self_character_level',
    targetSkillName: 'aptitude',
    characterLevelDivisor: 5, // +1 max level for every 5 character levels
    startLevel: 115, // Skill becomes available at level 120
    description: 'Increases its own max level by 1 for every 5 character levels (starting from level 120)',
    calculateBonus: function(sourceSkillLevel, targetSkillData, characterLevel = Character.DEFAULT_LEVEL) {
      if (targetSkillData.skill_name === this.targetSkillName) {
        const effectiveLevel = Math.max(0, characterLevel - this.startLevel);
        return Math.floor(effectiveLevel / this.characterLevelDivisor);
      }
      return 0;
    }
  },
  {
    sourceSkillName: null,
    type: 'self_character_level',
    targetSkillName: 'void_gazer',
    characterLevelDivisor: 5, // +1 max level for every 5 character levels
    startLevel: 95, // Skill becomes available at level 100
    description: 'Increases its own max level by 1 for every 5 character levels (starting from level 100)',
    calculateBonus: function(sourceSkillLevel, targetSkillData, characterLevel = Character.DEFAULT_LEVEL) {
      if (targetSkillData.skill_name === this.targetSkillName) {
        const effectiveLevel = Math.max(0, characterLevel - this.startLevel);
        return Math.floor(effectiveLevel / this.characterLevelDivisor);
      }
      return 0;
    }
  },
  {
    sourceSkillName: null,
    type: 'self_character_level',
    targetSkillName: 'warmth',
    characterLevelDivisor: 4, // +1 max level for every 4 character levels
    startLevel: 1, // Skill becomes available at level 5
    description: 'Increases its own max level by 1 for every 4 character levels (starting from level 5)',
    calculateBonus: function(sourceSkillLevel, targetSkillData, characterLevel = Character.DEFAULT_LEVEL) {
      if (targetSkillData.skill_name === this.targetSkillName) {
        const effectiveLevel = Math.max(0, characterLevel - this.startLevel);
        return Math.floor(effectiveLevel / this.characterLevelDivisor);
      }
      return 0;
    }
  }
];

/**
 * Descriptions from {@link MAX_LEVEL_MODIFIERS} for tooltips.
 * If `sourceSkillName` is set, that description is shown only on that skill’s tooltip.
 * Otherwise the description is shown for the skill(s) the rule applies to (target / bonus).
 * @param {number} numericId - catalog numeric id for the skill
 * @param {Record<string, number>} skillLevels
 * @param {number} characterLevel
 * @returns {string[]}
 */
export function getMaxLevelModifierDescriptionsForSkill(
  numericId,
  skillLevels = {},
  characterLevel = Character.DEFAULT_LEVEL
) {
  const store = getFileSkillStore();
  if (!store) return [];
  const internal = store.internalNameByNumericId(numericId);
  const cat = store.catalog?.find((c) => c.numericId === numericId);
  if (!internal || !cat) return [];

  const targetSkillData = {
    skill_name: internal,
    base_max_level: cat.baseMaxLevel,
    affected_by_specialization: Boolean(cat.affectedBySpecialization)
  };

  const out = [];
  const seen = new Set();

  for (const modifier of MAX_LEVEL_MODIFIERS) {
    if (!modifier.description) continue;

    if (modifier.sourceSkillName) {
      if (internal !== modifier.sourceSkillName) continue;
      if (!seen.has(modifier.description)) {
        seen.add(modifier.description);
        out.push(modifier.description);
      }
      continue;
    }

    const sourceSkillLevel = 0;
    const bonus = modifier.calculateBonus(
      sourceSkillLevel,
      targetSkillData,
      characterLevel,
      skillLevels
    );

    let include = bonus !== 0;
    if (!include) {
      if (modifier.targetSkillName === internal) {
        include = true;
      } else if (Array.isArray(modifier.targetSkillNames) && modifier.targetSkillNames.includes(internal)) {
        include = true;
      }
    }

    if (include && !seen.has(modifier.description)) {
      seen.add(modifier.description);
      out.push(modifier.description);
    }
  }

  return out;
}

/**
 * Raw max skill level at a given character level (ulvl), before planner "use max at 150" aggregation.
 * @param {number} skillId - Catalog numeric id
 * @param {Record<string, number>} skillLevels - internal skill name -> points
 * @param {number} ulvl - Character level passed into max-level modifiers
 * @returns {number}
 */
export function computeMaxSkillLevelAtUlvl(skillId, skillLevels = {}, ulvl = Character.DEFAULT_LEVEL) {
  const store = getFileSkillStore();
  if (!store) return 0;
  const internal = store.internalNameByNumericId(skillId);
  const cat = store.catalog?.find((c) => c.numericId === skillId);
  if (!internal || !cat) return 0;
  const base_max_level = cat.baseMaxLevel;
  if (base_max_level == null) return 0;

  const targetSkillData = {
    skill_name: internal,
    base_max_level,
    affected_by_specialization: Boolean(cat.affectedBySpecialization)
  };
  const u = Character.clampLevel(ulvl);
  let v = base_max_level;
  for (const modifier of MAX_LEVEL_MODIFIERS) {
    const sourceSkillLevel = modifier.sourceSkillName
      ? skillLevels[modifier.sourceSkillName] || 0
      : 0;
    const bonus = modifier.calculateBonus(
      sourceSkillLevel,
      targetSkillData,
      u,
      skillLevels
    );
    v += bonus;
  }
  return Math.min(v, 150);
}

/**
 * True when {@link calculateMaxLevel} uses the ulvl-150 invest cap (max grows with character level).
 * @param {number} skillId
 * @param {Record<string, number>} skillLevels
 */
export function skillMaxLevelScalesWithCharacterLevel(skillId, skillLevels = {}) {
  const store = getFileSkillStore();
  if (!store) return false;
  const internal = store.internalNameByNumericId(skillId);
  if (!internal || isInnateSkill({ id: internal })) return false;
  const cat = store.catalog?.find((c) => c.numericId === skillId);
  if (!cat) return false;
  const a = computeMaxSkillLevelAtUlvl(skillId, skillLevels, Character.MIN_LEVEL);
  const b = computeMaxSkillLevelAtUlvl(skillId, skillLevels, Character.MAX_LEVEL);
  return b > a;
}

/**
 * Minimum character level (ulvl) needed to legally hold `points` in this skill, from max-level modifiers only.
 * Returns {@link Character.MIN_LEVEL} when the skill does not scale max with ulvl.
 * @param {number} skillId
 * @param {Record<string, number>} skillLevels
 * @param {number} points - Allocated points (blvl) in this skill
 */
export function minCharacterLevelForAllocatedSkillPoints(skillId, skillLevels = {}, points = 0) {
  const p = Math.floor(Number(points) || 0);
  if (p <= 0) return Character.MIN_LEVEL;
  if (!skillMaxLevelScalesWithCharacterLevel(skillId, skillLevels)) return Character.MIN_LEVEL;

  let lo = Character.MIN_LEVEL;
  let hi = Character.MAX_LEVEL;
  let ans = Character.MAX_LEVEL + 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const cap = computeMaxSkillLevelAtUlvl(skillId, skillLevels, mid);
    if (cap >= p) {
      ans = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return ans <= Character.MAX_LEVEL ? ans : Character.MAX_LEVEL;
}

/**
 * Calculate the effective max level for a skill
 * @param {number} skillId - The skill ID to calculate max level for
 * @param {object} skillLevels - Object mapping skill_name to current skill level
 * @param {number} characterLevel - Current character level (by default we assume max level)
 * @returns {number} The calculated max level
 */
export function calculateMaxLevel(skillId, skillLevels = {}, characterLevel = Character.DEFAULT_LEVEL) {
  const store = getFileSkillStore();
  if (!store) {
    console.warn('calculateMaxLevel: Skill data store not initialized');
    return 0;
  }
  const internal = store.internalNameByNumericId(skillId);
  const cat = store.catalog?.find((c) => c.numericId === skillId);
  if (!internal || !cat) {
    console.warn(`calculateMaxLevel: Skill ${skillId} does not exist`);
    return 0;
  }
  const base_max_level = cat.baseMaxLevel;
  if (base_max_level == null) {
    if (!internal.includes('innate') && !internal.includes('Innate')) {
      console.warn(`calculateMaxLevel: No max level data found for skillId ${skillId} (${internal})`);
    }
    return 0;
  }
  const nonInnate = !isInnateSkill({ id: internal });

  const maxAtMinUlvl = computeMaxSkillLevelAtUlvl(skillId, skillLevels, Character.MIN_LEVEL);
  const maxAtMaxUlvl = computeMaxSkillLevelAtUlvl(skillId, skillLevels, Character.MAX_LEVEL);
  const maxAtCurrentUlvl = computeMaxSkillLevelAtUlvl(skillId, skillLevels, characterLevel);

  // Skills whose max grows with character level (ulvl): planner cap matches level 150, not current ulvl.
  if (nonInnate && maxAtMaxUlvl > maxAtMinUlvl) {
    return maxAtMaxUlvl;
  }

  let effectiveMaxLevel = maxAtCurrentUlvl;
  if (effectiveMaxLevel < 1 && nonInnate) {
    effectiveMaxLevel = 1;
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
 * @returns {string} The devotion type (DEVOTION_TYPES constant)
 */
export function getSkillDevotion(skillId) {
  const store = getFileSkillStore();
  const internal = store?.internalNameByNumericId(skillId);
  const det = internal ? store.getSkillDetail(internal) : null;
  if (!det) return DEVOTION_TYPES.NONE;
  const skillName = internal;
  const tabIndex = det.tabIndex;
  const classId = det.classId;
  if (classId === 5) {
    if (PALADIN_DEVOTION_ULTIMATE_SKILLS[skillName]) {
      return PALADIN_DEVOTION_ULTIMATE_SKILLS[skillName];
    }
    for (const [devotion, tabs] of Object.entries(PALADIN_DEVOTION_TABS)) {
      if (tabs.includes(tabIndex)) {
        return devotion;
      }
    }
  }
  if (classId === 2) {
    for (const [devotion, tabs] of Object.entries(AMAZON_DEVOTION_TABS)) {
      if (tabs.includes(tabIndex)) {
        return devotion;
      }
    }
  }
  return DEVOTION_TYPES.NONE;
}

/**
 * Determine the current devotion based on allocated skills
 * @param {object} skillLevels - Object mapping skill_name to current skill level
 * @returns {string} The current devotion type (DEVOTION_TYPES constant)
 */
export function getCurrentDevotion(skillLevels = {}) {
  const store = getFileSkillStore();
  for (const [skillName, level] of Object.entries(skillLevels)) {
    if (level > 0) {
      const cat = store?.catalog?.find((c) => c.id === skillName);
      if (cat) {
        const devotion = getSkillDevotion(cat.numericId);
        if (devotion !== DEVOTION_TYPES.NONE) {
          return devotion;
        }
      }
    }
  }
  return DEVOTION_TYPES.NONE;
}

/**
 * Check if a skill can be allocated based on devotion restrictions
 * @param {number} skillId - The skill ID to check
 * @param {object} skillLevels - Object mapping skill_name to current skill level
 * @returns {object} { canAllocate: boolean, reason: string }
 */
export function checkDevotionRestriction(skillId, skillLevels = {}) {
  const currentDevotion = getCurrentDevotion(skillLevels);
  const skillDevotion = getSkillDevotion(skillId);
  if (currentDevotion === DEVOTION_TYPES.NONE || skillDevotion === DEVOTION_TYPES.NONE) {
    return { canAllocate: true, reason: '' };
  }
  if (currentDevotion === skillDevotion) {
    return { canAllocate: true, reason: '' };
  }
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

