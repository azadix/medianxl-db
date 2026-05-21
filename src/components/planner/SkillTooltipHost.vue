<script setup>
/**
 * Portal root for planner skill tooltips (`tree-tooltip.js`).
 * `initializeTooltip()` attaches to `#skill-tooltip-portal` (innerHTML + positioning).
 * Patch notes use inline tooltip markup in `PatchNotesView.vue` until a shared builder exists.
 */
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
