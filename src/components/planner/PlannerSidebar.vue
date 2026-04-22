<script setup>
import { ref } from 'vue';
import PlannerSidebarToolbar from './PlannerSidebarToolbar.vue';
import PlannerSidebarTabs from './PlannerSidebarTabs.vue';
import PlannerSidebarOverview from './PlannerSidebarOverview.vue';
import PlannerStatsPanel from './PlannerStatsPanel.vue';
import PlannerConfigPanel from './PlannerConfigPanel.vue';

const sidebarPane = ref('overview');
</script>

<template>
  <div class="column is-one-fifth px-0 sidebar-column">
    <div class="pr-2 sidebar-column-inner">
      <PlannerSidebarToolbar />
      <PlannerSidebarTabs v-model="sidebarPane" />
      <PlannerSidebarOverview v-show="sidebarPane === 'overview'" />
      <PlannerStatsPanel v-show="sidebarPane === 'stats'" />
      <PlannerConfigPanel v-show="sidebarPane === 'config'" />
    </div>
  </div>
</template>
