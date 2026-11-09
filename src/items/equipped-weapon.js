/**
 * @file Equipped weapon damage profile: base range plus the attribute bonuses that
 * scale it. Used by the planner damage model for skills with a `weapon_damage` slot.
 * @module items/equipped-weapon
 */

import { isHandWeapon } from './item-types.js';
import { listActiveEquippedInstances } from './equipment-scan.js';
import { applyEtherealBonus } from './item-stats.js';
import { parseInnateWeaponDamage } from './innate-weapon-damage.js';

/**
 * Bare-handed base damage. Attribute damage bonuses require a weapon, but flat damage
 * from gear/skills ("Adds X-Y", "Bonus <element> Damage to Weapons") still applies.
 */
export const UNARMED_WEAPON_PROFILE = Object.freeze({
  name: 'Unarmed',
  unarmed: true,
  twoHanded: false,
  ethereal: false,
  min: 1,
  max: 2,
  strDamageBonus: 0,
  dexDamageBonus: 0,
});

/**
 * @param {unknown} value
 * @returns {number}
 */
function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Parse a damage display string ("41 to 43", "(156 - 206) to (266 - 293)").
 * Variable rolls are shown as ranges; the widest band is kept.
 * @param {unknown} text
 * @returns {{ min: number, max: number }|null}
 */
export function parseWeaponDamageDisplay(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  const nums = raw.match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 2) return null;
  const values = nums.map(Number).filter((n) => Number.isFinite(n));
  if (values.length < 2) return null;
  const low = Math.min(values[0], values[values.length - 1]);
  const high = Math.max(values[0], values[values.length - 1]);
  return { min: low, max: high };
}

export { parseInnateWeaponDamage } from './innate-weapon-damage.js';

/**
 * Base item def linked from a unique/set weapon (`baseId`).
 * @param {object|null|undefined} itemsStore
 * @param {object|null|undefined} def
 * @returns {object|null}
 */
function findBaseDef(itemsStore, def) {
  const baseId = def?.baseId != null ? String(def.baseId) : '';
  if (!baseId) return null;
  return (
    itemsStore?.catalogById?.[baseId] ??
    (Array.isArray(itemsStore?.catalog)
      ? itemsStore.catalog.find((row) => String(row?.id) === baseId) ?? null
      : null)
  );
}

/**
 * Profile of the weapon the current build attacks with (main hand first).
 *
 * @param {object|null|undefined} itemsStore
 * @returns {{
 *   name: string,
 *   twoHanded: boolean,
 *   ethereal: boolean,
 *   min: number,
 *   max: number,
 *   strDamageBonus: number,
 *   dexDamageBonus: number,
 *   innate: Array<{ type: string, attribute: string, percent: number }>,
 * }|null}
 */
export function getEquippedWeaponProfile(itemsStore) {
  const rows = listActiveEquippedInstances(itemsStore);
  const weapon =
    rows.find((row) => row.slot === 'rarm' && isHandWeapon(row.def)) ||
    rows.find((row) => isHandWeapon(row.def));
  if (!weapon?.def) return null;
  const def = weapon.def;
  const baseDef = findBaseDef(itemsStore, def);

  const twoHanded = Boolean(def.damage2hDisplay || def.damage2h || baseDef?.damage2h);
  let range = parseWeaponDamageDisplay(
    twoHanded ? def.damage2hDisplay : def.damage1hDisplay
  );
  if (!range) {
    const numeric = twoHanded
      ? baseDef?.damage2h ?? def.damage2h
      : baseDef?.damage1h ?? def.damage1h;
    if (numeric && Number.isFinite(Number(numeric.min)) && Number.isFinite(Number(numeric.max))) {
      range = { min: Number(numeric.min), max: Number(numeric.max) };
    }
  }
  // Some weapons (throw-only claws) have no melee range in the data. Keep the profile
  // with a zero base so added damage (e.g. Warbringer orbs "Adds 3-4 Damage") still
  // counts; the 0-1 floor is applied only when nothing adds physical damage at all.
  const baseRange = range ?? { min: 0, max: 0 };

  const ethereal = weapon.instance?.ethereal === true || def.ethereal === true;
  const scale = (value) => (ethereal ? applyEtherealBonus(value) : value);

  return {
    name: String(def.name || def.id || 'Weapon'),
    twoHanded,
    ethereal,
    min: scale(baseRange.min),
    max: scale(baseRange.max),
    strDamageBonus: number(def.strDamageBonus ?? baseDef?.strDamageBonus),
    dexDamageBonus: number(def.dexDamageBonus ?? baseDef?.dexDamageBonus),
    innate: parseInnateWeaponDamage(def.innate ?? baseDef?.innate),
  };
}

/** Flat damage added to weapon hits, split by element. */
const ELEMENT_FLAT_KEYS = Object.freeze({
  fire: ['minimum_fire_damage', 'maximum_fire_damage'],
  cold: ['minimum_cold_damage', 'maximum_cold_damage'],
  lightning: ['minimum_lightning_damage', 'maximum_lightning_damage'],
  magic: ['minimum_magic_damage', 'maximum_magic_damage'],
  poison: ['minimum_poison_damage_second', 'maximum_poison_damage_second'],
});

/**
 * Final weapon damage before the skill's `% Weapon Damage` multiplier.
 *
 * Physical: `(base + flat) * (1 + enhanced%) * (1 + strength/dexterity%)`.
 * Elemental flats are added by gear separately and are not scaled by enhanced damage
 * or attributes; the skill's weapon multiplier still applies to them.
 *
 * @param {{ min: number, max: number, twoHanded?: boolean, strDamageBonus?: number, dexDamageBonus?: number, innate?: Array<{ type: string, attribute: string, percent: number }> }|null|undefined} weapon
 * @param {Record<string, number>|null|undefined} stats
 * @returns {{
 *   baseMin: number, baseMax: number,
 *   flatMin: number, flatMax: number,
 *   rawMin: number, rawMax: number,
 *   enhancedPct: number, attrPct: number, factor: number,
 *   physical: { min: number, max: number },
 *   elements: Record<string, { min: number, max: number }>,
 * }|null}
 */
export function computeWeaponDamage(weapon, stats = {}) {
  if (!weapon) return null;
  const source = stats || {};
  const flatMinKey = weapon.twoHanded ? 'minimum_2_handed_damage' : 'minimum_1_handed_damage';
  const flatMaxKey = weapon.twoHanded ? 'maximum_2_handed_damage' : 'maximum_1_handed_damage';
  const genericFlat = number(source.damage);
  const flatMin =
    number(source[flatMinKey]) + number(source.minimum_damage) + genericFlat;
  const flatMax =
    number(source[flatMaxKey]) + number(source.maximum_damage) + genericFlat;
  const baseMin = Math.min(weapon.min, weapon.max);
  const baseMax = Math.max(weapon.min, weapon.max);
  const rawMin = baseMin + flatMin;
  const rawMax = baseMax + flatMax;
  // A weapon with no damage and no added physical damage deals 0-0.
  const physMin = Math.min(rawMin, rawMax);
  const physMax = Math.max(rawMin, rawMax);
  const enhancedPct = number(source.enhanced_damage) + number(source.enhanced_weapon_damage);
  const attrPct =
    number(source.strength) * number(weapon.strDamageBonus) +
    number(source.dexterity) * number(weapon.dexDamageBonus);
  const factor = Math.max(0, 1 + enhancedPct / 100) * Math.max(0, 1 + attrPct / 100);

  /** @type {Record<string, { min: number, max: number }>} */
  const elements = {};
  for (const [type, keys] of Object.entries(ELEMENT_FLAT_KEYS)) {
    // "Bonus <element> Damage to Weapons" (skills/auras) is a flat single value added
    // to both ends of the hit.
    const bonus = number(source[`bonus_${type}_damage_to_weapons`]);
    const min = number(source[keys[0]]) + bonus;
    const max = number(source[keys[1]]) + bonus;
    if (min <= 0 && max <= 0) continue;
    elements[type] = { min: Math.min(min, max), max: Math.max(min, max) };
  }

  // Innate weapon elemental damage, e.g. "62.0% of Dexterity" as lightning. Each weapon
  // has its own base conversion, which "#% Innate Damage" / "Innate Elemental damage"
  // increases; the game resolves it from the character's total attribute.
  const innateBonusPct =
    number(source.innate_damage) + number(source.innate_elemental_damage);
  for (const innate of Array.isArray(weapon.innate) ? weapon.innate : []) {
    const attributeValue = number(source[innate.attribute]);
    const percent = Number(innate.percent || 0) * (1 + innateBonusPct / 100);
    const amount = Math.round(attributeValue * percent);
    if (amount <= 0) continue;
    const current = elements[innate.type] || { min: 0, max: 0 };
    elements[innate.type] = { min: current.min + amount, max: current.max + amount };
  }

  return {
    baseMin,
    baseMax,
    flatMin,
    flatMax,
    rawMin: physMin,
    rawMax: physMax,
    enhancedPct,
    attrPct,
    factor,
    physical: {
      min: physMin * factor,
      max: physMax * factor,
    },
    elements,
  };
}

/**
 * Equipped weapon or the bare-handed profile when nothing is equipped.
 * @param {object|null|undefined} itemsStore
 * @returns {object}
 */
export function getWeaponProfileForDamage(itemsStore) {
  const profile = getEquippedWeaponProfile(itemsStore);
  if (profile) return profile;
  // A weapon is equipped but its damage range could not be resolved (custom/unknown
  // base): keep the percentage caption instead of pretending the build is unarmed.
  const hasWeapon = listActiveEquippedInstances(itemsStore).some((row) =>
    isHandWeapon(row.def)
  );
  return hasWeapon ? null : UNARMED_WEAPON_PROFILE;
}

/**
 * Physical weapon damage range (compatibility wrapper).
 * @param {object|null|undefined} weapon
 * @param {Record<string, number>|null|undefined} stats
 * @returns {{ min: number, max: number }|null}
 */
export function computeWeaponDamageRange(weapon, stats = {}) {
  const hit = computeWeaponDamage(weapon, stats);
  return hit ? hit.physical : null;
}
