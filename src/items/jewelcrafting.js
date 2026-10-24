/**
 * Cube Catalyst of Jewelcrafting presets (docs cube recipes).
 * @module items/jewelcrafting
 */

import { applyAffixRolls, buildAffixDisplayParts, parseAffixRanges } from '@/items/affix-rolls.js';

/**
 * @typedef {{
 *   id: string,
 *   modifiers: string[],
 * }} JewelcraftPreset
 */

/** @type {readonly JewelcraftPreset[]} */
export const JEWELCRAFT_PRESETS = Object.freeze([
  Object.freeze({
    id: 'mf',
    modifiers: Object.freeze(['(2 to 3)% Magic Find']),
  }),
  Object.freeze({
    id: 'req',
    modifiers: Object.freeze(['Requirements -(4 to 6)%']),
  }),
  Object.freeze({
    id: 'summonLife',
    modifiers: Object.freeze(['+(4 to 6)% to Summon Life']),
  }),
  Object.freeze({
    id: 'elemRes',
    modifiers: Object.freeze(['Elemental Resists +(3 to 5)%']),
  }),
  Object.freeze({
    id: 'laek',
    modifiers: Object.freeze([
      '+(4 to 6) Life after each Kill',
      '+(4 to 6) Mana after each Kill',
    ]),
  }),
  Object.freeze({
    id: 'summonRes',
    modifiers: Object.freeze(['+(2 to 4)% to Summon Elemental Resistances']),
  }),
  Object.freeze({
    id: 'allAttr',
    modifiers: Object.freeze(['+(4 to 6) to all Attributes']),
  }),
  Object.freeze({
    id: 'loa',
    modifiers: Object.freeze([
      '+(5 to 10) Life on Melee Attack',
      '+(4 to 6) Mana on Melee Attack',
    ]),
  }),
  Object.freeze({
    id: 'summonDmg',
    modifiers: Object.freeze(['+(2 to 3)% to Summon Damage']),
  }),
  Object.freeze({
    id: 'spellDmg',
    modifiers: Object.freeze(['+(1 to 2)% to Spell Damage']),
  }),
  Object.freeze({
    id: 'll',
    modifiers: Object.freeze(['(2 to 3)% Life stolen per Hit']),
  }),
  Object.freeze({
    id: 'maxDmg',
    modifiers: Object.freeze(['+(2 to 4) to Maximum Damage']),
  }),
  Object.freeze({
    id: 'spellFocus',
    modifiers: Object.freeze(['+(5 to 10) Spell Focus']),
  }),
  Object.freeze({
    id: 'xp',
    modifiers: Object.freeze(['+(1 to 2)% to Experience Gained']),
  }),
  Object.freeze({
    id: 'freq',
    modifiers: Object.freeze(['Activation Frequency (1 to 2)%']),
  }),
]);

/** @type {ReadonlyMap<string, JewelcraftPreset>} */
const BY_ID = new Map(JEWELCRAFT_PRESETS.map((row) => [row.id, row]));

/**
 * @param {string|null|undefined} id
 * @returns {JewelcraftPreset|null}
 */
export function lookupJewelcraft(id) {
  const key = String(id || '').trim();
  return key ? BY_ID.get(key) || null : null;
}

/**
 * @returns {JewelcraftPreset[]}
 */
export function listJewelcraftPresets() {
  return JEWELCRAFT_PRESETS.slice();
}

/**
 * @param {string|null|undefined} id
 * @returns {string[]}
 */
export function getJewelcraftLines(id) {
  const row = lookupJewelcraft(id);
  return row ? row.modifiers.slice() : [];
}

/**
 * @param {number} lineIndex
 * @param {number} rangeIndex
 * @returns {string}
 */
export function jewelcraftRollKey(lineIndex, rangeIndex) {
  return `jewelcraft:${lineIndex}:r${rangeIndex}`;
}

/**
 * @param {unknown} raw
 * @returns {Record<string, number>}
 */
export function parseJewelcraftRolls(raw) {
  /** @type {Record<string, number>} */
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw)) {
    const n = Number(value);
    if (key && Number.isFinite(n)) out[key] = n;
  }
  return out;
}

/**
 * @param {string|null|undefined} id
 * @param {Record<string, number>|null|undefined} rolls
 * @returns {string[]}
 */
export function getJewelcraftRolledLines(id, rolls) {
  return getJewelcraftLines(id).map((text, i) =>
    applyAffixRolls(text, rolls, (rangeIndex) => jewelcraftRollKey(i, rangeIndex))
  );
}

/**
 * @param {string|null|undefined} id
 * @returns {Record<string, number>}
 */
export function defaultJewelcraftRolls(id) {
  /** @type {Record<string, number>} */
  const rolls = {};
  for (const stat of listJewelcraftRollableStats(id, null)) {
    const mid = (Number(stat.min) + Number(stat.max)) / 2;
    rolls[stat.key] =
      Number.isInteger(stat.min) && Number.isInteger(stat.max) ? Math.round(mid) : mid;
  }
  return rolls;
}

/**
 * @param {string|null|undefined} id
 * @param {Record<string, number>|null|undefined} rolls
 * @returns {import('@/items/item-stats.js').RollableStat[]}
 */
export function listJewelcraftRollableStats(id, rolls) {
  /** @type {import('@/items/item-stats.js').RollableStat[]} */
  const out = [];
  getJewelcraftLines(id).forEach((text, lineIndex) => {
    const resolved = applyAffixRolls(text, rolls, (i) => jewelcraftRollKey(lineIndex, i));
    parseAffixRanges(text).forEach((range, rangeIndex) => {
      out.push({
        key: jewelcraftRollKey(lineIndex, rangeIndex),
        label: text,
        display: resolved,
        displayParts: buildAffixDisplayParts(
          text,
          rolls,
          (i) => jewelcraftRollKey(lineIndex, i),
          rangeIndex
        ),
        min: range.min,
        max: range.max,
        color: 'magic',
      });
    });
  });
  return out;
}

/**
 * Socket/tooltip lines for a user jewel: catalyst preset then rare affixes.
 * @param {{ rarity?: string, jewelcraft?: string, jewelcraftRolls?: Record<string, number>, modifiers?: string[] }|null|undefined} jewel
 * @returns {string[]}
 */
export function customJewelModifierLines(jewel) {
  const rarity = String(jewel?.rarity || '').toLowerCase();
  const craft =
    rarity === 'crafted'
      ? getJewelcraftRolledLines(jewel?.jewelcraft, parseJewelcraftRolls(jewel?.jewelcraftRolls))
      : [];
  const mods = Array.isArray(jewel?.modifiers)
    ? jewel.modifiers.map((line) => String(line || '').trim()).filter(Boolean)
    : [];
  if (!craft.length) return mods;
  const craftSet = new Set(craft);
  return [...craft, ...mods.filter((line) => !craftSet.has(line))];
}

/**
 * @param {JewelcraftPreset} row
 * @returns {string}
 */
export function jewelcraftOptionLabel(row) {
  return row.modifiers.join(' / ');
}
