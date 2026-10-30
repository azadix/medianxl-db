<script setup>
/**
 * Always-mounted portal for skill-preview WebP tooltips.
 */
import { onMounted, onUnmounted } from 'vue';
import { ensureSkillPreviewManifest } from '@/skills/skill-preview-catalog.js';
import {
  SKILL_PREVIEW_TOOLTIP_ID,
  destroySkillPreviewTooltip,
  initSkillPreviewTooltip,
} from '@/skills/skill-preview-tooltip.js';

onMounted(() => {
  void ensureSkillPreviewManifest();
  initSkillPreviewTooltip();
});

onUnmounted(() => {
  destroySkillPreviewTooltip();
});
</script>

<template>
  <Teleport to="body">
    <div
      :id="SKILL_PREVIEW_TOOLTIP_ID"
      class="skill-tooltip skill-preview-tooltip"
      style="display: none"
      aria-hidden="true"
    />
  </Teleport>
</template>
