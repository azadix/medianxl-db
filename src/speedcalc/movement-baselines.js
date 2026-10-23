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
 * @type {{ id: string, label: string, className?: string, walk?: number, run?: number }[]}
 */
export const SPEED_CALC_MORPHS = [
  { id: 'none', label: 'None' },
  { id: 'werewolf', label: 'Werewolf', className: 'Druid', walk: 10, run: 15 },
  { id: 'wereowl', label: 'Wereowl', className: 'Druid', walk: 11, run: 16 },
  { id: 'werebear', label: 'Werebear', className: 'Druid', walk: 10, run: 15 },
  { id: 'treewarden', label: 'Treewarden', className: 'Barbarian', walk: 10, run: 11 },
  { id: 'superbeast', label: 'Superbeast', className: 'Paladin', walk: 10, run: 15 },
  { id: 'deathlord', label: 'Deathlord', className: 'Necromancer' },
];

/**
 * @param {string} className
 * @returns {{ id: string, label: string, className?: string, walk?: number, run?: number }[]}
 */
export function morphsForClass(className) {
  return SPEED_CALC_MORPHS.filter((row) => row.id !== 'none' && row.className === className);
}

/**
 * Class select groups: base class plus that class's morphs.
 * @type {{ className: string, morphs: ReturnType<typeof morphsForClass> }[]}
 */
export const SPEED_CALC_CLASS_GROUPS = SPEED_CALC_CLASSES.map((className) => ({
  className,
  morphs: morphsForClass(className),
}));

/**
 * @param {string} className
 * @param {string} morphId
 */
export function encodeSpeedCalcClassKey(className, morphId) {
  const morph = morphId && morphId !== 'none' ? morphId : 'none';
  return `${className}:${morph}`;
}

/**
 * @param {string} key
 * @returns {{ className: string, morphId: string }}
 */
export function parseSpeedCalcClassKey(key) {
  const raw = String(key || '');
  const idx = raw.indexOf(':');
  const className = idx >= 0 ? raw.slice(0, idx) : raw;
  const morphId = idx >= 0 ? raw.slice(idx + 1) : 'none';
  const cls = CLASS_WALK_RUN[className] ? className : 'Amazon';
  const allowed = morphsForClass(cls);
  const morph = allowed.some((row) => row.id === morphId) ? morphId : 'none';
  return { className: cls, morphId: morph };
}

/**
 * @param {string} className
 * @param {string} morphId
 * @returns {WalkRunBase}
 */
export function getWalkRunBase(className, morphId) {
  const morph = SPEED_CALC_MORPHS.find((row) => row.id === morphId);
  if (morph && morph.className === className && morph.walk != null && morph.run != null) {
    return { walk: morph.walk, run: morph.run };
  }
  const cls = CLASS_WALK_RUN[className];
  return cls ? { walk: cls.walk, run: cls.run } : CLASS_WALK_RUN.Amazon;
}
