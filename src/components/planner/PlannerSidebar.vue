<script setup>
import { ref } from 'vue';
import PlannerSidebarTabs from './PlannerSidebarTabs.vue';
import PlannerSidebarOverview from './PlannerSidebarOverview.vue';
import PlannerStatsPanel from './PlannerStatsPanel.vue';
import PlannerSidebarTabQuests from './PlannerSidebarTabQuests.vue';
import PlannerSidebarConfig from './PlannerSidebarConfig.vue';

const sidebarPane = ref('overview');
</script>

<template>
  <div class="column sidebar-column">
    <div class="sidebar-column-inner">
      <PlannerSidebarTabs v-model="sidebarPane" />
      <div class="sidebar-pane-scroll pr-2" :class="{ 'is-quests': sidebarPane === 'quests' }">
        <PlannerSidebarOverview v-show="sidebarPane === 'overview'" />
        <PlannerStatsPanel v-show="sidebarPane === 'stats'" />
        <PlannerSidebarTabQuests v-show="sidebarPane === 'quests'" />
        <PlannerSidebarConfig v-show="sidebarPane === 'config'" />
      </div>
    </div>
  </div>
</template>
