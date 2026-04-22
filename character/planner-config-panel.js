/**
 * Planner sidebar Config tab: quest completion per difficulty.
 */
import Character from './Character.js';
import { recomputeClassDerivedLifeMana } from './character-state.js';

export function formatQuestLabel(questId) {
  return String(questId)
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function difficultiesForQuest(questId) {
  const q = Character.QUESTS[questId];
  if (!q?.reward) return [];
  return ['normal', 'nightmare', 'hell'].filter(
    (d) => q.reward[d] && typeof q.reward[d].amount === 'number'
  );
}

export const QUEST_DIFF_NAMES = {
  normal: 'Normal',
  nightmare: 'Nightmare',
  hell: 'Hell'
};

/**
 * One bracket string per quest: e.g. [+1 Skill Point(s)], [+40 Life], or per-diff only when values differ.
 * Stat-point and signet-cap rewards are shown for tracking only; they do not change the planner stat pool.
 * @param {string} questId
 * @returns {string}
 */
export function formatQuestRewardBracket(questId) {
  const q = Character.QUESTS[questId];
  if (!q?.reward) return '';
  const entries = [];
  for (const d of ['normal', 'nightmare', 'hell']) {
    const slot = q.reward[d];
    if (slot && typeof slot.amount === 'number') {
      entries.push({ amount: slot.amount, name: QUEST_DIFF_NAMES[d] });
    }
  }
  if (entries.length === 0) return '';
  const allSame = entries.every((e) => e.amount === entries[0].amount);

  const trackingOnly = ' (NOT IMPLEMENTED)';

  switch (q.type) {
    case 'signet_cap':
      if (allSame) return `[+${entries[0].amount} max signet cap]${trackingOnly}`;
      return `[${entries.map((e) => `${e.name} +${e.amount}`).join(', ')} max signet cap]${trackingOnly}`;
    case 'flat_life':
      if (allSame) return `[+${entries[0].amount} Life]`;
      return `[${entries.map((e) => `${e.name} +${e.amount}`).join(', ')} Life]`;
    case 'stat_points':
      if (allSame) return `[+${entries[0].amount} Stat Point(s)]${trackingOnly}`;
      return `[${entries.map((e) => `${e.name} +${e.amount}`).join(', ')} Stat Point(s)]${trackingOnly}`;
    case 'skill_point':
      if (allSame) return `[+${entries[0].amount} Skill Point(s)]`;
      return `[${entries.map((e) => `${e.name} +${e.amount}`).join(', ')} Skill Point(s)]`;
    default:
      return '';
  }
}

/**
 * Border style for a quest row: none checked (red), partial (amber), all (green).
 * @param {Record<string, boolean>} q
 * @param {string[]} diffs
 * @returns {'planner-quest-outline-none'|'planner-quest-outline-partial'|'planner-quest-outline-complete'}
 */
export function questRowOutlineClass(q, diffs) {
  const n = diffs.length;
  if (n === 0) return 'planner-quest-outline-none';
  const done = diffs.filter((d) => q[d]).length;
  if (done === 0) return 'planner-quest-outline-none';
  if (done === n) return 'planner-quest-outline-complete';
  return 'planner-quest-outline-partial';
}

let plannerConfigRefreshWired = false;

export function refreshPlannerConfigPanel() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('plannerConfigQuestsRefresh'));
  }
}

/**
 * Legacy no-op: {@link PlannerConfigPanel.vue} owns the UI.
 */
export function initPlannerConfigPanel() {
  if (!plannerConfigRefreshWired && typeof window !== 'undefined') {
    plannerConfigRefreshWired = true;
    window.addEventListener('plannerConfigRefresh', refreshPlannerConfigPanel);
    window.addEventListener('questCompletionChanged', (e) => {
      const qid = e.detail && e.detail.questId;
      if (qid == null || Character.QUESTS[qid]?.type === 'flat_life') {
        recomputeClassDerivedLifeMana();
      }
      refreshPlannerConfigPanel();
    });
  }
}
