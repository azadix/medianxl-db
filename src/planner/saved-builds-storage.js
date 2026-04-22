/** localStorage key for planner saved builds (same as legacy). */
export const SAVED_BUILDS_STORAGE_KEY = 'medianxl-builds';

export function getSavedBuilds() {
  const stored = localStorage.getItem(SAVED_BUILDS_STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error('Error parsing saved builds:', e);
      return [];
    }
  }
  return [];
}

export function setSavedBuilds(builds) {
  localStorage.setItem(SAVED_BUILDS_STORAGE_KEY, JSON.stringify(builds));
}

export function notifySavedBuildsListRefresh() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('savedBuildsListRefresh'));
  }
}
