<script setup>
import { ref } from 'vue';
import PlannerSidebarTabs from './PlannerSidebarTabs.vue';
import PlannerSidebarOverview from './PlannerSidebarOverview.vue';
import PlannerStatsPanel from './PlannerStatsPanel.vue';
import PlannerConfigPanel from './PlannerConfigPanel.vue';

const sidebarPane = ref('overview');
</script>

<template>
  <div class="column sidebar-column">
    <div class="sidebar-column-inner">
      <PlannerSidebarTabs v-model="sidebarPane" />
      <div class="sidebar-pane-scroll pr-2" :class="{ 'is-config': sidebarPane === 'config' }">
        <PlannerSidebarOverview v-show="sidebarPane === 'overview'" />
        <PlannerStatsPanel v-show="sidebarPane === 'stats'" />
        <PlannerConfigPanel v-show="sidebarPane === 'config'" />
      </div>
    </div>
  </div>
</template>
