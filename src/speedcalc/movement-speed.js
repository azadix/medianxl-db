/**
 * Median / D2 movement speed: item FRW curve, linear skill FRW and armor penalties,
 * integer 8.8 velocity, yards/s and frames per yard.
 */

import { getWalkRunBase } from './movement-baselines.js';

export const ITEM_FRW_CURVE = 150;
export const MIN_SPEED_PCT = 25;
export const ITEM_FRW_MAX = 500;
export const GAME_FPS = 25;
export const FRAME_DISTANCE_YARDS = 10;
const VEL_SHIFT = 256;

/**
 * @param {number} itemFrw
 * @returns {number}
 */
export function effectiveItemFrw(itemFrw) {
  const raw = Math.trunc(Number(itemFrw) || 0);
  const denom = ITEM_FRW_CURVE + raw;
  if (denom === 0) return raw < 0 ? -ITEM_FRW_CURVE : ITEM_FRW_CURVE;
  return Math.floor((ITEM_FRW_CURVE * raw) / denom);
}

/**
 * @param {number} walk
 * @param {number} run
 * @returns {number}
 */
export function runBonusPercent(walk, run) {
  const w = Math.max(1, Math.trunc(walk) || 1);
  const r = Math.max(0, Math.trunc(run) || 0);
  return Math.floor((100 * r) / w) - 100;
}

/**
 * @param {{
 *   itemFrw?: number,
 *   skillFrw?: number,
 *   armorPenalty?: number,
 *   shieldPenalty?: number,
 *   sprint?: boolean,
 *   walk?: number,
 *   run?: number,
 * }} opts
 * @returns {number}
 */
export function movementSpeedPercent(opts = {}) {
  const item = effectiveItemFrw(opts.itemFrw);
  const skill = Math.trunc(Number(opts.skillFrw) || 0);
  const armor = Math.trunc(Number(opts.armorPenalty) || 0);
  const shield = Math.trunc(Number(opts.shieldPenalty) || 0);
  const sprintBonus = opts.sprint ? runBonusPercent(opts.walk, opts.run) : 0;
  return Math.max(MIN_SPEED_PCT, 100 + item + skill - armor - shield + sprintBonus);
}

/**
 * @param {number} walk
 * @param {number} speedPct
 * @returns {number}
 */
export function internalVelocity(walk, speedPct) {
  const w = Math.max(0, Math.trunc(walk) || 0);
  const pct = Math.trunc(speedPct) || 0;
  return Math.floor((w * VEL_SHIFT * pct) / 100);
}

/**
 * @param {number} vel
 * @returns {number}
 */
export function yardsPerSecondFromVelocity(vel) {
  if (vel <= 0) return 0;
  return vel / VEL_SHIFT;
}

/**
 * Integer frames to travel `yards` (floored distance, no subframes).
 * @param {number} vel
 * @param {number} [yards]
 * @returns {number}
 */
export function framesForDistance(vel, yards = FRAME_DISTANCE_YARDS) {
  if (vel <= 0) return Infinity;
  const yardsInt = Math.max(1, Math.trunc(Number(yards) || FRAME_DISTANCE_YARDS));
  const numer = yardsInt * GAME_FPS * VEL_SHIFT;
  return Math.floor((numer + vel - 1) / vel);
}

/**
 * @param {{
 *   className: string,
 *   morphId: string,
 *   itemFrw: number,
 *   skillFrw?: number,
 *   armorPenalty?: number,
 *   shieldPenalty?: number,
 *   sprint: boolean,
 * }} input
 */
export function computeMovementMode(input) {
  const { walk, run } = getWalkRunBase(input.className, input.morphId);
  const speedPct = movementSpeedPercent({
    itemFrw: input.itemFrw,
    skillFrw: input.skillFrw,
    armorPenalty: input.armorPenalty,
    shieldPenalty: input.shieldPenalty,
    sprint: input.sprint,
    walk,
    run,
  });
  const vel = internalVelocity(walk, speedPct);
  const yardsPerSec = yardsPerSecondFromVelocity(vel);
  const frames = framesForDistance(vel);
  return {
    walk,
    run,
    speedPct,
    velocity: vel,
    yardsPerSec,
    frames,
  };
}

/**
 * @param {Omit<Parameters<typeof computeMovementMode>[0], 'sprint'>} input
 */
export function computeMovement(input) {
  return {
    walk: computeMovementMode({ ...input, sprint: false }),
    sprint: computeMovementMode({ ...input, sprint: true }),
  };
}

/**
 * Minimum item FRW in [0, ITEM_FRW_MAX] that yields `targetFrames` for 10 yards.
 * @param {number} targetFrames
 * @param {Omit<Parameters<typeof computeMovementMode>[0], 'itemFrw'|'sprint'> & { sprint: boolean }} base
 * @returns {number | null}
 */
export function findRequiredItemFrw(targetFrames, base) {
  let lo = 0;
  let hi = ITEM_FRW_MAX;
  let found = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const { frames } = computeMovementMode({ ...base, itemFrw: mid });
    if (frames <= targetFrames) {
      found = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  if (found == null) return null;
  const atFound = computeMovementMode({ ...base, itemFrw: found }).frames;
  return atFound === targetFrames ? found : null;
}

/**
 * @param {Omit<Parameters<typeof computeMovementMode>[0], 'sprint'> & { sprint: boolean }} input
 * @returns {{ frames: number, value: number }[]}
 */
export function buildBreakpointRows(input) {
  const slow = computeMovementMode({ ...input, itemFrw: 0 }).frames;
  const fast = computeMovementMode({ ...input, itemFrw: ITEM_FRW_MAX }).frames;
  if (!Number.isFinite(slow) || !Number.isFinite(fast)) return [];
  const rows = [];
  const seen = new Set();
  for (let frm = slow; frm >= fast; frm -= 1) {
    const required = findRequiredItemFrw(frm, input);
    if (required == null || seen.has(required)) continue;
    seen.add(required);
    rows.push({ frames: frm, value: required });
  }
  return rows;
}

/**
 * @param {{ frames: number, value: number }[]} rows
 * @param {number} currentItemFrw
 * @param {number} currentFrames
 * @returns {{ frames: number, value: number, extra?: number, current?: boolean }[]}
 */
export function annotateBreakpointRows(rows, currentItemFrw, currentFrames) {
  const item = Math.trunc(Number(currentItemFrw) || 0);
  let currentIdx = -1;
  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i].frames === currentFrames) {
      currentIdx = i;
      break;
    }
  }
  return rows.map((row, i) => {
    const out = { frames: row.frames, value: row.value };
    if (i === currentIdx) out.current = true;
    if (i === currentIdx + 1 && row.value > item) out.extra = row.value - item;
    return out;
  });
}

/**
 * @param {Omit<Parameters<typeof computeMovementMode>[0], 'sprint'>} input
 */
export function computeSpeedCalc(input) {
  const result = computeMovement(input);
  const walkRows = annotateBreakpointRows(
    buildBreakpointRows({ ...input, sprint: false }),
    input.itemFrw,
    result.walk.frames
  );
  const sprintRows = annotateBreakpointRows(
    buildBreakpointRows({ ...input, sprint: true }),
    input.itemFrw,
    result.sprint.frames
  );
  return { ...result, walkRows, sprintRows };
}
