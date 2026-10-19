/**
 * Corrupted Wormhole cycle catalog (Median XL 2.14).
 * Values from cubemain recipes cm107–cm138 (wiki life/mana flats are swapped vs game).
 * @see https://docs.median-xl.com/doc/wiki/cycles
 * @module items/wormhole-cycles-data
 */

/** Base Required Level of the Corrupted Wormhole charm. */
export const WORMHOLE_BASE_REQ_LEVEL = 100;

/** Highest character level (mirrors Character.MAX_LEVEL). */
export const WORMHOLE_MAX_CHARACTER_LEVEL = 150;

/**
 * Total Required Level from non-golden cycles cannot push the charm past the max character level,
 * so the bonus cap is max level - base Required Level (150 - 100 = 50).
 */
export const WORMHOLE_CYCLE_REQ_LEVEL_CAP = WORMHOLE_MAX_CHARACTER_LEVEL - WORMHOLE_BASE_REQ_LEVEL;

/**
 * @typedef {{
 *   id: string,
 *   code: string,
 *   size: 'small'|'medium'|'large'|'golden',
 *   type: string,
 *   label: string,
 *   reqLevelBonus: number,
 *   limit: number|null,
 *   affixes: string[],
 * }} WormholeCycleDef
 */

/** @type {ReadonlyArray<WormholeCycleDef>} */
export const WORMHOLE_CYCLES = Object.freeze([
  Object.freeze({
    id: 'cy01',
    code: 'cy01',
    size: 'small',
    type: 'str',
    label: 'Small Cycle',
    reqLevelBonus: 1,
    limit: null,
    affixes: Object.freeze(['+(3 to 5) to Strength']),
  }),
  Object.freeze({
    id: 'cy02',
    code: 'cy02',
    size: 'small',
    type: 'dex',
    label: 'Small Cycle',
    reqLevelBonus: 1,
    limit: null,
    affixes: Object.freeze(['+(3 to 5) to Dexterity']),
  }),
  Object.freeze({
    id: 'cy03',
    code: 'cy03',
    size: 'small',
    type: 'vit',
    label: 'Small Cycle',
    reqLevelBonus: 1,
    limit: null,
    affixes: Object.freeze(['+(3 to 5) to Vitality']),
  }),
  Object.freeze({
    id: 'cy04',
    code: 'cy04',
    size: 'small',
    type: 'ene',
    label: 'Small Cycle',
    reqLevelBonus: 1,
    limit: null,
    affixes: Object.freeze(['+(3 to 5) to Energy']),
  }),
  Object.freeze({
    id: 'cy13',
    code: 'cy13',
    size: 'small',
    type: 'gold',
    label: 'Small Cycle',
    reqLevelBonus: 2,
    limit: null,
    affixes: Object.freeze(['+(1 to 4)% Gold Find']),
  }),
  Object.freeze({
    id: 'cy16',
    code: 'cy16',
    size: 'small',
    type: 'mf',
    label: 'Small Cycle',
    reqLevelBonus: 2,
    limit: null,
    affixes: Object.freeze(['+(1 to 4)% Magic Find']),
  }),
  Object.freeze({
    id: 'cy19',
    code: 'cy19',
    size: 'small',
    type: 'speed',
    label: 'Small Cycle',
    reqLevelBonus: 2,
    limit: null,
    affixes: Object.freeze(['+(1 to 2)% Combat Speeds']),
  }),
  Object.freeze({
    id: 'cy29',
    code: 'cy29',
    size: 'small',
    type: 'lifemana',
    label: 'Small Cycle',
    reqLevelBonus: 1,
    limit: null,
    // cubemain: mana 0–20, life 0–10 (wiki lists these swapped)
    affixes: Object.freeze(['+(0 to 20) to Mana', '+(0 to 10) to Life']),
  }),

  Object.freeze({
    id: 'cy05',
    code: 'cy05',
    size: 'medium',
    type: 'str',
    label: 'Medium Cycle',
    reqLevelBonus: 3,
    limit: null,
    affixes: Object.freeze(['+1% to Strength', '+(2 to 6) to Strength']),
  }),
  Object.freeze({
    id: 'cy06',
    code: 'cy06',
    size: 'medium',
    type: 'dex',
    label: 'Medium Cycle',
    reqLevelBonus: 3,
    limit: null,
    affixes: Object.freeze(['+1% to Dexterity', '+(2 to 6) to Dexterity']),
  }),
  Object.freeze({
    id: 'cy07',
    code: 'cy07',
    size: 'medium',
    type: 'vit',
    label: 'Medium Cycle',
    reqLevelBonus: 3,
    limit: null,
    affixes: Object.freeze(['+1% to Vitality', '+(2 to 6) to Vitality']),
  }),
  Object.freeze({
    id: 'cy08',
    code: 'cy08',
    size: 'medium',
    type: 'ene',
    label: 'Medium Cycle',
    reqLevelBonus: 3,
    limit: null,
    affixes: Object.freeze(['+1% to Energy', '+(2 to 6) to Energy']),
  }),
  Object.freeze({
    id: 'cy14',
    code: 'cy14',
    size: 'medium',
    type: 'gold',
    label: 'Medium Cycle',
    reqLevelBonus: 3,
    limit: null,
    affixes: Object.freeze(['+(3 to 7)% Gold Find']),
  }),
  Object.freeze({
    id: 'cy17',
    code: 'cy17',
    size: 'medium',
    type: 'mf',
    label: 'Medium Cycle',
    reqLevelBonus: 3,
    limit: null,
    affixes: Object.freeze(['+(3 to 7)% Magic Find']),
  }),
  Object.freeze({
    id: 'cy20',
    code: 'cy20',
    size: 'medium',
    type: 'speed',
    label: 'Medium Cycle',
    reqLevelBonus: 3,
    limit: null,
    affixes: Object.freeze(['+(3 to 4)% Combat Speeds']),
  }),
  Object.freeze({
    id: 'cy30',
    code: 'cy30',
    size: 'medium',
    type: 'lifemana',
    label: 'Medium Cycle',
    reqLevelBonus: 3,
    limit: null,
    // cubemain: mana 15–30, life 2–15, max mana 0–2%
    affixes: Object.freeze([
      '+(15 to 30) to Mana',
      '+(2 to 15) to Life',
      'Maximum Mana +(0 to 2)%',
    ]),
  }),

  Object.freeze({
    id: 'cy09',
    code: 'cy09',
    size: 'large',
    type: 'str',
    label: 'Large Cycle',
    reqLevelBonus: 5,
    limit: null,
    affixes: Object.freeze(['+2% to Strength', '+(8 to 12) to Strength']),
  }),
  Object.freeze({
    id: 'cy10',
    code: 'cy10',
    size: 'large',
    type: 'dex',
    label: 'Large Cycle',
    reqLevelBonus: 5,
    limit: null,
    affixes: Object.freeze(['+2% to Dexterity', '+(8 to 12) to Dexterity']),
  }),
  Object.freeze({
    id: 'cy11',
    code: 'cy11',
    size: 'large',
    type: 'vit',
    label: 'Large Cycle',
    reqLevelBonus: 5,
    limit: null,
    affixes: Object.freeze(['+2% to Vitality', '+(8 to 12) to Vitality']),
  }),
  Object.freeze({
    id: 'cy12',
    code: 'cy12',
    size: 'large',
    type: 'ene',
    label: 'Large Cycle',
    reqLevelBonus: 5,
    limit: null,
    affixes: Object.freeze(['+2% to Energy', '+(8 to 12) to Energy']),
  }),
  Object.freeze({
    id: 'cy15',
    code: 'cy15',
    size: 'large',
    type: 'gold',
    label: 'Large Cycle',
    reqLevelBonus: 4,
    limit: null,
    affixes: Object.freeze(['+(6 to 10)% Gold Find']),
  }),
  Object.freeze({
    id: 'cy18',
    code: 'cy18',
    size: 'large',
    type: 'mf',
    label: 'Large Cycle',
    reqLevelBonus: 4,
    limit: null,
    affixes: Object.freeze(['+(6 to 10)% Magic Find']),
  }),
  Object.freeze({
    id: 'cy21',
    code: 'cy21',
    size: 'large',
    type: 'speed',
    label: 'Large Cycle',
    reqLevelBonus: 4,
    limit: null,
    affixes: Object.freeze(['+(5 to 6)% Combat Speeds']),
  }),
  Object.freeze({
    id: 'cy22',
    code: 'cy22',
    size: 'large',
    type: 'ama',
    label: 'Large Cycle',
    reqLevelBonus: 15,
    limit: null,
    affixes: Object.freeze(['+1 to Amazon Skill Levels']),
  }),
  Object.freeze({
    id: 'cy23',
    code: 'cy23',
    size: 'large',
    type: 'ass',
    label: 'Large Cycle',
    reqLevelBonus: 15,
    limit: null,
    affixes: Object.freeze(['+1 to Assassin Skill Levels']),
  }),
  Object.freeze({
    id: 'cy24',
    code: 'cy24',
    size: 'large',
    type: 'bar',
    label: 'Large Cycle',
    reqLevelBonus: 15,
    limit: null,
    affixes: Object.freeze(['+1 to Barbarian Skill Levels']),
  }),
  Object.freeze({
    id: 'cy25',
    code: 'cy25',
    size: 'large',
    type: 'dru',
    label: 'Large Cycle',
    reqLevelBonus: 15,
    limit: null,
    affixes: Object.freeze(['+1 to Druid Skill Levels']),
  }),
  Object.freeze({
    id: 'cy26',
    code: 'cy26',
    size: 'large',
    type: 'nec',
    label: 'Large Cycle',
    reqLevelBonus: 15,
    limit: null,
    affixes: Object.freeze(['+1 to Necromancer Skill Levels']),
  }),
  Object.freeze({
    id: 'cy27',
    code: 'cy27',
    size: 'large',
    type: 'sor',
    label: 'Large Cycle',
    reqLevelBonus: 15,
    limit: null,
    affixes: Object.freeze(['+1 to Sorceress Skill Levels']),
  }),
  Object.freeze({
    id: 'cy28',
    code: 'cy28',
    size: 'large',
    type: 'pal',
    label: 'Large Cycle',
    reqLevelBonus: 15,
    limit: null,
    affixes: Object.freeze(['+1 to Paladin Skill Levels']),
  }),
  Object.freeze({
    id: 'cy31',
    code: 'cy31',
    size: 'large',
    type: 'lifemana',
    label: 'Large Cycle',
    reqLevelBonus: 5,
    limit: null,
    // cubemain: mana 25–50, max life 0–1%, life 5–25, max mana 1–3%
    affixes: Object.freeze([
      '+(25 to 50) to Mana',
      'Maximum Life +(0 to 1)%',
      '+(5 to 25) to Life',
      'Maximum Mana +(1 to 3)%',
    ]),
  }),

  Object.freeze({
    id: 'golden',
    code: '\\6',
    size: 'golden',
    type: 'golden',
    label: 'Golden Cycle',
    reqLevelBonus: 0,
    limit: 1,
    affixes: Object.freeze([
      '+1 to All Skills',
      '+10 to All Attributes',
      'Maximum Life +2%',
      'Maximum Mana +5%',
    ]),
  }),
]);

/** @type {ReadonlyArray<'small'|'medium'|'large'|'golden'>} */
export const WORMHOLE_CYCLE_SIZE_ORDER = Object.freeze(['small', 'medium', 'large', 'golden']);

/** @type {Readonly<Record<string, string>>} */
export const WORMHOLE_CYCLE_SIZE_LABELS = Object.freeze({
  small: 'Small Cycle',
  medium: 'Medium Cycle',
  large: 'Large Cycle',
  golden: 'Golden Cycle',
});

/**
 * Cycle types (matrix rows): same stat family across Small / Medium / Large.
 * @type {ReadonlyArray<{ id: string, label: string, mods: string }>}
 */
export const WORMHOLE_CYCLE_TYPES = Object.freeze([
  Object.freeze({ id: 'str', label: 'Strength', mods: 'Strength, % Strength' }),
  Object.freeze({ id: 'dex', label: 'Dexterity', mods: 'Dexterity, % Dexterity' }),
  Object.freeze({ id: 'vit', label: 'Vitality', mods: 'Vitality, % Vitality' }),
  Object.freeze({ id: 'ene', label: 'Energy', mods: 'Energy, % Energy' }),
  Object.freeze({ id: 'gold', label: 'Gold Find', mods: '% Gold Find' }),
  Object.freeze({ id: 'mf', label: 'Magic Find', mods: '% Magic Find' }),
  Object.freeze({ id: 'speed', label: 'Combat Speeds', mods: '% Combat Speeds' }),
  Object.freeze({ id: 'lifemana', label: 'Life & Mana', mods: 'Life, Mana, % Maximum Life / Mana' }),
  Object.freeze({ id: 'ama', label: 'Amazon', mods: '+1 to Amazon Skill Levels' }),
  Object.freeze({ id: 'ass', label: 'Assassin', mods: '+1 to Assassin Skill Levels' }),
  Object.freeze({ id: 'bar', label: 'Barbarian', mods: '+1 to Barbarian Skill Levels' }),
  Object.freeze({ id: 'dru', label: 'Druid', mods: '+1 to Druid Skill Levels' }),
  Object.freeze({ id: 'nec', label: 'Necromancer', mods: '+1 to Necromancer Skill Levels' }),
  Object.freeze({ id: 'sor', label: 'Sorceress', mods: '+1 to Sorceress Skill Levels' }),
  Object.freeze({ id: 'pal', label: 'Paladin', mods: '+1 to Paladin Skill Levels' }),
  Object.freeze({ id: 'golden', label: 'Golden', mods: 'All Skills, All Attributes, % Max Life / Mana' }),
]);

/** Matrix columns (golden has no size variants and spans the row). */
/** @type {ReadonlyArray<'small'|'medium'|'large'>} */
export const WORMHOLE_CYCLE_MATRIX_SIZES = Object.freeze(['small', 'medium', 'large']);
