<script setup>
defineProps({
  /** Raw icon HTML from getSkillIconHTML / atlas markup */
  iconMarkup: { type: String, default: '' },
});
</script>

<template>
  <!-- Trusted atlas/sprite markup from getSkillIconHTML only -->
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div class="skill-card-icon" v-html="iconMarkup"></div>
</template>
