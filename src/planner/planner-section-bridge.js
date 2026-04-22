/**
 * Lets legacy modules (e.g. tree-core) drive planner section visibility via Pinia
 * without importing Vue. Registered from PlannerView on mount.
 */

let _setSection = null;

/** @param {(section: string) => void} fn */
export function registerPlannerSectionSetter(fn) {
  _setSection = fn;
}

export function unregisterPlannerSectionSetter() {
  _setSection = null;
}

/** @param {'menu'|'tree'|'load'|'defaults'} section */
export function setPlannerSectionFromLegacy(section) {
  if (typeof _setSection === 'function') {
    _setSection(section);
  }
}
