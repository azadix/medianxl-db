<script setup>
/**
 * Portal root for planner item tooltips.
 */
import { onMounted, onUnmounted } from 'vue';
import { initItemTooltip, destroyItemTooltip } from '@/items/item-tooltip-runtime.js';

onMounted(() => {
  initItemTooltip();
});

onUnmounted(() => {
  destroyItemTooltip();
});
</script>

<template>
  <Teleport to="body">
    <div
      id="item-tooltip-portal"
      class="skill-tooltip item-tooltip"
      style="display: none"
      aria-hidden="true"
    />
  </Teleport>
</template>
