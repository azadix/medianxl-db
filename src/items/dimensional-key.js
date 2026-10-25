/**
 * Dimensional Key Trial of Purity / Discovery / Invasion / Nephalem progression.
 * @module items/dimensional-key
 */

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
function looksLikeDimensionalKey(def) {
  if (!def || typeof def !== 'object') return false;
  const id = String(def.id || '');
  if (id === 'ebw' || id.startsWith('ebw-')) return true;
  return /^Dimensional Key\b/i.test(String(def.name || ''));
}

/** @type {Readonly<Record<string, string>>} */
export const DIM_KEY_CATALOG_ID = 'ebw';

/** @type {Readonly<Record<string, string>>} */
export const DIM_KEY_ROLL_KEYS = Object.freeze({
  variant: 'charmDimKeyVariant',
  starPrefix: 'charmDimKeyStar',
  dreamPrefix: 'charmDimKeyDream',
  labs: 'charmDimKeyLabs',
  invasion: 'charmDimKeyInvasion',
  nephalem: 'charmDimKeyNephalem',
});

/** @type {ReadonlyArray<'arcana'|'mandate'|'onslaught'|'primordia'>} */
export const DIM_KEY_VARIANT_IDS = Object.freeze(['arcana', 'mandate', 'onslaught', 'primordia']);

/** @type {Readonly<Record<string, string>>} */
export const DIM_KEY_VARIANT_LABELS = Object.freeze({
  arcana: 'Arcana',
  mandate: 'Mandate',
  onslaught: 'Onslaught',
  primordia: 'Primordia',
});

/** Old split-catalog ids → variant. */
export const DIM_KEY_LEGACY_DEF_IDS = Object.freeze({
  ebw: 'arcana',
  'ebw-mandate': 'mandate',
  'ebw-onslaught': 'onslaught',
  'ebw-primordia': 'primordia',
});

export const DIM_KEY_STAR_COUNT = 4;
export const DIM_KEY_DREAM_COUNT = 5;
export const DIM_KEY_LAB_MAX = 10;
export const DIM_KEY_PURITY_POINTS_MAX = 75;

/** Shared Trial of Purity weights (Onslaught scale). */
export const DIM_KEY_STAR_POINTS = Object.freeze([6, 9, 9, 12]);
export const DIM_KEY_DREAM_POINTS = Object.freeze([6, 6, 6, 9, 12]);

/** Cumulative Magic Find at highest completed riftstone / lab. Index 0 = none. */
export const DIM_KEY_LAB_MAGIC_FIND = Object.freeze([
  0, 3, 7, 12, 18, 25, 33, 42, 52, 63, 75,
]);

/**
 * @typedef {{
 *   id: string,
 *   purityMax: number,
 *   purityFormat: (n: number) => string,
 *   purityRe: RegExp,
 *   invasion: string[],
 *   invasionDetect: RegExp[],
 * }} DimKeyVariant
 */

/** @type {Readonly<Record<string, DimKeyVariant>>} */
export const DIM_KEY_VARIANTS = Object.freeze({
  arcana: {
    id: 'arcana',
    purityMax: 35,
    purityFormat: (n) => `+${n}% to Spell Damage`,
    purityRe: /\+?(\d+)%\s+to\s+Spell Damage/i,
    invasion: Object.freeze(['+5% Bonus to Spell Focus']),
    invasionDetect: Object.freeze([/\+5%\s+Bonus to Spell Focus/i]),
  },
  mandate: {
    id: 'mandate',
    purityMax: 100,
    purityFormat: (n) => `+${n}% to Summon Damage`,
    purityRe: /\+?(\d+)%\s+to\s+Summon(?:ed Minion)? Damage/i,
    invasion: Object.freeze(['Maximum Life and Mana +5%']),
    invasionDetect: Object.freeze([/Maximum Life and Mana \+?5%/i]),
  },
  onslaught: {
    id: 'onslaught',
    purityMax: 75,
    purityFormat: (n) => `Weapon Physical Damage +${n}%`,
    purityRe: /(?:Weapon Physical Damage \+?(\d+)%|\+?(\d+)%\s+Weapon Physical Damage)/i,
    invasion: Object.freeze(['5% Deadly Strike']),
    invasionDetect: Object.freeze([/5%\s+Deadly Strike/i]),
  },
  primordia: {
    id: 'primordia',
    purityMax: 16,
    purityFormat: (n) => `+${n}% Innate Elemental Damage`,
    purityRe: /\+?(\d+)%\s+Innate Elemental Damage/i,
    invasion: Object.freeze([
      'Adds 100-200 Fire Damage',
      'Adds 100-200 Lightning Damage',
      'Adds 100-200 Cold Damage',
    ]),
    invasionDetect: Object.freeze([/Adds 100-200 Fire Damage/i]),
  },
});

const PROGRESS_LINE_RE =
  /^(Dream Fragment|Star Chart)\s*\(\d+\)\s*$|^(Trial of|Explore every|Transmute\b|Defeat\b|Complete all|End the Invasion|Occult Smithing|Dimensional Alchemy|Void Armor|Keep in Inventory|Dimensional Key\s*$|Unlocks (?:Void Armor|Occult Smithing|Dimensional Alchemy)|\(must be done|\(these items are rare)/i;

/**
 * @param {string} prefix
 * @param {number} n
 * @returns {string}
 */
export function dimKeyPieceRollKey(prefix, n) {
  return `${prefix}${n}`;
}

/**
 * @param {string|null|undefined} id
 * @returns {number}
 */
export function dimensionalKeyVariantIndex(id) {
  const idx = DIM_KEY_VARIANT_IDS.indexOf(/** @type {'arcana'} */ (String(id || '').toLowerCase()));
  return idx >= 0 ? idx : 0;
}

/**
 * @param {Record<string, number>|null|undefined} rolls
 * @returns {'arcana'|'mandate'|'onslaught'|'primordia'}
 */
export function getDimensionalKeyVariantId(rolls) {
  const idx = Math.floor(Number(rolls?.[DIM_KEY_ROLL_KEYS.variant]) || 0);
  return DIM_KEY_VARIANT_IDS[Math.min(DIM_KEY_VARIANT_IDS.length - 1, Math.max(0, idx))] || 'arcana';
}

/**
 * @param {object|null|undefined} def
 * @param {Record<string, number>|null|undefined} [rolls]
 * @returns {DimKeyVariant|null}
 */
export function getDimensionalKeyVariant(def, rolls = null) {
  if (def && !looksLikeDimensionalKey(def)) return null;
  return DIM_KEY_VARIANTS[getDimensionalKeyVariantId(rolls)];
}

/**
 * @param {string[]|null|undefined} texts
 * @returns {'arcana'|'mandate'|'onslaught'|'primordia'}
 */
export function detectDimensionalKeyVariantId(texts) {
  const list = Array.isArray(texts) ? texts.map((t) => String(t || '')) : [];
  const blob = list.join('\n');
  for (const id of DIM_KEY_VARIANT_IDS) {
    if (new RegExp(`\\b${id}\\b`, 'i').test(blob)) return id;
  }
  for (const id of DIM_KEY_VARIANT_IDS) {
    const variant = DIM_KEY_VARIANTS[id];
    if (list.some((line) => variant.purityRe.test(line))) return id;
    if (variant.invasionDetect.some((re) => list.some((line) => re.test(line)))) return id;
  }
  return 'arcana';
}

/**
 * Map a saved charm row (including split-catalog ids) onto the single Dimensional Key.
 * @param {string} defId
 * @param {Record<string, number>|null|undefined} rolls
 * @returns {{ defId: string, rolls: Record<string, number>|null }}
 */
export function normalizeDimensionalKeySnapshot(defId, rolls = null) {
  const id = String(defId || '');
  const legacy = DIM_KEY_LEGACY_DEF_IDS[id];
  if (!legacy && id !== DIM_KEY_CATALOG_ID) return { defId: id, rolls: rolls ?? null };
  /** @type {Record<string, number>} */
  const next = { ...(rolls && typeof rolls === 'object' ? rolls : {}) };
  if (legacy && next[DIM_KEY_ROLL_KEYS.variant] == null) {
    next[DIM_KEY_ROLL_KEYS.variant] = dimensionalKeyVariantIndex(legacy);
  }
  return { defId: DIM_KEY_CATALOG_ID, rolls: Object.keys(next).length ? next : null };
}

/**
 * @param {Record<string, number>|null|undefined} rolls
 * @returns {string}
 */
export function dimensionalKeyTswDisplayName(rolls) {
  const label = DIM_KEY_VARIANT_LABELS[getDimensionalKeyVariantId(rolls)] || 'Arcana';
  return Number(rolls?.[DIM_KEY_ROLL_KEYS.nephalem]) ? `Nephalem ${label}` : label;
}

/**
 * @param {Record<string, number>|null|undefined} rolls
 * @param {string} prefix
 * @param {number} count
 * @returns {number[]}
 */
function enabledPieces(rolls, prefix, count) {
  /** @type {number[]} */
  const out = [];
  for (let n = 1; n <= count; n++) {
    if (Number(rolls?.[dimKeyPieceRollKey(prefix, n)])) out.push(n);
  }
  return out;
}

/**
 * @param {Record<string, number>|null|undefined} rolls
 * @returns {number[]}
 */
export function getDimensionalKeyStars(rolls) {
  return enabledPieces(rolls, DIM_KEY_ROLL_KEYS.starPrefix, DIM_KEY_STAR_COUNT);
}

/**
 * @param {Record<string, number>|null|undefined} rolls
 * @returns {number[]}
 */
export function getDimensionalKeyDreams(rolls) {
  return enabledPieces(rolls, DIM_KEY_ROLL_KEYS.dreamPrefix, DIM_KEY_DREAM_COUNT);
}

/**
 * @param {Record<string, number>|null|undefined} rolls
 * @returns {number}
 */
export function getDimensionalKeyLabs(rolls) {
  const n = Math.floor(Number(rolls?.[DIM_KEY_ROLL_KEYS.labs]) || 0);
  return Math.min(DIM_KEY_LAB_MAX, Math.max(0, n));
}

/**
 * @param {number[]} stars
 * @param {number[]} dreams
 * @returns {number}
 */
export function dimensionalKeyPurityPoints(stars, dreams) {
  let pts = 0;
  for (const n of stars) pts += DIM_KEY_STAR_POINTS[n - 1] || 0;
  for (const n of dreams) pts += DIM_KEY_DREAM_POINTS[n - 1] || 0;
  return pts;
}

/**
 * @param {number} points
 * @param {number} max
 * @returns {number}
 */
export function scaleDimensionalKeyPurity(points, max) {
  const p = Math.max(0, Number(points) || 0);
  const m = Number(max) || 0;
  if (p <= 0 || m <= 0) return 0;
  if (p >= DIM_KEY_PURITY_POINTS_MAX) return m;
  return Math.floor((p / DIM_KEY_PURITY_POINTS_MAX) * m);
}

/**
 * @param {Record<string, number>|null|undefined} rolls
 * @returns {boolean}
 */
export function dimensionalKeyTrialsReadyForNephalem(rolls) {
  return (
    getDimensionalKeyStars(rolls).length === DIM_KEY_STAR_COUNT &&
    getDimensionalKeyDreams(rolls).length === DIM_KEY_DREAM_COUNT &&
    getDimensionalKeyLabs(rolls) >= DIM_KEY_LAB_MAX &&
    Boolean(Number(rolls?.[DIM_KEY_ROLL_KEYS.invasion]))
  );
}

/**
 * @returns {Record<string, number>}
 */
export function defaultDimensionalKeyRolls() {
  /** @type {Record<string, number>} */
  const rolls = {
    [DIM_KEY_ROLL_KEYS.variant]: 0,
    [DIM_KEY_ROLL_KEYS.labs]: 0,
    [DIM_KEY_ROLL_KEYS.invasion]: 0,
    [DIM_KEY_ROLL_KEYS.nephalem]: 0,
  };
  for (let n = 1; n <= DIM_KEY_STAR_COUNT; n++) {
    rolls[dimKeyPieceRollKey(DIM_KEY_ROLL_KEYS.starPrefix, n)] = 0;
  }
  for (let n = 1; n <= DIM_KEY_DREAM_COUNT; n++) {
    rolls[dimKeyPieceRollKey(DIM_KEY_ROLL_KEYS.dreamPrefix, n)] = 0;
  }
  return rolls;
}

/**
 * @returns {Record<string, number>}
 */
export function maxDimensionalKeyRolls() {
  /** @type {Record<string, number>} */
  const rolls = {
    [DIM_KEY_ROLL_KEYS.labs]: DIM_KEY_LAB_MAX,
    [DIM_KEY_ROLL_KEYS.invasion]: 1,
    [DIM_KEY_ROLL_KEYS.nephalem]: 1,
  };
  for (let n = 1; n <= DIM_KEY_STAR_COUNT; n++) {
    rolls[dimKeyPieceRollKey(DIM_KEY_ROLL_KEYS.starPrefix, n)] = 1;
  }
  for (let n = 1; n <= DIM_KEY_DREAM_COUNT; n++) {
    rolls[dimKeyPieceRollKey(DIM_KEY_ROLL_KEYS.dreamPrefix, n)] = 1;
  }
  return rolls;
}

/**
 * @param {string|null|undefined} text
 * @returns {boolean}
 */
export function isDimensionalKeyProgressLine(text) {
  return PROGRESS_LINE_RE.test(String(text || '').trim());
}

/**
 * @param {object|null|undefined} def
 * @param {string|null|undefined} text
 * @returns {boolean}
 */
export function isDimensionalKeyGeneratedStatLine(def, text) {
  if (def && !looksLikeDimensionalKey(def)) return false;
  const line = String(text || '').trim();
  if (!line) return false;
  if (/\bMagic Find\b/i.test(line)) return true;
  for (const variant of Object.values(DIM_KEY_VARIANTS)) {
    if (variant.purityRe.test(line)) return true;
    if (variant.invasionDetect.some((re) => re.test(line))) return true;
  }
  if (/Adds 100-200 (?:Fire|Lightning|Cold) Damage/i.test(line)) return true;
  if (/^\+1 to (?:Light Radius|Void Armor)$/i.test(line)) return true;
  if (/^Unlocks (?:Void Armor|Occult Smithing|Dimensional Alchemy)$/i.test(line)) return true;
  if (/^Occult Smithing/i.test(line) || /^Dimensional Alchemy/i.test(line)) return true;
  return false;
}

/**
 * @param {object|null|undefined} def
 * @param {Record<string, number>|null|undefined} rolls
 * @returns {{ sourceKey: string, text: string, prefix: string }[]}
 */
export function collectDimensionalKeyAffixSources(def, rolls = null) {
  const variant = getDimensionalKeyVariant(def, rolls);
  if (!variant) return [];
  /** @type {{ sourceKey: string, text: string, prefix: string }[]} */
  const out = [];
  const stars = getDimensionalKeyStars(rolls);
  const dreams = getDimensionalKeyDreams(rolls);
  const points = dimensionalKeyPurityPoints(stars, dreams);
  const purity = scaleDimensionalKeyPurity(points, variant.purityMax);
  if (purity > 0) {
    out.push({
      sourceKey: 'dimkey:purity',
      text: variant.purityFormat(purity),
      prefix: '',
    });
  }
  const labs = getDimensionalKeyLabs(rolls);
  const mf = DIM_KEY_LAB_MAGIC_FIND[labs] || 0;
  if (mf > 0) {
    out.push({
      sourceKey: 'dimkey:labs',
      text: `+${mf}% Magic Find`,
      prefix: '',
    });
  }
  const invasion = Boolean(Number(rolls?.[DIM_KEY_ROLL_KEYS.invasion]));
  const nephalem = Boolean(Number(rolls?.[DIM_KEY_ROLL_KEYS.nephalem]));
  if (invasion) {
    variant.invasion.forEach((text, i) => {
      out.push({ sourceKey: `dimkey:invasion:${i}`, text, prefix: '' });
    });
    if (!nephalem) {
      out.push({ sourceKey: 'dimkey:invasion:lr', text: '+1 to Light Radius', prefix: '' });
    }
  }
  if (nephalem) {
    out.push({ sourceKey: 'dimkey:nephalem:void', text: '+1 to Void Armor', prefix: '' });
  }
  return out;
}

/**
 * @param {string[]} lines
 * @returns {{ stars: number[], dreams: number[] }}
 */
export function parseDimensionalKeyProgressLines(lines) {
  /** @type {Set<number>} */
  const stars = new Set();
  /** @type {Set<number>} */
  const dreams = new Set();
  for (const raw of Array.isArray(lines) ? lines : []) {
    const text = String(raw || '').trim();
    const star = /^Star Chart\s*\((\d+)\)\s*$/i.exec(text);
    if (star) {
      const n = Number(star[1]);
      if (n >= 1 && n <= DIM_KEY_STAR_COUNT) stars.add(n);
      continue;
    }
    const dream = /^Dream Fragment\s*\((\d+)\)\s*$/i.exec(text);
    if (dream) {
      const n = Number(dream[1]);
      if (n >= 1 && n <= DIM_KEY_DREAM_COUNT) dreams.add(n);
    }
  }
  return { stars: [...stars].sort((a, b) => a - b), dreams: [...dreams].sort((a, b) => a - b) };
}

/**
 * @param {string[]} lines
 * @returns {number}
 */
export function parseDimensionalKeyLabsFromLines(lines) {
  let mf = 0;
  for (const raw of Array.isArray(lines) ? lines : []) {
    const m = /^\+?(\d+)%\s+(?:to\s+)?Magic Find$/i.exec(String(raw || '').trim());
    if (!m) continue;
    mf = Math.max(mf, Number(m[1]) || 0);
  }
  let labs = 0;
  for (let i = 0; i < DIM_KEY_LAB_MAGIC_FIND.length; i++) {
    if (DIM_KEY_LAB_MAGIC_FIND[i] <= mf) labs = i;
  }
  return labs;
}

/**
 * @param {object|null|undefined} def
 * @param {string[]} lines
 * @returns {Record<string, number>}
 */
export function parseDimensionalKeyRollsFromLines(def, lines) {
  const rolls = defaultDimensionalKeyRolls();
  if (def && !looksLikeDimensionalKey(def)) return rolls;
  const list = Array.isArray(lines) ? lines : [];
  const variantId = detectDimensionalKeyVariantId(list);
  rolls[DIM_KEY_ROLL_KEYS.variant] = dimensionalKeyVariantIndex(variantId);
  const variant = DIM_KEY_VARIANTS[variantId];
  if (!variant) return rolls;
  const progress = parseDimensionalKeyProgressLines(list);
  const labs = parseDimensionalKeyLabsFromLines(list);
  rolls[DIM_KEY_ROLL_KEYS.labs] = labs;

  let stars = progress.stars;
  let dreams = progress.dreams;
  if (!stars.length && !dreams.length) {
    let purityVal = 0;
    for (const raw of list) {
      const m = variant.purityRe.exec(String(raw || '').trim());
      if (!m) continue;
      const n = Number(m[1] || m[2] || 0);
      if (n > purityVal) purityVal = n;
    }
    if (purityVal >= variant.purityMax) {
      stars = Array.from({ length: DIM_KEY_STAR_COUNT }, (_, i) => i + 1);
      dreams = Array.from({ length: DIM_KEY_DREAM_COUNT }, (_, i) => i + 1);
    }
  }
  for (const n of stars) rolls[dimKeyPieceRollKey(DIM_KEY_ROLL_KEYS.starPrefix, n)] = 1;
  for (const n of dreams) rolls[dimKeyPieceRollKey(DIM_KEY_ROLL_KEYS.dreamPrefix, n)] = 1;

  const invasion =
    variant.invasionDetect.some((re) => list.some((line) => re.test(String(line || '')))) ||
    list.some((line) => /Adds 100-200 Fire Damage/i.test(String(line || ''))) ||
    list.some((line) => /^\+1 to Light Radius$/i.test(String(line || '').trim()));
  if (invasion) rolls[DIM_KEY_ROLL_KEYS.invasion] = 1;

  const nephalem =
    list.some((line) => /^\+1 to Void Armor$/i.test(String(line || '').trim())) ||
    list.some((line) => /Occult Smithing/i.test(String(line || '')) && /Unlocked/i.test(String(line || ''))) ||
    list.some((line) => /^Nephalem\b/i.test(String(line || '').trim()));
  if (nephalem) {
    rolls[DIM_KEY_ROLL_KEYS.nephalem] = 1;
    rolls[DIM_KEY_ROLL_KEYS.invasion] = 1;
    if (labs < DIM_KEY_LAB_MAX && !list.some((line) => /\bMagic Find\b/i.test(String(line || '')))) {
      rolls[DIM_KEY_ROLL_KEYS.labs] = DIM_KEY_LAB_MAX;
    }
    if (!stars.length && !dreams.length) {
      for (let n = 1; n <= DIM_KEY_STAR_COUNT; n++) {
        rolls[dimKeyPieceRollKey(DIM_KEY_ROLL_KEYS.starPrefix, n)] = 1;
      }
      for (let n = 1; n <= DIM_KEY_DREAM_COUNT; n++) {
        rolls[dimKeyPieceRollKey(DIM_KEY_ROLL_KEYS.dreamPrefix, n)] = 1;
      }
    }
  }
  return rolls;
}

/**
 * @param {Record<string, number>|null|undefined} rolls
 * @returns {string[]}
 */
export function dimensionalKeyTswProgressLines(rolls) {
  /** @type {string[]} */
  const out = [];
  for (const n of getDimensionalKeyStars(rolls)) out.push(`Star Chart (${n})`);
  for (const n of getDimensionalKeyDreams(rolls)) out.push(`Dream Fragment (${n})`);
  return out;
}
