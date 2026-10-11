<script setup>
/**
 * Portal root for planner skill tooltips (`tree-tooltip.js`).
 * `initializeTooltip()` attaches to `#skill-tooltip-portal` (innerHTML + positioning).
 */
import { onActivated } from 'vue';
import { bindPlannerNestedSkillTooltipHandlers } from '@/tree/tree-tooltip.js';

onActivated(() => {
  bindPlannerNestedSkillTooltipHandlers();
});
</script>

<template>
  <Teleport to="body">
    <div
      id="skill-tooltip-portal"
      class="skill-tooltip"
      style="display: none"
      aria-hidden="true"
    />
  </Teleport>
</template>
