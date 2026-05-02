<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import Character from '../../../character/Character.js';
import {
  getQuestCompletion,
  updateQuestCompletion,
  getCharacterInstance,
  completeAllQuests,
} from '../../../character/character-state.js';
import {
  formatQuestLabel,
  difficultiesForQuest,
  formatQuestRewardBracket,
  QUEST_DIFF_NAMES,
} from '../../../character/planner-config-panel.js';

const refreshKey = ref(0);

const questIds = computed(() => Character.getQuestRewardQuestIds());

const questActLabels = {
  den_of_evil: 'Act 1',
  radament: 'Act 2',
  golden_bird: 'Act 3',
  "lam_essen's_tome": 'Act 3',
  izual: 'Act 4',
  justicar_signet: 'Endgame',
  inquisitor_of_the_triune: 'Endgame',
};

const questActOrder = {
  'Act 1': 1,
  'Act 2': 2,
  'Act 3': 3,
  'Act 4': 4,
  'Act 5': 5,
  Other: 90,
  Endgame: 100,
};

const questRows = computed(() =>
  questIds.value
    .filter((questId) => difficultiesForQuest(questId).length > 0)
    .map((questId) => ({
      questId,
      act: questActLabels[questId] || 'Other',
      diffs: difficultiesForQuest(questId),
    }))
    .sort((a, b) => {
      const orderA = questActOrder[a.act] ?? questActOrder.Other;
      const orderB = questActOrder[b.act] ?? questActOrder.Other;
      if (orderA !== orderB) return orderA - orderB;
      return formatQuestLabel(a.questId).localeCompare(formatQuestLabel(b.questId));
    })
);

const questGroups = computed(() => {
  const groups = [];
  const byAct = new Map();
  for (const row of questRows.value) {
    if (!byAct.has(row.act)) {
      byAct.set(row.act, []);
      groups.push({ act: row.act, rows: byAct.get(row.act) });
    }
    byAct.get(row.act).push(row);
  }
  return groups;
});

const questSummary = computed(() => {
  void refreshKey.value;
  let total = 0;
  let done = 0;
  let skillPoints = 0;
  for (const questId of questIds.value) {
    const q = Character.QUESTS[questId];
    const state = completion(questId);
    for (const d of difficultiesForQuest(questId)) {
      total++;
      if (state[d]) {
        done++;
        if (q?.type === 'skill_point') {
          skillPoints += q.reward?.[d]?.amount || 0;
        }
      }
    }
  }
  return { done, total, skillPoints };
});

function completion(questId) {
  return getQuestCompletion(questId);
}

function onQuestChange(questId) {
  if (!getCharacterInstance()) return;
  const esc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(questId) : questId;
  const row = document.querySelector(`.planner-config-quest-row[data-quest="${esc}"]`);
  if (!row) return;
  const next = { normal: false, nightmare: false, hell: false };
  row.querySelectorAll('.planner-quest-cb').forEach((cb) => {
    if (!(cb instanceof HTMLInputElement)) return;
    const d = cb.getAttribute('data-diff');
    if (d && Object.prototype.hasOwnProperty.call(next, d)) {
      next[d] = cb.checked;
    }
  });
  updateQuestCompletion(questId, next);
  window.dispatchEvent(new CustomEvent('skillPointsChanged'));
  refreshKey.value++;
}

function onCompleteAll() {
  completeAllQuests();
  window.dispatchEvent(new CustomEvent('skillPointsChanged'));
  refreshKey.value++;
}

function onClearAll() {
  if (!getCharacterInstance()) return;
  for (const questId of questIds.value) {
    updateQuestCompletion(questId, { normal: false, nightmare: false, hell: false });
  }
  window.dispatchEvent(new CustomEvent('skillPointsChanged'));
  refreshKey.value++;
}

const refreshHandler = () => {
  refreshKey.value++;
};

onMounted(() => {
  window.addEventListener('plannerConfigQuestsRefresh', refreshHandler);
});

onUnmounted(() => {
  window.removeEventListener('plannerConfigQuestsRefresh', refreshHandler);
});
</script>

<template>
  <div id="sidebarPaneConfig">
    <section class="planner-card planner-config-summary">
      <span class="planner-card__eyebrow">Quest completion</span>
      <div class="planner-config-summary__numbers">
        <div>
          <strong>{{ questSummary.done }} / {{ questSummary.total }}</strong>
          <span>quests completed</span>
        </div>
        <div>
          <strong>+{{ questSummary.skillPoints }}</strong>
          <span>skill points</span>
        </div>
      </div>
      <div class="buttons are-small mt-3 mb-0">
        <button id="plannerQuestCompleteAllBtn" type="button" class="button is-success is-outlined" @click="onCompleteAll">
          Complete all
        </button>
        <button type="button" class="button is-danger is-outlined" @click="onClearAll">
          Clear all
        </button>
      </div>
    </section>

    <div id="plannerConfigQuests" :key="refreshKey">
      <p v-if="questIds.length === 0" class="is-size-7 has-text-grey">No quest rewards configured.</p>
      <div v-else class="planner-quest-groups">
        <section v-for="group in questGroups" :key="group.act" class="planner-quest-group">
          <h4 class="planner-quest-group__title">{{ group.act }}</h4>
          <div
            v-for="row in group.rows"
            :key="row.questId"
            class="planner-config-quest-row"
            :data-quest="row.questId"
          >
            <p class="planner-quest-title">
              <template v-if="formatQuestRewardBracket(row.questId)">
                {{ formatQuestLabel(row.questId) }}
                <span>{{ formatQuestRewardBracket(row.questId) }}</span>
              </template>
              <template v-else>{{ formatQuestLabel(row.questId) }}</template>
            </p>
            <div class="planner-quest-difficulty-pills">
              <label
                v-for="d in ['normal', 'nightmare', 'hell'].filter((x) => row.diffs.includes(x))"
                :key="`${row.questId}-${d}`"
                class="planner-quest-pill"
                :class="{ 'is-checked': completion(row.questId)[d] }"
              >
                <input
                  :id="`quest_${row.questId}_${d}`"
                  type="checkbox"
                  class="planner-quest-cb"
                  :data-quest="row.questId"
                  :data-diff="d"
                  :checked="completion(row.questId)[d]"
                  @change="onQuestChange(row.questId)"
                />
                {{ QUEST_DIFF_NAMES[d] }}
              </label>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
