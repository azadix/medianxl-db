/**
 * @file Neutral snapshot holder used by Character to read bucket values without
 * importing the engine (avoids Character <-> engine cycles).
 * @module character/stats-snapshot
 */

/** @type {(() => object|null)|null} */
let provider = null;
/** @type {(() => void)|null} */
let invalidator = null;

/**
 * @param {(() => object|null)|null} fn
 * @param {(() => void)|null} [onInvalidate]
 */
export function setCharacterSnapshotProvider(fn, onInvalidate = null) {
  provider = typeof fn === 'function' ? fn : null;
  invalidator = typeof onInvalidate === 'function' ? onInvalidate : null;
}

/**
 * @returns {object|null}
 */
export function getCharacterSnapshot() {
  if (!provider) return null;
  try {
    return provider();
  } catch {
    return null;
  }
}

/** Ask the provider to rebuild on the next read. */
export function invalidateCharacterSnapshot() {
  if (invalidator) invalidator();
}
