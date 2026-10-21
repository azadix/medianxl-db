<script>
export default {
  name: 'PlannerView',
};
</script>

<script setup>
import { onMounted, onUnmounted, onActivated, nextTick, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { usePlannerStore } from '@/stores/planner.js';
import { attachPlannerWindowSync } from '@/composables/usePlannerRevisionRefresh.js';
import {
  registerPlannerSectionSetter,
  unregisterPlannerSectionSetter,
} from '@/planner/planner-section-bridge.js';
import { ensurePlannerTreeInitialized } from '@/planner/planner-init.js';
import { plannerMenuImportBuildFromTswCode } from '@/planner/planner-dom-handlers.js';
import {
  consumeTswImportCodeFromLocation,
  peekPendingTswImportCode,
  takePendingTswImportCode,
} from '@/planner/tsw-code-import.js';
import { initializeVersionSelector } from '@/shared/version-config.js';
import '@/styles/tree-styles.css';
import '@/styles/dropdown-style.css';
import '@/styles/character-sheet-sidebar.css';
import PlannerMenuSection from '@/components/planner/PlannerMenuSection.vue';
import PlannerTreeSection from '@/components/planner/PlannerTreeSection.vue';
import PlannerLoadSection from '@/components/planner/PlannerLoadSection.vue';
import SkillTooltipHost from '@/components/planner/SkillTooltipHost.vue';

const plannerStore = usePlannerStore();
const { activeSection } = storeToRefs(plannerStore);

const tswImportLoading = ref(false);

let initStarted = false;
let unbindPlannerSync = () => {};
let tswImportInFlight = false;

async function runPendingTswImport() {
  consumeTswImportCodeFromLocation();
  const tswCode = takePendingTswImportCode();
  if (!tswCode || tswImportInFlight) return;
  tswImportInFlight = true;
  tswImportLoading.value = true;
  try {
    await plannerMenuImportBuildFromTswCode(tswCode);
  } finally {
    tswImportInFlight = false;
    tswImportLoading.value = false;
  }
}

onMounted(() => {
  if (initStarted) return;
  initStarted = true;
  unbindPlannerSync = attachPlannerWindowSync();
  registerPlannerSectionSetter((section) => plannerStore.setActiveSection(section));
  if (peekPendingTswImportCode()) {
    tswImportLoading.value = true;
  }
  void (async () => {
    await nextTick();
    // Tree init runs inside plannerMenuImportBuildFromTswCode; kick import immediately
    // so the azadi.pl prefetch overlaps boot. Also ensure tree for non-import visits.
    const importPromise = runPendingTswImport();
    await ensurePlannerTreeInitialized();
    await importPromise;
  })();
});

onActivated(async () => {
  if (peekPendingTswImportCode()) {
    tswImportLoading.value = true;
  }
  const importPromise = runPendingTswImport();
  await ensurePlannerTreeInitialized();
  const sel = document.getElementById('version-selector');
  if (sel) {
    await initializeVersionSelector(sel);
  }
  await importPromise;
});

onUnmounted(() => {
  initStarted = false;
  unbindPlannerSync();
  unregisterPlannerSectionSetter();
});
</script>

<template>
  <div class="planner-route section px-1 py-0">
    <div class="container is-hidden-tablet planner-mobile-unsupported">
      <div class="notification is-warning is-light">
        <p class="has-text-weight-semibold mb-2">Planner is not supported on mobile.</p>
        <p class="mb-0">Use a tablet or desktop browser to plan builds.</p>
      </div>
    </div>
    <div class="is-hidden-mobile">
      <div
        v-if="tswImportLoading"
        class="notification is-info is-light tsw-import-loading"
        role="status"
        aria-live="polite"
      >
        Loading build...
      </div>
      <SkillTooltipHost />
      <PlannerMenuSection v-show="activeSection === 'menu'" />
      <PlannerTreeSection v-show="activeSection === 'tree'" />
      <PlannerLoadSection v-show="activeSection === 'load'" />
    </div>
  </div>
</template>

<style scoped>
.planner-route {
  margin-top: 0;
  overflow: visible;
}

.planner-mobile-unsupported {
  max-width: 32rem;
  padding: 1.5rem 0.75rem;
}

.tsw-import-loading {
  position: fixed;
  top: 1rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 40;
  margin: 0;
  padding: 0.75rem 1.25rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
}
</style>
