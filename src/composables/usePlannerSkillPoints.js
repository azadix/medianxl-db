import { computed, nextTick, onMounted, ref } from 'vue';
import { setupPlannerMinLevelSkillPoolTooltips } from '@/character/planner-stats-panel.js';
import { usePlannerRevisionRefresh } from '@/composables/usePlannerRevisionRefresh.js';
import {
  getEffectivePlannerLevel,
  getSpentSkillPoints,
  getTotalQuestSkillPoints,
} from '@/character/planner-core.js';
import Character from '@/character/Character.js';

/**
 * Reactive spent/available skill points and effective level; refreshes on planner revision bumps.
 * @param {{ setupPoolTooltips?: boolean }} [options]
 */
export function usePlannerSkillPoints(options = {}) {
  const spentPoints = ref(0);
  const effectiveLevel = ref(1);
  const availablePoints = ref(0);

  const basePoints = computed(() => Character.getBaseSkillPoints(effectiveLevel.value));
  const questPoints = computed(() => getTotalQuestSkillPoints(effectiveLevel.value));
  const pointsOverBudget = computed(() => spentPoints.value > availablePoints.value);

  function refreshSkillPoints() {
    spentPoints.value = getSpentSkillPoints();
    effectiveLevel.value = getEffectivePlannerLevel();
    availablePoints.value = basePoints.value + questPoints.value;
  }

  function onRefresh() {
    nextTick(refreshSkillPoints);
  }

  onMounted(() => {
    if (options.setupPoolTooltips) {
      setupPlannerMinLevelSkillPoolTooltips();
    }
    onRefresh();
  });

  usePlannerRevisionRefresh(onRefresh);

  return {
    spentPoints,
    effectiveLevel,
    availablePoints,
    basePoints,
    questPoints,
    pointsOverBudget,
    refreshSkillPoints,
    onRefresh,
  };
}
