/**
 * @file Shared search + sort state for skill/editor tables.
 * @module composables/useSortableSearchableTable
 */
import { ref, computed } from 'vue';
import { parseSearchInput, createSkillMatcher } from '@/skills/skillTableSearch.js';

/**
 * @param {object} options
 * @param {string[]} options.searchFields
 * @param {string} options.defaultSortKey
 * @param {string[]} [options.numericSortKeys]
 * @param {(row: object, key: string) => string} [options.getSortValue]
 */
export function useSortableSearchableTable(options) {
  const {
    searchFields,
    defaultSortKey,
    numericSortKeys = [],
    getSortValue,
  } = options;

  const matcher = createSkillMatcher(searchFields);
  const searchRaw = ref('');
  const sortKey = ref(defaultSortKey);
  const sortDir = ref(/** @type {1|-1} */ (1));
  const parsedSearch = computed(() => parseSearchInput(searchRaw.value));
  const sortHint = computed(() => (sortDir.value === 1 ? 'A-Z' : 'Z-A'));

  /** @param {string} key */
  function toggleSort(key) {
    if (sortKey.value === key) {
      sortDir.value = sortDir.value === 1 ? -1 : 1;
    } else {
      sortKey.value = key;
      sortDir.value = 1;
    }
  }

  /**
   * @template T
   * @param {T[]} items
   * @param {{
   *   filterRow?: (item: T, index: number) => boolean,
   *   getSearchRow?: (item: T) => object,
   * }} [opts]
   */
  function filterSortRows(items, opts = {}) {
    const filterRow = opts.filterRow || (() => true);
    const getSearchRow = opts.getSearchRow || ((item) => item);
    const search = parsedSearch.value;
    let rows = items
      .map((item, index) => ({ item, index, skill: getSearchRow(item) }))
      .filter(({ item, index }) => filterRow(item, index));

    if (search.type !== 'regex_error') {
      rows = rows.filter(({ skill }) => matcher.matches(skill, search));
    }

    const key = sortKey.value;
    const dir = sortDir.value;
    return [...rows].sort((a, b) => {
      const va = getSortValue ? getSortValue(a.skill, key) : String(a.skill[key] ?? '');
      const vb = getSortValue ? getSortValue(b.skill, key) : String(b.skill[key] ?? '');
      if (numericSortKeys.includes(key)) {
        const na = Number(va);
        const nb = Number(vb);
        if (Number.isFinite(na) && Number.isFinite(nb) && String(na) === va && String(nb) === vb) {
          return (na - nb) * dir;
        }
      }
      return va.localeCompare(vb, undefined, { sensitivity: 'base', numeric: true }) * dir;
    });
  }

  return {
    searchRaw,
    sortKey,
    sortDir,
    parsedSearch,
    sortHint,
    toggleSort,
    filterSortRows,
  };
}
