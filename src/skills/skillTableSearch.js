/**
 * Home skills table search: plain text (partial, case-insensitive) or /pattern/flags regex.
 */

/**
 * @typedef {{ type: 'none' }} SearchNone
 * @typedef {{ type: 'substring', needle: string }} SearchSubstring
 * @typedef {{ type: 'regex', re: RegExp }} SearchRegex
 * @typedef {{ type: 'regex_error', message: string }} SearchRegexError
 */

/** @returns {SearchNone | SearchSubstring | SearchRegex | SearchRegexError} */
export function parseSearchInput(raw) {
  const t = String(raw ?? '').trim();
  if (!t) return { type: 'none' };
  if (t.startsWith('/') && t.length >= 2) {
    const end = t.lastIndexOf('/');
    if (end > 0) {
      const pattern = t.slice(1, end);
      const flags = t.slice(end + 1);
      try {
        return { type: 'regex', re: new RegExp(pattern, flags) };
      } catch (e) {
        return {
          type: 'regex_error',
          message: e instanceof Error ? e.message : String(e),
        };
      }
    }
  }
  return { type: 'substring', needle: t.toLowerCase() };
}

/** @param {Record<string, unknown>} skill */
export function skillSearchHaystack(skill) {
  const tags = Array.isArray(skill.tags) ? skill.tags.join(' ') : '';
  return [skill.name, tags, skill.class, skill.tabName]
    .filter((x) => x != null)
    .map((x) => String(x).toLowerCase())
    .join(' ');
}

/** @param {Record<string, unknown>} skill */
export function skillSearchTextPlain(skill) {
  const tags = Array.isArray(skill.tags) ? skill.tags.join(' ') : '';
  return [skill.name, tags, skill.class, skill.tabName]
    .filter((x) => x != null)
    .map((x) => String(x))
    .join(' ');
}

/**
 * @param {Record<string, unknown>} skill
 * @param {ReturnType<typeof parseSearchInput>} parsed
 */
export function skillMatchesSearch(skill, parsed) {
  if (parsed.type === 'none' || parsed.type === 'regex_error') return true;
  if (parsed.type === 'substring') {
    return skillSearchHaystack(skill).includes(parsed.needle);
  }
  return parsed.re.test(skillSearchTextPlain(skill));
}
