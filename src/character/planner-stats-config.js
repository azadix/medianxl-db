/**
 * Planner character stats: loaded from tree_data/{version}/character_stats.json via SkillFileStore.
 * Strict registry: only these keys exist on the character; unknown keys are rejected.
 */

import { getFileSkillStore } from '@/shared/skill-data-store.js';

/**
 * @typedef {'attributes'|'resists'|'damage'|'defense'|'minions'|'misc'} PlannerStatSection
 */

/**
 * @typedef {{
 *   id?: number,
 *   key: string,
 *   label: string,
 *   min: number|null,
 *   max: number|null,
 *   allowNegative?: boolean,
 *   default?: number,
 *   alwaysVisible?: boolean,
 *   sortOrder?: number,
 *   section?: PlannerStatSection
 * }} PlannerCharacterStatDef
 */

function normalizeSection(raw) {
  if (typeof raw !== 'string') return undefined;
  const s = raw.trim().toLowerCase();
  if (s === 'attributes' || s === 'resists' || s === 'damage' || s === 'defense' || s === 'minions' || s === 'misc') {
    return /** @type {PlannerStatSection} */ (s);
  }
  return undefined;
}

/**
 * Raw rows from JSON -> normalized defs (labels + flags).
 * @param {object[]} rows
 * @returns {PlannerCharacterStatDef[]}
 */
function normalizeRegistryRows(rows) {
  const out = [];
  for (const r of rows || []) {
    if (!r || typeof r.key !== 'string' || !r.key.trim()) continue;
    const key = String(r.key).trim().toLowerCase();
    const soRaw = r.sortOrder;
    const sortOrderNum =
      soRaw != null && soRaw !== '' ? Number(soRaw) : Number.NaN;
    const section = normalizeSection(r.section);
    // Default allowNegative: true unless explicitly false (bounds still enforced via min/max).
    const allowNegative = r.allowNegative === false ? false : true;

    const def = {
      id: r.id,
      key,
      label: typeof r.label === 'string' && r.label.trim() ? r.label.trim() : key,
      min: r.min != null && r.min !== '' ? Number(r.min) : null,
      max: r.max != null && r.max !== '' ? Number(r.max) : null,
      allowNegative,
      default: r.default != null ? Number(r.default) : 0,
      alwaysVisible: !!r.alwaysVisible,
      section
    };
    if (Number.isFinite(sortOrderNum)) {
      def.sortOrder = sortOrderNum;
    }
    if (def.min != null && Number.isNaN(def.min)) def.min = null;
    if (def.max != null && Number.isNaN(def.max)) def.max = null;
    if (def.default != null && Number.isNaN(def.default)) def.default = 0;
    out.push(def);
  }
  return out;
}

/**
 * Lower `sortOrder` appears first. Stats without `sortOrder` sort after all that have it, by `id` then `key`.
 * @param {PlannerCharacterStatDef[]} defs
 * @returns {PlannerCharacterStatDef[]}
 */
export function sortPlannerStatDefsForDisplay(defs) {
  const list = defs.slice();
  const NO_ID = 1e12;
  list.sort((a, b) => {
    const oa = a.sortOrder;
    const ob = b.sortOrder;
    const ha = oa != null && Number.isFinite(oa);
    const hb = ob != null && Number.isFinite(ob);
    if (ha !== hb) {
      return ha ? -1 : 1;
    }
    if (ha && hb && oa !== ob) {
      return oa - ob;
    }
    const ida = a.id != null && Number.isFinite(Number(a.id)) ? Number(a.id) : NO_ID;
    const idb = b.id != null && Number.isFinite(Number(b.id)) ? Number(b.id) : NO_ID;
    if (ida !== idb) return ida - idb;
    return a.key.localeCompare(b.key);
  });
  return list;
}

/**
 * @returns {PlannerCharacterStatDef[]}
 */
export function getPlannerCharacterStatDefs() {
  const store = getFileSkillStore();
  const raw = store?.characterStatRegistry;
  if (raw && raw.length) {
    return sortPlannerStatDefsForDisplay(normalizeRegistryRows(raw));
  }
  return [];
}

/**
 * @returns {string[]}
 */
export function getPlannerBaseStatKeys() {
  return getPlannerCharacterStatDefs().map((s) => s.key);
}

/**
 * @param {string} key
 * @returns {PlannerCharacterStatDef|undefined}
 */
export function getPlannerStatDef(key) {
  const k = String(key || '').toLowerCase();
  const store = getFileSkillStore();
  if (store?.characterStatByKeyLower?.size) {
    const row = store.characterStatByKeyLower.get(k);
    if (!row) return undefined;
    const [def] = normalizeRegistryRows([row]);
    return def;
  }
  return undefined;
}

/**
 * Registered character stat (for backwards import name `isPlannerBaseStatKey`).
 * @param {string} key
 */
export function isPlannerBaseStatKey(key) {
  return getPlannerStatDef(key) !== undefined;
}

/**
 * @param {string} key
 */
export function isPlannerNegativeAllowedBaseStat(key) {
  const d = getPlannerStatDef(key);
  return !!(d && d.allowNegative);
}

/**
 * @param {string} key
 * @returns {string}
 */
export function getPlannerStatLabel(key) {
  const d = getPlannerStatDef(key);
  return d ? d.label : String(key || '');
}

/**
 * @returns {Record<string, number>}
 */
export function createEmptyRegisteredStatsObject() {
  const o = {};
  for (const d of getPlannerCharacterStatDefs()) {
    o[d.key] = 0;
  }
  return o;
}

/**
 * @param {number} raw
 * @param {PlannerCharacterStatDef} meta
 * @returns {number}
 */
function applyMinMax(raw, meta) {
  let v = raw;
  if (meta.min != null && Number.isFinite(meta.min)) {
    v = Math.max(meta.min, v);
  }
  if (meta.max != null && Number.isFinite(meta.max)) {
    v = Math.min(meta.max, v);
  }
  return v;
}

/**
 * @param {string} key
 * @param {unknown} raw
 * @returns {number}
 */
export function normalizePlannerStatValue(key, raw) {
  const k = String(key || '').toLowerCase();
  const meta = getPlannerStatDef(k);
  const num = typeof raw === 'number' ? raw : parseFloat(String(raw).trim());
  if (Number.isNaN(num)) return 0;
  if (!meta) return num;

  let v = num;
  if (!meta.allowNegative) {
    const floor = meta.min != null && Number.isFinite(meta.min) ? Math.max(0, meta.min) : 0;
    v = Math.max(floor, v);
  }
  v = applyMinMax(v, meta);
  if (
    k === 'life' ||
    k === 'mana' ||
    k === 'base_life' ||
    k === 'base_mana' ||
    k === 'current_life' ||
    k === 'current_mana'
  ) {
    v = Math.floor(v);
  }
  return v;
}

/**
 * Export lines: only values that differ from default (usually 0).
 * @param {Record<string, number>} stats
 * @returns {string[]}
 */
export function plannerStatsToTextLines(stats) {
  const s = stats && typeof stats === 'object' ? stats : {};
  const lines = [];
  for (const d of getPlannerCharacterStatDefs()) {
    const k = d.key;
    let v = s[k];
    if (v != null && v !== '') {
      v = Number(v);
      if (Number.isNaN(v)) v = 0;
    } else {
      v = 0;
    }
    const normalized = normalizePlannerStatValue(k, v);
    const defVal = d.default != null && !Number.isNaN(d.default) ? d.default : 0;
    if (normalized !== defVal) {
      lines.push(`{{${k}}}=${normalized}`);
    }
  }
  return lines;
}
