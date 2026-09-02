<script setup>
import PlannerStatsPanel from './PlannerStatsPanel.vue';
import PlannerSidebarConfig from './PlannerSidebarConfig.vue';
import PlannerSidebarTabQuests from './PlannerSidebarTabQuests.vue';
</script>

<template>
  <div class="planner-settings-panel">
    <div class="planner-settings-grid">
      <div class="planner-settings-stats">
        <PlannerStatsPanel />
      </div>
      <div class="planner-settings-side">
        <PlannerSidebarConfig />
        <PlannerSidebarTabQuests />
      </div>
    </div>
  </div>
</template>
