/**
 * Character class
 * Central place for character-related default values, constants, and instance management
 */
import {
  normalizePlannerStatValue,
  plannerStatsToTextLines,
  isPlannerBaseStatKey,
  createEmptyRegisteredStatsObject
} from './planner-stats-config.js';
import { getPlannerSkillsSnapshot } from './character-state.js';
import { minCharacterLevelForAllocatedSkillPoints } from '../skills/skill-calculations.js';

export default class Character {
  // Level constraints
  static MIN_LEVEL = 1;
  static MAX_LEVEL = 150;
  static DEFAULT_LEVEL = 1;
  static OSKILL_MAX_POINTS = 150;
  
  /**
   * All planner quests: `type` selects behavior; `reward` lists per-difficulty `amount` (and `expectedLevel` for reference).
   * @type {Record<string, { type: 'skill_point'|'stat_points'|'signet_cap'|'flat_life', reward: Record<string, { amount: number, expectedLevel: number }> }>}
   */
  static QUESTS = {
    den_of_evil: {
      type: 'skill_point',
      reward: {
        normal: { amount: 1, expectedLevel: 5 },
        nightmare: { amount: 1, expectedLevel: 60 },
        hell: { amount: 1, expectedLevel: 105 }
      }
    },
    radament: {
      type: 'skill_point',
      reward: {
        normal: { amount: 1, expectedLevel: 18 },
        nightmare: { amount: 1, expectedLevel: 70 },
        hell: { amount: 1, expectedLevel: 107 }
      }
    },
    izual: {
      type: 'skill_point',
      reward: {
        normal: { amount: 2, expectedLevel: 35 },
        nightmare: { amount: 2, expectedLevel: 90 },
        hell: { amount: 2, expectedLevel: 110 }
      }
    },
    inquisitor_of_the_triune: {
      type: 'skill_point',
      reward: {
        hell: { amount: 2, expectedLevel: 115 }
      }
    },
    "lam_essen's_tome": {
      type: 'stat_points',
      reward: {
        normal: { amount: 10, expectedLevel: 25 },
        nightmare: { amount: 10, expectedLevel: 80 },
        hell: { amount: 10, expectedLevel: 107 }
      }
    },
    justicar_signet: {
      type: 'signet_cap',
      reward: {
        hell: { amount: 50, expectedLevel: 115 }
      }
    },
    golden_bird: {
      type: 'flat_life',
      reward: {
        normal: { amount: 50, expectedLevel: 25 },
        nightmare: { amount: 50, expectedLevel: 80 },
        hell: { amount: 50, expectedLevel: 107 }
      }
    }
  };

  static STAT_ALLOCATION_KEYS = ['strength', 'dexterity', 'vitality', 'energy'];

  /**
   * Sum `amount` for a quest definition. If `diffState` is set, only count difficulties where `diffState[diff]` is true.
   * If `diffState` is null/undefined, sum every defined difficulty.
   * @param {{ reward?: Record<string, { amount?: number }> }} def
   * @param {{ normal?: boolean, nightmare?: boolean, hell?: boolean } | null | undefined} diffState
   * @returns {number}
   */
  static sumQuestRewardAmounts(def, diffState) {
    let sum = 0;
    if (!def?.reward) return 0;
    for (const diff of ['normal', 'nightmare', 'hell']) {
      const slot = def.reward[diff];
      if (!slot || typeof slot.amount !== 'number') continue;
      if (diffState != null && !diffState[diff]) continue;
      sum += slot.amount;
    }
    return sum;
  }

  /**
   * @returns {string[]}
   */
  static getQuestRewardQuestIds() {
    return Object.keys(Character.QUESTS);
  }

  /**
   * Total flat life from completed flat_life quests.
   * @returns {number}
   */
  getTotalQuestLifeBonus() {
    let total = 0;
    for (const [questId, def] of Object.entries(Character.QUESTS)) {
      if (def.type !== 'flat_life') continue;
      total += Character.sumQuestRewardAmounts(def, this.questsCompleted[questId] || {});
    }
    return total;
  }

  /**
   * Saves without `questCompletionOptOut`: if a difficulty is still incomplete but level meets expectedLevel,
   * treat it as manually declined so loading does not auto-check over the saved state.
   * @param {number} level
   * @param {Record<string, { normal?: boolean, nightmare?: boolean, hell?: boolean }>} questsCompleted
   * @param {Record<string, { normal?: boolean, nightmare?: boolean, hell?: boolean }>} targetOptOut mutated in place
   */
  static migrateQuestOptOutFromLegacySave(level, questsCompleted, targetOptOut) {
    const L = Character.clampLevel(level);
    for (const [questId, def] of Object.entries(Character.QUESTS)) {
      if (!def.reward) continue;
      for (const diff of ['normal', 'nightmare', 'hell']) {
        const slot = def.reward[diff];
        if (!slot || typeof slot.amount !== 'number' || typeof slot.expectedLevel !== 'number') continue;
        const qc = questsCompleted[questId] || {};
        if (!qc[diff] && L >= slot.expectedLevel) {
          if (!targetOptOut[questId]) targetOptOut[questId] = {};
          targetOptOut[questId][diff] = true;
        }
      }
    }
  }

  /**
   * Apply level-based auto completion: sets a difficulty to completed when level >= expectedLevel,
   * unless that slot is opted out (user unchecked it).
   * @param {number} level
   * @returns {boolean} true if any quest checkbox changed
   */
  applyAutoQuestCompletionForLevel(level) {
    const L = Character.clampLevel(level);
    if (!this.questCompletionOptOut) this.questCompletionOptOut = {};
    let changed = false;
    for (const [questId, def] of Object.entries(Character.QUESTS)) {
      if (!def.reward) continue;
      if (!this.questsCompleted[questId]) {
        this.questsCompleted[questId] = { normal: false, nightmare: false, hell: false };
      }
      for (const diff of ['normal', 'nightmare', 'hell']) {
        const slot = def.reward[diff];
        if (!slot || typeof slot.amount !== 'number' || typeof slot.expectedLevel !== 'number') continue;
        if (L < slot.expectedLevel) continue;
        if (this.questCompletionOptOut[questId]?.[diff]) continue;
        if (!this.questsCompleted[questId][diff]) {
          this.questsCompleted[questId][diff] = true;
          changed = true;
        }
      }
    }
    if (changed) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('questCompletionChanged', { detail: { questId: null, auto: true } })
        );
      }
    }
    return changed;
  }

  /**
   * Mark every reward difficulty complete and clear opt-outs (manual "complete everything").
   */
  completeAllQuests() {
    for (const questId of Character.getQuestRewardQuestIds()) {
      const def = Character.QUESTS[questId];
      if (!def?.reward) continue;
      if (!this.questsCompleted[questId]) {
        this.questsCompleted[questId] = { normal: false, nightmare: false, hell: false };
      }
      for (const diff of ['normal', 'nightmare', 'hell']) {
        if (def.reward[diff] && typeof def.reward[diff].amount === 'number') {
          this.questsCompleted[questId][diff] = true;
        }
      }
    }
    this.questCompletionOptOut = Character.createDefaultQuestCompletionOptOut();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('questCompletionChanged', { detail: { questId: null, completeAll: true } }));
    }
  }

  /**
   * Default quest completion: nothing completed until auto (level) or manual check.
   * @returns {Record<string, { normal: boolean, nightmare: boolean, hell: boolean }>}
   */
  static createDefaultQuestsCompleted() {
    const o = {};
    for (const id of Character.getQuestRewardQuestIds()) {
      o[id] = { normal: false, nightmare: false, hell: false };
    }
    return o;
  }

  /**
   * When true for a difficulty, auto-completion will not force that checkbox on (user left it off).
   * @returns {Record<string, { normal?: boolean, nightmare?: boolean, hell?: boolean }>}
   */
  static createDefaultQuestCompletionOptOut() {
    return {};
  }

  /**
   * Returns true when the given quest state matches what applyAutoQuestCompletionForLevel
   * would produce for the given level on a fresh character (no manual changes).
   * @param {number} level
   * @param {Record<string, { normal: boolean, nightmare: boolean, hell: boolean }>} questsCompleted
   * @param {Record<string, object>} questCompletionOptOut
   * @returns {boolean}
   */
  static isDefaultQuestState(level, questsCompleted, questCompletionOptOut) {
    if (questCompletionOptOut && Object.keys(questCompletionOptOut).length > 0) return false;

    const expected = Character.createDefaultQuestsCompleted();
    const L = Character.clampLevel(level);
    for (const [questId, def] of Object.entries(Character.QUESTS)) {
      if (!def.reward) continue;
      for (const diff of ['normal', 'nightmare', 'hell']) {
        const slot = def.reward[diff];
        if (!slot || typeof slot.amount !== 'number' || typeof slot.expectedLevel !== 'number') continue;
        if (L < slot.expectedLevel) continue;
        expected[questId][diff] = true;
      }
    }

    for (const [questId, diffs] of Object.entries(expected)) {
      const actual = (questsCompleted && questsCompleted[questId]) || {};
      for (const diff of ['normal', 'nightmare', 'hell']) {
        if (!!actual[diff] !== !!diffs[diff]) return false;
      }
    }
    return true;
  }

  static createEmptyStatAllocation() {
    const o = {};
    for (const k of Character.STAT_ALLOCATION_KEYS) {
      o[k] = 0;
    }
    return o;
  }

  /**
   * Stat points from leveling: 5 per level-up from level 1 through 149 (character levels 2..150).
   * @param {number} level
   * @returns {number}
   */
  static getBaseStatPoints(level) {
    const L = Character.clampLevel(level);
    return 5 * Math.max(0, Math.min(L, Character.MAX_LEVEL) - 1);
  }

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
    this.questsCompleted = Character.createDefaultQuestsCompleted();
    this.questCompletionOptOut = Character.createDefaultQuestCompletionOptOut();
    this.statAllocation = Character.createEmptyStatAllocation();
    this.oSkills = []; // Array of {skillId, skillName, displayName, image, className, points}
    this.stats = createEmptyRegisteredStatsObject();
    /** @type {Record<string, number>} Sum of passive planner stats from allocated skills (not persisted). */
    this._plannerSkillStatBonuses = {};
    this.applyAutoQuestCompletionForLevel(this.level);
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
   * Calculate total quest skill points from completed quests (Config checkboxes only; no level gate).
   * @param {number} [_characterLevel] - unused; kept for call-site compatibility
   * @returns {number} Total quest skill points
   */
  getTotalQuestSkillPoints(_characterLevel = Character.MAX_LEVEL) {
    let total = 0;
    for (const [questId, difficulties] of Object.entries(this.questsCompleted)) {
      const def = Character.QUESTS[questId];
      if (!def || def.type !== 'skill_point') continue;
      total += Character.sumQuestRewardAmounts(def, difficulties);
    }
    return total;
  }

  /**
   * Total stat points from completed stat_points quests (no level gate).
   * @param {number} [_characterLevel] - unused; kept for call-site compatibility
   * @returns {number}
   */
  getTotalQuestStatPoints(_characterLevel = Character.MAX_LEVEL) {
    let total = 0;
    for (const [questId, difficulties] of Object.entries(this.questsCompleted)) {
      const def = Character.QUESTS[questId];
      if (!def || def.type !== 'stat_points') continue;
      total += Character.sumQuestRewardAmounts(def, difficulties);
    }
    return total;
  }

  /**
   * Sum of stat points spent on strength/dexterity/vitality/energy allocation.
   * @returns {number}
   */
  getSpentStatPoints() {
    let total = 0;
    for (const k of Character.STAT_ALLOCATION_KEYS) {
      total += Math.max(0, Math.floor(Number(this.statAllocation[k]) || 0));
    }
    return total;
  }

  /**
   * Total stat points available before spending (level-based pool only; quest stat rewards and signets are not applied).
   * @param {number} characterLevel
   * @returns {number}
   */
  getTotalAvailableStatPoints(characterLevel = Character.MAX_LEVEL) {
    const L = Character.clampLevel(characterLevel);
    return Character.getBaseStatPoints(L);
  }

  /**
   * Unspent stat points from the pool.
   * @param {number} characterLevel
   * @returns {number}
   */
  getRemainingStatPoints(characterLevel = Character.MAX_LEVEL) {
    return Math.max(0, this.getTotalAvailableStatPoints(characterLevel) - this.getSpentStatPoints());
  }

  /**
   * @param {Record<string, number>} allocation
   */
  setStatAllocation(allocation) {
    const next = Character.createEmptyStatAllocation();
    for (const k of Character.STAT_ALLOCATION_KEYS) {
      if (allocation && typeof allocation === 'object' && allocation[k] != null) {
        next[k] = Math.max(0, Math.floor(Number(allocation[k]) || 0));
      }
    }
    this.statAllocation = next;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('statAllocationChanged', { detail: { ...next } }));
    }
  }

  /** Old quest keys from prior planner versions -> {@link QUESTS} keys. */
  static LEGACY_QUEST_ID_ALIASES = {
    // Old `QUEST_SIGNET_CAP_BONUSES` used a broken string key that evaluated to this id.
    justicars_signet: 'justicar_signet'
  };

  /**
   * Wire format: per-difficulty flags as [normal, nightmare, hell] with 0/1; omit all-zero rows in saves.
   * @param {unknown} val - Legacy object or compact [n,n,n] array
   * @returns {{ normal: boolean, nightmare: boolean, hell: boolean }|null}
   */
  static normalizeQuestDifficultiesFromSave(val) {
    if (Array.isArray(val) && val.length === 3) {
      return {
        normal: !!Number(val[0]),
        nightmare: !!Number(val[1]),
        hell: !!Number(val[2]),
      };
    }
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return {
        normal: !!val.normal,
        nightmare: !!val.nightmare,
        hell: !!val.hell,
      };
    }
    return null;
  }

  /**
   * Build JSON / URL compact form: questId -> [0|1, 0|1, 0|1] for normal, nightmare, hell; skips [0,0,0].
   * @param {Record<string, { normal?: boolean, nightmare?: boolean, hell?: boolean }>} record
   * @returns {Record<string, [number, number, number]>}
   */
  static compactQuestDifficultiesForSave(record) {
    const out = {};
    if (!record || typeof record !== 'object') return out;
    for (const [questId, diff] of Object.entries(record)) {
      const n = !!(diff && diff.normal);
      const nm = !!(diff && diff.nightmare);
      const h = !!(diff && diff.hell);
      if (!n && !nm && !h) continue;
      out[questId] = [n ? 1 : 0, nm ? 1 : 0, h ? 1 : 0];
    }
    return out;
  }

  /**
   * Merge saved quest state with current defaults (new quest IDs get defaults).
   * Accepts legacy objects or compact arrays [normal, nightmare, hell] per quest id.
   * @param {Record<string, unknown>} quests
   * @param {Record<string, unknown>} [optOutFromSave]
   */
  importQuestsCompleted(quests, optOutFromSave) {
    const defaults = Character.createDefaultQuestsCompleted();
    this.questsCompleted = { ...defaults };
    const raw = { ...(quests || {}) };
    for (const key of Object.keys(raw)) {
      const norm = Character.normalizeQuestDifficultiesFromSave(raw[key]);
      if (norm) raw[key] = norm;
      else delete raw[key];
    }
    for (const [legacyId, canonicalId] of Object.entries(Character.LEGACY_QUEST_ID_ALIASES)) {
      const src = raw[legacyId];
      if (!src || typeof src !== 'object') continue;
      const cur = raw[canonicalId];
      if (!cur) {
        raw[canonicalId] = { ...src };
      } else {
        raw[canonicalId] = {
          normal: !!(cur.normal || src.normal),
          nightmare: !!(cur.nightmare || src.nightmare),
          hell: !!(cur.hell || src.hell)
        };
      }
    }
    for (const [questId, diff] of Object.entries(raw)) {
      if (!this.questsCompleted[questId]) {
        this.questsCompleted[questId] = { normal: false, nightmare: false, hell: false };
      }
      if (diff && typeof diff === 'object') {
        if (diff.normal !== undefined) this.questsCompleted[questId].normal = !!diff.normal;
        if (diff.nightmare !== undefined) this.questsCompleted[questId].nightmare = !!diff.nightmare;
        if (diff.hell !== undefined) this.questsCompleted[questId].hell = !!diff.hell;
      }
    }
    if (optOutFromSave && typeof optOutFromSave === 'object') {
      this.questCompletionOptOut = {};
      for (const [qid, val] of Object.entries(optOutFromSave)) {
        const norm = Character.normalizeQuestDifficultiesFromSave(val);
        if (norm) this.questCompletionOptOut[qid] = norm;
      }
    } else {
      this.questCompletionOptOut = Character.createDefaultQuestCompletionOptOut();
      Character.migrateQuestOptOutFromLegacySave(this.level, this.questsCompleted, this.questCompletionOptOut);
    }
    this.applyAutoQuestCompletionForLevel(this.level);
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
   * @param {Array|null} [allSkills] - when non-empty, used for character_level prerequisites instead of planner snapshot
   * @returns {number} Minimum character level needed
   */
  getMinimumRequiredLevel(allSkills = null) {
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
    
    if (spentPoints > 0) {
      const skillLevels = this.getAllSkillPoints();
      const allocatedSkillNames = [];
      
      for (const [skillName, points] of Object.entries(skillLevels)) {
        if (points > 0) {
          allocatedSkillNames.push(skillName);
        }
      }
      
      if (allocatedSkillNames.length > 0) {
        const skillsForPrereq =
          Array.isArray(allSkills) && allSkills.length > 0 ? allSkills : getPlannerSkillsSnapshot();
        if (skillsForPrereq.length > 0) {
          const className = this.className;
          for (const name of allocatedSkillNames) {
            let sk = null;
            if (className) {
              sk =
                skillsForPrereq.find((s) => s.id === name && s.class === className) ??
                null;
            }
            if (!sk) {
              sk = skillsForPrereq.find((s) => s.id === name) ?? null;
            }
            if (!sk) continue;

            const pointsInSkill = skillLevels[name] || 0;
            if (sk.skillId != null && Number.isFinite(Number(sk.skillId)) && pointsInSkill > 0) {
              const dynMin = minCharacterLevelForAllocatedSkillPoints(
                Number(sk.skillId),
                skillLevels,
                pointsInSkill
              );
              minLevelFromPrerequisites = Math.max(minLevelFromPrerequisites, dynMin);
            }

            if (!sk.prerequisites || !sk.prerequisites.length) continue;
            for (const prereq of sk.prerequisites) {
              const parts = String(prereq).split(':');
              if (parts[0] !== 'character_level') continue;
              const requiredLevel = parseInt(parts[1], 10);
              if (Number.isFinite(requiredLevel)) {
                minLevelFromPrerequisites = Math.max(
                  minLevelFromPrerequisites,
                  requiredLevel
                );
              }
            }
          }
        }
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
      this.questsCompleted[questId] = { normal: false, nightmare: false, hell: false };
    }
    if (!this.questCompletionOptOut) this.questCompletionOptOut = {};
    if (!this.questCompletionOptOut[questId]) this.questCompletionOptOut[questId] = {};

    const oldState = { ...this.questsCompleted[questId] };
    const next = {
      normal: !!(difficulties && difficulties.normal),
      nightmare: !!(difficulties && difficulties.nightmare),
      hell: !!(difficulties && difficulties.hell)
    };
    for (const diff of ['normal', 'nightmare', 'hell']) {
      if (next[diff]) {
        this.questCompletionOptOut[questId][diff] = false;
      } else {
        this.questCompletionOptOut[questId][diff] = true;
      }
    }
    this.questsCompleted[questId] = next;

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('questCompletionChanged', {
          detail: { questId, oldState, newState: this.questsCompleted[questId] }
        })
      );
    }
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
    const L = Character.clampLevel(level);
    const oldLevel = this.level;
    this.level = L;
    this.maxLevels = {}; // Clear cache
    this.applyAutoQuestCompletionForLevel(L);

    if (oldLevel !== L && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('characterLevelChanged', {
          detail: { oldLevel, newLevel: L }
        })
      );
    }
  }

  /**
   * Export character state for saving
   * @returns {Object} Character state
   */
  exportState() {
    return {
      level: this.level,
      className: this.className,
      skillPoints: { ...this.skillPoints },
      stats: { ...this.stats },
      questsCompleted: JSON.parse(JSON.stringify(this.questsCompleted)),
      questCompletionOptOut: JSON.parse(JSON.stringify(this.questCompletionOptOut || {})),
      statAllocation: { ...this.statAllocation }
    };
  }

  /**
   * Import character state from save
   * @param {Object} state - Saved character state
   */
  importState(state) {
    this.level = state.level || Character.DEFAULT_LEVEL;
    this.className = state.className || null;
    this.skillPoints = state.skillPoints ? { ...state.skillPoints } : {};
    this.maxLevels = {};
    this.setAllStats(state.stats || {});
    if (state.questsCompleted && typeof state.questsCompleted === 'object') {
      this.importQuestsCompleted(state.questsCompleted, state.questCompletionOptOut);
    } else {
      this.questsCompleted = Character.createDefaultQuestsCompleted();
      this.questCompletionOptOut = Character.createDefaultQuestCompletionOptOut();
      this.applyAutoQuestCompletionForLevel(this.level);
    }
    if (state.statAllocation && typeof state.statAllocation === 'object') {
      this.setStatAllocation(state.statAllocation);
    } else {
      this.statAllocation = Character.createEmptyStatAllocation();
    }
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
   * @param {number} skillId - Numeric catalog skill id
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
      existing.points = Character.clampOSkillPoints(existing.points + 1);
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
    
    skill.points = Character.clampOSkillPoints(newPoints);
    
    // Remove skill if points drop to 0 or below
    if (skill.points <= 0) {
      this.removeOSkill(skillIdOrName);
    }
  }

  /**
   * Clear all oSkills
   */
  clearOSkills() {
    this.oSkills = [];
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
      this.oSkills = oSkills
        .map((row) => ({
          ...row,
          points: Character.clampOSkillPoints(row?.points ?? 0)
        }))
        .filter((row) => row.points > 0);
    } else if (typeof oSkills === 'object') {
      // New format: object with skill IDs or names as keys and points as values
      this.oSkills = [];
      Object.entries(oSkills).forEach(([skillIdOrName, points]) => {
        const clampedPoints = Character.clampOSkillPoints(points);
        if (clampedPoints > 0) {
          this.oSkills.push({
            skillId: /^\d+$/.test(skillIdOrName) ? parseInt(skillIdOrName) : null,
            skillName: /^\d+$/.test(skillIdOrName) ? null : skillIdOrName,
            points: clampedPoints
          });
        }
      });
    }
  }

  static clampOSkillPoints(points) {
    const normalized = Math.floor(Number(points) || 0);
    return Math.max(0, Math.min(Character.OSKILL_MAX_POINTS, normalized));
  }

  // ===== STATS MANAGEMENT METHODS =====

  /**
   * Stored stat only (manual / saved / class-written), without passive skill bonuses.
   * @param {string} statKey
   * @returns {number}
   */
  getRawStat(statKey) {
    const k = String(statKey || '').toLowerCase();
    if (!isPlannerBaseStatKey(k)) return 0;
    const raw = this.stats[k];
    const n = typeof raw === 'number' ? raw : parseFloat(String(raw ?? '').trim());
    return Number.isFinite(n) ? n : 0;
  }

  /**
   * Get stat value for a given stat key
   * @param {string} statKey - Stat key (e.g., 'strength', 'dexterity')
   * @returns {number} Stat value, or 0 if not set
   */
  getStat(statKey) {
    const k = String(statKey || '').toLowerCase();
    if (!isPlannerBaseStatKey(k)) return 0;
    const raw = this.getRawStat(k);
    const bonus = Number(this._plannerSkillStatBonuses?.[k]) || 0;
    return normalizePlannerStatValue(k, raw + bonus);
  }

  /**
   * Set stored stat from a **displayed** value (panel input): underlying save excludes passive skill bonuses.
   * @param {string} statKey - Stat key (e.g., 'strength', 'dexterity')
   * @param {number|string} value - Value shown in the planner
   */
  setStat(statKey, value) {
    const k = String(statKey || '').trim().toLowerCase();
    if (!k || !isPlannerBaseStatKey(k)) return;
    const bonus = Number(this._plannerSkillStatBonuses?.[k]) || 0;
    const displayNum = typeof value === 'number' ? value : parseFloat(String(value).trim());
    const storedBase = Number.isFinite(displayNum) ? displayNum - bonus : 0;
    this.stats[k] = normalizePlannerStatValue(k, storedBase);
  }

  /**
   * Set stored stat directly (life/mana from class scaling, import, etc.).
   * @param {string} statKey
   * @param {number|string} value
   */
  setRawStat(statKey, value) {
    const k = String(statKey || '').trim().toLowerCase();
    if (!k || !isPlannerBaseStatKey(k)) return;
    const numValue = normalizePlannerStatValue(k, value);
    this.stats[k] = numValue;
  }

  /**
   * Replace passive skill stat bonuses (recomputed when allocations change).
   * @param {Record<string, number>} bonuses
   */
  setPlannerSkillStatBonuses(bonuses) {
    /** @type {Record<string, number>} */
    const next = {};
    for (const [k0, v] of Object.entries(bonuses || {})) {
      const k = String(k0 || '').trim().toLowerCase();
      if (!k || !isPlannerBaseStatKey(k)) continue;
      const n = Number(v);
      if (!Number.isFinite(n) || n === 0) continue;
      next[k] = n;
    }
    this._plannerSkillStatBonuses = next;
  }

  /**
   * Remove a non-baseline stat (baseline keys are always shown in the planner).
   * @param {string} statKey
   */
  removeStat(statKey) {
    void statKey;
    // Strict registry: stats cannot be removed, only reset via clearAllStats or parse/export.
  }

  /**
   * Get all stats
   * @returns {Object} Map of stat_key -> value
   */
  getAllStats() {
    const out = { ...this.stats };
    for (const k of Object.keys(out)) {
      if (!isPlannerBaseStatKey(k)) continue;
      out[k] = this.getStat(k);
    }
    return out;
  }

  /**
   * All stored stats without passive skill bonuses (for merging baselines / export consistency).
   * @returns {Record<string, number>}
   */
  getAllRawStats() {
    return { ...this.stats };
  }

  /**
   * Set all stats (used for loading builds)
   * @param {Object} stats - Map of stat_key -> value
   */
  setAllStats(stats) {
    const oldStats = { ...this.stats };
    const normalized = createEmptyRegisteredStatsObject();
    for (const [k, v] of Object.entries(stats || {})) {
      const key = String(k).trim().toLowerCase();
      if (!key || !isPlannerBaseStatKey(key)) continue;
      normalized[key] = normalizePlannerStatValue(key, v);
    }
    this.stats = normalized;
    
    // Dispatch event if stats changed
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('characterStatsChanged', { 
        detail: { oldStats, newStats: this.stats } 
      }));
    }
  }

  /**
   * Clear all stats
   */
  clearAllStats() {
    const oldStats = { ...this.stats };
    this.stats = createEmptyRegisteredStatsObject();
    this._plannerSkillStatBonuses = {};

    // Dispatch event if stats changed
    if (typeof window !== 'undefined' && Object.keys(oldStats).length > 0) {
      window.dispatchEvent(new CustomEvent('characterStatsChanged', {
        detail: { oldStats, newStats: { ...this.stats } }
      }));
    }
  }

  /**
   * Parse and set stats from a text field (one stat per line)
   * Format: {{statKey}}=value or statKey=value
   * @param {string} text - Text containing stat definitions (one per line)
   * @returns {Array} Array of error messages, empty if no errors
   */
  parseStatsFromText(text) {
    const errors = [];
    const next = createEmptyRegisteredStatsObject();
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cleanedLine = line.replace(/\{\{|\}\}/g, '');
      const match = cleanedLine.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.*)$/);
      if (!match) {
        errors.push(`Line ${i + 1}: Invalid format. Expected: statKey=value (e.g., {{strength}}=30)`);
        continue;
      }

      const [, statKey, rawValue] = match;
      const k = String(statKey).trim().toLowerCase();
      if (!isPlannerBaseStatKey(k)) {
        errors.push(`Line ${i + 1}: Unknown stat "${statKey}" (not in character_stats registry)`);
        continue;
      }

      const valueTrim = (rawValue || '').trim();
      let numValue;
      if (valueTrim === '') {
        numValue = 0;
      } else {
        numValue = parseFloat(valueTrim);
        if (Number.isNaN(numValue)) {
          errors.push(`Line ${i + 1}: Invalid value for ${statKey}`);
          continue;
        }
      }

      next[k] = normalizePlannerStatValue(k, numValue);
    }

    for (const k of Object.keys(next)) {
      next[k] = normalizePlannerStatValue(k, next[k]);
    }
    this.stats = next;

    return errors;
  }

  /**
   * Export stats to text format (one stat per line)
   * Format: {{statKey}}=value
   * @returns {string} Text representation of stats
   */
  exportStatsToText() {
    return plannerStatsToTextLines(this.stats).join('\n');
  }
}
