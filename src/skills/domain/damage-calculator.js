/**
 * D2-style level-band damage calculator for min-max tooltip values.
 */

export const LEVEL_BANDS = Object.freeze([
  Object.freeze({ lowerExclusive: 1, upperInclusive: 8, perLevelIndex: 0 }),
  Object.freeze({ lowerExclusive: 8, upperInclusive: 16, perLevelIndex: 1 }),
  Object.freeze({ lowerExclusive: 16, upperInclusive: 22, perLevelIndex: 2 }),
  Object.freeze({ lowerExclusive: 22, upperInclusive: 28, perLevelIndex: 3 }),
  Object.freeze({ lowerExclusive: 28, upperInclusive: null, perLevelIndex: 4 }),
]);

const BAND_DAMAGE_STAT_KEYS = new Set([
  'cold_damage',
  'fire_damage',
  'lightning_damage',
  'magic_damage',
  'physical_damage',
  'poison_dot',
]);

const ELEMENT_FROM_STAT_KEY = Object.freeze({
  cold_damage: 'cold',
  fire_damage: 'fire',
  lightning_damage: 'lightning',
  magic_damage: 'magic',
  physical_damage: 'physical',
  poison_dot: 'poison',
});

const ELEMENT_FROM_TAG = Object.freeze({
  cold: 'cold',
  fire: 'fire',
  lightning: 'lightning',
  magic: 'magic',
  poison: 'poison',
  physical: 'physical',
});

function truncNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function numberOr(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizePerLevel(perLevel) {
  if (!Array.isArray(perLevel)) return [0, 0, 0, 0, 0];
  const out = [0, 0, 0, 0, 0];
  for (let i = 0; i < 5; i++) out[i] = truncNumber(perLevel[i], 0);
  return out;
}

function isLightningMinOneCase({ elementType, baseMin, minPerLevel }) {
  if (elementType !== 'lightning') return false;
  if (truncNumber(baseMin, 0) !== 1) return false;
  return normalizePerLevel(minPerLevel).every((x) => x === 0);
}

/**
 * @param {string} statKey
 * @returns {boolean}
 */
export function isBandDamageStatKey(statKey) {
  return BAND_DAMAGE_STAT_KEYS.has(String(statKey || '').toLowerCase());
}

/**
 * Infer element type from skill tags first, then fallback to stat key.
 *
 * @param {{ tags?: string[] }|null|undefined} skill
 * @param {string} statKey
 * @returns {'cold'|'fire'|'lightning'|'magic'|'poison'|'physical'|null}
 */
export function inferElementTypeFromSkill(skill, statKey) {
  const fromStatKey = ELEMENT_FROM_STAT_KEY[String(statKey || '').toLowerCase()] ?? null;
  const tags = Array.isArray(skill?.tags) ? skill.tags : [];
  const normalizedTagHits = tags
    .map((t) => ELEMENT_FROM_TAG[String(t || '').trim().toLowerCase()] ?? null)
    .filter(Boolean);
  if (normalizedTagHits.length === 0) return fromStatKey;
  if (fromStatKey && normalizedTagHits.includes(fromStatKey)) return fromStatKey;
  return normalizedTagHits[0] ?? fromStatKey;
}

/**
 * @param {number|string} damage
 * @param {number|string|undefined|null} hitShift
 * @returns {number}
 */
export function applyHitShift(damage, hitShift) {
  const dmg = truncNumber(damage, 0);
  const shift = truncNumber(hitShift, 8);
  const shifted = dmg * 2 ** (shift - 8);
  return Math.trunc(shifted);
}

/**
 * @param {{
 *   baseValue: number|string,
 *   perLevel: Array<number|string>,
 *   level: number|string,
 *   hitShift?: number|string,
 *   synergyMultiplier?: number|string
 * }} args
 * @returns {number}
 */
export function calculateBandDamageValue(args) {
  const level = Math.max(1, truncNumber(args?.level, 1));
  const perLevel = normalizePerLevel(args?.perLevel);
  let value = truncNumber(args?.baseValue, 0);
  for (const band of LEVEL_BANDS) {
    if (level <= band.lowerExclusive) continue;
    const maxLvl = band.upperInclusive == null ? level : Math.min(level, band.upperInclusive);
    const levelsInBand = Math.max(0, maxLvl - band.lowerExclusive);
    value += levelsInBand * perLevel[band.perLevelIndex];
  }
  const synergyMultiplier = numberOr(args?.synergyMultiplier, 1);
  value = Math.trunc(value * synergyMultiplier);
  return applyHitShift(value, args?.hitShift);
}

/**
 * @param {{
 *   kind?: 'elemental'|'physical',
 *   statKey?: string,
 *   skill?: { tags?: string[] }|null,
 *   level: number|string,
 *   baseMin: number|string,
 *   baseMax: number|string,
 *   minPerLevel: Array<number|string>,
 *   maxPerLevel: Array<number|string>,
 *   hitShift?: number|string,
 *   synergyMultiplier?: number|string
 * }} args
 * @returns {{ min: number, max: number, kind: 'elemental'|'physical', elementType: string|null }}
 */
export function calculateBandDamageMinMax(args) {
  const kind = args?.kind === 'physical' ? 'physical' : 'elemental';
  const elementType = inferElementTypeFromSkill(args?.skill, args?.statKey || '');
  const baseMin = truncNumber(args?.baseMin, 0);
  const minPerLevel = normalizePerLevel(args?.minPerLevel);
  const min =
    kind === 'elemental' &&
    isLightningMinOneCase({ elementType, baseMin, minPerLevel })
      ? 1
      : calculateBandDamageValue({
          baseValue: args?.baseMin,
          perLevel: args?.minPerLevel,
          level: args?.level,
          hitShift: args?.hitShift,
          synergyMultiplier: args?.synergyMultiplier,
        });
  const max = calculateBandDamageValue({
    baseValue: args?.baseMax,
    perLevel: args?.maxPerLevel,
    level: args?.level,
    hitShift: args?.hitShift,
    synergyMultiplier: args?.synergyMultiplier,
  });
  return { min, max, kind, elementType };
}

export function calculateElementalBandMin(args) {
  return calculateBandDamageMinMax({ ...args, kind: 'elemental' }).min;
}

export function calculateElementalBandMax(args) {
  return calculateBandDamageMinMax({ ...args, kind: 'elemental' }).max;
}

export function calculatePhysicalBandMin(args) {
  return calculateBandDamageMinMax({ ...args, kind: 'physical' }).min;
}

export function calculatePhysicalBandMax(args) {
  return calculateBandDamageMinMax({ ...args, kind: 'physical' }).max;
}
