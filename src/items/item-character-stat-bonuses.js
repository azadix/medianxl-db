/**
 * @file Parse item/relic/charm modifier lines into planner character-stat bonuses.
 * @module items/item-character-stat-bonuses
 */

import { useItemsStore } from '@/stores/items.js';
import { getCharacterInstance } from '@/character/planner-instance.js';
import {
  getPlannerCharacterStatDefs,
  isPlannerBaseStatKey,
  normalizePlannerStatValue,
} from '@/character/planner-stats-config.js';
import { getFileSkillStore } from '@/shared/skill-data-store.js';
import { isModifierLineActive, modifierLineText } from '@/items/item-modifier-line.js';
import { stripDisplayedRollRanges } from '@/items/affix-rolls.js';
import { parseSkillBonusFromModifierLine } from '@/items/skill-bonus-from-modifiers.js';
import { matchCatalogSkillGrantFromLine } from '@/items/item-granted-oskills.js';
import { stripProcLinePrefix } from '@/items/item-procs.js';
import {
  defaultRelicAffixRolls,
  getRelicStatLines,
  isRelicBonusActive,
} from '@/items/relic-items.js';
import {
  defaultCharmRollsForDef,
  getCharmAffixSources,
  isCharmBonusActive,
  resolveCharmAffixText,
} from '@/items/charm-items.js';
import { getItemStatLines } from '@/items/item-stats.js';
import { EQUIPMENT_SLOTS } from '@/items/item-types.js';

/**
 * @typedef {{
 *   sourceLabel: string,
 *   description: string,
 *   value: number,
 *   active?: boolean,
 * }} PlannerStatItemModifier
 *
 * @typedef {{ key: string, amount: number }} ParsedCharacterStatBonus
 */

/** @type {Record<string, PlannerStatItemModifier[]>} */
let _plannerStatItemModifiersByKey = {};

const ELEMENTAL_RESIST_KEYS = Object.freeze([
  'fire_resistance',
  'cold_resistance',
  'lightning_resistance',
  'poison_resistance',
]);

/**
 * Item-text aliases that do not match character_stats labels 1:1.
 * `keys` expands one line onto several planner stats (e.g. Elemental Resists).
 * @type {Array<{ re: RegExp, key?: string, keys?: string[] }>}
 */
const EXTRA_LINE_PATTERNS = [
  { re: /^([+-]?\d+(?:\.\d+)?)\s+to\s+Life$/i, key: 'life' },
  { re: /^([+-]?\d+(?:\.\d+)?)\s+to\s+Mana$/i, key: 'mana' },
  { re: /^Maximum Mana \+([+-]?\d+(?:\.\d+)?)%$/i, key: 'maximum_mana' },
  { re: /^Maximum Life \+([+-]?\d+(?:\.\d+)?)%$/i, key: 'maximum_life' },
  { re: /^Maximum Fire Resist \+([+-]?\d+(?:\.\d+)?)%$/i, key: 'maximum_fire_resistance' },
  { re: /^Maximum Lightning Resist \+([+-]?\d+(?:\.\d+)?)%$/i, key: 'maximum_lightning_resistance' },
  { re: /^Maximum Cold Resist \+([+-]?\d+(?:\.\d+)?)%$/i, key: 'maximum_cold_resistance' },
  { re: /^Maximum Poison Resist \+([+-]?\d+(?:\.\d+)?)%$/i, key: 'maximum_poison_resist' },
  { re: /^([+-]?\d+(?:\.\d+)?)%\s+to\s+Strength$/i, key: 'percent_strength' },
  { re: /^([+-]?\d+(?:\.\d+)?)%\s+to\s+Dexterity$/i, key: 'percent_dexterity' },
  { re: /^([+-]?\d+(?:\.\d+)?)%\s+to\s+Vitality$/i, key: 'percent_vitality' },
  { re: /^([+-]?\d+(?:\.\d+)?)%\s+to\s+Energy$/i, key: 'percent_energy' },
  {
    re: /^\+([+-]?\d+(?:\.\d+)?)%\s+to\s+Summon Elemental Resistances$/i,
    key: 'summoned_minion_resistances',
  },
  { re: /^\+([+-]?\d+(?:\.\d+)?)%\s+to\s+Summon Life$/i, key: 'summoned_minion_life' },
  { re: /^\+([+-]?\d+(?:\.\d+)?)%\s+to\s+Summon Damage$/i, key: 'summoned_minion_damage' },
  { re: /^Elemental Resists \+([+-]?\d+(?:\.\d+)?)%$/i, keys: [...ELEMENTAL_RESIST_KEYS] },
  { re: /^All Resists \+([+-]?\d+(?:\.\d+)?)%$/i, keys: [...ELEMENTAL_RESIST_KEYS] },
];

/** @type {Array<{ re: RegExp, key: string }>|null} */
let _labelPatternsCache = null;
/** @type {Array<{ re: RegExp, key: string }>|null} */
let _statsFormatPatternsCache = null;

/**
 * @param {string} text
 * @returns {string}
 */
function normalizeMatchText(text) {
  return String(text || '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Build a case-insensitive regex from a character_stats label (`#` = number).
 * @param {string} label
 * @returns {RegExp|null}
 */
function labelToPattern(label) {
  const raw = String(label || '').trim();
  if (!raw || !raw.includes('#')) return null;
  // Replace # placeholders first, then escape the rest.
  const parts = raw.split('#');
  const escaped = parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const withNum = escaped.join('([+-]?\\d+(?:\\.\\d+)?)');
  return new RegExp(`^\\+?${withNum}$`, 'i');
}

/**
 * @returns {Array<{ re: RegExp, key: string }>}
 */
function getLabelPatterns() {
  if (_labelPatternsCache) return _labelPatternsCache;
  /** @type {Array<{ re: RegExp, key: string }>} */
  const out = [];
  for (const def of getPlannerCharacterStatDefs()) {
    const re = labelToPattern(def.label);
    if (!re) continue;
    out.push({ re, key: def.key });
  }
  _labelPatternsCache = out;
  return out;
}

/**
 * @returns {Array<{ re: RegExp, key: string }>}
 */
function getStatsFormatPatterns() {
  if (_statsFormatPatternsCache) return _statsFormatPatternsCache;
  /** @type {Array<{ re: RegExp, key: string }>} */
  const out = [];
  const store = getFileSkillStore();
  const stats = store?.stats;
  if (!Array.isArray(stats)) {
    _statsFormatPatternsCache = out;
    return out;
  }
  for (const row of stats) {
    const paired = Array.isArray(row?.pairedStat) ? row.pairedStat : [];
    /** @type {Set<string>} */
    const plannerKeys = new Set();
    for (const entry of paired) {
      const token =
        entry?.plannerKey ?? entry?.stat ?? entry?.key ?? entry?.characterStat ?? entry?.character_stat;
      const k = token != null ? String(token).trim().toLowerCase() : '';
      if (k && isPlannerBaseStatKey(k)) plannerKeys.add(k);
    }
    if (plannerKeys.size !== 1) continue;
    const plannerKey = [...plannerKeys][0];
    const format = String(row?.format || '').trim();
    if (!format || !format.includes('{value0}')) continue;
    const parts = format.split('{value0}');
    const escaped = parts.map((p) =>
      p
        .replace(/\{value[1-3]\}/g, 'NUM')
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/NUM/g, '[+-]?\\d+(?:\\.\\d+)?')
    );
    const withNum = escaped.join('([+-]?\\d+(?:\\.\\d+)?)');
    try {
      out.push({ re: new RegExp(`^\\+?${withNum}$`, 'i'), key: plannerKey });
    } catch {
      // ignore bad format rows
    }
  }
  _statsFormatPatternsCache = out;
  return out;
}

/** Drop caches when skill data reloads (tests / version switch). */
export function clearItemCharacterStatBonusCaches() {
  _labelPatternsCache = null;
  _statsFormatPatternsCache = null;
}

/**
 * @param {string} text
 * @returns {boolean}
 */
function shouldSkipNonStatLine(text) {
  const t = String(text || '').trim();
  if (!t) return true;
  if (/Chance to cast/i.test(t)) return true;
  if (/\bwhen you\b/i.test(t)) return true;
  if (/\bon (Kill|Striking|Attack|Death|Melee)\b/i.test(t)) return true;
  if (/^Adds\b/i.test(t)) return true;
  if (/Required Level/i.test(t)) return true;
  if (/Keep in Inventory/i.test(t)) return true;
  if (/Socketed\s*\(/i.test(t)) return true;
  if (/Damage:/i.test(t) || /Defense:/i.test(t)) return true;
  if (/Melee range:/i.test(t) || /Attack Speed Modifier:/i.test(t)) return true;
  // Skill-specific flavour ("Arrow Swarm: +2 Projectiles") — not sheet stats.
  if (/^[A-Za-z0-9][^:]{0,40}:\s/.test(t) && !/Resist/i.test(t)) return true;
  return false;
}

/**
 * @param {string[]} keys
 * @param {number} amount
 * @returns {ParsedCharacterStatBonus[]}
 */
function bonusesForKeys(keys, amount) {
  /** @type {ParsedCharacterStatBonus[]} */
  const out = [];
  if (!Number.isFinite(amount) || amount === 0) return out;
  for (const key of keys) {
    if (!isPlannerBaseStatKey(key)) continue;
    out.push({ key, amount });
  }
  return out;
}

/**
 * Parse one resolved modifier line into planner character-stat delta(s).
 * @param {string|null|undefined} line
 * @returns {ParsedCharacterStatBonus[]}
 */
export function parseCharacterStatBonusesFromModifierLine(line) {
  if (!isModifierLineActive(line)) return [];
  const text = stripDisplayedRollRanges(
    stripProcLinePrefix(modifierLineText(line))
  ).trim();
  if (!text || shouldSkipNonStatLine(text)) return [];

  // Skill soft-levels / catalog oSkill grants are handled elsewhere.
  // Keep generic "+N to Life/Mana" as character stats (not skill grants).
  const skillBonus = parseSkillBonusFromModifierLine(line);
  if (skillBonus && (skillBonus.kind === 'all' || skillBonus.kind === 'class')) return [];
  if (matchCatalogSkillGrantFromLine(line)) return [];

  const normalized = normalizeMatchText(text);

  for (const pattern of EXTRA_LINE_PATTERNS) {
    const m = pattern.re.exec(normalized);
    if (!m) continue;
    const amount = Number(m[1]);
    const keys = pattern.keys || (pattern.key ? [pattern.key] : []);
    return bonusesForKeys(keys, amount);
  }

  for (const { re, key } of getLabelPatterns()) {
    const m = re.exec(normalized) || re.exec(normalized.replace(/^\+/, ''));
    if (!m) continue;
    return bonusesForKeys([key], Number(m[1]));
  }

  for (const { re, key } of getStatsFormatPatterns()) {
    const m = re.exec(normalized) || re.exec(normalized.replace(/^\+/, ''));
    if (!m) continue;
    return bonusesForKeys([key], Number(m[1]));
  }

  return [];
}

/**
 * @param {string|null|undefined} line
 * @returns {ParsedCharacterStatBonus|null}
 */
export function parseCharacterStatBonusFromModifierLine(line) {
  const list = parseCharacterStatBonusesFromModifierLine(line);
  return list[0] ?? null;
}

/**
 * @param {string[]} lines
 * @param {string} sourceLabel
 * @param {Record<string, number>} bonuses
 * @param {Record<string, PlannerStatItemModifier[]>} modsByKey
 */
function accumulateLines(lines, sourceLabel, bonuses, modsByKey) {
  for (const line of Array.isArray(lines) ? lines : []) {
    for (const parsed of parseCharacterStatBonusesFromModifierLine(line)) {
      const { key, amount } = parsed;
      bonuses[key] = (bonuses[key] || 0) + amount;
      if (!modsByKey[key]) modsByKey[key] = [];
      const sign = amount >= 0 ? '+' : '';
      modsByKey[key].push({
        sourceLabel,
        description: `${sign}${amount}`,
        value: amount,
        active: true,
      });
    }
  }
}

/**
 * @param {object|null|undefined} def
 * @returns {string}
 */
function sourceLabelForDef(def) {
  const name = def?.name != null ? String(def.name).trim() : '';
  return name || (def?.id != null ? String(def.id) : 'Item');
}

/**
 * Sum character-stat bonuses from enabled relics / charms / equipped gear.
 * @param {{ className?: string|null }} [options]
 * @returns {{
 *   bonuses: Record<string, number>,
 *   modifiersByKey: Record<string, PlannerStatItemModifier[]>,
 * }}
 */
export function collectEnabledItemCharacterStatBonuses(options = {}) {
  /** @type {Record<string, number>} */
  const bonuses = {};
  /** @type {Record<string, PlannerStatItemModifier[]>} */
  const modifiersByKey = {};

  try {
    const itemsStore = useItemsStore();
    const character = getCharacterInstance();
    const className =
      (options.className != null ? String(options.className).trim() : '') ||
      (character?.className != null ? String(character.className).trim() : '') ||
      null;
    const characterLevel = character?.level ?? null;

    for (const slot of EQUIPMENT_SLOTS) {
      if (!itemsStore.equipmentSlotMeetsRequirements?.(slot)) continue;
      const instanceId = itemsStore.equipment?.[slot];
      if (instanceId == null) continue;
      const def = itemsStore.getDefForInstance?.(instanceId);
      if (!def) continue;
      const rolls = itemsStore.getRollsForInstance?.(instanceId) ?? null;
      const lines = getItemStatLines(def, rolls, {
        hideRollableRanges: false,
        showRollRanges: false,
        characterLevel,
        charmInInventory: true,
        className,
      });
      accumulateLines(lines, sourceLabelForDef(def), bonuses, modifiersByKey);
    }

    for (const [defId, instanceId] of Object.entries(itemsStore.enabledCharms || {})) {
      const def = itemsStore.catalogById?.[defId];
      if (!def) continue;
      if (!isCharmBonusActive(def, characterLevel, { inInventory: true })) continue;
      const rolls =
        itemsStore.getRollsForInstance?.(instanceId) ?? defaultCharmRollsForDef(def, className);
      /** @type {string[]} */
      const lines = [];
      for (const source of getCharmAffixSources(def, rolls, className, { activeOnly: true })) {
        const text = resolveCharmAffixText(source.text, source.sourceKey, rolls, false);
        if (text == null) continue;
        lines.push(text);
      }
      accumulateLines(lines, sourceLabelForDef(def), bonuses, modifiersByKey);
    }

    for (const [defId, instanceId] of Object.entries(itemsStore.enabledRelics || {})) {
      const def = itemsStore.catalogById?.[defId];
      if (!def) continue;
      if (!isRelicBonusActive(def, characterLevel, { inInventory: true })) continue;
      const rolls =
        itemsStore.getRollsForInstance?.(instanceId) ?? defaultRelicAffixRolls(def);
      const lines = getRelicStatLines(def, rolls, {
        hideRollableRanges: false,
        showRollRanges: false,
      });
      accumulateLines(lines, sourceLabelForDef(def), bonuses, modifiersByKey);
    }
  } catch {
    return { bonuses: {}, modifiersByKey: {} };
  }

  for (const k of Object.keys(bonuses)) {
    bonuses[k] = normalizePlannerStatValue(k, bonuses[k]);
  }

  return { bonuses, modifiersByKey };
}

/**
 * Apply enabled item/relic/charm flat stats onto the character (non-persisted layer).
 * @param {import('@/character/Character.js').default|null|undefined} character
 * @param {{ className?: string|null }} [options]
 */
export function recomputePlannerStatsFromItems(character, options = {}) {
  _plannerStatItemModifiersByKey = {};
  if (!character || typeof character.setPlannerItemStatBonuses !== 'function') return;

  const { bonuses, modifiersByKey } = collectEnabledItemCharacterStatBonuses(options);
  _plannerStatItemModifiersByKey = modifiersByKey;
  character.setPlannerItemStatBonuses(bonuses);
}

/**
 * @param {string} statKey
 * @returns {PlannerStatItemModifier[]}
 */
export function getPlannerStatItemModifiers(statKey) {
  const k = String(statKey || '').trim().toLowerCase();
  return _plannerStatItemModifiersByKey[k] || [];
}
