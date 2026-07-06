<script setup>
import { usePlannerSkillPoints } from '@/composables/usePlannerSkillPoints.js';

const {
  spentPoints,
  effectiveLevel,
  availablePoints,
  basePoints,
  questPoints,
  pointsOverBudget,
} = usePlannerSkillPoints({ setupPoolTooltips: true });
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
