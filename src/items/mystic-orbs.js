/**
 * @file Mystic orb display helpers for tooltips and item inspector.
 * @module items/mystic-orbs
 */

/**
 * @typedef {[number, string]} MysticOrbEntry
 * @typedef {{ name: string, aliases?: string[], modifiers?: string[] }} MysticOrbCatalogRow
 */

/** @type {Map<string, MysticOrbCatalogRow>|null} */
let catalogByName = null;

/**
 * @param {string|null|undefined} s
 * @returns {string}
 */
function normKey(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * @param {Array<MysticOrbCatalogRow>|null|undefined} rows
 */
export function loadMysticOrbsCatalog(rows) {
  /** @type {Map<string, MysticOrbCatalogRow>} */
  const byName = new Map();
  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const name = String(row.name || '').trim();
      if (!name) continue;
      /** @type {MysticOrbCatalogRow} */
      const entry = {
        name,
        modifiers: Array.isArray(row.modifiers)
          ? row.modifiers.map((line) => String(line || '').trim()).filter(Boolean)
          : [],
      };
      const aliases = Array.isArray(row.aliases)
        ? row.aliases.map((a) => String(a || '').trim()).filter(Boolean)
        : [];
      if (aliases.length) entry.aliases = aliases;
      byName.set(normKey(name), entry);
      for (const alias of aliases) byName.set(normKey(alias), entry);
    }
  }
  catalogByName = byName;
}

/**
 * @param {string|null|undefined} name
 * @returns {MysticOrbCatalogRow|null}
 */
export function lookupMysticOrb(name) {
  const key = normKey(name);
  if (!key || !catalogByName) return null;
  if (catalogByName.has(key)) return catalogByName.get(key) || null;
  const stripped = key.replace(/^the\s+/, '');
  if (stripped !== key && catalogByName.has(stripped)) return catalogByName.get(stripped) || null;
  return null;
}

/**
 * Scale per-orb modifier text by apply count. Leaves `level N` skill ids alone.
 * @param {string} line
 * @param {number} count
 * @returns {string}
 */
export function scaleMysticOrbModifierLine(line, count) {
  const text = String(line || '').trim();
  const n = Math.floor(Number(count));
  if (!text || !Number.isFinite(n) || n <= 1) return text;
  /** @type {string[]} */
  const locked = [];
  const unlocked = text.replace(/level\s+(\d+)/gi, (_, lvl) => {
    locked.push(lvl);
    return `level §LVL§`;
  });
  const scaled = unlocked.replace(/(-?\d+(?:\.\d+)?)/g, (_, num) => {
    const v = Number(num);
    if (!Number.isFinite(v)) return num;
    const product = v * n;
    return Number.isInteger(product) ? String(product) : String(Number(product.toFixed(4)));
  });
  let i = 0;
  return scaled.replace(/§LVL§/g, () => locked[i++] || '');
}

/**
 * Bonus lines this mystic orb grants (scaled by apply count).
 * @param {string|null|undefined} name
 * @param {number} [count]
 * @returns {string[]}
 */
export function getMysticOrbBonusLines(name, count = 1) {
  const row = lookupMysticOrb(name);
  if (!row) return [];
  const n = Math.floor(Number(count));
  const times = Number.isFinite(n) && n > 0 ? n : 1;
  return (row.modifiers || [])
    .map((line) => scaleMysticOrbModifierLine(line, times))
    .filter(Boolean);
}

/**
 * Unique mystic orbs vs vendor / soulforged MOs.
 * @param {string|null|undefined} name
 * @returns {'unique'|'rare'|'normal'}
 */
export function mysticOrbKind(name) {
  const label = String(name || '').trim();
  if (/^rare\s+mo\b/i.test(label)) return 'rare';
  if (/^mo\s*-/i.test(label)) return 'normal';
  return 'unique';
}

/**
 * @param {unknown} raw
 * @returns {MysticOrbEntry[]}
 */
export function normalizeMysticOrbs(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {MysticOrbEntry[]} */
  const out = [];
  for (const entry of raw) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const count = Math.floor(Number(entry[0]));
    const name = String(entry[1] ?? '').trim();
    if (!Number.isFinite(count) || count < 1 || !name) continue;
    out.push([count, name]);
  }
  return out;
}

/**
 * @param {number} count
 * @param {string} name
 * @returns {string}
 */
export function formatMysticOrbLine(count, name) {
  const n = Math.floor(Number(count));
  const label = String(name || '').trim();
  if (!label) return '';
  if (!Number.isFinite(n) || n < 1) return label;
  return `${n}x ${label}`;
}

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
export function formatMysticOrbLines(raw) {
  return normalizeMysticOrbs(raw)
    .map(([count, name]) => formatMysticOrbLine(count, name))
    .filter(Boolean);
}

/**
 * @param {unknown} raw
 * @returns {Array<{ label: string, name: string, kind: string, mods: string[] }>}
 */
export function formatMysticOrbRows(raw) {
  return normalizeMysticOrbs(raw).map(([count, name]) => ({
    label: formatMysticOrbLine(count, name),
    name,
    kind: mysticOrbKind(name),
    mods: getMysticOrbBonusLines(name, count),
  }));
}
