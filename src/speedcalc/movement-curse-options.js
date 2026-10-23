/**
 * Monster curse / slow skills that reduce player movement.
 * Amounts from Median XL 2.14.6 skills.txt (sigmaRE).
 * Plain 128-255 aurastat constants are signed bytes (226 = -30).
 * is67 (velocitypercent) is linear after item speed; is96 stacks with boots on the 150 curve.
 */

/** @typedef {{ key: string, name: string, skillFrw: number, itemFrw: number, note?: string }} MoveCurseOption */

export const NONE_MOVE_CURSE_OPTION = Object.freeze({
  key: 'none',
  name: 'None',
  skillFrw: 0,
  itemFrw: 0,
});

/** @type {MoveCurseOption[]} */
export const MOVE_CURSE_OPTIONS = Object.freeze([
  { key: 'unseelie', name: 'Unseelie Curse', skillFrw: 0, itemFrw: -100 },
  { key: 'dream_eater', name: 'Dream Eater', skillFrw: 0, itemFrw: -60 },
  { key: 'timefield', name: 'Timefield', skillFrw: 0, itemFrw: -100, note: 'up to' },
  { key: 'chronofield', name: 'Chronofield', skillFrw: 0, itemFrw: -60, note: 'up to' },
  { key: 'miasma', name: 'Miasma', skillFrw: 0, itemFrw: -33 },
  { key: 'mind_flay', name: 'Mind Flay', skillFrw: 0, itemFrw: -30 },
  { key: 'decrepify', name: 'Decrepify', skillFrw: -30, itemFrw: 0 },
  { key: 'spellbind', name: 'Spellbind', skillFrw: -50, itemFrw: 0 },
  { key: 'soul_of_greed', name: 'Soul of Greed', skillFrw: -50, itemFrw: 0 },
  { key: 'lucion', name: 'Lucion', skillFrw: -25, itemFrw: 0 },
  { key: 'venomous_spirit', name: 'Venomous Spirit', skillFrw: -10, itemFrw: 0 },
  { key: 'phoboss', name: 'Phoboss', skillFrw: -20, itemFrw: 0 },
  { key: 'navigator', name: 'Navigator', skillFrw: -40, itemFrw: 0 },
]);

export const LAB_LEVEL_MIN = 1;
export const LAB_LEVEL_MAX = 10;
const NAVIGATOR_SKILL_BASE = 5;
const NAVIGATOR_SLOW_BASE = 28;
const NAVIGATOR_SLOW_PER_SKILL = 2;

/**
 * @param {number} level
 * @returns {number}
 */
export function clampLabLevel(level) {
  const n = Math.trunc(Number(level) || LAB_LEVEL_MIN);
  return Math.min(LAB_LEVEL_MAX, Math.max(LAB_LEVEL_MIN, n));
}

/**
 * Navigator aura skill level for a Lab floor (floor 1 = skill 6, floor 10 = skill 15).
 * @param {number} labLevel
 * @returns {number}
 */
export function navigatorSkillLevel(labLevel) {
  return NAVIGATOR_SKILL_BASE + clampLabLevel(labLevel);
}

/**
 * After-calc velocitypercent from sk2486: -1 * (28 + skillLevel * 2).
 * @param {number} labLevel
 * @returns {number}
 */
export function navigatorSkillFrw(labLevel) {
  return -1 * (NAVIGATOR_SLOW_BASE + navigatorSkillLevel(labLevel) * NAVIGATOR_SLOW_PER_SKILL);
}

/**
 * @type {{ id: string, title: string, hint: string, options: MoveCurseOption[] }[]}
 */
export const MOVE_CURSE_GROUPS = Object.freeze([
  {
    id: 'item',
    title: 'Item speed reductions',
    hint: 'Flat reductions to movement speed, applied before the curve.',
    options: MOVE_CURSE_OPTIONS.filter((row) => row.itemFrw < 0),
  },
  {
    id: 'after',
    title: 'After-calculation reductions',
    hint: 'Reductions applied at full value after item speed is calculated.',
    options: MOVE_CURSE_OPTIONS.filter((row) => row.skillFrw < 0),
  },
]);

/**
 * @param {MoveCurseOption} opt
 * @param {number} [labLevel]
 */
export function curseStatAmount(opt, labLevel) {
  const skill = opt.key === 'navigator' ? navigatorSkillFrw(labLevel) : opt.skillFrw || 0;
  return skill + (opt.itemFrw || 0);
}

/**
 * @param {MoveCurseOption} opt
 * @param {number} [labLevel]
 */
export function formatMoveCurseOption(opt, labLevel) {
  const amt = curseStatAmount(opt, labLevel);
  if (!amt) return opt.name;
  const prefix = opt.note ? `${opt.note} ` : '';
  return `${opt.name} (${prefix}${amt}%)`;
}

/**
 * @param {Iterable<string>|null|undefined} keys
 * @returns {MoveCurseOption[]}
 */
export function selectedMoveCurses(keys) {
  const set = new Set(keys || []);
  return MOVE_CURSE_OPTIONS.filter((row) => set.has(row.key));
}

/**
 * @param {Iterable<string>|null|undefined} keys
 * @param {number} [labLevel]
 * @returns {{ skillFrw: number, itemFrw: number }}
 */
export function sumSelectedMoveCurses(keys, labLevel) {
  let skillFrw = 0;
  let itemFrw = 0;
  for (const row of selectedMoveCurses(keys)) {
    skillFrw += row.key === 'navigator' ? navigatorSkillFrw(labLevel) : row.skillFrw;
    itemFrw += row.itemFrw;
  }
  return { skillFrw, itemFrw };
}

/**
 * @param {MoveCurseOption[]} options
 * @param {string} key
 */
export function findMoveCurseOption(options, key) {
  return options.find((row) => row.key === key) || NONE_MOVE_CURSE_OPTION;
}
