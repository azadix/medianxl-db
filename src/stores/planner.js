import { defineStore } from 'pinia';

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
      const bump = () => this.bump();
      window.addEventListener('skillPointsChanged', bump);
      window.addEventListener('plannerStateChanged', bump);
      window.addEventListener('characterStatsChanged', bump);
      return () => {
        window.removeEventListener('skillPointsChanged', bump);
        window.removeEventListener('plannerStateChanged', bump);
        window.removeEventListener('characterStatsChanged', bump);
      };
    },
  },
});
