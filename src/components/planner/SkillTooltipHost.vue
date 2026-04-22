<script setup>
/**
 * Empty portal root for tree-tooltip.js (innerHTML + positioning).
 * initializeTooltip() attaches to #skill-tooltip-portal when this Teleport mounts first.
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
