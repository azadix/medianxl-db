/**
 * @file Planner quest completion wrappers.
 * @module character/planner-quests
 */

import Character from './Character.js';
import { getCharacterInstance } from './planner-instance.js';
import { notifyPlannerStateChanged } from './planner-instance.js';

/**
 * @param {string} questId
 * @param {{ normal?: boolean, nightmare?: boolean, hell?: boolean }} difficulties
 */
export function updateQuestCompletion(questId, difficulties) {
  const characterInstance = getCharacterInstance();
  if (characterInstance) {
    characterInstance.updateQuestCompletion(questId, difficulties);
    notifyPlannerStateChanged({ source: 'updateQuestCompletion' });
  }
}

/**
 * @param {string} questId
 * @returns {{ normal: boolean, nightmare: boolean, hell: boolean }}
 */
export function getQuestCompletion(questId) {
  const characterInstance = getCharacterInstance();
  return characterInstance
    ? characterInstance.getQuestCompletion(questId)
    : { normal: false, nightmare: false, hell: false };
}

/**
 * @param {number} [characterLevel]
 * @returns {number}
 */
export function getTotalQuestStatPoints(characterLevel = Character.MAX_LEVEL) {
  const characterInstance = getCharacterInstance();
  return characterInstance ? characterInstance.getTotalQuestStatPoints(characterLevel) : 0;
}

/**
 * @param {Record<string, { normal?: boolean, nightmare?: boolean, hell?: boolean }>} quests
 * @param {Record<string, { normal?: boolean, nightmare?: boolean, hell?: boolean }>} questCompletionOptOut
 */
export function importQuestsCompleted(quests, questCompletionOptOut) {
  const characterInstance = getCharacterInstance();
  if (characterInstance) {
    characterInstance.importQuestsCompleted(quests, questCompletionOptOut);
    notifyPlannerStateChanged({ source: 'importQuestsCompleted' });
  }
}

/** @returns {Record<string, { normal: boolean, nightmare: boolean, hell: boolean }>} */
export function getQuestsCompletedForSave() {
  const characterInstance = getCharacterInstance();
  return characterInstance ? JSON.parse(JSON.stringify(characterInstance.questsCompleted)) : {};
}

/** @returns {Record<string, { normal?: boolean, nightmare?: boolean, hell?: boolean }>} */
export function getQuestCompletionOptOutForSave() {
  const characterInstance = getCharacterInstance();
  return characterInstance
    ? JSON.parse(JSON.stringify(characterInstance.questCompletionOptOut || {}))
    : {};
}

export function completeAllQuests() {
  const characterInstance = getCharacterInstance();
  if (characterInstance) {
    characterInstance.completeAllQuests();
    notifyPlannerStateChanged({ source: 'completeAllQuests' });
  }
}

/**
 * @param {number} [characterLevel]
 * @returns {number}
 */
export function getTotalQuestSkillPoints(characterLevel = Character.MAX_LEVEL) {
  const characterInstance = getCharacterInstance();
  return characterInstance ? characterInstance.getTotalQuestSkillPoints(characterLevel) : 0;
}
