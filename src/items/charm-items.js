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
  poolPrefix: 'charmPool',
  affixPrefix: 'charmAffix:',
});

/**
 * @typedef {{ index: number, key: string, label: string, affixes: string[] }} CharmUpgradeEntry
 * @typedef {{ key: string, label: string, affixes: string[] }} CharmTrophyEntry
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
 * @param {unknown} mod
 * @returns {mod is { oneOf: string[] }}
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
    return def.upgrades.map((step, index) => ({
      index,
      key: `${CHARM_ROLL_KEYS.upgradePrefix}${index}`,
      label: `Upgrade ${index + 1}`,
      affixes: Array.isArray(step) ? step.map((m) => String(m)) : [],
    }));
  }

  if (!Array.isArray(def.upgrade) || !def.upgrade.length) return [];

  const first = def.upgrade[0];
  if (first && typeof first === 'object' && !Array.isArray(first)) {
    const classKey = classNameToUpgradeKey(className);
    const affixes =
      classKey && Array.isArray(first[classKey]) ? first[classKey].map((m) => String(m)) : [];
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
  return hasCharmUpgrade(def) || hasCharmTrophy(def) || getCharmModifierPools(def).length > 0;
}

/**
 * @param {object|null|undefined} def
 * @returns {{ poolIndex: number, options: string[] }[]}
 */
export function getCharmModifierPools(def) {
  const mods = Array.isArray(def?.modifiers) ? def.modifiers : [];
  /** @type {{ poolIndex: number, options: string[] }[]} */
  const pools = [];
  let poolIndex = 0;
  for (const mod of mods) {
    if (isModifierPool(mod)) {
      pools.push({
        poolIndex,
        options: mod.oneOf.map((opt) => String(opt)),
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

  let modIndex = 0;
  let poolIndex = 0;
  for (const mod of Array.isArray(def.modifiers) ? def.modifiers : []) {
    if (isModifierPool(mod)) {
      const key = `${CHARM_ROLL_KEYS.poolPrefix}${poolIndex}`;
      const selected = Number(rolls?.[key]) || 0;
      const options = mod.oneOf.map((opt) => String(opt));
      const clamped = Math.min(Math.max(0, selected), options.length - 1);
      out.push({
        sourceKey: `base:p${poolIndex}`,
        text: options[clamped],
        prefix: '',
      });
      poolIndex += 1;
      continue;
    }
    if (typeof mod === 'string') {
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
  for (const source of collectCharmAffixSources(def, null, className)) {
    parseAffixRanges(source.text).forEach((range, rangeIndex) => {
      const key = charmAffixRollKey(source.sourceKey, rangeIndex);
      if (!(key in out)) out[key] = defaultRollValue(range.min, range.max);
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
  for (const pool of getCharmModifierPools(def)) {
    rolls[`${CHARM_ROLL_KEYS.poolPrefix}${pool.poolIndex}`] = 0;
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
