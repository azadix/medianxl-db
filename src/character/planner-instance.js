/**
 * @file Planner character singleton and window notification helpers.
 * @module character/planner-instance
 */

import Character from './Character.js';

/** @type {Character | null} */
let characterInstance = null;

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
 * @param {Record<string, unknown>} [detail]
 */
export function notifyPlannerStateChanged(detail = {}) {
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
