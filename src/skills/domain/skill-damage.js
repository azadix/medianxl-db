/**
 * @file Per-hit damage components for a skill at a given level / character state.
 *
 * Values come from the same `Skill.getScalingValues()` path the tooltip uses, so
 * synergies, Spell Damage % and HitShift are already applied. This module only gathers
 * the damage slots and applies the parts the tooltip does not show: enemy resistance
 * (after our pierce) and critical strikes.
 *
 * @module skills/domain/skill-damage
 */

import Skill from './Skill.js';
import { isScalingConstantRowActive } from './show-conditions.js';

/**
 * Stat keys that describe damage dealt. `*_dot` keys are damage over time: they are
 * reported separately so a poison total is never mixed into "damage per hit".
 */
export const DAMAGE_COMPONENTS = Object.freeze({
  physical_damage: { label: 'Physical', type: 'physical', dot: false },
  fire_damage: { label: 'Fire', type: 'fire', dot: false },
  cold_damage: { label: 'Cold', type: 'cold', dot: false },
  lightning_damage: { label: 'Lightning', type: 'lightning', dot: false },
  magic_damage: { label: 'Magic', type: 'magic', dot: false },
  poison_dot: { label: 'Poison', type: 'poison', dot: true },
  fire_dot: { label: 'Fire over time', type: 'fire', dot: true },
});

/** Character stat that reduces incoming damage of each element (pierce is subtracted). */
const ENEMY_RESIST_STAT = Object.freeze({
  physical: 'enemy_physical_resistance',
  fire: 'enemy_fire_resistance',
  cold: 'enemy_cold_resistance',
  lightning: 'enemy_lightning_resistance',
  poison: 'enemy_poison_resistance',
  magic: 'enemy_magic_resistance',
});

/**
 * @param {unknown} raw
 * @returns {number|null}
 */
function toNumber(raw) {
  if (raw == null || raw === '') return null;
  const value = typeof raw === 'object' && raw !== null && 'value' in raw ? raw.value : raw;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/**
 * Collect the damage slots of one skill.
 *
 * @param {{
 *   row: object,
 *   level: number,
 *   characterState: object,
 *   characterLevel?: number|null,
 *   variantKey?: string|null,
 * }} input
 * @returns {{
 *   components: Array<{ key: string, label: string, type: string, dot: boolean, min: number, max: number, durationFrames: number|null }>,
 *   weaponDamagePercent: number,
 *   totalMin: number,
 *   totalMax: number,
 * }}
 */
export function collectSkillDamage(input) {
  const row = input?.row;
  const characterState = input?.characterState;
  if (!row || !row.id || !characterState) {
    return { components: [], weaponDamagePercent: 0, totalMin: 0, totalMax: 0 };
  }
  const level = Math.max(0, Math.floor(Number(input.level) || 0));
  const ulvl = Math.max(1, Math.floor(Number(input.characterLevel) || level || 1));
  const variantKey =
    input.variantKey != null && String(input.variantKey).trim() !== ''
      ? String(input.variantKey).trim()
      : null;
  const skill = new Skill({ id: String(row.id), name: String(row.displayName || row.id) });

  /** @type {Map<string, { min: number, max: number, durationFrames: number|null }>} */
  const byKey = new Map();
  let weaponDamagePercent = 0;

  for (const scRow of Array.isArray(row.scalingConstants) ? row.scalingConstants : []) {
    if (!scRow || typeof scRow !== 'object') continue;
    const statKey = String(scRow.statKey ?? '').trim().toLowerCase();
    if (!statKey) continue;

    const rowVariant =
      scRow.variantKey != null && String(scRow.variantKey).trim() !== ''
        ? String(scRow.variantKey).trim()
        : null;
    if (variantKey == null) {
      if (rowVariant != null) continue;
    } else if (rowVariant !== variantKey) {
      continue;
    }
    if (!isScalingConstantRowActive(row, scRow)) continue;

    const isDamage = Object.prototype.hasOwnProperty.call(DAMAGE_COMPONENTS, statKey);
    if (!isDamage && statKey !== 'weapon_damage') continue;

    let values;
    try {
      values = skill.getScalingValues(
        level,
        statKey,
        Number(scRow.occurrenceIndex) || 0,
        characterState,
        ulvl,
        false,
        0,
        variantKey
      );
    } catch {
      values = null;
    }
    if (!values || typeof values !== 'object') continue;

    if (statKey === 'weapon_damage') {
      const percent = toNumber(values.value0);
      if (percent != null && Math.abs(percent) > Math.abs(weaponDamagePercent)) {
        weaponDamagePercent = percent;
      }
      continue;
    }

    const min = toNumber(values.value0);
    const max = toNumber(values.value1);
    if (min == null && max == null) continue;
    const durationFrames = toNumber(values.value2);
    const entry = byKey.get(statKey) || { min: 0, max: 0, durationFrames: null };
    entry.min += min ?? max ?? 0;
    entry.max += max ?? min ?? 0;
    if (durationFrames != null) {
      entry.durationFrames = Math.max(entry.durationFrames ?? 0, Math.floor(durationFrames));
    }
    byKey.set(statKey, entry);
  }

  const components = [...byKey.entries()].map(([key, entry]) => ({
    key,
    label: DAMAGE_COMPONENTS[key].label,
    type: DAMAGE_COMPONENTS[key].type,
    dot: DAMAGE_COMPONENTS[key].dot,
    min: Math.min(entry.min, entry.max),
    max: Math.max(entry.min, entry.max),
    durationFrames: entry.durationFrames,
  }));

  let totalMin = 0;
  let totalMax = 0;
  for (const component of components) {
    if (component.dot) continue;
    totalMin += component.min;
    totalMax += component.max;
  }

  return { components, weaponDamagePercent, totalMin, totalMax };
}

/**
 * Expected damage multiplier from Critical Strike and Deadly Strike.
 *
 * The two are independent rolls and both double physical damage, so the chance of at
 * least one is `1 - (1 - cs)(1 - ds)`.
 *
 * @param {Record<string, number>|null|undefined} stats
 * @returns {number} multiplier >= 1
 */
export function physicalCritMultiplier(stats) {
  const chanceOf = (raw) => Math.min(1, Math.max(0, (Number(raw) || 0) / 100));
  // Barbarians get Critical Strike through a separate stat; each source is its own roll.
  const rolls = [
    chanceOf(stats?.critical_strike),
    chanceOf(stats?.critical_strike_for_barbarian),
    chanceOf(stats?.deadly_strike),
  ];
  const noCrit = rolls.reduce((acc, chance) => acc * (1 - chance), 1);
  return 1 + (1 - noCrit);
}

/**
 * Effective damage in percent points for an element, after our pierce stats.
 *
 * @param {string} type
 * @param {Record<string, number>|null|undefined} stats
 * @returns {number} 0..100
 */
export function enemyResistPercent(type, stats) {
  const key = ENEMY_RESIST_STAT[type];
  const raw = key ? Number(stats?.[key]) : 0;
  return Number.isFinite(raw) ? raw : 0;
}

/**
 * Apply enemy resistance and (physical only) critical strikes to collected components.
 *
 * @param {ReturnType<typeof collectSkillDamage>['components']} components
 * @param {{
 *   stats?: Record<string, number>|null,
 *   baseEnemyResistPct?: number,
 *   useCharacterPierce?: boolean,
 * }} [options]
 * @returns {Array<{ key: string, label: string, type: string, min: number, max: number, effectiveMin: number, effectiveMax: number, resistPct: number }>}
 */
export function applyDamageMitigation(components, options = {}) {
  const stats = options.stats || {};
  const baseResist = Number(options.baseEnemyResistPct) || 0;
  const usePierce = options.useCharacterPierce !== false;
  const critMultiplier = physicalCritMultiplier(stats);

  return (Array.isArray(components) ? components : []).map((component) => {
    const resistPct = usePierce
      ? baseResist - enemyResistPercent(component.type, stats)
      : baseResist;
    const factor = Math.max(0, 1 - resistPct / 100);
    const crit = component.type === 'physical' ? critMultiplier : 1;
    return {
      key: component.key,
      label: component.label,
      type: component.type,
      dot: component.dot === true,
      durationFrames: component.durationFrames ?? null,
      resistPct,
      min: component.min,
      max: component.max,
      effectiveMin: component.min * factor * crit,
      effectiveMax: component.max * factor * crit,
    };
  });
}
