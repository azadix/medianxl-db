/** localStorage key for planner saved builds (same as legacy). */
export const SAVED_BUILDS_STORAGE_KEY = 'medianxl-builds';

/**
 * @param {unknown} b
 * @returns {number}
 */
function savedAtMs(b) {
  if (!b || typeof b.savedAt !== 'string') return 0;
  const t = Date.parse(b.savedAt);
  return Number.isFinite(t) ? t : 0;
}

/**
 * Newest {@link savedAt} first. Mutates `builds`. Ties keep relative order (stable).
 * @param {object[]} builds
 */
export function sortSavedBuildsNewestFirstInPlace(builds) {
  if (!Array.isArray(builds) || builds.length < 2) return;
  builds.sort((a, b) => {
    const db = savedAtMs(b);
    const da = savedAtMs(a);
    if (db !== da) return db - da;
    return 0;
  });
}

export function getSavedBuilds() {
  const stored = localStorage.getItem(SAVED_BUILDS_STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        sortSavedBuildsNewestFirstInPlace(parsed);
      }
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('Error parsing saved builds:', e);
      return [];
    }
  }
  return [];
}

export function setSavedBuilds(builds) {
  if (!Array.isArray(builds)) {
    localStorage.setItem(SAVED_BUILDS_STORAGE_KEY, JSON.stringify([]));
    return;
  }
  sortSavedBuildsNewestFirstInPlace(builds);
  localStorage.setItem(SAVED_BUILDS_STORAGE_KEY, JSON.stringify(builds));
}

export function notifySavedBuildsListRefresh() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('savedBuildsListRefresh'));
  }
}
