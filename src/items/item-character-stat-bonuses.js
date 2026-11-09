/**
 * @file Parse item modifier lines into planner character-stat bonuses.
 * @module items/item-character-stat-bonuses
 */

import { useItemsStore } from '@/stores/items.js';
import { getCharacterInstance } from '@/character/planner-instance.js';
import {
  getPlannerCharacterStatDefs,
  isPlannerBaseStatKey,
} from '@/character/planner-stats-config.js';
import { getFileSkillStore } from '@/shared/skill-data-store.js';
import { isModifierLineActive, modifierLineText } from '@/items/item-modifier-line.js';
import { stripDisplayedRollRanges } from '@/items/affix-rolls.js';
import { parseSkillBonusFromModifierLine } from '@/items/skill-bonus-from-modifiers.js';
import { matchAnyCatalogSkillGrantFromLine } from '@/items/item-granted-oskills.js';
import { stripProcLinePrefix } from '@/items/item-procs.js';
import { createCharacterBucket, createStatRegistry } from '@/character/bucket/index.js';
import { applyItemSources } from '@/character/bucket/sources/items.js';
import { applyItemDerivedSources } from '@/character/bucket/sources/item-derived.js';

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

const COMBAT_SPEED_KEYS = Object.freeze([
  'hit_recovery',
  'block_speed',
  'attack_speed',
  'cast_speed',
]);

const SPELL_DAMAGE_KEYS = Object.freeze([
  'fire_spell_damage',
  'cold_spell_damage',
  'lightning_spell_damage',
  'poison_spell_damage',
  'physical_magic_spell_damage',
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
 * @type {Array<{ re: RegExp, key?: string, keys?: string[], abs?: boolean, negate?: boolean }>}
 */
const EXTRA_LINE_PATTERNS = [
  { re: /^([+-]?\d+(?:\.\d+)?)\s+to\s+Life and Mana$/i, keys: ['life', 'mana'] },
  { re: /^([+-]?\d+(?:\.\d+)?)\s+to\s+Life$/i, key: 'life' },
  { re: /^([+-]?\d+(?:\.\d+)?)\s+to\s+Mana$/i, key: 'mana' },
  { re: /^Maximum Mana \+?([+-]?\d+(?:\.\d+)?)%$/i, key: 'maximum_mana' },
  { re: /^\+?([+-]?\d+(?:\.\d+)?)%\s+Maximum Mana$/i, key: 'maximum_mana' },
  { re: /^Maximum Life \+?([+-]?\d+(?:\.\d+)?)%$/i, key: 'maximum_life' },
  { re: /^\+?([+-]?\d+(?:\.\d+)?)%\s+Max(?:imum)? Life$/i, key: 'maximum_life' },
  { re: /^Max(?:imum)? Fire Resist \+?([+-]?\d+(?:\.\d+)?)%$/i, key: 'maximum_fire_resistance' },
  { re: /^Max(?:imum)? Lightning Resist \+?([+-]?\d+(?:\.\d+)?)%$/i, key: 'maximum_lightning_resistance' },
  { re: /^Max(?:imum)? Cold Resist \+?([+-]?\d+(?:\.\d+)?)%$/i, key: 'maximum_cold_resistance' },
  { re: /^Max(?:imum)? Poison Resist \+?([+-]?\d+(?:\.\d+)?)%$/i, key: 'maximum_poison_resist' },
  {
    re: /^Maximum Elemental Resists? \+?([+-]?\d+(?:\.\d+)?)%$/i,
    keys: [...MAXIMUM_ELEMENTAL_RESIST_KEYS],
  },
  { re: /^([+-]?\d+(?:\.\d+)?)%\s+to\s+Strength$/i, key: 'percent_strength' },
  { re: /^([+-]?\d+(?:\.\d+)?)%\s+to\s+Dexterity$/i, key: 'percent_dexterity' },
  { re: /^([+-]?\d+(?:\.\d+)?)%\s+to\s+Vitality$/i, key: 'percent_vitality' },
  { re: /^([+-]?\d+(?:\.\d+)?)%\s+to\s+Energy$/i, key: 'percent_energy' },
  {
    re: /^\+?([+-]?\d+(?:\.\d+)?)%\s+(?:to\s+)?Summon(?:ed Minion)?(?: Elemental)? Resistances$/i,
    key: 'summoned_minion_resistances',
  },
  { re: /^\+?([+-]?\d+(?:\.\d+)?)%\s+to\s+Summon Life$/i, key: 'summoned_minion_life' },
  { re: /^\+?([+-]?\d+(?:\.\d+)?)%\s+to\s+Summon Damage$/i, key: 'summoned_minion_damage' },
  {
    re: /^\+?([+-]?\d+(?:\.\d+)?)%\s+to\s+Summon Physical Resist(?:ance)?$/i,
    key: 'summon_physical_resistance',
  },
  { re: /^Elemental Resists \+?([+-]?\d+(?:\.\d+)?)%$/i, keys: [...ELEMENTAL_RESIST_KEYS] },
  {
    re: /^\+?([+-]?\d+(?:\.\d+)?)%\s+(?:to\s+)?Elemental Resists$/i,
    keys: [...ELEMENTAL_RESIST_KEYS],
  },
  { re: /^All Resists \+?([+-]?\d+(?:\.\d+)?)%$/i, keys: [...ELEMENTAL_RESIST_KEYS] },
  { re: /^\+?([+-]?\d+(?:\.\d+)?)%\s+(?:to\s+)?Magic Find$/i, key: 'magic_find' },
  { re: /^Regenerate mana \+?([+-]?\d+(?:\.\d+)?)%$/i, key: 'regenerate_mana' },
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
  // Continuity mastery / relic "+x% Skill Duration" -> skill_duration.
  { re: /^\+?([+-]?\d+(?:\.\d+)?)%\s+Skill Duration$/i, key: 'skill_duration' },
  { re: /^Skill Duration\s*\+?([+-]?\d+(?:\.\d+)?)%$/i, key: 'skill_duration' },
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
    re: /^\+?([+-]?\d+(?:\.\d+)?)\s+(?:to\s+)?all Attributes$/i,
    keys: [...ALL_ATTRIBUTE_KEYS],
  },
  {
    re: /^\+?([+-]?\d+(?:\.\d+)?)%\s+(?:to\s+)?All Attributes$/i,
    keys: [...PERCENT_ALL_ATTRIBUTE_KEYS],
  },
  {
    re: /^([+-]?\d+(?:\.\d+)?)%\s+to\s+All Vendor Prices$/i,
    key: 'all_vendor_prices',
  },
  {
    re: /^\+?([+-]?\d+(?:\.\d+)?)%\s+Combat Speeds?$/i,
    keys: [...COMBAT_SPEED_KEYS],
  },
  {
    re: /^Maximum Block Chance \+?([+-]?\d+(?:\.\d+)?)%$/i,
    key: 'max_block_chance',
  },
  // Item text uses a leading minus; planner stores the reduced-by magnitude as positive.
  {
    re: /^-([+-]?\d+(?:\.\d+)?)\s+Physical damage taken$/i,
    key: 'physical_damage_taken_reduced',
  },
  {
    re: /^\+?([+-]?\d+(?:\.\d+)?)%\s+to\s+Spell Damage$/i,
    keys: [...SPELL_DAMAGE_KEYS],
  },
  {
    re: /^Maximum Life and Mana \+?([+-]?\d+(?:\.\d+)?)%$/i,
    keys: ['maximum_life', 'maximum_mana'],
  },
  // Leading minus is display syntax; planner stores the magnitude as a positive pierce value.
  {
    re: /^-([+-]?\d+(?:\.\d+)?)%\s+to\s+(?:Enemy Elemental|All Enemy) Resistances$/i,
    keys: [...ENEMY_ELEMENTAL_RESIST_KEYS],
  },
  {
    re: /^\+?([+-]?\d+(?:\.\d+)?)%\s+to\s+(?:Enemy Elemental|All Enemy) Resistances$/i,
    keys: [...ENEMY_ELEMENTAL_RESIST_KEYS],
    abs: true,
  },
  {
    re: /^Target Takes Additional Damage of \+?([+-]?\d+(?:\.\d+)?)$/i,
    key: 'target_takes_additional_damage',
  },
  {
    re: /^\+?([+-]?\d+(?:\.\d+)?)%\s+Potion Effectiveness$/i,
    key: 'increased_potion_effectiveness',
  },
  {
    re: /^\+?([+-]?\d+(?:\.\d+)?)%\s+Bonus to Spell Focus$/i,
    key: 'percent_spell_focus',
  },
  { re: /^\+?([+-]?\d+(?:\.\d+)?)%\s+Move Speed$/i, key: 'movement_speed' },
  { re: /^\+?([+-]?\d+(?:\.\d+)?)%\s+Avoid$/i, key: 'avoid_chance' },
  {
    re: /^\+?([+-]?\d+(?:\.\d+)?)%\s+Damage to Vessel of Justice$/i,
    key: 'bonus_damage_to_vessel_of_judgement',
  },
  {
    re: /^\+?([+-]?\d+(?:\.\d+)?)%\s+Damage to Vessel of Retribution$/i,
    key: 'bonus_damage_to_vessel_of_retribution',
  },
  {
    re: /^\+?([+-]?\d+(?:\.\d+)?)%\s+(?:of\s+)?Maximum Life Regenerated per second$/i,
    key: 'regenerate_life_percent',
  },
  {
    re: /^Drains \+?([+-]?\d+(?:\.\d+)?)%\s+of Maximum Life per second$/i,
    key: 'regenerate_life_percent',
    negate: true,
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
 * Labels never gate counting â€” keys / stats.json / EXTRA always apply first.
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
  // Skill-specific flavour ("Arrow Swarm: +2 Projectiles") â€” not sheet stats.
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
const PER_LEVEL_ABOVE_RE = /\s+per Character Level above (\d+)$/i;

/**
 * @param {string} text
 * @param {unknown} characterLevel
 * @returns {{ text: string, multiplier: number }}
 */
function peelPerCharacterLevelAbove(text, characterLevel) {
  const m = PER_LEVEL_ABOVE_RE.exec(text);
  if (!m) return { text, multiplier: 1 };
  const threshold = Number(m[1]);
  const lvl = Number(characterLevel);
  const above =
    Number.isFinite(lvl) && Number.isFinite(threshold) ? Math.max(0, Math.floor(lvl) - threshold) : 0;
  return { text: text.slice(0, m.index).trim(), multiplier: above };
}

function bonusesForKeys(keys, amount) {
  /** @type {ParsedCharacterStatBonus[]} */
  const out = [];
  if (!Number.isFinite(amount)) return out;
  for (const key of keys) {
    if (!isPlannerBaseStatKey(key)) continue;
    let n = amount;
    // Item text is always "-X% to Enemy â€¦ Resistance"; there is no positive form.
    if (ENEMY_ELEMENTAL_RESIST_KEYS.includes(key)) n = Math.abs(n);
    if (n === 0) continue;
    out.push({ key, amount: n });
  }
  return out;
}

/**
 * Target phrases of `X% added as <target> (Max +N%)` item conversions.
 *
 * Item text names a share of the character's damage that is re-added as another type.
 * For planner purposes each phrase is a bonus to the matching stat: the spell-damage
 * variants then flow through `Skill._applySpellDamageToResult`, and the weapon/innate
 * variants feed the damage model.
 */
const ADDED_AS_TARGETS = [
  { re: /^weapon physical damage$/i, keys: ['enhanced_weapon_damage'] },
  { re: /^innate elemental damage$/i, keys: ['innate_elemental_damage'] },
  {
    re: /^cold\s*(?:\/|and)\s*poison spell damage$/i,
    keys: ['cold_spell_damage', 'poison_spell_damage'],
  },
  {
    re: /^fire\s*(?:\/|and)\s*lightning spell damage$/i,
    keys: ['fire_spell_damage', 'lightning_spell_damage'],
  },
  {
    re: /^physical\s*(?:\/|and)\s*magic spell damage$/i,
    keys: ['physical_magic_spell_damage'],
  },
  { re: /^magic find$/i, keys: ['magic_find'] },
  { re: /^(fire|cold|lightning|poison) spell damage$/i, keysFromMatch: (m) => [`${m[1].toLowerCase()}_spell_damage`] },
];

/**
 * Parse an `X% added as <target> (Max +N%)` conversion line.
 *
 * The parenthesised "Max +N%" caps the bonus this line can grant, so the line value is
 * clamped to it (caps are per line; the registry caps only apply where they exist).
 *
 * @param {string|null|undefined} text
 * @returns {ParsedCharacterStatBonus[]|null} null when the line is not a conversion
 */
export function parseAddedAsDamageLine(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  const capMatch = /\s*\(\s*max\s*\+?(\d+(?:\.\d+)?)\s*%?\s*\)\s*$/i.exec(raw);
  const cap = capMatch ? Number(capMatch[1]) : null;
  const base = (capMatch ? raw.slice(0, capMatch.index) : raw).trim();
  const match = /^\+?([+-]?\d+(?:\.\d+)?)\s*%\s+added as\s+(.+)$/i.exec(base);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount === 0) return null;
  const target = match[2].trim().toLowerCase().replace(/\s+/g, ' ');

  /** @type {string[]|null} */
  let keys = null;
  for (const entry of ADDED_AS_TARGETS) {
    const targetMatch = entry.re.exec(target);
    if (!targetMatch) continue;
    keys = entry.keysFromMatch ? entry.keysFromMatch(targetMatch) : entry.keys;
    break;
  }
  if (!keys) return null;

  const capped =
    cap != null && Number.isFinite(cap) ? Math.min(Math.abs(amount), Math.abs(cap)) : amount;
  return keys.filter((key) => isPlannerBaseStatKey(key)).map((key) => ({ key, amount: capped }));
}

/**
 * `X% of <source stat> added as <target stat>` conversions. The bonus is a share of
 * another stat's current value, so it cannot be a fixed contribution: the classifier
 * returns a rule and the bucket evaluates it once the source stat is known.
 */
const DERIVED_SOURCE_STATS = [
  { re: /^bonus to defense$/i, key: 'enhanced_defense' },
  {
    re: /^(fire|cold|lightning|poison) resistance$/i,
    keysFromMatch: (m) => `${m[1].toLowerCase()}_resistance`,
  },
  { re: /^minion damage(?: increases)?$/i, key: 'summoned_minion_damage' },
  { re: /^minion life(?: increases)?$/i, key: 'summoned_minion_life' },
  { re: /^(?:maximum\s+)?life$/i, key: 'life' },
  { re: /^vitality$/i, key: 'vitality' },
  { re: /^energy$/i, key: 'energy' },
];

const DERIVED_TARGET_STATS = [
  {
    re: /^(fire|cold|lightning|poison) spell damage$/i,
    keysFromMatch: (m) => [`${m[1].toLowerCase()}_spell_damage`],
  },
  // Flat cold damage added to the weapon: both ends of the damage range move together.
  { re: /^cold damage to weapon$/i, keys: ['minimum_cold_damage', 'maximum_cold_damage'] },
  { re: /^physical damage$/i, keys: ['damage'] },
  { re: /^deadly strike$/i, keys: ['deadly_strike'] },
  { re: /^bonus to defense$/i, keys: ['enhanced_defense'] },
  { re: /^vitality$/i, keys: ['vitality'] },
  { re: /^energy$/i, keys: ['energy'] },
];

/**
 * @param {string} phrase
 * @param {Array<{ re: RegExp, key?: string, keysFromMatch?: (m: RegExpExecArray) => string }>} table
 * @returns {string|null}
 */
function matchDerivedStat(phrase, table) {
  const text = String(phrase || '')
    .trim()
    .replace(/^(?:your|total)\s+/i, '')
    .replace(/\s+/g, ' ');
  if (!text) return null;
  for (const entry of table) {
    const match = entry.re.exec(text);
    if (!match) continue;
    return entry.keysFromMatch ? entry.keysFromMatch(match) : entry.key || null;
  }
  return null;
}

/**
 * @param {string} phrase
 * @returns {string[]|null}
 */
function matchDerivedTargets(phrase) {
  const text = String(phrase || '')
    .trim()
    .replace(/^(?:your|total)\s+/i, '')
    .replace(/\s+/g, ' ');
  if (!text) return null;
  for (const entry of DERIVED_TARGET_STATS) {
    const match = entry.re.exec(text);
    if (!match) continue;
    return entry.keysFromMatch ? entry.keysFromMatch(match) : entry.keys || null;
  }
  return null;
}

/** Suffix conditions understood by `parseDerivedStatLine`. */
const DERIVED_SHIELD_TAIL = /\s+while\s+(?:holding|wielding)\s+a\s+shield$/i;
const DERIVED_JEWEL_TAIL = /\s+for\s+each\s+jewel\s+in\s+your\s+gear$/i;

/**
 * Parse an `X% of <source> added as <target>` derived conversion.
 *
 * Conditions/counts in the suffix are returned as metadata and resolved by the item
 * source (which can see the equipment): `requires: 'shield'` and `count: 'jewels'`.
 *
 * @param {string|null|undefined} text
 * @returns {Array<{ key: string, sourceKey: string, ratio: number, requires?: string, count?: string }>|null}
 */
export function parseDerivedStatLine(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  const match = /^([\d.]+)\s*%\s+of\s+(.+?)\s+added as\s+(.+)$/i.exec(raw);
  if (!match) return null;
  const percent = Number(match[1]);
  if (!Number.isFinite(percent) || percent === 0) return null;
  const sourceKey = matchDerivedStat(match[2], DERIVED_SOURCE_STATS);
  if (!sourceKey) return null;

  let targetPhrase = match[3].trim();
  /** @type {string|undefined} */
  let requires;
  /** @type {string|undefined} */
  let count;
  if (DERIVED_SHIELD_TAIL.test(targetPhrase)) {
    requires = 'shield';
    targetPhrase = targetPhrase.replace(DERIVED_SHIELD_TAIL, '').trim();
  }
  if (DERIVED_JEWEL_TAIL.test(targetPhrase)) {
    count = 'jewels';
    targetPhrase = targetPhrase.replace(DERIVED_JEWEL_TAIL, '').trim();
  }

  const keys = matchDerivedTargets(targetPhrase);
  if (!keys || keys.length === 0) return null;
  const ratio = percent / 100;
  return keys
    .filter((key) => key && key !== sourceKey)
    .map((key) => ({
      key,
      sourceKey,
      ratio,
      ...(requires ? { requires } : {}),
      ...(count ? { count } : {}),
    }));
}

/**
 * @param {string|null|undefined} line
 * @param {{ characterLevel?: number|null }} [options]
 * @returns {{
 *   text: string,
 *   kind: 'inactive'|'skip'|'skill'|'parsed'|'derived'|'unknown',
 *   bonuses: ParsedCharacterStatBonus[],
 *   derived?: Array<{ key: string, sourceKey: string, ratio: number, requires?: string, count?: string }>,
 * }}
 */
export function classifyCharacterStatModifierLine(line, options = {}) {
  if (!isModifierLineActive(line)) {
    return { text: '', kind: 'inactive', bonuses: [] };
  }
  const text = stripDisplayedRollRanges(
    stripProcLinePrefix(modifierLineText(line))
  ).trim();
  if (!text || shouldSkipNonStatLine(text)) {
    return { text, kind: 'skip', bonuses: [] };
  }

  // Nephalem Weapons wording: "20-30% of base Strength and Dexterity",
  // "10-15% of base Vitality". These do NOT grant the attribute â€” a percentage of the
  // base attribute is added as fire and lightning damage to weapons instead. Counting
  // them as flat/total attribute bonuses inflates strength/dexterity.
  if (/\bof\s+base\s+(?:strength|dexterity|vitality|energy)\b/i.test(text)) {
    return { text, kind: 'skip', bonuses: [] };
  }

  // "X% added as <damage>" conversions (Bone Chimes family).
  const addedAsBonuses = parseAddedAsDamageLine(text);
  if (addedAsBonuses) {
    return { text, kind: 'parsed', bonuses: addedAsBonuses };
  }

  // "X% of <source stat> added as <target stat>" (derived, evaluated after items).
  const derivedRules = parseDerivedStatLine(text);
  if (derivedRules && derivedRules.length) {
    return { text, kind: 'derived', bonuses: [], derived: derivedRules };
  }

  // All-skills / class-skills / catalog oSkills are handled elsewhere.
  const skillBonus = parseSkillBonusFromModifierLine(line);
  if (skillBonus && (skillBonus.kind === 'all' || skillBonus.kind === 'class')) {
    return { text, kind: 'skill', bonuses: [] };
  }
  if (matchAnyCatalogSkillGrantFromLine(line)) {
    return { text, kind: 'skill', bonuses: [] };
  }

  const normalized = normalizeMatchText(text);
  const peeled = peelPerCharacterLevelAbove(normalized, options.characterLevel);
  const matchText = peeled.text;
  const matchNoPlus = matchText.replace(/^\+/, '');
  /** @type {ParsedCharacterStatBonus[]} */
  let bonuses = [];
  let matched = false;

  /**
   * @param {string[]} keys
   * @param {number} amount
   * @param {{ abs?: boolean, negate?: boolean }} [flags]
   */
  const take = (keys, amount, flags = {}) => {
    let n = amount;
    if (flags.abs && Number.isFinite(n)) n = Math.abs(n);
    if (flags.negate && Number.isFinite(n)) n = -n;
    bonuses = bonusesForKeys(keys, n * peeled.multiplier);
    matched = true;
  };

  for (const pattern of EXTRA_LINE_PATTERNS) {
    const m = pattern.re.exec(matchText);
    if (!m) continue;
    const keys = pattern.keys || (pattern.key ? [pattern.key] : []);
    take(keys, Number(m[1]), { abs: pattern.abs, negate: pattern.negate });
    break;
  }

  if (!matched) {
    for (const { re, keys } of getStatsFormatPatterns()) {
      const m = re.exec(matchText) || re.exec(matchNoPlus);
      if (!m) continue;
      take(keys, Number(m[1]));
      break;
    }
  }

  if (!matched) {
    for (const { re, key } of getKeyPatterns()) {
      const m = re.exec(matchText) || re.exec(matchNoPlus);
      if (!m) continue;
      take([key], Number(m[1]));
      break;
    }
  }

  // Label aliases last â€” helpful when wording differs from the key, never required.
  if (!matched) {
    for (const { re, key } of getLabelAliasPatterns()) {
      const m = re.exec(matchText) || re.exec(matchNoPlus);
      if (!m) continue;
      take([key], Number(m[1]));
      break;
    }
  }

  if (bonuses.length || matched) return { text, kind: 'parsed', bonuses };

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
 * Matching uses item aliases, stats.json formats, and planner **keys** â€”
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
 * Sum character-stat bonuses from enabled relics / charms / equipped gear through the
 * character bucket.
 * @param {{ className?: string|null }} [options]
 * @returns {{
 *   bonuses: Record<string, number>,
 *   modifiersByKey: Record<string, PlannerStatItemModifier[]>,
 *   unknownModifiers: UnknownItemStatModifier[],
 * }}
 */
export function collectEnabledItemCharacterStatBonuses(options = {}) {
  return (
    collectItemBonusesViaBucket(options) || {
      bonuses: {},
      modifiersByKey: {},
      unknownModifiers: [],
    }
  );
}

/**
 * @param {object} [options]
 * @returns {{ bonuses: Record<string, number>, modifiersByKey: Record<string, PlannerStatItemModifier[]>, unknownModifiers: UnknownItemStatModifier[] }|null}
 */
function collectItemBonusesViaBucket(options = {}) {
  try {
    const itemsStore = useItemsStore();
    const character = getCharacterInstance();
    const registry = createStatRegistry(getPlannerCharacterStatDefs());
    if (!character || !itemsStore) return null;
    const bucket = createCharacterBucket({ registry, expandAliases: false });
    const items = applyItemSources(bucket, {
      itemsStore,
      character,
      className: options.className ?? null,
    });
    let snapshot = bucket.commit();
    if (Array.isArray(items?.derived) && items.derived.length) {
      applyItemDerivedSources(bucket, { rules: items.derived });
      snapshot = bucket.commit();
    }
    /** @type {Record<string, number>} */
    const bonuses = {};
    for (const [key, value] of Object.entries(snapshot.values)) {
      const num = Number(value);
      if (Number.isFinite(num) && num !== 0) bonuses[key] = num;
    }
    /** @type {Record<string, PlannerStatItemModifier[]>} */
    const modifiersByKey = {};
    for (const key of Object.keys(bonuses)) {
      const breakdown = snapshot.getBreakdown(key);
      const rows = (breakdown?.groups || []).flatMap((group) => group.rows || []);
      if (rows.length === 0) continue;
      /** @type {Map<string, PlannerStatItemModifier>} */
      const bySource = new Map();
      for (const row of rows) {
        const sourceLabel = String(row.label || 'Item');
        const existing = bySource.get(sourceLabel);
        if (existing) {
          existing.value += Number(row.value) || 0;
          existing.description = `${existing.value >= 0 ? '+' : ''}${existing.value}`;
          existing.active = existing.active && row.active !== false;
        } else {
          const value = Number(row.value) || 0;
          bySource.set(sourceLabel, {
            sourceLabel,
            description: `${value >= 0 ? '+' : ''}${value}`,
            value,
            active: row.active !== false,
          });
        }
      }
      modifiersByKey[key] = [...bySource.values()];
    }
    const unknownModifiers = snapshot.unsupported.map((row) => ({
      text: row.text,
      sourceLabel: row.source?.label || 'Item',
    }));
    return { bonuses, modifiersByKey, unknownModifiers };
  } catch {
    return null;
  }
}

/**
 * Recompute item bonuses through the bucket and mirror them onto the character.
 * @param {object} character
 * @param {{ className?: string|null }} [options]
 * @returns {void}
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
