/**
 * @file Relic helpers (enable-list / max 3, no duplicates).
 * @module items/relic-items
 */

import {
  applyAffixRolls,
  parseAffixRanges,
  buildAffixDisplayParts,
} from '@/items/affix-rolls.js';
import { annotateAffixDisplayPartsWithSkills } from '@/items/item-granted-oskills.js';
import { getFileSkillStore } from '@/shared/skill-data-store.js';
import { MISSING_IMAGE_NAME } from '@/shared/utils.js';

/** MXL hard cap: at most 3 enabled relics. */
export const MAX_RELICS = 3;

/**
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function defaultRollValue(min, max) {
  const mid = (Number(min) + Number(max)) / 2;
  if (Number.isInteger(min) && Number.isInteger(max)) return Math.round(mid);
  return mid;
}

/** @type {Readonly<Record<string, string>>} */
export const RELIC_ROLL_KEYS = Object.freeze({
  affixPrefix: 'relicAffix:',
});

/**
 * @param {string} sourceKey
 * @param {number} rangeIndex
 * @returns {string}
 */
export function relicAffixRollKey(sourceKey, rangeIndex) {
  return `${RELIC_ROLL_KEYS.affixPrefix}${sourceKey}:r${rangeIndex}`;
}

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
export function isRelicItem(def) {
  if (!def || typeof def !== 'object') return false;
  return (
    def.category === 'relics' ||
    def.rarity === 'relic' ||
    def.type === 'relic' ||
    String(def.id || '').startsWith('relic:')
  );
}

/**
 * Strip `relic:` prefix from a catalog id.
 * @param {string|null|undefined} defId
 * @returns {string}
 */
export function relicSlugFromId(defId) {
  const id = String(defId || '').trim();
  if (!id) return '';
  return id.replace(/^relic:/i, '');
}

/**
 * @param {string} slug
 * @returns {string[]}
 */
function relicSlugCandidates(slug) {
  const raw = String(slug || '').trim().toLowerCase();
  if (!raw) return [];
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  const push = (value) => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    out.push(value);
  };
  let cur = raw;
  while (true) {
    push(cur);
    // Skill ids use underscores (arrow_swarm); relic slugs use hyphens.
    if (cur.includes('-')) push(cur.replace(/-/g, '_'));
    if (!cur.includes('-')) break;
    const next = cur.replace(/-[^-]+$/, '');
    if (!next || next === cur) break;
    cur = next;
  }
  return out;
}

/**
 * @param {unknown} image
 * @returns {boolean}
 */
function isUsableSkillImage(image) {
  const img = image != null ? String(image).trim() : '';
  return img.length > 0 && img !== MISSING_IMAGE_NAME;
}

/**
 * Resolve the skill linked to a relic for icon display.
 * @param {object|null|undefined} def
 * @returns {{ id: string, displayName: string, image: string|null, className: string }|null}
 */
export function resolveRelicSkill(def) {
  if (!isRelicItem(def)) return null;
  const store = getFileSkillStore();
  if (!store) return null;

  const slug = relicSlugFromId(def.id);
  const nameMatch = String(def.name || '').match(/^Relic\s*\((.+)\)\s*$/i);
  const nameHint = nameMatch ? String(nameMatch[1]).trim() : '';

  /** @type {string[]} */
  const idCandidates = relicSlugCandidates(slug);
  for (const candidate of idCandidates) {
    const detail = store.getSkillDetail(candidate);
    if (!isUsableSkillImage(detail?.image)) continue;
    return {
      id: String(detail.id),
      displayName: String(detail.display_name || detail.id),
      image: String(detail.image),
      className: String(detail.className || ''),
    };
  }

  /** @type {Map<string, object>|undefined} */
  const byId = store.catalogByInternalId;
  if (byId && typeof byId.values === 'function') {
    const hints = [
      nameHint,
      ...idCandidates.map((s) => s.replace(/[-_]/g, ' ')),
    ].filter(Boolean);
    for (const hint of hints) {
      const needle = hint.toLowerCase();
      for (const row of byId.values()) {
        const dn = String(row?.displayName || '').trim();
        if (!dn || dn.toLowerCase() !== needle) continue;
        if (!isUsableSkillImage(row.image)) continue;
        return {
          id: String(row.id),
          displayName: dn,
          image: String(row.image),
          className: String(store.primaryClassDisplayName?.(row) || row.className || ''),
        };
      }
    }
  }

  return null;
}

/**
 * @param {object|null|undefined} def
 * @param {number|null|undefined} characterLevel
 * @returns {boolean}
 */
export function relicMeetsLevel(def, characterLevel) {
  if (!isRelicItem(def)) return true;
  const req = Number(def.reqLevel) || 0;
  const level = Number(characterLevel);
  if (!Number.isFinite(level)) return false;
  return level >= req;
}

/**
 * Relic bonuses apply only while the item is in inventory and level req is met.
 * @param {object|null|undefined} def
 * @param {number|null|undefined} characterLevel
 * @param {{ inInventory?: boolean }} [options]
 * @returns {boolean}
 */
export function isRelicBonusActive(def, characterLevel, options = {}) {
  if (!isRelicItem(def)) return true;
  if (options.inInventory === false) return false;
  return relicMeetsLevel(def, characterLevel);
}

/**
 * @param {object|null|undefined} def
 * @returns {{ sourceKey: string, text: string }[]}
 */
export function collectRelicAffixSources(def) {
  /** @type {{ sourceKey: string, text: string }[]} */
  const out = [];
  if (!def || typeof def !== 'object') return out;
  let i = 0;
  for (const mod of Array.isArray(def.modifiers) ? def.modifiers : []) {
    if (typeof mod !== 'string' || !mod.trim()) continue;
    out.push({ sourceKey: `base:m${i}`, text: mod });
    i += 1;
  }
  return out;
}

/**
 * @param {string} text
 * @param {string} sourceKey
 * @param {Record<string, number>|null|undefined} rolls
 * @param {boolean} [hideRollableRanges]
 * @returns {string|null}
 */
export function resolveRelicAffixText(text, sourceKey, rolls = null, hideRollableRanges = false) {
  const ranges = parseAffixRanges(text);
  if (!ranges.length) return text;
  if (hideRollableRanges) return null;
  return applyAffixRolls(text, rolls, (i) => relicAffixRollKey(sourceKey, i), {
    hideRanges: hideRollableRanges,
  });
}

/**
 * @param {object|null|undefined} def
 * @returns {Record<string, number>}
 */
export function defaultRelicAffixRolls(def) {
  /** @type {Record<string, number>} */
  const rolls = {};
  for (const source of collectRelicAffixSources(def)) {
    parseAffixRanges(source.text).forEach((range, rangeIndex) => {
      rolls[relicAffixRollKey(source.sourceKey, rangeIndex)] = defaultRollValue(
        range.min,
        range.max
      );
    });
  }
  return rolls;
}

/**
 * @param {object|null|undefined} def
 * @param {Record<string, number>|null|undefined} rolls
 * @param {{ hideRollableRanges?: boolean }} [options]
 * @returns {string[]}
 */
export function getRelicStatLines(def, rolls = null, options = {}) {
  /** @type {string[]} */
  const lines = [];
  const hide = options.hideRollableRanges === true;
  for (const source of collectRelicAffixSources(def)) {
    const text = resolveRelicAffixText(source.text, source.sourceKey, rolls, hide);
    if (text == null) continue;
    lines.push(text);
  }
  return lines;
}

/**
 * @param {{ sourceKey: string, text: string }} source
 * @param {Record<string, number>|null|undefined} rolls
 * @returns {import('@/items/item-stats.js').RollableStat[]}
 */
export function buildRelicSourceRollableStats(source, rolls = null) {
  /** @type {import('@/items/item-stats.js').RollableStat[]} */
  const out = [];
  const resolved = resolveRelicAffixText(source.text, source.sourceKey, rolls, false);
  if (!resolved) return out;
  parseAffixRanges(source.text).forEach((range, rangeIndex) => {
    const parts = annotateAffixDisplayPartsWithSkills(
      buildAffixDisplayParts(
        source.text,
        rolls,
        (i) => relicAffixRollKey(source.sourceKey, i),
        rangeIndex
      )
    );
    out.push({
      key: relicAffixRollKey(source.sourceKey, rangeIndex),
      label: source.text,
      display: resolved,
      displayParts: parts,
      min: range.min,
      max: range.max,
    });
  });
  return out;
}

/**
 * @param {object|null|undefined} def
 * @param {Record<string, number>|null|undefined} rolls
 * @returns {import('@/items/item-stats.js').RollableStat[]}
 */
export function getRelicRollableStats(def, rolls = null) {
  /** @type {import('@/items/item-stats.js').RollableStat[]} */
  const out = [];
  for (const source of collectRelicAffixSources(def)) {
    out.push(...buildRelicSourceRollableStats(source, rolls));
  }
  return out;
}

/**
 * @param {object|null|undefined} def
 * @param {Record<string, number>|null|undefined} rolls
 * @returns {Array<{ kind: 'text'|'roll', text?: string, stat?: import('@/items/item-stats.js').RollableStat }>}
 */
export function getRelicDetailStatRows(def, rolls = null) {
  /** @type {Array<{ kind: 'text'|'roll', text?: string, stat?: import('@/items/item-stats.js').RollableStat }>} */
  const rows = [];
  for (const source of collectRelicAffixSources(def)) {
    const ranges = parseAffixRanges(source.text);
    if (ranges.length) {
      for (const stat of buildRelicSourceRollableStats(source, rolls)) {
        rows.push({ kind: 'roll', stat });
      }
      continue;
    }
    const text = resolveRelicAffixText(source.text, source.sourceKey, rolls, false);
    if (text == null) continue;
    rows.push({ kind: 'text', text });
  }
  return rows;
}
