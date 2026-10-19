import { defineStore } from 'pinia';
import { isPlannerBuildLoadInProgress } from '@/character/planner-instance.js';

/** @typedef {'menu'|'tree'|'load'|'defaults'} PlannerSection */

export const usePlannerStore = defineStore('planner', {
  state: () => ({
    revision: 0,
    /** Which planner surface is visible (menu / tree / load / defaults). */
    activeSection: /** @type {PlannerSection} */ ('menu'),
  }),
  actions: {
    /** @param {PlannerSection} section */
    setActiveSection(section) {
      const allowed = ['menu', 'tree', 'load', 'defaults'];
      if (allowed.includes(section)) {
        this.activeSection = section;
      }
    },
    bump() {
      this.revision++;
    },
    attachWindowSync() {
      const bump = () => {
        // Avoid Vue re-render storm while applying a JSON/saved build.
        if (isPlannerBuildLoadInProgress()) return;
        this.bump();
      };
      const events = [
        'skillPointsChanged',
        'plannerStateChanged',
        'characterStatsChanged',
        'questCompletionChanged',
        'plannerStatsPanelRefresh',
      ];
      for (const name of events) {
        window.addEventListener(name, bump);
      }
      return () => {
        for (const name of events) {
          window.removeEventListener(name, bump);
        }
      };
    },
  },
});
