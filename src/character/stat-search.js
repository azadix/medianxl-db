/**
 * @file Partial-input matching for the character stat search box.
 * @module character/stat-search
 */

/**
 * Label words plus key segments a stat can be matched against.
 * @param {{ key?: string, label?: string }} def
 * @returns {{ words: string[], acronym: string }}
 */
function statWords(def) {
  const label = String(def?.label ?? '').toLowerCase();
  const key = String(def?.key ?? '').toLowerCase();
  const labelWords = label.split(/[^a-z0-9]+/).filter(Boolean);
  const keyWords = key.split(/_+/).filter(Boolean);
  const words = [...labelWords, ...keyWords];
  const acronym = labelWords
    .filter((word) => /^[a-z]+$/.test(word))
    .map((word) => word[0])
    .join('');
  return { words, acronym };
}

/**
 * Match a stat against a partial query such as "min dam" → "+# to Minimum Damage".
 *
 * Every whitespace-separated token must prefix-match at least one word of the label or
 * key (or the label acronym, so "fcr" finds "Faster Cast Rate").
 *
 * @param {{ key?: string, label?: string }} def
 * @param {string} query
 * @returns {boolean}
 */
export function matchesStatQuery(def, query) {
  const tokens = String(query ?? '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return true;

  const { words, acronym } = statWords(def);
  if (words.length === 0) return false;

  return tokens.every((token) => {
    if (words.some((word) => word.startsWith(token))) return true;
    if (acronym.startsWith(token)) return true;
    return words.some((word) => word.includes(token));
  });
}

/**
 * @param {Array<{ key?: string, label?: string }>} defs
 * @param {string} query
 * @returns {Array<{ key?: string, label?: string }>}
 */
export function filterStatDefsByQuery(defs, query) {
  if (!String(query ?? '').trim()) return defs;
  return defs.filter((def) => matchesStatQuery(def, query));
}
