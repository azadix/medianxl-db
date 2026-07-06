/**
 * @file Core planner character logic (allocation, stats, init).
 * @module character/planner-core
 *
 * Domain slices: planner-snapshot, planner-instance, planner-prereqs, planner-build-io,
 * planner-oskills, planner-quests, planner-allocation-checks.
 */

import Character from './Character.js';
import { normalizePlannerStatValue, isPlannerBaseStatKey } from './planner-stats-config.js';
import {
  getClassPlannerStatDefaults,
  computeClassDerivedLifeMana
} from './class-baselines.js';
import { getPlannerAutoLevelFromSpentSkillPoints } from '@/planner/planner-level-options.js';
import { recomputePlannerStatsFromSkillAllocations } from './planner-stat-modifiers.js';
import { calculateMaxLevel } from '@/skills/domain/skill-calculations.js';
import { extractStatReferences } from '@/skills/domain/formula-evaluator.js';
import { getFileSkillStore } from '@/tree/skill-data-store.js';
import {
  normalizePrereqSkillTargetKey,
} from './prereq-utils.js';
import {
  getCharacterInstance,
  createCharacterInstance,
  notifyPlannerStateChanged,
  notifySkillPointsChanged,
} from './planner-instance.js';
import {
  setPlannerSkillsSnapshot,
  getPlannerSkillsSnapshot,
  buildTreeSkillsCache,
  buildTreeSkillsCacheFromLoadedSkills,
  getTreeSkillsCache,
} from './planner-snapshot.js';
import { checkPrerequisites } from './planner-prereqs.js';
import {
  runFirstPointAllocationChecks,
} from './first-point-allocation-checks.js';
import {
  resolveCatalogRowBySkillRef,
  normalizeBuildSkillPointsForImport,
  normalizeBuildOSkillsForImport,
  getAllSkillPointsById,
  setAllSkillPoints,
  setAllSkillPointsById,
  getOSkillsForBuildExport,
  exportCharacterState,
  importCharacterState,
} from './planner-build-io.js';
import {
  updateQuestCompletion,
  getQuestCompletion,
  getTotalQuestStatPoints,
  importQuestsCompleted,
  getQuestsCompletedForSave,
  getQuestCompletionOptOutForSave,
  completeAllQuests,
  getTotalQuestSkillPoints,
} from './planner-quests.js';
import {
  registerAutoAddStatsToInput,
  getOSkillRowsForPlanner,
  getAllOSkills,
  getOSkillPoints,
  addOSkill,
  removeOSkill,
  changeOSkillPoints,
  clearOSkills,
  setAllOSkills,
  getOSkillIdentifierSet,
  hasAnyOSkillAllocations,
} from './planner-oskills.js';

export { Character, getCharacterInstance };
export {
  setPlannerSkillsSnapshot,
  getPlannerSkillsSnapshot,
  buildTreeSkillsCache,
  buildTreeSkillsCacheFromLoadedSkills,
  getTreeSkillsCache,
  checkPrerequisites,
  resolveCatalogRowBySkillRef,
  normalizeBuildSkillPointsForImport,
  normalizeBuildOSkillsForImport,
  getAllSkillPointsById,
  setAllSkillPoints,
  setAllSkillPointsById,
  getOSkillsForBuildExport,
  exportCharacterState,
  importCharacterState,
  updateQuestCompletion,
  getQuestCompletion,
  getTotalQuestStatPoints,
  importQuestsCompleted,
  getQuestsCompletedForSave,
  getQuestCompletionOptOutForSave,
  completeAllQuests,
  getTotalQuestSkillPoints,
  getOSkillRowsForPlanner,
  getAllOSkills,
  getOSkillPoints,
  addOSkill,
  removeOSkill,
  changeOSkillPoints,
  clearOSkills,
  setAllOSkills,
  getOSkillIdentifierSet,
  hasAnyOSkillAllocations,
};

/**
 * Initialize character state for a class
 * @param {string} className - Class name
 * @param {number} level - Character level (for max level calculations and skill point pool)
 */
export function initializeCharacter(className, level = Character.DEFAULT_LEVEL) {
  const instance = createCharacterInstance(className, level);
  notifyPlannerStateChanged({ source: 'initializeCharacter' });
  runPlannerSkillStatRecompute({ immediate: true });
  return instance;
}

/** @type {ReturnType<typeof setTimeout>|null} */
let _plannerSkillStatRecomputeTimer = null;

/**
 * Resolve merged skill levels (internal id -> points) for passive stat aggregation.
 * Regular tree skills exclude oSkill keys; oSkills override same internal id with max points.
 * @param {Character} character
 * @returns {Record<string, number>}
 */
export function buildMergedSkillLevelsForStatRecompute(character) {
  if (!character) return {};
  const store = getFileSkillStore();
  const regular = filterRegularSkillsOnly(character.getAllSkillPoints());

  /** @type {Record<string, number>} */
  const byInternal = {};

  function addPoints(skillKey, pts) {
    const n = Math.max(0, Math.floor(Number(pts) || 0));
    if (n <= 0) return;
    let internal = String(skillKey).trim();
    if (store) {
      const row =
        store.catalogByInternalId?.get(internal) ??
        (/^\d+$/.test(internal)
          ? store.catalog?.find((r) => Number(r?.numericId) === Number(internal))
          : null) ??
        store.catalogByInternalId?.get(
          internal.toLowerCase().replace(/'/g, '').replace(/\s+/g, '_')
        ) ??
        store.catalog?.find(
          (r) => String(r?.displayName || '').trim().toLowerCase() === internal.toLowerCase()
        );
      if (row?.id) internal = String(row.id);
    }
    if (character.isSkillDisabled(internal)) return;
    byInternal[internal] = (byInternal[internal] || 0) + n;
  }

  for (const [k, v] of Object.entries(regular)) {
    addPoints(k, v);
  }

  for (const row of character.oSkills || []) {
    const p = Character.clampOSkillPoints(row?.points ?? 0);
    if (p <= 0) continue;
    const sid = String(row?.slotId ?? '').trim();
    if (sid && character.isOSkillSlotDisabled(sid)) continue;
    if (row.skillName) {
      const rowHit = store?.catalogByInternalId?.get(String(row.skillName).trim());
      const id = rowHit?.id ? String(rowHit.id) : String(row.skillName).trim();
      const cur = byInternal[id] || 0;
      byInternal[id] = Math.max(cur, p);
      continue;
    }
    if (row.skillId != null && store) {
      const hit = store.lookupSkillNameAndDisplayByNumericId(row.skillId);
      if (hit?.name) {
        const id = String(hit.name);
        const cur = byInternal[id] || 0;
        byInternal[id] = Math.max(cur, p);
      }
    }
  }

  return byInternal;
}

/**
 * Internal catalog ids with points from tree skills and oSkills (matches stat recompute).
 * @returns {Set<string>}
 */
export function getActiveInternalSkillIdsForConditions() {
  if (!getCharacterInstance()) return new Set();
  return new Set(Object.keys(buildMergedSkillLevelsForStatRecompute(getCharacterInstance())));
}

async function runPlannerSkillStatRecomputeImpl() {
  if (!getCharacterInstance()) return;
  const mergedBlvl = buildMergedSkillLevelsForStatRecompute(getCharacterInstance());
  let allSkillsBonus = 0;
  if (typeof document !== 'undefined') {
    const inp = document.getElementById('allSkillsBonus');
    if (inp instanceof HTMLInputElement) {
      allSkillsBonus = Math.max(0, Math.floor(parseInt(inp.value, 10) || 0));
    }
  }
  await recomputePlannerStatsFromSkillAllocations(getCharacterInstance(), {
    effectiveLevel: getEffectivePlannerLevel(),
    treeSkillsCache: getTreeSkillsCache(),
    allSkillsBonus,
    mergedBlvl
  });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('plannerStatsPanelRefresh'));
  }
}

/**
 * Debounced passive stat recompute from allocated skills (scalingConstants).
 * @param {{ immediate?: boolean }} [options]
 */
export function runPlannerSkillStatRecompute(options = {}) {
  if (!getCharacterInstance()) return;
  if (options.immediate === true) {
    if (_plannerSkillStatRecomputeTimer != null && typeof window !== 'undefined') {
      window.clearTimeout(_plannerSkillStatRecomputeTimer);
      _plannerSkillStatRecomputeTimer = null;
    }
    void runPlannerSkillStatRecomputeImpl();
    return;
  }
  if (typeof window === 'undefined') {
    void runPlannerSkillStatRecomputeImpl();
    return;
  }
  if (_plannerSkillStatRecomputeTimer != null) {
    window.clearTimeout(_plannerSkillStatRecomputeTimer);
  }
  _plannerSkillStatRecomputeTimer = window.setTimeout(() => {
    _plannerSkillStatRecomputeTimer = null;
    void runPlannerSkillStatRecomputeImpl();
  }, 55);
}

/**
 * Invoked when skill allocations change (debounced in tree). Extensible for skill-driven stat deltas.
 */
export function onPlannerSkillAllocationChanged() {
  runPlannerSkillStatRecompute();
}

/**
 * Planner level for life/mana scaling and header "Level N".
 * When {@link getPlannerAutoLevelFromSpentSkillPoints} is true (default): max of stored level and
 * minimum level required by the current allocation once any skill points are spent.
 * When false: uses stored level only (manual control via planner options).
 */
export function getEffectivePlannerLevel() {
  if (!getCharacterInstance()) return Character.DEFAULT_LEVEL;
  const stored = Character.clampLevel(getCharacterInstance().level);
  const autoLevelFromSpent = getPlannerAutoLevelFromSpentSkillPoints();
  if (!autoLevelFromSpent) {
    return stored;
  }
  const spent = getCharacterInstance().getSpentSkillPoints();
  if (spent <= 0) {
    return stored;
  }
  const minForBuild = getCharacterInstance().getMinimumRequiredLevel(getPlannerSkillsSnapshot());
  return Math.max(stored, minForBuild);
}

/**
 * Set planner core stats from game_meta classes: attributes from base_*; life/mana from scaling.
 * @param {string} className
 */
export function applyClassBaselineStatsToCharacter(className) {
  if (!getCharacterInstance() || !className) return;
  const row = getClassPlannerStatDefaults(className);
  if (!row) return;
  const level = getEffectivePlannerLevel();
  const next = { ...getCharacterInstance().getAllRawStats() };
  next.strength = normalizePlannerStatValue('strength', row.strength);
  next.dexterity = normalizePlannerStatValue('dexterity', row.dexterity);
  next.energy = normalizePlannerStatValue('energy', row.energy);
  next.vitality = normalizePlannerStatValue('vitality', row.vitality);
  const { life, mana } = computeClassDerivedLifeMana(level, next.vitality, next.energy, row);
  const lifeBonus = getCharacterInstance().getTotalQuestLifeBonus();
  next.life = normalizePlannerStatValue('life', life + lifeBonus);
  next.mana = normalizePlannerStatValue('mana', mana);
  getCharacterInstance().setAllStats(next);
}

/**
 * Recompute life/mana from class scaling only (keeps str/dex/ene/vit and other stats as-is).
 */
export function recomputeClassDerivedLifeMana() {
  if (!getCharacterInstance()) return;
  const className = getCharacterInstance().className;
  if (!className) return;
  const row = getClassPlannerStatDefaults(className);
  if (!row) return;
  const level = getEffectivePlannerLevel();
  const vit = getCharacterInstance().getRawStat('vitality');
  const ene = getCharacterInstance().getRawStat('energy');
  const { life, mana } = computeClassDerivedLifeMana(level, vit, ene, row);
  const lifeBonus = getCharacterInstance().getTotalQuestLifeBonus();
  getCharacterInstance().setRawStat('life', normalizePlannerStatValue('life', life + lifeBonus));
  getCharacterInstance().setRawStat('mana', normalizePlannerStatValue('mana', mana));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('plannerStatsPanelRefresh'));
    window.dispatchEvent(new CustomEvent('characterStatsChanged', { detail: { derivedLifeMana: true } }));
  }
}

/**
 * @param {string} internalId Internal skill id (skills.json `id`)
 */
export function isSkillDisabled(internalId) {
  return getCharacterInstance() ? getCharacterInstance().isSkillDisabled(internalId) : false;
}

/**
 * @param {string} slotId oSkill row id from Character.oSkills[].slotId
 */
export function isOSkillSlotDisabled(slotId) {
  return getCharacterInstance() ? getCharacterInstance().isOSkillSlotDisabled(slotId) : false;
}

/**
 * Toggle planner stat contribution for a skill (does not change allocated points).
 * @param {string} internalId
 * @param {boolean} disabled
 */
export function setSkillDisabled(internalId, disabled) {
  if (!getCharacterInstance()) return;
  getCharacterInstance().setSkillDisabled(internalId, disabled);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('skillPointsChanged', {
        detail: {
          skillName: internalId != null ? String(internalId) : null,
          action: 'toggleDisabled'
        }
      })
    );
  }
  runPlannerSkillStatRecompute({ immediate: true });
}

/**
 * Toggle planner stat contribution for one oSkill row (tree disable is separate).
 * @param {string} slotId
 * @param {boolean} disabled
 */
export function setOSkillSlotDisabled(slotId, disabled) {
  if (!getCharacterInstance()) return;
  getCharacterInstance().setOSkillSlotDisabled(slotId, disabled);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('skillPointsChanged', {
        detail: {
          skillName: slotId != null ? String(slotId) : null,
          action: 'toggleDisabledOSkill'
        }
      })
    );
  }
  runPlannerSkillStatRecompute({ immediate: true });
}

/** @returns {string[]} */
export function getDisabledSkillIds() {
  return getCharacterInstance() ? getCharacterInstance().getDisabledSkillIds() : [];
}

/** @returns {string[]} */
export function getDisabledOSkillSlotIds() {
  return getCharacterInstance() ? getCharacterInstance().getDisabledOSkillSlotIds() : [];
}

/** @param {unknown} list */
export function setDisabledSkillIds(list) {
  if (!getCharacterInstance()) return;
  getCharacterInstance().setDisabledSkillIds(list);
}

/** @param {unknown} list */
export function setDisabledOSkillSlotIds(list) {
  if (!getCharacterInstance()) return;
  getCharacterInstance().setDisabledOSkillSlotIds(list);
}

/**
 * Set character level
 * @param {number} level - New character level
 */
export function setCharacterLevel(level) {
  if (!getCharacterInstance()) {
    console.warn('setCharacterLevel: Character instance not initialized');
    return false;
  }
  const ok = getCharacterInstance().setCharacterLevel(level);
  if (ok) notifyPlannerStateChanged({ source: 'setCharacterLevel' });
  return ok;
}

/**
 * Get current character level
 * @returns {number} Character level
 */
export function getCharacterLevel() {
  return getCharacterInstance() ? getCharacterInstance().level : Character.DEFAULT_LEVEL;
}

/**
 * Get skill points for a skill
 * @param {string} skillName - Skill name
 * @returns {number} Points allocated
 */
export function getSkillPoints(skillName) {
  return getCharacterInstance() ? getCharacterInstance().getSkillPoints(skillName) : 0;
}

/**
 * Get all skill points (regular skills only, excludes oSkills)
 * @returns {object} Map of skill_name -> points
 */
export function getAllSkillPoints() {
  return getCharacterInstance() ? getCharacterInstance().getAllSkillPoints() : {};
}

/**
 * Get all regular skill points explicitly (excludes oSkills)
 * This ensures oSkills never affect regular skill calculations
 * @returns {object} Map of skill_name -> points (regular skills only)
 */
export function getRegularSkillPoints() {
  // getAllSkillPoints already excludes oSkills since they're stored separately
  // But this function makes the intent explicit
  return getAllSkillPoints();
}

/**
 * Total available skill points at the given character level (base + quest tab rewards).
 * When `characterLevel` is omitted, uses {@link getEffectivePlannerLevel}.
 * @param {number} [characterLevel]
 * @returns {number}
 */
export function getAvailableSkillPoints(characterLevel) {
  if (!getCharacterInstance()) return 0;
  const plannerLevel =
    characterLevel != null && Number.isFinite(Number(characterLevel))
      ? Character.clampLevel(Number(characterLevel))
      : getEffectivePlannerLevel();
  const basePoints = Character.getBaseSkillPoints(plannerLevel);
  const questPoints = getCharacterInstance().getTotalQuestSkillPoints(plannerLevel);
  return basePoints + questPoints;
}

/**
 * Calculate total spent skill points
 * @returns {number} Total points spent
 */
export function getSpentSkillPoints() {
  return getCharacterInstance() ? getCharacterInstance().getSpentSkillPoints() : 0;
}

/**
 * Spent tree skill points exceed the pool shown in the planner header (same rule as PlannerSkillPointsBadge).
 * @returns {boolean}
 */
export function isPlannerSkillPointPoolOverBudget() {
  if (!getCharacterInstance()) return false;
  const spent = getCharacterInstance().getSpentSkillPoints();
  const plannerLevel = getEffectivePlannerLevel();
  const base = Character.getBaseSkillPoints(plannerLevel);
  const quest = getCharacterInstance().getTotalQuestSkillPoints(plannerLevel);
  return spent > base + quest;
}

/**
 * Calculate remaining skill points
 * @returns {number} Points remaining to spend
 */
export function getRemainingSkillPoints() {
  if (!getCharacterInstance()) return 0;
  const plannerLevel = getEffectivePlannerLevel();
  const basePoints = Character.getBaseSkillPoints(plannerLevel);
  const questPoints = getCharacterInstance().getTotalQuestSkillPoints(plannerLevel);
  const spent = getCharacterInstance().getSpentSkillPoints();
  return basePoints + questPoints - spent;
}

/**
 * Calculate minimum character level required for current skill allocation
 * Takes into account spent skill points, quest rewards, and skill prerequisites
 * @param {Array|null} [allSkills] - when non-empty, used for character_level prerequisites instead of planner snapshot
 * @returns {number} Minimum character level needed
 */
export function getMinimumRequiredLevel(allSkills = null) {
  if (!getCharacterInstance()) return Character.MIN_LEVEL;
  const skills =
    Array.isArray(allSkills) && allSkills.length > 0 ? allSkills : getPlannerSkillsSnapshot();
  return getCharacterInstance().getMinimumRequiredLevel(skills);
}

/**
 * Raise planner character level so the build meets minimum level (skill point pool + prereqs).
 * @param {Array|null} allSkills
 */
function bumpCharacterLevelToMinimumRequired(allSkills = null) {
  if (!getCharacterInstance()) return;
  if (!getPlannerAutoLevelFromSpentSkillPoints()) return;
  const needed = getMinimumRequiredLevel(allSkills);
  if (getCharacterInstance().level < needed) {
    setCharacterLevel(needed);
  }
}

/**
 * When auto-level mode is on, raise stored level to the minimum required by the current build.
 */
export function syncPlannerCharacterLevelIfAuto(allSkills = null) {
  bumpCharacterLevelToMinimumRequired(allSkills);
}

/**
 * When auto-level mode is on and the skill point pool is empty, probe +1 on skillName
 * and raise stored level if the build requires it.
 * @param {string} skillName
 * @param {Array} allSkills
 * @returns {number} Remaining skill points after a possible level bump
 */
function ensureRemainingSkillPointsForAutoLevel(skillName, allSkills) {
  let remaining = getRemainingSkillPoints();
  if (remaining > 0 || !getPlannerAutoLevelFromSpentSkillPoints() || !getCharacterInstance()) {
    return remaining;
  }

  const prevPoints = getSkillPoints(skillName);
  getCharacterInstance().skillPoints[skillName] = prevPoints + 1;
  getCharacterInstance().maxLevels = {};
  const neededAfterSpend = getMinimumRequiredLevel(allSkills);
  if (prevPoints <= 0) {
    delete getCharacterInstance().skillPoints[skillName];
  } else {
    getCharacterInstance().skillPoints[skillName] = prevPoints;
  }
  getCharacterInstance().maxLevels = {};
  if (getCharacterInstance().level < neededAfterSpend) {
    setCharacterLevel(neededAfterSpend);
  }
  return getRemainingSkillPoints();
}

/**
 * Add a point to a skill
 * @param {string} skillName - Skill name
 * @param {object} skill - Skill object with prerequisites
 * @param {number} maxLevel - Maximum level for this skill
 * @param {Array} allSkills - Array of all skills for prerequisite validation
 * @returns {object} { success: boolean, reason: string }
 */
export function addSkillPoint(skillName, skill, maxLevel, allSkills = [], skipEvent = false) {
  const currentPoints = getSkillPoints(skillName);
  
  // Check if at max level BEFORE adding the point
  // Note: For self-scaling skills, the caller should recalculate maxLevel in the loop
  if (currentPoints >= maxLevel) {
    return { success: false, reason: 'Skill is at maximum level' };
  }
  
  // Check if we have skill points available
  const remainingPoints = ensureRemainingSkillPointsForAutoLevel(skillName, allSkills);
  if (remainingPoints <= 0) {
    return { success: false, reason: 'No skill points remaining' };
  }
  
  if (currentPoints === 0) {
    const character = getCharacterInstance();
    const regularSkillLevels = character ? filterRegularSkillsOnly(character.skillPoints) : {};
    const check = runFirstPointAllocationChecks(
      skill,
      allSkills,
      regularSkillLevels,
      checkPrerequisites,
      { mode: 'block' }
    );
    if (check.blocked) {
      return { success: false, reason: check.reason };
    }
  }

  const character = getCharacterInstance();
  if (character) {
    character.skillPoints[skillName] = currentPoints + 1;
    character.maxLevels = {};

    bumpCharacterLevelToMinimumRequired(allSkills);
    autoAddStatsToInput(skill.skillId);

    if (!skipEvent) {
      notifySkillPointsChanged(skillName, 'add');
    }
  }

  return { success: true, reason: '' };
}

/**
 * Add multiple skill points at once (for batch operations like shift-click)
 * @param {string} skillName - Skill name
 * @param {object} skill - Skill object
 * @param {number} amount - Number of points to add
 * @param {Array} allSkills - Array of all skills
 * @param {() => number} [getMaxLevelFn] - Returns current max level (may change during batch)
 * @returns {object} { success: boolean, pointsAdded: number, reason: string }
 */
export function addSkillPointsBatch(skillName, skill, amount, allSkills = [], getMaxLevelFn = null) {
  if (!getCharacterInstance()) {
    return { success: false, pointsAdded: 0, reason: 'Character not initialized' };
  }
  
  let pointsAdded = 0;

  for (let i = 0; i < amount; i++) {
    const currentPoints = getSkillPoints(skillName);
    
    // Get current max level (may change for self-scaling skills)
    const maxLevel = getMaxLevelFn ? getMaxLevelFn() : (skill.baseMaxLevel || 150);
    
    // Check if at max level
    if (currentPoints >= maxLevel) {
      break; // Can't add more points
    }
    
    // Check if we have skill points available (auto-level may raise level first)
    const remainingPoints = ensureRemainingSkillPointsForAutoLevel(skillName, allSkills);
    if (remainingPoints <= 0) {
      break; // No more skill points available
    }
    
    if (currentPoints === 0) {
      const character = getCharacterInstance();
      const regularSkillLevels = character ? filterRegularSkillsOnly(character.skillPoints) : {};
      const check = runFirstPointAllocationChecks(
        skill,
        allSkills,
        regularSkillLevels,
        checkPrerequisites,
        { mode: 'block' }
      );
      if (check.blocked) {
        return { success: pointsAdded > 0, pointsAdded, reason: check.reason };
      }
    }

    getCharacterInstance().skillPoints[skillName] = currentPoints + 1;
    getCharacterInstance().maxLevels = {}; // Clear cache as max levels may change
    
    // Auto-add required stats to input field (only need to do this once)
    if (pointsAdded === 0) {
      autoAddStatsToInput(skill.skillId);
    }
    
    pointsAdded++;
  }

  if (pointsAdded > 0) {
    bumpCharacterLevelToMinimumRequired(allSkills);
  }

  // Dispatch single event after all points are added
  if (pointsAdded > 0) {
    notifySkillPointsChanged(skillName, 'add', pointsAdded);
  }

  return { success: pointsAdded > 0, pointsAdded, reason: pointsAdded === 0 ? 'No points could be added' : '' };
}

/**
 * Check if removing a point from a skill would cause other skills to exceed their max level
 * This prevents removing points from skills like Specialization when it would break other skills
 * @param {string} skillName - Skill name being removed
 * @param {Array} allSkills - Array of all skills
 * @returns {object} { allowed: boolean, reason: string }
 */
function checkMaxLevelDependencies(skillName, allSkills = []) {
  // Skills that affect max levels: specialization, noxious_mastery, elemental_command
  const maxLevelAffectingSkills = ['specialization', 'noxious_mastery', 'elemental_command'];
  
  if (!maxLevelAffectingSkills.includes(skillName)) {
    return { allowed: true, reason: '' };
  }
  
  if (!getCharacterInstance()) return { allowed: true, reason: '' };
  
  // Simulate removing the point
  const simulatedSkillPoints = { ...getCharacterInstance().skillPoints };
  const currentPoints = simulatedSkillPoints[skillName] || 0;
  if (currentPoints > 1) {
    simulatedSkillPoints[skillName] = currentPoints - 1;
  } else {
    delete simulatedSkillPoints[skillName];
  }
  
  // Check all skills that have points allocated
  for (const [allocatedSkillName, allocatedPoints] of Object.entries(getCharacterInstance().skillPoints)) {
    if (allocatedPoints === 0) continue;
    
    // Find the skill object
    const skill = allSkills.find(s => s.id === allocatedSkillName);
    if (!skill) continue;
    
    // Calculate what the new max level would be with the simulated removal
    const newMaxLevel = calculateMaxLevel(skill.skillId, simulatedSkillPoints, getCharacterInstance().level);
    
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
 * @returns {object} { success: boolean, reason: string }
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
  if (getCharacterInstance()) {
    getCharacterInstance().skillPoints[skillName] = currentPoints - 1;
    if (getCharacterInstance().skillPoints[skillName] === 0) {
      delete getCharacterInstance().skillPoints[skillName];
    }

    getCharacterInstance().pruneDisabledSkillsWithoutAllocatedPoints();
    
    getCharacterInstance().maxLevels = {}; // Clear cache as max levels may change
    
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
 * @returns {object} { success: boolean, pointsRemoved: number, reason: string }
 */
export function removeSkillPointsBatch(skillName, amount, allSkills = []) {
  if (!getCharacterInstance()) {
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
    getCharacterInstance().skillPoints[skillName] = currentPoints - 1;
    if (getCharacterInstance().skillPoints[skillName] === 0) {
      delete getCharacterInstance().skillPoints[skillName];
    }
    
    getCharacterInstance().maxLevels = {}; // Clear cache as max levels may change
    
    pointsRemoved++;
  }

  if (pointsRemoved > 0) {
    getCharacterInstance().pruneDisabledSkillsWithoutAllocatedPoints();
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
  if (!getCharacterInstance()) return [];

  const actualCharacterLevel = getMinimumRequiredLevel(allSkills);
  const skillLevels = getAllSkillPoints();
  const exceedingSkills = [];
  
  // Check each skill that has points allocated
  for (const [skillName, currentPoints] of Object.entries(getCharacterInstance().skillPoints)) {
    if (currentPoints === 0) continue;
    
    // Find the skill object
    const skill = allSkills.find(s => s.id === skillName);
    if (!skill) continue;
    
    // Calculate the current maximum level for this skill
    const effectiveMaxLevel = calculateMaxLevel(skill.skillId, skillLevels, actualCharacterLevel);
    
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
 * @returns {object} {minRequired: number, blockingSkills: Array}
 */
function getMinimumRequiredPointsWithBlockingSkills(skillName, allSkills) {
  let minRequired = 0;
  const blockingSkills = [];
  
  if (!getCharacterInstance()) return { minRequired: 0, blockingSkills: [] };
  
  // Check all skills that have points allocated
  for (const [allocatedSkillName, points] of Object.entries(getCharacterInstance().skillPoints)) {
    if (points === 0) continue;
    
    // Find the skill object
    const skill = allSkills.find(s => s.id === allocatedSkillName);
    if (!skill || !skill.prerequisites) continue;
    
    // Check if this skill depends on the skill we're checking
    for (const prereq of skill.prerequisites) {
      const [type, value, target] = prereq.split(':');
      
      if (type === 'skill_level') {
        const targetSkillName = normalizePrereqSkillTargetKey(target);
        
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
  if (getCharacterInstance()) {
    getCharacterInstance().resetAllSkillPoints();
    notifyPlannerStateChanged({ source: 'resetAllSkillPoints' });
  }
}

/**
 * Get total skill points allocated
 * @returns {number} Total points
 */
export function getTotalSkillPoints() {
  return getCharacterInstance() ? getCharacterInstance().getTotalSkillPoints() : 0;
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
  return getCharacterInstance() ? getCharacterInstance().getStat(statKey) : 0;
}

/**
 * Set stat value for a given stat key
 * @param {string} statKey - Stat key (e.g., 'strength', 'dexterity')
 * @param {number} value - Stat value
 */
export function setStat(statKey, value) {
  if (getCharacterInstance()) {
    getCharacterInstance().setStat(statKey, value);
  }
}

/**
 * Get all stats
 * @returns {object} Map of stat_key -> value
 */
export function getAllStats() {
  return getCharacterInstance() ? getCharacterInstance().getAllStats() : {};
}

/**
 * Set all stats (used for loading builds)
 * @param {object} stats - Map of stat_key -> value
 */
export function setAllStats(stats) {
  if (getCharacterInstance()) {
    getCharacterInstance().setAllStats(stats);
    runPlannerSkillStatRecompute({ immediate: true });
  }
}

/**
 * Clear all stats
 */
export function clearAllStats() {
  if (getCharacterInstance()) {
    getCharacterInstance().clearAllStats();
    runPlannerSkillStatRecompute({ immediate: true });
  }
}

/**
 * Parse and set stats from a text field (one stat per line)
 * Format: {{statKey}}=value or statKey=value
 * @param {string} text - Text containing stat definitions (one per line)
 * @returns {Array} Array of error messages, empty if no errors
 */
export function parseStatsFromText(text) {
  if (!getCharacterInstance()) return ['Character not initialized'];
  const errors = getCharacterInstance().parseStatsFromText(text);
  if (errors.length === 0) {
    runPlannerSkillStatRecompute({ immediate: true });
  }
  return errors;
}

/**
 * Export stats to text format (one stat per line)
 * Format: {{statKey}}=value
 * @returns {string} Text representation of stats
 */
export function exportStatsToText() {
  return getCharacterInstance() ? getCharacterInstance().exportStatsToText() : '';
}

/**
 * Get all formulas used by a skill for auto-adding stats
 * @param {number} skillId - Numeric catalog skill id
 */
function pushStatKeyAsFormula(formulas, statKey) {
  const trimmedKey = String(statKey || '').trim();
  if (!trimmedKey) return;
  formulas.push(`{{${trimmedKey}}}`);
}

async function getSkillFormulas(skillId) {
  const store = getFileSkillStore();
  if (!store) return [];
  const internal = store.internalNameByNumericId(skillId);
  if (!internal) return [];
  const formulas = [];
  try {
    await store.loadSkillBalance(internal);
    const bal = store.getSkillBalanceSync(internal);
    for (const r of bal?.scaling || []) {
      if (r?.statKey) pushStatKeyAsFormula(formulas, r.statKey);
      for (const k of ['value0', 'value1', 'value2', 'value3']) {
        if (r[k]) formulas.push(String(r[k]));
      }
    }
    for (const r of bal?.scalingConstants || []) {
      if (r?.statKey) pushStatKeyAsFormula(formulas, r.statKey);
      for (const k of ['value0', 'value1', 'value2', 'value3']) {
        if (r[k]) formulas.push(String(r[k]));
      }
    }
    const det = store.getSkillDetail(internal);
    if (det) {
      for (const field of ['description', 'skill_effect', 'restriction']) {
        const t = det[field];
        if (t != null && String(t).trim() !== '') {
          formulas.push(String(t));
        }
      }
      for (let j = 1; j <= 6; j++) {
        const calcFormula = det[`calc${j}`];
        if (calcFormula != null && String(calcFormula).trim() !== '') {
          formulas.push(String(calcFormula));
        }
      }
    }
  } catch (error) {
    console.warn('Error getting skill formulas (file):', error);
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

  // Extract all stat references from all formulas
  const statRefsSet = new Set();
  for (const formula of formulas) {
    const stats = extractStatReferences(formula);
    stats.forEach(stat => statRefsSet.add(stat));
  }
  
  if (statRefsSet.size === 0) return; // No stat references found

  if (!getCharacterInstance()) return;

  const next = { ...getCharacterInstance().getAllRawStats() };
  let added = false;
  for (const statName of statRefsSet) {
    const k = String(statName).toLowerCase();
    if (!isPlannerBaseStatKey(k)) continue;
    if (!Object.prototype.hasOwnProperty.call(next, k)) {
      next[k] = normalizePlannerStatValue(k, 0);
      added = true;
    }
  }
  if (!added) return;

  getCharacterInstance().setAllStats(next);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('plannerStatsPanelRefresh'));
    window.dispatchEvent(new CustomEvent('characterStatsChanged', { detail: { autoStats: true } }));
  }
}

registerAutoAddStatsToInput(autoAddStatsToInput);

/**
 * Filter skill levels to exclude oSkills
 * Ensures oSkill points never affect regular skill calculations
 * @param {object} skillLevels - Object mapping skill_name/ID to points
 * @returns {object} Filtered skill levels with only regular skills
 */
const OSKILL_HARD_CAP = 150;

const SKILL_PROFILES = {
  regular: {
    maxLevel(skillId, skillLevels, characterLevel) {
      return calculateMaxLevel(skillId, skillLevels, characterLevel);
    },
    includeRestrictions: true
  },
  oskill: {
    maxLevel() {
      return OSKILL_HARD_CAP;
    },
    includeRestrictions: false
  }
};

export function getSkillProfile(skillType = 'regular') {
  return SKILL_PROFILES[skillType] || SKILL_PROFILES.regular;
}

function filterRegularSkillsOnly(skillLevels) {
  const oSkillKeys = getOSkillIdentifierSet();

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
 * @param {number} skillId - Numeric catalog id for regular skills, or oSkill identifier
 * @param {string} skillType - 'regular' | 'oskill'
 * @param {object} skillLevels - Object mapping skill_name to current skill level (should only contain regular skills, not oSkills)
 * @param {number} characterLevel - Current character level
 * @returns {number} Effective max level (capped at 150)
 */
export function calculateEffectiveMaxLevel(skillId, skillType, skillLevels = {}, characterLevel = Character.DEFAULT_LEVEL) {
  const profile = getSkillProfile(skillType);
  const effectiveSkillLevels =
    profile.includeRestrictions ? filterRegularSkillsOnly(skillLevels) : skillLevels;

  if (profile.includeRestrictions && !getFileSkillStore()) {
    console.warn('calculateEffectiveMaxLevel: No file skill store for max level calculation');
    return 0;
  }

  return profile.maxLevel(skillId, effectiveSkillLevels, characterLevel);
}

/**
 * Get all restrictions for a skill
 * Consolidated from SkillValidationService
 * @param {object} skill - Skill object (for regular skills) or skill metadata (for oSkills)
 * @param {string} skillType - 'regular' | 'oskill'
 * @param {number} currentPoints - Current points allocated
 * @param {Array} allSkills - Array of all skills (for regular skills only)
 * @param {object} skillLevels - Object mapping skill_name to current skill level (should exclude oSkills for regular skills)
 * @returns {Array} Array of {type: string, reason: string} restriction objects
 */
export function getSkillRestrictions(skill, skillType, currentPoints, allSkills = [], skillLevels = {}) {
  const profile = getSkillProfile(skillType);
  const restrictions = [];

  if (!profile.includeRestrictions) {
    return restrictions;
  }

  // For regular skills, ensure skillLevels excludes oSkills
  const regularSkillLevels = filterRegularSkillsOnly(skillLevels);

  // Skip all checks if skill already has points (can always add more)
  if (currentPoints > 0) {
    return restrictions;
  }

  const check = runFirstPointAllocationChecks(
    skill,
    allSkills,
    regularSkillLevels,
    checkPrerequisites,
    { mode: 'list' }
  );
  return check.restrictions;
}

/**
 * Check if a skill can have points allocated
 * Consolidated from SkillService/SkillValidationService
 * @param {object} skill - Skill object or skill metadata
 * @param {string} skillType - 'regular' | 'oskill'
 * @param {number} currentPoints - Current points allocated
 * @param {number} maxPoints - Maximum points allowed
 * @param {Array} allSkills - Array of all skills (for regular skills only)
 * @param {object} skillLevels - Object mapping skill_name to current skill level
 * @returns {boolean} True if skill can have points allocated
 */
export function canAllocateSkillPoints(skill, skillType, currentPoints, maxPoints, allSkills = [], skillLevels = {}) {
  const profile = getSkillProfile(skillType);
  // Check if already at max
  if (currentPoints >= maxPoints) {
    return false;
  }

  // If skill already has points, it can always add more
  if (currentPoints > 0) {
    return true;
  }

  // For oSkills, only check max level (handled above)
  if (!profile.includeRestrictions) {
    return true;
  }

  // For regular skills, check restrictions
  const regularSkillLevels = filterRegularSkillsOnly(skillLevels);
  const restrictions = getSkillRestrictions(skill, skillType, currentPoints, allSkills, regularSkillLevels);
  return restrictions.length === 0;
}