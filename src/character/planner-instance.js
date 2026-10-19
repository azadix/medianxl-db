/**
 * @file Planner character singleton and window notification helpers.
 * @module character/planner-instance
 */

import Character from './Character.js';

/** @type {Character | null} */
let characterInstance = null;

/** Nested depth of {@link beginPlannerBuildLoad} / {@link endPlannerBuildLoad}. */
let _buildLoadDepth = 0;
/** @type {Record<string, unknown>|null} */
let _pendingPlannerStateDetail = null;

/**
 * Suspend intermediate Vue bumps / recomputes while applying a saved build.
 * Nestable; call {@link endPlannerBuildLoad} in a finally block.
 */
export function beginPlannerBuildLoad() {
  _buildLoadDepth += 1;
}

/**
 * End a build-load batch. Flushes one coalesced `plannerStateChanged` if any were deferred.
 */
export function endPlannerBuildLoad() {
  if (_buildLoadDepth > 0) _buildLoadDepth -= 1;
  if (_buildLoadDepth > 0) return;
  if (_pendingPlannerStateDetail == null) return;
  const detail = _pendingPlannerStateDetail;
  _pendingPlannerStateDetail = null;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('plannerStateChanged', { detail }));
  }
}

/** @returns {boolean} */
export function isPlannerBuildLoadInProgress() {
  return _buildLoadDepth > 0;
}

/** @returns {Character | null} */
export function getCharacterInstance() {
  return characterInstance;
}

/**
 * @param {Character | null} instance
 */
export function setCharacterInstance(instance) {
  characterInstance = instance;
}

/**
 * Raise stored planner level to an item's required level (never lowers).
 * @param {{ reqLevel?: number }|null|undefined} def
 * @returns {boolean} True if the stored level changed
 */
export function raiseCharacterLevelForItemReq(def) {
  const req = Number(def?.reqLevel);
  if (!Number.isFinite(req) || req <= 0) return false;
  if (!characterInstance) return false;
  const needed = Character.clampLevel(req);
  if (characterInstance.level >= needed) return false;
  characterInstance.setCharacterLevel(needed);
  notifyPlannerStateChanged({ source: 'itemReqLevel' });
  return true;
}

/**
 * Raise displayed strength/dexterity to item requirements (never lowers).
 * @param {{ reqStr?: number, reqDex?: number }|null|undefined} def
 * @returns {boolean} True if either attribute changed
 */
export function raiseCharacterStatsForItemReq(def) {
  if (!characterInstance || !def) return false;
  let changed = false;
  const reqStr = Number(def.reqStr);
  if (Number.isFinite(reqStr) && reqStr > 0) {
    const current = characterInstance.getStat('strength');
    if (!Number.isFinite(current) || current < reqStr) {
      characterInstance.setStat('strength', reqStr);
      changed = true;
    }
  }
  const reqDex = Number(def.reqDex);
  if (Number.isFinite(reqDex) && reqDex > 0) {
    const current = characterInstance.getStat('dexterity');
    if (!Number.isFinite(current) || current < reqDex) {
      characterInstance.setStat('dexterity', reqDex);
      changed = true;
    }
  }
  if (!changed) return false;
  notifyPlannerStateChanged({ source: 'itemReqStats' });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('characterStatsChanged', { detail: { source: 'itemReqStats' } }));
    window.dispatchEvent(new CustomEvent('plannerStatsPanelRefresh'));
  }
  return true;
}

/**
 * @param {Record<string, unknown>} [detail]
 */
export function notifyPlannerStateChanged(detail = {}) {
  if (_buildLoadDepth > 0) {
    _pendingPlannerStateDetail = { ...detail, source: detail.source || 'buildLoad' };
    return;
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('plannerStateChanged', { detail }));
  }
}

/**
 * @param {string | number | null | undefined} skillNameOrId
 * @param {string} [action]
 */
export function notifyOSkillPointsChanged(skillNameOrId, action = 'update') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('skillPointsChanged', {
      detail: {
        skillName: skillNameOrId != null ? String(skillNameOrId) : null,
        action,
        skillType: 'oskill',
      },
    })
  );
}

/**
 * @param {string} skillName
 * @param {string} action
 * @param {number} [amount]
 */
export function notifySkillPointsChanged(skillName, action, amount) {
  if (typeof window === 'undefined') return;
  /** @type {{ skillName: string, action: string, amount?: number }} */
  const detail = { skillName, action };
  if (amount != null) detail.amount = amount;
  window.dispatchEvent(new CustomEvent('skillPointsChanged', { detail }));
}

/**
 * Initialize character state for a class.
 * @param {string} className
 * @param {number} [level]
 * @returns {Character}
 */
export function createCharacterInstance(className, level = Character.DEFAULT_LEVEL) {
  characterInstance = new Character(className, level);
  return characterInstance;
}
