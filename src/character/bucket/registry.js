/**
 * @file Stat registry for the character bucket.
 * Normalizes `character_stats.json` rows plus optional engine metadata.
 * @module character/bucket/registry
 */

/**
 * @typedef {'none'|'floor'|'round'} StatRounding
 *
 * @typedef {object} StatDef
 * @property {string} key Lowercase registry key.
 * @property {string} label Display label.
 * @property {number|null} min Minimum allowed value.
 * @property {number|null} max Maximum allowed value.
 * @property {boolean} allowNegative Whether negative values are valid.
 * @property {number} default Default value for the stat.
 * @property {boolean} alwaysVisible Whether the panel always shows the row.
 * @property {number|undefined} sortOrder Display ordering.
 * @property {string|undefined} section Panel filter section.
 * @property {StatRounding} round Final rounding rule.
 * @property {string[]} dependsOn Stats this stat reads.
 * @property {boolean} isPool `true` for life/mana-like pools.
 */

const DEFAULT_DEF = Object.freeze({
  key: '',
  label: '',
  min: null,
  max: null,
  allowNegative: true,
  default: 0,
  alwaysVisible: false,
  sortOrder: undefined,
  section: undefined,
  round: 'none',
  dependsOn: [],
  isPool: false,
});

/**
 * @param {unknown} value
 * @returns {number|null}
 */
function optionalNumber(value) {
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function stringList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry ?? '').trim().toLowerCase())
    .filter((entry) => entry !== '');
}

/**
 * @param {StatRounding|string|undefined} value
 * @returns {StatRounding}
 */
function normalizeRounding(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'floor') return 'floor';
  if (raw === 'round') return 'round';
  return 'none';
}

/**
 * @param {string} key
 * @returns {StatRounding}
 */
function defaultRoundingForKey(key) {
  const k = String(key || '').toLowerCase();
  if (k === 'strength' || k === 'dexterity' || k === 'vitality' || k === 'energy') {
    return 'floor';
  }
  if (
    k === 'life' ||
    k === 'mana' ||
    k === 'base_life' ||
    k === 'base_mana' ||
    k === 'current_life' ||
    k === 'current_mana'
  ) {
    return 'floor';
  }
  return 'none';
}

/**
 * @param {string} key
 * @returns {boolean}
 */
function defaultIsPool(key) {
  const k = String(key || '').toLowerCase();
  return k === 'life' || k === 'mana' || k === 'base_life' || k === 'base_mana';
}

/**
 * Normalize one registry row. Accepts both raw `character_stats.json` rows and
 * already-normalized defs from `planner-stats-config.js`.
 * @param {object} row
 * @returns {StatDef}
 */
export function normalizeStatDef(row) {
  const source = row && typeof row === 'object' ? row : {};
  const key = String(source.key ?? '').trim().toLowerCase();
  if (!key) throw new Error('Stat definition requires a key');
  const allowNegative = source.allowNegative === false ? false : true;
  /** @type {StatDef} */
  const def = {
    ...DEFAULT_DEF,
    key,
    label: String(source.label ?? key).trim() || key,
    min: optionalNumber(source.min),
    max: optionalNumber(source.max),
    allowNegative,
    default: optionalNumber(source.default) ?? 0,
    alwaysVisible: source.alwaysVisible === true,
    round:
      source.round != null
        ? normalizeRounding(source.round)
        : defaultRoundingForKey(key),
    dependsOn: Object.freeze(stringList(source.dependsOn)),
    isPool: source.isPool === true || defaultIsPool(key),
  };
  const sortOrder = optionalNumber(source.sortOrder);
  if (sortOrder != null) def.sortOrder = sortOrder;
  if (source.section != null && String(source.section).trim() !== '') {
    def.section = String(source.section).trim().toLowerCase();
  }
  return Object.freeze(def);
}

/**
 * @typedef {object} StatRegistry
 * @property {(key: string) => boolean} has Look up whether a stat is registered.
 * @property {(key: string) => StatDef|undefined} get Read a normalized def.
 * @property {() => string[]} keys List registry keys.
 * @property {() => StatDef[]} values List normalized defs.
 * @property {number} size Number of registered stats.
 * @property {Map<string, StatDef>} defs Backing map.
 */

/**
 * @param {Array<object>} rows
 * @returns {StatRegistry}
 */
export function createStatRegistry(rows = []) {
  /** @type {Map<string, StatDef>} */
  const defs = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const def = normalizeStatDef(row);
    defs.set(def.key, def);
  }
  return {
    defs,
    size: defs.size,
    has: (key) => defs.has(String(key ?? '').trim().toLowerCase()),
    get: (key) => defs.get(String(key ?? '').trim().toLowerCase()),
    keys: () => [...defs.keys()],
    values: () => [...defs.values()],
  };
}

/**
 * Effective def for a stat that is not registered (tests / forward compatibility).
 * @param {string} key
 * @returns {StatDef}
 */
export function fallbackStatDef(key) {
  return normalizeStatDef({ key, label: key, allowNegative: true });
}

/**
 * Dependencies declared by the registry, restricted to existing stats.
 * @param {StatRegistry} registry
 * @returns {Map<string, string[]>}
 */
export function getRegistryDependencies(registry) {
  /** @type {Map<string, string[]>} */
  const out = new Map();
  for (const def of registry.values()) {
    const deps = def.dependsOn.filter((dep) => dep !== def.key && registry.has(dep));
    out.set(def.key, deps);
  }
  return out;
}
