/**
 * @file Dungeon charm helpers (inventory-only bonuses).
 * @module items/charm-items
 */

import {
  applyAffixRolls,
  parseAffixRanges,
  buildAffixDisplayParts,
} from '@/items/affix-rolls.js';
import { annotateAffixDisplayPartsWithSkills } from '@/items/item-granted-oskills.js';
import { defaultRollValue } from '@/items/item-stats.js';

/** @type {Readonly<Record<string, string>>} */
export const CHARM_ROLL_KEYS = Object.freeze({
  upgradePrefix: 'charmUpgrade',
  trophy: 'charmTrophy',
  trophyIndex: 'charmTrophyIndex',
  trophyIndex2: 'charmTrophyIndex2',
  awakening: 'charmAwakening',
  poolPrefix: 'charmPool',
  poolHighPrefix: 'charmPoolHigh',
  affixPrefix: 'charmAffix:',
  paragonRegularPrefix: 'charmParagonRegular',
  paragonPath: 'charmParagonPath',
  paragonJusticar: 'charmParagonJusticar',
});

const NONE_POOL_OPTION = '(none)';

/**
 * @typedef {{ index: number, key: string, label: string, affixes: string[] }} CharmUpgradeEntry
 * @typedef {{ key: string, label: string, affixes: string[] }} CharmTrophyEntry
 * @typedef {{ label: string, affixes: string[] }} CharmTrophyOption
 * @typedef {{ sourceKey: string, text: string, prefix: string }} CharmAffixSource
 */

/**
 * @param {string} sourceKey
 * @param {number} rangeIndex
 * @returns {string}
 */
export function charmAffixRollKey(sourceKey, rangeIndex) {
  return `${CHARM_ROLL_KEYS.affixPrefix}${sourceKey}:r${rangeIndex}`;
}

/**
 * @param {number} poolIndex
 * @param {number} optionIndex
 * @returns {string}
 */
export function charmPoolOptionSourceKey(poolIndex, optionIndex) {
  return `base:p${poolIndex}:o${optionIndex}`;
}

/**
 * @param {number} poolIndex
 * @returns {string}
 */
export function charmPoolHighRollKey(poolIndex) {
  return `${CHARM_ROLL_KEYS.poolHighPrefix}${poolIndex}`;
}

/**
 * @typedef {{ label: string, text?: string, low?: string, high?: string }} CharmPoolOption
 */

/**
 * @param {unknown} opt
 * @returns {CharmPoolOption}
 */
export function normalizeCharmPoolOption(opt) {
  if (typeof opt === 'string') {
    return { label: opt, text: opt };
  }
  if (opt && typeof opt === 'object' && !Array.isArray(opt)) {
    const rec = /** @type {{ label?: unknown, low?: unknown, high?: unknown, text?: unknown }} */ (opt);
    const low = typeof rec.low === 'string' ? rec.low.trim() : '';
    const high = typeof rec.high === 'string' ? rec.high.trim() : '';
    if (low && high) {
      const label =
        typeof rec.label === 'string' && rec.label.trim() ? rec.label.trim() : low;
      return { label, low, high };
    }
    const text = typeof rec.text === 'string' && rec.text.trim() ? rec.text.trim() : '';
    if (text) {
      const label =
        typeof rec.label === 'string' && rec.label.trim() ? rec.label.trim() : text;
      return { label, text };
    }
  }
  const fallback = String(opt ?? '');
  return { label: fallback, text: fallback };
}

/**
 * @param {CharmPoolOption} option
 * @returns {string[]}
 */
export function charmPoolOptionTexts(option) {
  if (option.low && option.high) return [option.low, option.high];
  return option.text ? [option.text] : [];
}

/**
 * @param {CharmPoolOption} option
 * @param {boolean} high
 * @returns {string}
 */
export function resolveCharmPoolOptionText(option, high) {
  if (option.low && option.high) return high ? option.high : option.low;
  return option.text || option.label || '';
}

/**
 * @param {'Low'|'High'} kind
 * @param {string} affix
 * @returns {string}
 */
export function formatCharmPoolRollButton(kind, affix) {
  const match = /^(\d+)\s*%/.exec(String(affix || ''));
  return match ? `${kind} Roll (${match[1]}%)` : `${kind} Roll`;
}

/**
 * @param {unknown} mod
 * @returns {mod is { oneOf: unknown[] }}
 */
export function isModifierPool(mod) {
  return Boolean(
    mod &&
      typeof mod === 'object' &&
      !Array.isArray(mod) &&
      Array.isArray(/** @type {{ oneOf?: unknown }} */ (mod).oneOf) &&
      /** @type {{ oneOf: unknown[] }} */ (mod).oneOf.length > 0
  );
}

/**
 * @param {unknown} step
 * @param {number} index
 * @returns {CharmUpgradeEntry|null}
 */
function normalizeUpgradeStep(step, index) {
  if (Array.isArray(step)) {
    return {
      index,
      key: `${CHARM_ROLL_KEYS.upgradePrefix}${index}`,
      label: `Upgrade ${index + 1}`,
      affixes: step.map((m) => String(m)),
    };
  }
  if (step && typeof step === 'object' && Array.isArray(/** @type {{ affixes?: unknown }} */ (step).affixes)) {
    const labeled = /** @type {{ label?: unknown, affixes: unknown[] }} */ (step);
    return {
      index,
      key: `${CHARM_ROLL_KEYS.upgradePrefix}${index}`,
      label: String(labeled.label || `Upgrade ${index + 1}`),
      affixes: labeled.affixes.map((m) => String(m)),
    };
  }
  return null;
}

/**
 * @param {object|null|undefined} def
 * @returns {Record<string, string[]>|null}
 */
export function getCharmClassUpgradeMap(def) {
  if (!def || !Array.isArray(def.upgrade) || !def.upgrade.length) return null;
  const first = def.upgrade[0];
  if (!first || typeof first !== 'object' || Array.isArray(first)) return null;
  if (Array.isArray(/** @type {{ affixes?: unknown }} */ (first).affixes)) return null;
  /** @type {Record<string, string[]>} */
  const out = {};
  for (const [key, value] of Object.entries(first)) {
    if (Array.isArray(value)) out[key] = value.map((m) => String(m));
  }
  return Object.keys(out).length ? out : null;
}

/**
 * @param {object|null|undefined} def
 * @returns {string[]}
 */
export function getCharmClassUpgradeKeys(def) {
  const map = getCharmClassUpgradeMap(def);
  return map ? Object.keys(map) : [];
}

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
export function isCharmItem(def) {
  if (!def || typeof def !== 'object') return false;
  // Relics also use keepInInventory; never treat them as charms.
  if (def.category === 'relics' || def.rarity === 'relic' || def.type === 'relic') return false;
  return (
    def.category === 'charms' ||
    def.type === 'charm' ||
    def.keepInInventory === true
  );
}

/**
 * Dimensional Key variants (Arcana / Mandate / Onslaught / Primordia).
 * Only one may be enabled at a time.
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
export function isDimensionalKeyCharm(def) {
  if (!isCharmItem(def)) return false;
  const id = String(def.id || '');
  if (id === 'ebw' || id.startsWith('ebw-')) return true;
  return /^Dimensional Key\b/i.test(String(def.name || ''));
}

/**
 * @param {object|null|undefined} def
 * @param {number|null|undefined} characterLevel
 * @returns {boolean}
 */
export function charmMeetsLevel(def, characterLevel) {
  if (!isCharmItem(def)) return true;
  const req = Number(def.reqLevel) || 0;
  const level = Number(characterLevel);
  if (!Number.isFinite(level)) return false;
  return level >= req;
}

/**
 * Charm bonuses apply only while the item is in inventory and level req is met.
 * @param {object|null|undefined} def
 * @param {number|null|undefined} characterLevel
 * @param {{ inInventory?: boolean }} [options]
 * @returns {boolean}
 */
export function isCharmBonusActive(def, characterLevel, options = {}) {
  if (!isCharmItem(def)) return true;
  if (options.inInventory === false) return false;
  return charmMeetsLevel(def, characterLevel);
}

/**
 * @param {string|null|undefined} className
 * @returns {string|null}
 */
function classNameToUpgradeKey(className) {
  if (!className) return null;
  return String(className).trim().toLowerCase();
}

/**
 * @param {object|null|undefined} def
 * @param {string|null|undefined} [className]
 * @returns {CharmUpgradeEntry[]}
 */
export function getCharmUpgradeEntries(def, className = null) {
  if (!def || typeof def !== 'object') return [];

  if (Array.isArray(def.upgrades) && def.upgrades.length) {
    return def.upgrades
      .map((step, index) => normalizeUpgradeStep(step, index))
      .filter((entry) => entry != null);
  }

  if (!Array.isArray(def.upgrade) || !def.upgrade.length) return [];

  const classMap = getCharmClassUpgradeMap(def);
  if (classMap) {
    const keys = Object.keys(classMap);
    const classKey = classNameToUpgradeKey(className) || keys[0];
    const affixes = classKey && Array.isArray(classMap[classKey]) ? classMap[classKey] : [];
    return [
      {
        index: 0,
        key: `${CHARM_ROLL_KEYS.upgradePrefix}0`,
        label: 'Upgrade',
        affixes,
      },
    ];
  }

  return [
    {
      index: 0,
      key: `${CHARM_ROLL_KEYS.upgradePrefix}0`,
      label: 'Upgrade',
      affixes: def.upgrade.filter((m) => typeof m === 'string').map((m) => String(m)),
    },
  ];
}

/**
 * @param {object|null|undefined} def
 * @returns {CharmTrophyEntry|null}
 */
export function getCharmTrophyEntry(def) {
  if (!def || !Array.isArray(def.trophy) || !def.trophy.length) return null;
  return {
    key: CHARM_ROLL_KEYS.trophy,
    label: 'Trophy',
    affixes: def.trophy.map((m) => String(m)),
  };
}

/**
 * @param {object|null|undefined} def
 * @returns {CharmTrophyOption[]}
 */
export function getCharmTrophyOptions(def) {
  if (!def || !Array.isArray(def.trophyOptions)) return [];
  return def.trophyOptions
    .map((opt) => {
      if (!opt || typeof opt !== 'object') return null;
      const label = String(opt.label || '').trim();
      const affixes = Array.isArray(opt.affixes) ? opt.affixes.map((m) => String(m)) : [];
      if (!label) return null;
      return { label, affixes };
    })
    .filter((opt) => opt != null);
}

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
export function hasCharmExtraAwakening(def) {
  return Boolean(def && def.extraAwakening);
}

/**
 * @param {object|null|undefined} def
 * @returns {object|null}
 */
export function getParagonHammerConfig(def) {
  if (!def || typeof def.paragonHammer !== 'object' || !def.paragonHammer) return null;
  return def.paragonHammer;
}

/**
 * @param {object|null|undefined} def
 * @param {Record<string, number>|null|undefined} rolls
 * @returns {number}
 */
export function countParagonRegularUpgrades(def, rolls = null) {
  const cfg = getParagonHammerConfig(def);
  const list = Array.isArray(cfg?.regularUpgrades) ? cfg.regularUpgrades : [];
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    if (Number(rolls?.[`${CHARM_ROLL_KEYS.paragonRegularPrefix}${i}`])) n += 1;
  }
  return n;
}

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
export function hasCharmUpgrade(def) {
  return getCharmUpgradeEntries(def).length > 0;
}

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
export function hasCharmTrophy(def) {
  return getCharmTrophyEntry(def) != null;
}

/**
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
export function hasCharmExtras(def) {
  return (
    hasCharmUpgrade(def) ||
    hasCharmTrophy(def) ||
    getCharmModifierPools(def).length > 0 ||
    getCharmTrophyOptions(def).length > 0 ||
    getParagonHammerConfig(def) != null
  );
}

/**
 * @param {object|null|undefined} def
 * @returns {{ poolIndex: number, options: CharmPoolOption[], label: string }[]}
 */
export function getCharmModifierPools(def) {
  const mods = Array.isArray(def?.modifiers) ? def.modifiers : [];
  /** @type {{ poolIndex: number, options: CharmPoolOption[], label: string }[]} */
  const pools = [];
  let poolIndex = 0;
  for (const mod of mods) {
    if (isModifierPool(mod)) {
      const label = typeof mod.label === 'string' && mod.label.trim() ? mod.label.trim() : 'Modifier choice';
      pools.push({
        poolIndex,
        options: mod.oneOf.map((opt) => normalizeCharmPoolOption(opt)),
        label,
      });
      poolIndex += 1;
    }
  }
  return pools;
}

/**
 * @param {object|null|undefined} def
 * @param {Record<string, number>|null|undefined} rolls
 * @param {string|null|undefined} [className]
 * @returns {CharmAffixSource[]}
 */
export function collectCharmAffixSources(def, rolls = null, className = null) {
  /** @type {CharmAffixSource[]} */
  const out = [];
  if (!def || typeof def !== 'object') return out;

  const paragon = getParagonHammerConfig(def);
  const regularUsed = countParagonRegularUpgrades(def, rolls);
  const paragonPath = Number(rolls?.[CHARM_ROLL_KEYS.paragonPath]) || 0;
  const regularLimit = Number(paragon?.regularLimit) || 0;

  let modIndex = 0;
  let poolIndex = 0;
  for (const mod of Array.isArray(def.modifiers) ? def.modifiers : []) {
    if (isModifierPool(mod)) {
      const key = `${CHARM_ROLL_KEYS.poolPrefix}${poolIndex}`;
      const selected = Number(rolls?.[key]) || 0;
      const options = mod.oneOf.map((opt) => normalizeCharmPoolOption(opt));
      const clamped = Math.min(Math.max(0, selected), options.length - 1);
      const option = options[clamped];
      const high = Boolean(Number(rolls?.[charmPoolHighRollKey(poolIndex)]));
      const text = option ? resolveCharmPoolOptionText(option, high) : '';
      poolIndex += 1;
      if (!text || text === NONE_POOL_OPTION) continue;
      out.push({
        sourceKey: charmPoolOptionSourceKey(poolIndex - 1, clamped),
        text,
        prefix: '',
      });
      continue;
    }
    if (typeof mod === 'string') {
      if (paragon) {
        if (/^Charges:/i.test(mod)) continue;
        if (/^Can be upgraded in Heroic/i.test(mod) && regularLimit && regularUsed >= regularLimit) {
          continue;
        }
        if (/^Can be upgraded to unlock a Paragon/i.test(mod) && paragonPath > 0) continue;
      }
      out.push({
        sourceKey: `base:m${modIndex}`,
        text: mod,
        prefix: '',
      });
      modIndex += 1;
    }
  }

  for (const entry of getCharmUpgradeEntries(def, className)) {
    entry.affixes.forEach((text, affixIndex) => {
      out.push({
        sourceKey: `upgrade:${entry.index}:${affixIndex}`,
        text,
        prefix: '[Upgrade] ',
      });
    });
  }

  const trophy = getCharmTrophyEntry(def);
  if (trophy) {
    trophy.affixes.forEach((text, affixIndex) => {
      out.push({
        sourceKey: `trophy:${affixIndex}`,
        text,
        prefix: '[Trophy] ',
      });
    });
  }

  const trophyOptions = getCharmTrophyOptions(def);
  if (trophyOptions.length) {
    const idx = Number(rolls?.[CHARM_ROLL_KEYS.trophyIndex]) || 0;
    const chosen = idx > 0 ? trophyOptions[idx - 1] : null;
    if (chosen) {
      chosen.affixes.forEach((text, affixIndex) => {
        out.push({
          sourceKey: `trophyOpt:${idx}:${affixIndex}`,
          text,
          prefix: '[Trophy] ',
        });
      });
    }
    if (hasCharmExtraAwakening(def) && Number(rolls?.[CHARM_ROLL_KEYS.awakening])) {
      const idx2 = Number(rolls?.[CHARM_ROLL_KEYS.trophyIndex2]) || 0;
      const chosen2 = idx2 > 0 && idx2 !== idx ? trophyOptions[idx2 - 1] : null;
      if (chosen2) {
        chosen2.affixes.forEach((text, affixIndex) => {
          out.push({
            sourceKey: `trophyOpt2:${idx2}:${affixIndex}`,
            text,
            prefix: '[Awakening] ',
          });
        });
      }
    }
  }

  if (paragon) {
    const regulars = Array.isArray(paragon.regularUpgrades) ? paragon.regularUpgrades : [];
    regulars.forEach((step, index) => {
      if (!Number(rolls?.[`${CHARM_ROLL_KEYS.paragonRegularPrefix}${index}`])) return;
      const affixes = Array.isArray(step?.affixes) ? step.affixes : [];
      affixes.forEach((text, affixIndex) => {
        out.push({
          sourceKey: `paragonRegular:${index}:${affixIndex}`,
          text: String(text),
          prefix: `[${String(step.label || 'Upgrade')}] `,
        });
      });
    });
    const paths = Array.isArray(paragon.paragonPaths) ? paragon.paragonPaths : [];
    const path = paths[paragonPath - 1];
    if (path && Array.isArray(path.affixes)) {
      path.affixes.forEach((text, affixIndex) => {
        out.push({
          sourceKey: `paragonPath:${paragonPath}:${affixIndex}`,
          text: String(text),
          prefix: `[${String(path.label || 'Paragon')}] `,
        });
      });
    }
    if (paragon.justicar && Number(rolls?.[CHARM_ROLL_KEYS.paragonJusticar])) {
      const affixes = Array.isArray(paragon.justicar.affixes) ? paragon.justicar.affixes : [];
      affixes.forEach((text, affixIndex) => {
        out.push({
          sourceKey: `paragonJusticar:${affixIndex}`,
          text: String(text),
          prefix: '[Justicar] ',
        });
      });
    }
  }

  return out;
}

/**
 * @param {object|null|undefined} def
 * @param {Record<string, number>|null|undefined} rolls
 * @param {string|null|undefined} [className]
 * @param {{ activeOnly?: boolean }} [options]
 * @returns {CharmAffixSource[]}
 */
export function getCharmAffixSources(def, rolls = null, className = null, options = {}) {
  const sources = collectCharmAffixSources(def, rolls, className);
  if (!options.activeOnly) return sources;
  return sources.filter((source) => {
    if (source.sourceKey.startsWith('base:')) return true;
    if (source.sourceKey.startsWith('upgrade:')) {
      const upgradeIndex = Number(source.sourceKey.split(':')[1]);
      return Boolean(rolls?.[`${CHARM_ROLL_KEYS.upgradePrefix}${upgradeIndex}`]);
    }
    if (source.sourceKey.startsWith('trophy:')) {
      return Boolean(rolls?.[CHARM_ROLL_KEYS.trophy]);
    }
    if (source.sourceKey.startsWith('trophyOpt')) {
      return true;
    }
    if (source.sourceKey.startsWith('paragon')) {
      return true;
    }
    return true;
  });
}

/**
 * @param {string} text
 * @param {string} sourceKey
 * @param {Record<string, number>|null|undefined} rolls
 * @param {boolean} [hideRollableRanges]
 * @returns {string|null}
 */
export function resolveCharmAffixText(text, sourceKey, rolls = null, hideRollableRanges = false) {
  const ranges = parseAffixRanges(text);
  if (!ranges.length) return text;
  // When roll controls are shown elsewhere, omit every ranged affix line (even if rolls exist).
  if (hideRollableRanges && ranges.length > 0) {
    return null;
  }
  return applyAffixRolls(text, rolls, (i) => charmAffixRollKey(sourceKey, i), {
    hideRanges: hideRollableRanges,
  });
}

/**
 * @param {CharmAffixSource} source
 * @param {Record<string, number>|null|undefined} rolls
 * @returns {import('@/items/item-stats.js').RollableStat[]}
 */
export function buildCharmSourceRollableStats(source, rolls = null) {
  /** @type {import('@/items/item-stats.js').RollableStat[]} */
  const out = [];
  const resolved = resolveCharmAffixText(source.text, source.sourceKey, rolls, false);
  if (!resolved) return out;
  const display = source.prefix ? `${source.prefix.trim()} ${resolved}` : resolved;
  parseAffixRanges(source.text).forEach((range, rangeIndex) => {
    const parts = annotateAffixDisplayPartsWithSkills(
      buildAffixDisplayParts(
        source.text,
        rolls,
        (i) => charmAffixRollKey(source.sourceKey, i),
        rangeIndex
      )
    );
    const displayParts = source.prefix
      ? [{ kind: 'text', text: `${source.prefix.trim()} ` }, ...parts]
      : parts;
    out.push({
      key: charmAffixRollKey(source.sourceKey, rangeIndex),
      label: source.prefix ? `${source.prefix.trim()} ${source.text}` : source.text,
      display,
      displayParts,
      min: range.min,
      max: range.max,
    });
  });
  return out;
}

/**
 * @param {object|null|undefined} def
 * @param {Record<string, number>|null|undefined} rolls
 * @param {string|null|undefined} [className]
 * @returns {import('@/items/item-stats.js').RollableStat[]}
 */
export function getCharmRollableStats(def, rolls = null, className = null) {
  /** @type {import('@/items/item-stats.js').RollableStat[]} */
  const out = [];
  for (const source of getCharmAffixSources(def, rolls, className, { activeOnly: true })) {
    out.push(...buildCharmSourceRollableStats(source, rolls));
  }
  return out;
}

/**
 * Picker/modify rows in source order: base affixes, then upgrades, then trophies.
 * Ranged affixes become roll controls; fixed affixes stay as text.
 * @param {object|null|undefined} def
 * @param {Record<string, number>|null|undefined} [rolls]
 * @param {string|null|undefined} [className]
 * @returns {({ kind: 'text', text: string } | { kind: 'roll', stat: import('@/items/item-stats.js').RollableStat })[]}
 */
export function getCharmDetailStatRows(def, rolls = null, className = null) {
  /** @type {({ kind: 'text', text: string } | { kind: 'roll', stat: import('@/items/item-stats.js').RollableStat })[]} */
  const rows = [];
  for (const source of getCharmAffixSources(def, rolls, className, { activeOnly: true })) {
    const ranges = parseAffixRanges(source.text);
    if (ranges.length) {
      for (const stat of buildCharmSourceRollableStats(source, rolls)) {
        rows.push({ kind: 'roll', stat });
      }
      continue;
    }
    const text = resolveCharmAffixText(source.text, source.sourceKey, rolls, false);
    if (text == null) continue;
    rows.push({ kind: 'text', text: source.prefix ? `${source.prefix}${text}` : text });
  }
  return rows;
}

/**
 * @param {object|null|undefined} def
 * @param {string|null|undefined} [className]
 * @returns {Record<string, number>}
 */
export function defaultCharmAffixRolls(def, className = null) {
  /** @type {Record<string, number>} */
  const out = {};
  /**
   * @param {string} sourceKey
   * @param {string} text
   */
  const seed = (sourceKey, text) => {
    parseAffixRanges(text).forEach((range, rangeIndex) => {
      const key = charmAffixRollKey(sourceKey, rangeIndex);
      if (!(key in out)) out[key] = defaultRollValue(range.min, range.max);
    });
  };
  for (const source of collectCharmAffixSources(def, null, className)) {
    seed(source.sourceKey, source.text);
  }
  for (const pool of getCharmModifierPools(def)) {
    pool.options.forEach((option, optionIndex) => {
      for (const text of charmPoolOptionTexts(option)) {
        seed(charmPoolOptionSourceKey(pool.poolIndex, optionIndex), text);
      }
    });
  }
  return out;
}

/**
 * @param {object|null|undefined} def
 * @param {string|null|undefined} [className]
 * @returns {Record<string, number>}
 */
export function defaultCharmRollsForDef(def, className = null) {
  /** @type {Record<string, number>} */
  const rolls = {};
  if (!isCharmItem(def)) return rolls;

  for (const entry of getCharmUpgradeEntries(def, className)) {
    rolls[entry.key] = 0;
  }
  if (getCharmTrophyEntry(def)) {
    rolls[CHARM_ROLL_KEYS.trophy] = 0;
  }
  if (getCharmTrophyOptions(def).length) {
    rolls[CHARM_ROLL_KEYS.trophyIndex] = 0;
    if (hasCharmExtraAwakening(def)) {
      rolls[CHARM_ROLL_KEYS.awakening] = 0;
      rolls[CHARM_ROLL_KEYS.trophyIndex2] = 0;
    }
  }
  const paragon = getParagonHammerConfig(def);
  if (paragon) {
    const regulars = Array.isArray(paragon.regularUpgrades) ? paragon.regularUpgrades : [];
    regulars.forEach((_step, index) => {
      rolls[`${CHARM_ROLL_KEYS.paragonRegularPrefix}${index}`] = 0;
    });
    rolls[CHARM_ROLL_KEYS.paragonPath] = 0;
    if (paragon.justicar) rolls[CHARM_ROLL_KEYS.paragonJusticar] = 0;
  }
  for (const pool of getCharmModifierPools(def)) {
    rolls[`${CHARM_ROLL_KEYS.poolPrefix}${pool.poolIndex}`] = 0;
    if (pool.options.some((opt) => Boolean(opt.low && opt.high))) {
      rolls[charmPoolHighRollKey(pool.poolIndex)] = 0;
    }
  }
  return { ...rolls, ...defaultCharmAffixRolls(def, className) };
}

/**
 * @param {object|null|undefined} def
 * @param {Record<string, number>|null|undefined} rolls
 * @param {string|null|undefined} className
 * @returns {string[]}
 */
export function resolveCharmBaseModifiers(def, rolls = null, className = null) {
  return getCharmAffixSources(def, rolls, className, { activeOnly: true })
    .filter((source) => source.sourceKey.startsWith('base:'))
    .map((source) => resolveCharmAffixText(source.text, source.sourceKey, rolls, false))
    .filter((text) => text != null);
}

/**
 * @param {object|null|undefined} def
 * @param {Record<string, number>|null|undefined} rolls
 * @param {string|null|undefined} className
 * @returns {string[]}
 */
export function resolveCharmUpgradeModifiers(def, rolls = null, className = null) {
  return getCharmAffixSources(def, rolls, className, { activeOnly: true })
    .filter((source) => source.sourceKey.startsWith('upgrade:'))
    .map((source) => resolveCharmAffixText(source.text, source.sourceKey, rolls, false))
    .filter((text) => text != null);
}

/**
 * @param {object|null|undefined} def
 * @param {Record<string, number>|null|undefined} rolls
 * @returns {string[]}
 */
export function resolveCharmTrophyModifiers(def, rolls = null) {
  return getCharmAffixSources(def, rolls, null, { activeOnly: true })
    .filter((source) => source.sourceKey.startsWith('trophy:'))
    .map((source) => resolveCharmAffixText(source.text, source.sourceKey, rolls, false))
    .filter((text) => text != null);
}

/**
 * @param {object|null|undefined} def
 * @param {number|null|undefined} characterLevel
 * @param {{ inInventory?: boolean, rolls?: Record<string, number>|null, className?: string|null, hideRollableRanges?: boolean, headerOnly?: boolean }} [options]
 * @returns {string[]}
 */
export function getCharmStatLines(def, characterLevel, options = {}) {
  if (!isCharmItem(def)) return [];
  const rolls = options.rolls ?? null;
  const className = options.className ?? null;
  const hideRollableRanges = options.hideRollableRanges === true;
  /** @type {string[]} */
  const lines = [];
  if (def.dungeon) lines.push(String(def.dungeon));
  if (options.headerOnly) return lines;

  const pushMod = (text, prefix = '') => {
    const line = prefix ? `${prefix}${text}` : text;
    lines.push(line);
  };

  for (const source of getCharmAffixSources(def, rolls, className, { activeOnly: true })) {
    const text = resolveCharmAffixText(source.text, source.sourceKey, rolls, hideRollableRanges);
    if (text == null) continue;
    pushMod(text, source.prefix);
  }
  return lines;
}
