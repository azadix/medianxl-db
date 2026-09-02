<script setup>
import { ref } from 'vue';
import PlannerHeaderBar from './PlannerHeaderBar.vue';
import PlannerSidebar from './PlannerSidebar.vue';
import PlannerMainWorkspace from './PlannerMainWorkspace.vue';

/** @typedef {'tree'|'items'|'other'} WorkspaceMode */

const workspaceMode = ref(/** @type {WorkspaceMode} */ ('tree'));
</script>

<template>
  <section id="tree-section">
    <PlannerHeaderBar />
    <div class="columns planner-tree-layout">
      <PlannerSidebar v-model:mode="workspaceMode" />
      <PlannerMainWorkspace :mode="workspaceMode" />
    </div>
  </section>
</template>
