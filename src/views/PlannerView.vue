<script>
export default {
  name: 'PlannerView',
};
</script>

<script setup>
import { onMounted, onUnmounted, onActivated, nextTick } from 'vue';
import { storeToRefs } from 'pinia';
import { usePlannerStore } from '../stores/planner.js';
import {
  registerPlannerSectionSetter,
  unregisterPlannerSectionSetter,
} from '../planner/planner-section-bridge.js';
import { initializeTreePage } from '../../tree/tree-core.js';
import { initializeVersionSelector } from '../shared/version-config.js';
import '../../tree/tree-styles.css';
import '../../tree/dropdown-style.css';
import '../../tree/character-sheet-sidebar.css';
import PlannerMenuSection from '../components/planner/PlannerMenuSection.vue';
import PlannerTreeSection from '../components/planner/PlannerTreeSection.vue';
import PlannerLoadSection from '../components/planner/PlannerLoadSection.vue';
import SkillTooltipHost from '../components/planner/SkillTooltipHost.vue';

const plannerStore = usePlannerStore();
const { activeSection } = storeToRefs(plannerStore);

let initStarted = false;

onMounted(async () => {
  if (initStarted) return;
  initStarted = true;
  registerPlannerSectionSetter((section) => plannerStore.setActiveSection(section));
  await nextTick();
  await initializeTreePage();
});

onActivated(async () => {
  const sel = document.getElementById('version-selector');
  if (sel) {
    await initializeVersionSelector(sel);
  }
});

onUnmounted(() => {
  initStarted = false;
  unregisterPlannerSectionSetter();
});
</script>

<template>
  <div class="planner-route section px-1 py-0">
    <SkillTooltipHost />
    <PlannerMenuSection v-show="activeSection === 'menu'" />
    <PlannerTreeSection v-show="activeSection === 'tree'" />
    <PlannerLoadSection v-show="activeSection === 'load'" />
  </div>
</template>

<style scoped>
.planner-route {
  margin-top: 0;
  overflow: hidden;
}
</style>
