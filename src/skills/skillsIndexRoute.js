/**
 * Skills index route query helpers shared by skillsIndex and SkillsBrowseTable.
 */

export const SKILLS_ROUTE_NAME = 'skills';

const FILTER_VALUES = ['all', 'with_details', 'without_details'];

/**
 * @param {unknown} q
 * @param {string} key
 * @returns {string[]}
 */
export function readQueryStringArray(q, key) {
  if (!q || typeof q !== 'object') return [];
  const raw = /** @type {Record<string, unknown>} */ (q)[key];
  if (raw == null || raw === '') return [];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  return [String(raw)].filter(Boolean);
}

/**
 * @param {import('vue-router').Router | null | undefined} router
 * @param {Record<string, string | string[] | undefined | null>} partial
 */
export function mergeHomeQuery(router, partial) {
  if (!router) return;
  const cur = router.currentRoute.value.query;
  const next = { ...cur };
  for (const [k, v] of Object.entries(partial)) {
    if (v === undefined || v === null || v === '') {
      delete next[k];
    } else if (Array.isArray(v)) {
      const filtered = v.map(String).filter(Boolean);
      if (filtered.length === 0) delete next[k];
      else next[k] = filtered;
    } else {
      next[k] = String(v);
    }
  }
  router.replace({ name: SKILLS_ROUTE_NAME, query: next });
}

/**
 * @param {import('vue-router').Router | null | undefined} router
 * @returns {'all'|'with_details'|'without_details'}
 */
export function readHomeFilterFromRoute(router) {
  const q = router?.currentRoute?.value?.query;
  const fromQuery = q && q.filter != null ? String(q.filter) : null;
  const savedFilter =
    fromQuery ?? new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get('filter');
  if (savedFilter && FILTER_VALUES.includes(String(savedFilter))) {
    return /** @type {'all'|'with_details'|'without_details'} */ (String(savedFilter));
  }
  return 'all';
}

/**
 * @param {import('vue-router').Router | null | undefined} router
 * @returns {string[]}
 */
export function readHomeClassFiltersFromRoute(router) {
  const q = router?.currentRoute?.value?.query;
  return readQueryStringArray(q, 'classes');
}

/**
 * @param {import('vue-router').Router | null | undefined} router
 * @returns {string[]}
 */
export function readHomeTagFiltersFromRoute(router) {
  const q = router?.currentRoute?.value?.query;
  return readQueryStringArray(q, 'tags');
}

/**
 * How to combine class and tag filters when both have selections (`and` = must match both, `or` = match either).
 * Query: `classTagOp` preferred; `classTabOp` kept for older links.
 * @param {unknown} q
 * @returns {'and'|'or'}
 */
export function readClassTagJoinFromQuery(q) {
  if (!q || typeof q !== 'object') return 'and';
  const rec = /** @type {Record<string, unknown>} */ (q);
  const raw =
    rec.classTagOp != null
      ? String(rec.classTagOp).toLowerCase()
      : rec.classTabOp != null
        ? String(rec.classTabOp).toLowerCase()
        : 'and';
  return raw === 'or' ? 'or' : 'and';
}

/**
 * @param {import('vue-router').Router | null | undefined} router
 * @returns {'and'|'or'}
 */
export function readClassTagJoinFromRoute(router) {
  const q = router?.currentRoute?.value?.query;
  return readClassTagJoinFromQuery(q);
}
