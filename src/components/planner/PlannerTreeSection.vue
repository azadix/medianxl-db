<script setup>
import PlannerHeaderBar from './PlannerHeaderBar.vue';
import PlannerSidebar from './PlannerSidebar.vue';
import PlannerSkillsColumn from './PlannerSkillsColumn.vue';
</script>

<template>
  <section id="tree-section">
    <PlannerHeaderBar />
    <div class="columns planner-tree-layout">
      <PlannerSidebar />
      <PlannerSkillsColumn />
    </div>
  </section>
</template>
