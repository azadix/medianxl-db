<script setup>
/**
 * Portal roots for skills-page proc tooltips (distinct from planner keep-alive IDs).
 */
import { onMounted, onUnmounted } from 'vue';
import {
  SKILLS_PAGE_ITEM_TOOLTIP_ID,
  SKILLS_PAGE_SKILL_TOOLTIP_ID,
  destroySkillsPageTooltips,
  initSkillsPageTooltips,
} from '@/skills/skills-page-tooltip-runtime.js';

onMounted(() => {
  initSkillsPageTooltips();
});

onUnmounted(() => {
  destroySkillsPageTooltips();
});
</script>

<template>
  <Teleport to="body">
    <div
      :id="SKILLS_PAGE_ITEM_TOOLTIP_ID"
      class="skill-tooltip item-tooltip"
      style="display: none"
      aria-hidden="true"
    />
    <div
      :id="SKILLS_PAGE_SKILL_TOOLTIP_ID"
      class="skill-tooltip"
      style="display: none"
      aria-hidden="true"
    />
  </Teleport>
</template>
