/**
 * @file Planner affix templates (wiki Item Affixes labels).
 * @module items/affix-templates
 */

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   type?: string,
 *   category?: string,
 *   color?: string,
 *   displayOnly?: boolean,
 * }} AffixTemplate
 */

/** @type {AffixTemplate[]} */
let templates = [];
/** @type {Map<string, AffixTemplate>} */
let byId = new Map();

/**
 * @param {unknown} rows
 */
export function loadAffixTemplates(rows) {
  /** @type {AffixTemplate[]} */
  const list = [];
  /** @type {Map<string, AffixTemplate>} */
  const map = new Map();
  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const id = String(row.id || '').trim();
      const label = String(row.label || '').trim();
      if (!id || !label) continue;
      /** @type {AffixTemplate} */
      const entry = { id, label };
      if (row.type) entry.type = String(row.type);
      if (row.category) entry.category = String(row.category);
      if (row.color) entry.color = String(row.color);
      if (row.displayOnly === true) entry.displayOnly = true;
      list.push(entry);
      map.set(id, entry);
    }
  }
  templates = list;
  byId = map;
}

/**
 * @returns {AffixTemplate[]}
 */
export function listAffixTemplates() {
  return templates.filter((row) => row.displayOnly !== true);
}

/**
 * @returns {string[]}
 */
export function listAffixCategories() {
  const seen = new Set();
  /** @type {string[]} */
  const out = [];
  for (const row of listAffixTemplates()) {
    const cat = row.category || 'utility';
    if (seen.has(cat)) continue;
    seen.add(cat);
    out.push(cat);
  }
  return out;
}

/**
 * @param {string|null|undefined} id
 * @returns {AffixTemplate|null}
 */
export function lookupAffixTemplate(id) {
  const key = String(id || '').trim();
  return key ? byId.get(key) || null : null;
}

/**
 * @param {string} label
 * @param {number|null|undefined} value
 * @returns {string}
 */
export function formatAffixLabel(label, value) {
  const text = String(label || '').trim();
  if (value == null || !Number.isFinite(Number(value))) {
    return text.replace(/\bx\b/g, '0');
  }
  const n = Number(value);
  if (!text.includes('x')) return text;
  const plus = n >= 0 ? `+${n}` : String(n);
  const raw = n >= 0 ? String(n) : String(n);
  return text.replace(/\+x\b/g, plus).replace(/\bx\b/g, raw);
}

/**
 * @param {string|null|undefined} affixId
 * @param {number|null|undefined} value
 * @param {string|null|undefined} [fallback]
 * @returns {string}
 */
export function formatAffixIdLine(affixId, value, fallback = '') {
  const row = lookupAffixTemplate(affixId);
  if (row) return formatAffixLabel(row.label, value);
  const text = String(fallback || '').trim();
  if (text) return formatAffixLabel(text, value);
  const id = String(affixId || '').trim();
  if (!id) return '';
  if (value == null || !Number.isFinite(Number(value))) return id;
  return `${id} ${value}`;
}

/**
 * @param {{ affixId?: string, value?: number, text?: string }|null|undefined} mod
 * @returns {string}
 */
export function formatAffixModLine(mod) {
  if (!mod || typeof mod !== 'object') return '';
  if (mod.text && mod.value == null && !String(mod.text).includes('x')) return String(mod.text);
  return formatAffixIdLine(mod.affixId, mod.value, mod.text);
}
