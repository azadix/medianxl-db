<script setup>
import PlannerSidebar from './PlannerSidebar.vue';
import PlannerSkillsColumn from './PlannerSkillsColumn.vue';
</script>

<template>
  <section id="tree-section">
    <div class="columns pt-3" style="height: 95vh">
      <PlannerSidebar />
      <PlannerSkillsColumn />
    </div>
  </section>
</template>
