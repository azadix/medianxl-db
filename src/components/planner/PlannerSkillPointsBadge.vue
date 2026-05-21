<script setup>
import { computed, nextTick, onMounted, ref } from 'vue';
import { usePlannerRevisionRefresh } from '../../composables/usePlannerRevisionRefresh.js';
import {
  getEffectivePlannerLevel,
  getSpentSkillPoints,
  getTotalQuestSkillPoints,
} from '@/character/character-state.js';
import Character from '@/character/Character.js';
import { setupPlannerMinLevelSkillPoolTooltips } from '@/character/planner-stats-panel.js';

const spentPoints = ref(0);
const effectiveLevel = ref(1);
const availablePoints = ref(0);

const basePoints = computed(() => Character.getBaseSkillPoints(effectiveLevel.value));
const questPoints = computed(() => getTotalQuestSkillPoints(effectiveLevel.value));

const pointsOverBudget = computed(() => spentPoints.value > availablePoints.value);

function refreshPoints() {
  spentPoints.value = getSpentSkillPoints();
  effectiveLevel.value = getEffectivePlannerLevel();
  availablePoints.value = basePoints.value + questPoints.value;
}

function onRefresh() {
  nextTick(refreshPoints);
}

onMounted(() => {
  setupPlannerMinLevelSkillPoolTooltips();
  onRefresh();
});

usePlannerRevisionRefresh(onRefresh);
</script>

<template>
  <div class="planner-header-points planner-tab-points">
    <span class="planner-card__eyebrow">Skill points</span>
    <span>
      <strong
        id="minLevelSpentPart"
        :class="{ 'is-danger has-text-danger': pointsOverBudget }"
      >{{ spentPoints }} spent</strong>
      <span class="has-text-grey"> / </span>
      <span
        id="minLevelAvailPart"
        class="planner-skill-pool-tooltip-target"
        :data-pool-base="basePoints"
        :data-pool-quest="questPoints"
        :data-pool-level="effectiveLevel"
      >
        {{ availablePoints }} available
      </span>
    </span>
  </div>
</template>
