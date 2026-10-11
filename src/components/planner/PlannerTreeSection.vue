<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import PlannerHeaderBar from './PlannerHeaderBar.vue';
import PlannerSidebar from './PlannerSidebar.vue';
import PlannerMainWorkspace from './PlannerMainWorkspace.vue';

/** @typedef {'tree'|'items'|'other'} WorkspaceMode */

const workspaceMode = ref(/** @type {WorkspaceMode} */ ('tree'));

/** @param {CustomEvent} e */
function onWorkspaceMode(e) {
  const mode = e.detail?.mode;
  if (mode === 'tree' || mode === 'items' || mode === 'other') {
    workspaceMode.value = mode;
  }
}

onMounted(() => {
  window.addEventListener('plannerWorkspaceMode', onWorkspaceMode);
});

onUnmounted(() => {
  window.removeEventListener('plannerWorkspaceMode', onWorkspaceMode);
});
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
