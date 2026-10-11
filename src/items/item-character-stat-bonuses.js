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
import {
  countEquippedSetPieces,
  formatSetBonusLabel,
  resolveSetBonuses,
} from '@/items/item-overlays.js';

/**
 * @typedef {{
 *   sourceLabel: string,
 *   description: string,
 *   value: number,
 *   active?: boolean,
 * }} PlannerStatItemModifier
 *
 * @typedef {{ key: string, amount: number }} ParsedCharacterStatBonus
 *
 * @typedef {{
 *   text: string,
 *   sourceLabel: string,
 * }} UnknownItemStatModifier
 */

/** @type {Record<string, PlannerStatItemModifier[]>} */
let _plannerStatItemModifiersByKey = {};
/** @type {UnknownItemStatModifier[]} */
let _plannerUnknownItemStatModifiers = [];

const ELEMENTAL_RESIST_KEYS = Object.freeze([
  'fire_resistance',
  'cold_resistance',
  'lightning_resistance',
  'poison_resistance',
]);

const ENEMY_ELEMENTAL_RESIST_KEYS = Object.freeze([
  'enemy_fire_resistance',
  'enemy_cold_resistance',
  'enemy_lightning_resistance',
  'enemy_poison_resistance',
]);

const MAXIMUM_ELEMENTAL_RESIST_KEYS = Object.freeze([
  'maximum_fire_resistance',
  'maximum_lightning_resistance',
  'maximum_cold_resistance',
  'maximum_poison_resist',
]);

const ALL_ATTRIBUTE_KEYS = Object.freeze(['strength', 'dexterity', 'vitality', 'energy']);

const PERCENT_ALL_ATTRIBUTE_KEYS = Object.freeze([
  'percent_strength',
  'percent_dexterity',
  'percent_vitality',
  'percent_energy',
]);

/** Planner keys that should not get auto patterns from the key name. */
const SKIP_KEY_AUTO_PATTERNS = new Set([
  'unspent_stat_points',
  'unspent_skill_points',
  'life',
  'base_life',
  'current_life',
  'mana',
  'base_mana',
  'current_mana',
  'current_stamina',
  'maximum_stamina',
  'combined_percent_spell_focus',
  'total_vitality_bonus_from_paragon',
  'runes_contributing_to_gematria',
]);

/**
 * Item-text aliases for affix wording that differs from planner keys / stats.json.
 * `keys` expands one line onto several planner stats (e.g. Elemental Resists).
 * @type {Array<{ re: RegExp, key?: string, keys?: string[], abs?: boolean }>}
 */
const EXTRA_LINE_PATTERNS = [
  { re: /^([+-]?\d+(?:\.\d+)?)\s+to\s+Life$/i, key: 'life' },
  { re: /^([+-]?\d+(?:\.\d+)?)\s+to\s+Mana$/i, key: 'mana' },
  { re: /^Maximum Mana \+?([+-]?\d+(?:\.\d+)?)%$/i, key: 'maximum_mana' },
  { re: /^Maximum Life \+?([+-]?\d+(?:\.\d+)?)%$/i, key: 'maximum_life' },
  { re: /^Maximum Fire Resist \+?([+-]?\d+(?:\.\d+)?)%$/i, key: 'maximum_fire_resistance' },
  { re: /^Maximum Lightning Resist \+?([+-]?\d+(?:\.\d+)?)%$/i, key: 'maximum_lightning_resistance' },
  { re: /^Maximum Cold Resist \+?([+-]?\d+(?:\.\d+)?)%$/i, key: 'maximum_cold_resistance' },
  { re: /^Maximum Poison Resist \+?([+-]?\d+(?:\.\d+)?)%$/i, key: 'maximum_poison_resist' },
  {
    re: /^Maximum Elemental Resists? \+?([+-]?\d+(?:\.\d+)?)%$/i,
    keys: [...MAXIMUM_ELEMENTAL_RESIST_KEYS],
  },
  { re: /^([+-]?\d+(?:\.\d+)?)%\s+to\s+Strength$/i, key: 'percent_strength' },
  { re: /^([+-]?\d+(?:\.\d+)?)%\s+to\s+Dexterity$/i, key: 'percent_dexterity' },
  { re: /^([+-]?\d+(?:\.\d+)?)%\s+to\s+Vitality$/i, key: 'percent_vitality' },
  { re: /^([+-]?\d+(?:\.\d+)?)%\s+to\s+Energy$/i, key: 'percent_energy' },
  {
    re: /^\+?([+-]?\d+(?:\.\d+)?)%\s+to\s+Summon Elemental Resistances$/i,
    key: 'summoned_minion_resistances',
  },
  { re: /^\+?([+-]?\d+(?:\.\d+)?)%\s+to\s+Summon Life$/i, key: 'summoned_minion_life' },
  { re: /^\+?([+-]?\d+(?:\.\d+)?)%\s+to\s+Summon Damage$/i, key: 'summoned_minion_damage' },
  { re: /^Elemental Resists \+?([+-]?\d+(?:\.\d+)?)%$/i, keys: [...ELEMENTAL_RESIST_KEYS] },
  { re: /^All Resists \+?([+-]?\d+(?:\.\d+)?)%$/i, keys: [...ELEMENTAL_RESIST_KEYS] },
  // Item text uses "Enhanced Defense"; character_stats label is "Bonus Defense".
  { re: /^\+?([+-]?\d+(?:\.\d+)?)%\s+Enhanced Defense$/i, key: 'enhanced_defense' },
  { re: /^\+?([+-]?\d+(?:\.\d+)?)%\s+Bonus to Defense$/i, key: 'enhanced_defense' },
  { re: /^\+?([+-]?\d+(?:\.\d+)?)%\s+Bonus Defense$/i, key: 'enhanced_defense' },
  {
    re: /^\+?([+-]?\d+(?:\.\d+)?)%\s+to\s+Physical\/Magic Spell Damage$/i,
    key: 'physical_magic_spell_damage',
  },
  // Life regen item text vs label / stats.json "Life Regeneration".
  {
    re: /^\+?([+-]?\d+(?:\.\d+)?)\s+Life Regenerat(?:ed|ion) per Second$/i,
    key: 'life_regenerated_per_second',
  },
  // Activation Frequency affixes: "Activation Frequency +6%" / "20% Activation Frequency".
  { re: /^Activation Frequency \+?([+-]?\d+(?:\.\d+)?)%$/i, key: 'activation_frequency' },
  { re: /^\+?([+-]?\d+(?:\.\d+)?)%\s+Activation Frequency$/i, key: 'activation_frequency' },
  {
    re: /^Activation Frequency of Periodic (?:Fire|Lightning|Cold|Poison) Skills?\s*:?\s*\+?([+-]?\d+(?:\.\d+)?)%$/i,
    key: 'activation_frequency',
  },
  { re: /^Physical Resist \+?([+-]?\d+(?:\.\d+)?)%$/i, key: 'physical_resistance' },
  { re: /^\+?([+-]?\d+(?:\.\d+)?)%\s+Physical Resist$/i, key: 'physical_resistance' },
  {
    re: /^Weapon Physical Damage \+?([+-]?\d+(?:\.\d+)?)%$/i,
    key: 'enhanced_weapon_damage',
  },
  {
    re: /^\+?([+-]?\d+(?:\.\d+)?)%\s+Weapon Physical Damage$/i,
    key: 'enhanced_weapon_damage',
  },
  { re: /^Slow(?:s)? Target(?: by)? \+?([+-]?\d+(?:\.\d+)?)%$/i, key: 'slows_target_by' },
  { re: /^Slows Attacker(?: by)? \+?([+-]?\d+(?:\.\d+)?)%$/i, key: 'slows_attacker' },
  {
    re: /^\+?([+-]?\d+(?:\.\d+)?)%\s+Innate Elemental Damage$/i,
    key: 'innate_elemental_damage',
  },
  {
    re: /^Innate Elemental Damage \+?([+-]?\d+(?:\.\d+)?)%$/i,
    key: 'innate_elemental_damage',
  },
  {
    re: /^Poison Length Reduction:?\s*\+?([+-]?\d+(?:\.\d+)?)%$/i,
    key: 'poison_length_reduction',
  },
  {
    re: /^Curse Length Reduction:?\s*\+?([+-]?\d+(?:\.\d+)?)%$/i,
    key: 'curse_length_reduction',
  },
  {
    re: /^\+?([+-]?\d+(?:\.\d+)?)\s+Mana after each Kill$/i,
    key: 'mana_after_each_kill',
  },
  {
    re: /^\+?([+-]?\d+(?:\.\d+)?)\s+Life after each Kill$/i,
    key: 'life_after_each_kill',
  },
  {
    re: /^\+?([+-]?\d+(?:\.\d+)?)\s+to\s+all Attributes$/i,
    keys: [...ALL_ATTRIBUTE_KEYS],
  },
  {
    re: /^\+?([+-]?\d+(?:\.\d+)?)%\s+to\s+All Attributes$/i,
    keys: [...PERCENT_ALL_ATTRIBUTE_KEYS],
  },
  // Leading minus is display syntax; planner stores the magnitude as a positive pierce value.
  {
    re: /^-([+-]?\d+(?:\.\d+)?)%\s+to\s+Enemy Elemental Resistances$/i,
    keys: [...ENEMY_ELEMENTAL_RESIST_KEYS],
  },
  {
    re: /^\+?([+-]?\d+(?:\.\d+)?)%\s+to\s+Enemy Elemental Resistances$/i,
    keys: [...ENEMY_ELEMENTAL_RESIST_KEYS],
    abs: true,
  },
];

/** @type {Array<{ re: RegExp, key: string }>|null} */
let _keyPatternsCache = null;
/** @type {Array<{ re: RegExp, key: string }>|null} */
let _labelAliasPatternsCache = null;
/** @type {Array<{ re: RegExp, keys: string[] }>|null} */
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
 * @param {string} key
 * @returns {string}
 */
function humanizePlannerStatKey(key) {
  return String(key || '')
    .trim()
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Escape a literal for use inside a RegExp source string.
 * @param {string} text
 * @returns {string}
 */
function escapeRegExp(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build item-text regexes from a planner stat **key** (not the UI label).
 * Labels are display-only and must not gate whether a mod is counted.
 * @param {string} key
 * @returns {Array<{ re: RegExp, key: string }>}
 */
function keyToPatterns(key) {
  const k = String(key || '')
    .trim()
    .toLowerCase();
  if (!k || SKIP_KEY_AUTO_PATTERNS.has(k)) return [];
  if (/\(0\s*\/\s*1\)/i.test(k)) return [];

  const name = humanizePlannerStatKey(k);
  if (!name) return [];
  const esc = escapeRegExp(name);
  const num = '([+-]?\\d+(?:\\.\\d+)?)';
  /** @type {string[]} */
  const sources = [
    `^${esc}\\s*\\+?${num}%?$`,
    `^\\+?${num}%?\\s+${esc}$`,
    `^\\+?${num}%\\s+to\\s+${esc}$`,
    `^\\+?${num}\\s+to\\s+${esc}$`,
    `^${esc}\\s*\\+?${num}%$`,
  ];
  if (k.startsWith('enemy_')) {
    sources.push(`^-${num}%\\s+to\\s+${esc}$`);
  }
  /** @type {Array<{ re: RegExp, key: string }>} */
  const out = [];
  for (const src of sources) {
    try {
      out.push({ re: new RegExp(src, 'i'), key: k });
    } catch {
      // ignore bad pattern
    }
  }
  return out;
}

/**
 * @returns {Array<{ re: RegExp, key: string }>}
 */
function getKeyPatterns() {
  if (_keyPatternsCache) return _keyPatternsCache;
  /** @type {Array<{ re: RegExp, key: string }>} */
  const out = [];
  for (const def of getPlannerCharacterStatDefs()) {
    out.push(...keyToPatterns(def.key));
  }
  _keyPatternsCache = out;
  return out;
}

/**
 * Optional aliases from character_stats labels when they contain `#`.
 * Labels never gate counting — keys / stats.json / EXTRA always apply first.
 * @param {string} label
 * @param {string} key
 * @returns {Array<{ re: RegExp, key: string }>}
 */
function labelAliasPatterns(label, key) {
  const raw = String(label || '').trim();
  const k = String(key || '')
    .trim()
    .toLowerCase();
  if (!raw || !k || !raw.includes('#')) return [];
  const parts = raw.split('#');
  const escaped = parts.map((p, i) => {
    let body = p;
    let optionalPlus = false;
    let optionalColon = false;
    if (i < parts.length - 1) {
      if (body.endsWith('+')) {
        optionalPlus = true;
        body = body.slice(0, -1);
      }
      if (/:\s*$/.test(body)) {
        optionalColon = true;
        body = body.replace(/:\s*$/, '');
      }
    }
    let e = escapeRegExp(body);
    if (optionalColon) e += ':?\\s*';
    if (optionalPlus) e += '\\+?';
    return e;
  });
  const withNum = escaped.join('([+-]?\\d+(?:\\.\\d+)?)');
  try {
    return [{ re: new RegExp(`^\\+?${withNum}$`, 'i'), key: k }];
  } catch {
    return [];
  }
}

/**
 * @returns {Array<{ re: RegExp, key: string }>}
 */
function getLabelAliasPatterns() {
  if (_labelAliasPatternsCache) return _labelAliasPatternsCache;
  /** @type {Array<{ re: RegExp, key: string }>} */
  const out = [];
  for (const def of getPlannerCharacterStatDefs()) {
    out.push(...labelAliasPatterns(def.label, def.key));
  }
  _labelAliasPatternsCache = out;
  return out;
}

/**
 * Patterns from stats.json format strings + pairedStat planner keys.
 * Supports multi-key rows (e.g. enemy elemental resists).
 * @returns {Array<{ re: RegExp, keys: string[] }>}
 */
function getStatsFormatPatterns() {
  if (_statsFormatPatternsCache) return _statsFormatPatternsCache;
  /** @type {Array<{ re: RegExp, keys: string[] }>} */
  const out = [];
  const store = getFileSkillStore();
  const stats = store?.stats;
  if (!Array.isArray(stats)) {
    _statsFormatPatternsCache = out;
    return out;
  }
  for (const row of stats) {
    const paired = Array.isArray(row?.pairedStat) ? row.pairedStat : [];
    /** @type {string[]} */
    const plannerKeys = [];
    /** @type {Set<string>} */
    const seen = new Set();
    for (const entry of paired) {
      const token =
        entry?.plannerKey ?? entry?.stat ?? entry?.key ?? entry?.characterStat ?? entry?.character_stat;
      const k = token != null ? String(token).trim().toLowerCase() : '';
      if (!k || !isPlannerBaseStatKey(k) || seen.has(k)) continue;
      seen.add(k);
      plannerKeys.push(k);
    }
    if (!plannerKeys.length) continue;
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
      out.push({ re: new RegExp(`^\\+?${withNum}$`, 'i'), keys: plannerKeys });
    } catch {
      // ignore bad format rows
    }
  }
  _statsFormatPatternsCache = out;
  return out;
}

/** Drop caches when skill data reloads (tests / version switch). */
export function clearItemCharacterStatBonusCaches() {
  _keyPatternsCache = null;
  _labelAliasPatternsCache = null;
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
  if (/^Requirements\b/i.test(t)) return true;
  if (/Keep in Inventory/i.test(t)) return true;
  if (/Socketed\s*\(/i.test(t)) return true;
  if (/Damage:/i.test(t) || /Defense:/i.test(t)) return true;
  if (/Melee range:/i.test(t) || /Attack Speed Modifier:/i.test(t)) return true;
  // Skill-specific flavour ("Arrow Swarm: +2 Projectiles") — not sheet stats.
  // Keep Activation Frequency / resist lines (colon is common in those affixes).
  if (
    /^[A-Za-z0-9][^:]{0,40}:\s/.test(t) &&
    !/Resist/i.test(t) &&
    !/Activation Frequency/i.test(t)
  ) {
    return true;
  }
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
 * @param {string|null|undefined} line
 * @returns {{
 *   text: string,
 *   kind: 'inactive'|'skip'|'skill'|'parsed'|'unknown',
 *   bonuses: ParsedCharacterStatBonus[],
 * }}
 */
export function classifyCharacterStatModifierLine(line) {
  if (!isModifierLineActive(line)) {
    return { text: '', kind: 'inactive', bonuses: [] };
  }
  const text = stripDisplayedRollRanges(
    stripProcLinePrefix(modifierLineText(line))
  ).trim();
  if (!text || shouldSkipNonStatLine(text)) {
    return { text, kind: 'skip', bonuses: [] };
  }

  // All-skills / class-skills / catalog oSkills are handled elsewhere.
  const skillBonus = parseSkillBonusFromModifierLine(line);
  if (skillBonus && (skillBonus.kind === 'all' || skillBonus.kind === 'class')) {
    return { text, kind: 'skill', bonuses: [] };
  }
  if (matchCatalogSkillGrantFromLine(line)) {
    return { text, kind: 'skill', bonuses: [] };
  }

  const normalized = normalizeMatchText(text);
  /** @type {ParsedCharacterStatBonus[]} */
  let bonuses = [];

  for (const pattern of EXTRA_LINE_PATTERNS) {
    const m = pattern.re.exec(normalized);
    if (!m) continue;
    let amount = Number(m[1]);
    if (pattern.abs && Number.isFinite(amount)) amount = Math.abs(amount);
    const keys = pattern.keys || (pattern.key ? [pattern.key] : []);
    bonuses = bonusesForKeys(keys, amount);
    break;
  }

  if (!bonuses.length) {
    for (const { re, keys } of getStatsFormatPatterns()) {
      const m = re.exec(normalized) || re.exec(normalized.replace(/^\+/, ''));
      if (!m) continue;
      bonuses = bonusesForKeys(keys, Number(m[1]));
      if (bonuses.length) break;
    }
  }

  if (!bonuses.length) {
    for (const { re, key } of getKeyPatterns()) {
      const m = re.exec(normalized) || re.exec(normalized.replace(/^\+/, ''));
      if (!m) continue;
      bonuses = bonusesForKeys([key], Number(m[1]));
      if (bonuses.length) break;
    }
  }

  // Label aliases last — helpful when wording differs from the key, never required.
  if (!bonuses.length) {
    for (const { re, key } of getLabelAliasPatterns()) {
      const m = re.exec(normalized) || re.exec(normalized.replace(/^\+/, ''));
      if (!m) continue;
      bonuses = bonusesForKeys([key], Number(m[1]));
      if (bonuses.length) break;
    }
  }

  if (bonuses.length) return { text, kind: 'parsed', bonuses };

  // Named "+N to Skill" lines that did not also match a character-stat key.
  if (skillBonus && skillBonus.kind === 'skill') {
    return { text, kind: 'skill', bonuses: [] };
  }

  // Numeric affix-like lines that did not map to a planner key.
  if (/\d/.test(normalized)) {
    return { text: normalized, kind: 'unknown', bonuses: [] };
  }
  return { text, kind: 'skip', bonuses: [] };
}

/**
 * Parse one resolved modifier line into planner character-stat delta(s).
 * Matching uses item aliases, stats.json formats, and planner **keys** —
 * character_stats labels are display-only and do not affect counting.
 * @param {string|null|undefined} line
 * @returns {ParsedCharacterStatBonus[]}
 */
export function parseCharacterStatBonusesFromModifierLine(line) {
  return classifyCharacterStatModifierLine(line).bonuses;
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
 * @param {UnknownItemStatModifier[]} unknownOut
 */
function accumulateLines(lines, sourceLabel, bonuses, modsByKey, unknownOut) {
  for (const line of Array.isArray(lines) ? lines : []) {
    const classified = classifyCharacterStatModifierLine(line);
    if (classified.kind === 'unknown') {
      unknownOut.push({ text: classified.text, sourceLabel });
      continue;
    }
    for (const parsed of classified.bonuses) {
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
 *   unknownModifiers: UnknownItemStatModifier[],
 * }}
 */
export function collectEnabledItemCharacterStatBonuses(options = {}) {
  /** @type {Record<string, number>} */
  const bonuses = {};
  /** @type {Record<string, PlannerStatItemModifier[]>} */
  const modifiersByKey = {};
  /** @type {UnknownItemStatModifier[]} */
  const unknownModifiers = [];

  try {
    const itemsStore = useItemsStore();
    const character = getCharacterInstance();
    const className =
      (options.className != null ? String(options.className).trim() : '') ||
      (character?.className != null ? String(character.className).trim() : '') ||
      null;
    const characterLevel = character?.level ?? null;

    for (const slot of EQUIPMENT_SLOTS) {
      if (!itemsStore.equipmentSlotContributesBonuses?.(slot)) continue;
      const instanceId = itemsStore.equipment?.[slot];
      if (instanceId == null) continue;
      const def = itemsStore.getDefForInstance?.(instanceId);
      if (!def) continue;
      const rolls = itemsStore.getRollsForInstance?.(instanceId) ?? null;
      const extras = itemsStore.getExtrasForInstance?.(instanceId) ?? [];
      const lines = getItemStatLines(def, rolls, {
        hideRollableRanges: false,
        showRollRanges: false,
        characterLevel,
        charmInInventory: true,
        className,
        extras,
      });
      accumulateLines(lines, sourceLabelForDef(def), bonuses, modifiersByKey, unknownModifiers);
    }

    // Set bonus tiers — only pieces on the active weapon set count.
    const equippedDefs = itemsStore.activeEquippedDefs || [];
    const counts = countEquippedSetPieces(equippedDefs);
    for (const setDef of itemsStore.sets || []) {
      if (!setDef?.id) continue;
      const equippedCount = counts[setDef.id] || 0;
      if (equippedCount <= 0) continue;
      const totalPieces = (itemsStore.catalog || []).filter((d) => d.setId === setDef.id).length;
      for (const bonus of resolveSetBonuses(setDef, equippedCount, totalPieces)) {
        if (!bonus.active) continue;
        const setName = String(setDef.name || setDef.id || 'Set').trim();
        const sourceLabel = `${setName} (${formatSetBonusLabel(bonus.required)})`;
        accumulateLines(bonus.modifiers, sourceLabel, bonuses, modifiersByKey, unknownModifiers);
      }
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
      accumulateLines(lines, sourceLabelForDef(def), bonuses, modifiersByKey, unknownModifiers);
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
      accumulateLines(lines, sourceLabelForDef(def), bonuses, modifiersByKey, unknownModifiers);
    }
  } catch {
    return { bonuses: {}, modifiersByKey: {}, unknownModifiers: [] };
  }

  for (const k of Object.keys(bonuses)) {
    bonuses[k] = normalizePlannerStatValue(k, bonuses[k]);
  }

  return { bonuses, modifiersByKey, unknownModifiers };
}

/**
 * Apply enabled item/relic/charm flat stats onto the character (non-persisted layer).
 * @param {import('@/character/Character.js').default|null|undefined} character
 * @param {{ className?: string|null }} [options]
 */
export function recomputePlannerStatsFromItems(character, options = {}) {
  _plannerStatItemModifiersByKey = {};
  _plannerUnknownItemStatModifiers = [];
  if (!character || typeof character.setPlannerItemStatBonuses !== 'function') return;

  const { bonuses, modifiersByKey, unknownModifiers } =
    collectEnabledItemCharacterStatBonuses(options);
  _plannerStatItemModifiersByKey = modifiersByKey;
  _plannerUnknownItemStatModifiers = unknownModifiers;
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

/**
 * Item modifier lines that look numeric/stat-like but did not map to a planner key.
 * @returns {UnknownItemStatModifier[]}
 */
export function getPlannerUnknownItemStatModifiers() {
  return _plannerUnknownItemStatModifiers.slice();
}
