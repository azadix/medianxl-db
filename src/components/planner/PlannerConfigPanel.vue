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
  questRowOutlineClass,
  QUEST_DIFF_NAMES,
} from '../../../character/planner-config-panel.js';

const refreshKey = ref(0);

const questIds = computed(() => Character.getQuestRewardQuestIds());

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
    <h3 class="title is-5 mb-3">Config</h3>
    <p class="is-size-7 has-text-grey mb-3">
      Quest rewards for skill points (and optional tracking for other rewards). Stat point pool uses level only.
    </p>
    <div class="is-flex is-justify-content-space-between is-align-items-center mb-2">
      <label class="label mb-0">Quest completion</label>
      <button id="plannerQuestCompleteAllBtn" type="button" class="button is-small" @click="onCompleteAll">
        Complete all
      </button>
    </div>
    <div id="plannerConfigQuests" class="mb-3" :key="refreshKey">
      <p v-if="questIds.length === 0" class="is-size-7 has-text-grey">No quest rewards configured.</p>
      <div v-else class="content is-small">
        <template v-for="questId in questIds" :key="questId">
          <div
            v-if="difficultiesForQuest(questId).length > 0"
            class="mb-2 planner-config-quest-row py-2 px-3"
            :class="questRowOutlineClass(completion(questId), difficultiesForQuest(questId))"
            :data-quest="questId"
          >
            <p class="is-size-7 has-text-weight-semibold mb-2 has-text-white">
              <template v-if="formatQuestRewardBracket(questId)">
                {{ formatQuestLabel(questId) }}
                <span class="has-text-weight-normal has-text-white">{{ formatQuestRewardBracket(questId) }}</span>
              </template>
              <template v-else>{{ formatQuestLabel(questId) }}</template>
            </p>
            <div class="ml-1">
              <label
                v-for="d in ['normal', 'nightmare', 'hell'].filter((x) => difficultiesForQuest(questId).includes(x))"
                :key="`${questId}-${d}`"
                class="checkbox mr-3 is-size-7 has-text-white"
              >
                <input
                  :id="`quest_${questId}_${d}`"
                  type="checkbox"
                  class="planner-quest-cb"
                  :data-quest="questId"
                  :data-diff="d"
                  :checked="completion(questId)[d]"
                  @change="onQuestChange(questId)"
                />
                {{ QUEST_DIFF_NAMES[d] }}
              </label>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
