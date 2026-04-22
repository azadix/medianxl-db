/**
 * Home route query helpers shared by skillsIndex and SkillsBrowseTable.
 */

const FILTER_VALUES = ['all', 'with_details', 'without_details'];

/**
 * @param {import('vue-router').Router | null | undefined} router
 * @param {Record<string, string | undefined | null>} partial
 */
export function mergeHomeQuery(router, partial) {
  if (!router) return;
  const cur = router.currentRoute.value.query;
  const next = { ...cur };
  for (const [k, v] of Object.entries(partial)) {
    if (v === undefined || v === null || v === '') {
      delete next[k];
    } else {
      next[k] = String(v);
    }
  }
  router.replace({ name: 'home', query: next });
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
