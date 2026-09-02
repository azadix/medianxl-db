/**
 * D2-style calc1..calc6 buckets for the `calc` shorthand.
 * Kept dependency-free so Skill.js can import without pulling planner-core.
 */

export const D2_CALC_BUCKETS = [
  { slot: 1, minLvl: 0, maxLvl: 1 },
  { slot: 2, minLvl: 2, maxLvl: 8 },
  { slot: 3, minLvl: 9, maxLvl: 16 },
  { slot: 4, minLvl: 17, maxLvl: 22 },
  { slot: 5, minLvl: 23, maxLvl: 28 },
  { slot: 6, minLvl: 29, maxLvl: null },
];

/**
 * @param {number} lvl - Effective skill level (blvl + slvl)
 * @returns {number} Bucket index 1..6 for the `calc` alias
 */
export function getCalcBucketIndex(lvl) {
  const n = Math.trunc(Number(lvl));
  const x = Number.isFinite(n) ? n : 0;
  if (x <= 1) return 1;
  if (x <= 8) return 2;
  if (x <= 16) return 3;
  if (x <= 22) return 4;
  if (x <= 28) return 5;
  return 6;
}
