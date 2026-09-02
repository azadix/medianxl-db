<script setup>
import { nextTick, watch } from 'vue';
import PlannerSkillsColumn from './PlannerSkillsColumn.vue';
import PlannerItemsPanel from './PlannerItemsPanel.vue';
import PlannerSettingsPanel from './PlannerSettingsPanel.vue';

const props = defineProps({
  /** @type {import('vue').PropType<'tree'|'items'|'other'>} */
  mode: { type: String, required: true },
});

watch(
  () => props.mode,
  (mode) => {
    if (mode !== 'tree') return;
    nextTick(() => {
      window.dispatchEvent(new CustomEvent('plannerSkillsRedrawArrows'));
    });
  }
);
</script>

<template>
  <div class="column planner-main-workspace">
    <div class="planner-workspace-panes">
      <div v-show="mode === 'tree'" class="planner-workspace-pane">
        <PlannerSkillsColumn />
      </div>
      <div v-show="mode === 'items'" class="planner-workspace-pane">
        <PlannerItemsPanel />
      </div>
      <div v-show="mode === 'other'" class="planner-workspace-pane">
        <PlannerSettingsPanel />
      </div>
    </div>
  </div>
</template>
