/**
 * Planner sidebar Quests tab: quest UI config and helpers (labels, ordering, formatting).
 */
import Character from './Character.js';
import { recomputeClassDerivedLifeMana } from './character-state.js';

/** Quests tab: act labels and sort order for grouped quest list in {@link PlannerSidebarTabQuests.vue}. */
export const sidebarTabQuests = {
  questActLabels: {
    den_of_evil: 'Act 1',
    radament: 'Act 2',
    golden_bird: 'Act 3',
    "lam_essen's_tome": 'Act 3',
    izual: 'Act 4',
    justicar_signet: 'Endgame',
    inquisitor_of_the_triune: 'Endgame',
  },
  questActOrder: {
    'Act 1': 1,
    'Act 2': 2,
    'Act 3': 3,
    'Act 4': 4,
    'Act 5': 5,
    Other: 90,
    Endgame: 100,
  },
};

export function formatQuestLabel(questId) {
  return String(questId)
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function difficultiesForQuest(questId) {
  const q = Character.QUESTS[questId];
  if (!q?.reward) return [];
  return ['normal', 'nightmare', 'hell'].filter((d) => q.reward[d] && typeof q.reward[d].amount === 'number');
}

export const QUEST_DIFF_NAMES = {
  normal: 'Normal',
  nightmare: 'Nightmare',
  hell: 'Hell',
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

  switch (q.type) {
    case 'signet_cap':
      if (allSame) return `[+${entries[0].amount} signet cap]`;
      return `[${entries.map((e) => `${e.name} +${e.amount}`).join(', ')} signet cap]`;
    case 'flat_life':
      if (allSame) return `[+${entries[0].amount} Life]`;
      return `[${entries.map((e) => `${e.name} +${e.amount}`).join(', ')} Life]`;
    case 'stat_points':
      if (allSame) return `[+${entries[0].amount} Stat Point(s)]`;
      return `[${entries.map((e) => `${e.name} +${e.amount}`).join(', ')} Stat Point(s)]`;
    case 'skill_point':
      if (allSame) return `[+${entries[0].amount} Skill Point(s)]`;
      return `[${entries.map((e) => `${e.name} +${e.amount}`).join(', ')} Skill Point(s)]`;
    default:
      return '';
  }
}

let plannerSidebarTabQuestsRefreshWired = false;

export function refreshPlannerSidebarTabQuests() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('plannerSidebarTabQuestsUiRefresh'));
  }
}

/**
 * Wire global refresh events for {@link PlannerSidebarTabQuests.vue}.
 */
export function initPlannerSidebarTabQuests() {
  if (!plannerSidebarTabQuestsRefreshWired && typeof window !== 'undefined') {
    plannerSidebarTabQuestsRefreshWired = true;
    window.addEventListener('plannerSidebarTabQuestsRefresh', refreshPlannerSidebarTabQuests);
    window.addEventListener('questCompletionChanged', (e) => {
      const qid = e.detail && e.detail.questId;
      if (qid == null || Character.QUESTS[qid]?.type === 'flat_life') {
        recomputeClassDerivedLifeMana();
      }
      refreshPlannerSidebarTabQuests();
    });
  }
}
