/**
 * Walk/run bases from Median XL 2.14.6 tables (sigmaRE 2_txt).
 * Unmorphed: charstats.txt WalkVelocity / RunVelocity.
 * Transform morphs: states.txt gfxclass -> monstats.txt Velocity / Run.
 */

/** @typedef {{ walk: number, run: number }} WalkRunBase */

/** @type {Record<string, WalkRunBase>} */
export const CLASS_WALK_RUN = {
  Amazon: { walk: 10, run: 15 },
  Assassin: { walk: 10, run: 15 },
  Barbarian: { walk: 10, run: 14 },
  Druid: { walk: 10, run: 15 },
  Necromancer: { walk: 10, run: 15 },
  Paladin: { walk: 10, run: 15 },
  Sorceress: { walk: 11, run: 15 },
};

export const SPEED_CALC_CLASSES = Object.keys(CLASS_WALK_RUN);

/**
 * Morph ids. Deathlord has no transform/gfxclass (overlay only), so it keeps class walk/run.
 * @type {{ id: string, label: string, walk?: number, run?: number }[]}
 */
export const SPEED_CALC_MORPHS = [
  { id: 'none', label: 'None' },
  { id: 'werewolf', label: 'Werewolf', walk: 10, run: 15 },
  { id: 'wereowl', label: 'Wereowl', walk: 11, run: 16 },
  { id: 'werebear', label: 'Werebear', walk: 10, run: 15 },
  { id: 'superbeast', label: 'Superbeast', walk: 10, run: 15 },
  { id: 'deathlord', label: 'Deathlord' },
];

/**
 * @param {string} className
 * @param {string} morphId
 * @returns {WalkRunBase}
 */
export function getWalkRunBase(className, morphId) {
  const morph = SPEED_CALC_MORPHS.find((row) => row.id === morphId);
  if (morph && morph.walk != null && morph.run != null) {
    return { walk: morph.walk, run: morph.run };
  }
  const cls = CLASS_WALK_RUN[className];
  return cls ? { walk: cls.walk, run: cls.run } : CLASS_WALK_RUN.Amazon;
}
