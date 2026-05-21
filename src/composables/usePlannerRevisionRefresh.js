import { watch } from 'vue';
import { storeToRefs } from 'pinia';
import { usePlannerStore } from '@/stores/planner.js';

/**
 * Re-run callback when planner Pinia revision bumps (legacy window events bridged in store).
 * @param {() => void} callback
 */
export function usePlannerRevisionRefresh(callback) {
  const store = usePlannerStore();
  const { revision } = storeToRefs(store);
  watch(revision, () => callback(), { flush: 'post' });
}

/**
 * Attach window listeners once for the planner route; returns teardown.
 * @returns {() => void}
 */
export function attachPlannerWindowSync() {
  return usePlannerStore().attachWindowSync();
}
