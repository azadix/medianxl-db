/**
 * @file Parse item "chance to cast" modifier lines and index them by skill.
 * @module items/item-procs
 */

import { resolveCatalogRowBySkillRef } from '@/character/planner-build-io.js';
import { isCharmItem, isModifierPool } from '@/items/charm-items.js';
import { formatOverlayBadge } from '@/items/item-overlays.js';
import { isRelicItem } from '@/items/relic-items.js';
import { formatItemRarityBadge } from '@/items/item-stats.js';

/** Longest-first so "when Struck by a Missile" wins over "when Struck". */
export const PROC_TRIGGERS = Object.freeze([
  'when Struck by a Missile',
  'when you Level-Up',
  'when you Die',
  'when Attacked',
  'when Struck',
  'on Melee Attack',
  'on Death Blow',
  'on Striking',
  'on Kill',
  'on Block',
]);

const CHARM_PREFIX_RE = /^\[(?:Upgrade|Trophy)\]\s*/i;
const CHANCE_LINE_RE =
  /^(?:(\d+(?:\.\d+)?)|\((\d+)\s+to\s+(\d+)\))%\s+Chance to cast level (\d+)\s+(.+)$/i;

/**
 * @typedef {{
 *   chance: number,
 *   chanceMax: number,
 *   chanceLabel: string,
 *   level: number,
 *   skillName: string,
 *   condition: string,
 * }} ParsedItemProc
 *
 * @typedef {{
 *   sourceLabel: string,
 *   sourceKind: 'item'|'setBonus',
 *   sourceRarity: string,
 *   itemDefId?: string,
 *   setId?: string,
 *   setRequired?: number|string,
 * }} ItemProcSource
 *
 * @typedef {{
 *   skillId: string,
 *   skillName: string,
 *   chance: number,
 *   chanceMax: number,
 *   chanceLabel: string,
 *   level: number,
 *   condition: string,
 *   sourceLabel: string,
 *   sourceKind: 'item'|'setBonus',
 *   sourceRarity: string,
 *   skillImage?: string|null,
 *   skillClass?: string,
 *   itemDefId?: string,
 *   setId?: string,
 *   setRequired?: number|string,
 *   sources: ItemProcSource[],
 *   rowKey: string,
 * }} ItemProcRow
 */

/**
 * @param {string} s
 * @returns {string}
 */
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {string|null|undefined} line
 * @returns {string}
 */
export function stripProcLinePrefix(line) {
  return String(line || '').replace(CHARM_PREFIX_RE, '').trim();
}

/**
 * Parse a single modifier line into a chance-to-cast proc.
 * @param {string|null|undefined} line
 * @returns {ParsedItemProc|null}
 */
export function parseProcFromModifierLine(line) {
  const text = stripProcLinePrefix(line);
  if (!text) return null;
  const match = CHANCE_LINE_RE.exec(text);
  if (!match) return null;

  const rest = String(match[5] || '').trim();
  const trigger = PROC_TRIGGERS.find((name) =>
    new RegExp(`\\s+${escapeRegExp(name)}$`, 'i').test(rest)
  );
  if (!trigger) return null;

  const skillName = rest.slice(0, rest.length - trigger.length).trim();
  if (!skillName) return null;

  const fixed = match[1] != null ? Number(match[1]) : null;
  const rangeMin = match[2] != null ? Number(match[2]) : null;
  const rangeMax = match[3] != null ? Number(match[3]) : null;
  const chance = Number.isFinite(fixed) ? fixed : rangeMin;
  const chanceMax = Number.isFinite(rangeMax) ? rangeMax : chance;
  if (!Number.isFinite(chance) || !Number.isFinite(chanceMax)) return null;
  const level = Number(match[4]);
  if (!Number.isFinite(level) || level < 1) return null;

  const chanceLabel =
    Number.isFinite(fixed) || chance === chanceMax ? String(chance) : `${chance}-${chanceMax}`;

  return {
    chance,
    chanceMax,
    chanceLabel,
    level,
    skillName,
    condition: trigger,
  };
}

/**
 * @param {unknown} modifiers
 * @returns {string[]}
 */
export function flattenModifierLines(modifiers) {
  if (!Array.isArray(modifiers)) return [];
  /** @type {string[]} */
  const out = [];
  for (const mod of modifiers) {
    if (typeof mod === 'string') {
      const text = mod.trim();
      if (text) out.push(text);
      continue;
    }
    if (isModifierPool(mod)) {
      for (const opt of mod.oneOf) {
        const text = String(opt || '').trim();
        if (text) out.push(text);
      }
    }
  }
  return out;
}

/**
 * @param {object|null|undefined} def
 * @returns {string}
 */
export function formatProcItemSourceLabel(def) {
  if (!def || typeof def !== 'object') return 'Unknown item';
  if (isRelicItem(def)) return String(def.name || 'Relic');
  if (isCharmItem(def)) return String(def.name || 'Charm');

  const badge =
    formatOverlayBadge(def.uniqueKind, def.tier) || formatItemRarityBadge(def) || '';
  const name = String(def.name || def.id || 'Unknown item');
  const typePart = String(def.baseName || def.baseType || def.group || '').trim();
  if (badge && typePart) return `${badge}: ${name} (${typePart})`;
  if (badge) return `${badge}: ${name}`;
  if (typePart) return `${name} (${typePart})`;
  return name;
}

/**
 * @param {object|null|undefined} setDef
 * @param {number|string|null|undefined} required
 * @returns {string}
 */
export function formatProcSetBonusSourceLabel(setDef, required) {
  const name = String(setDef?.name || setDef?.id || 'Unknown set');
  const req = required === 'complete' || required == null ? 'complete' : String(required);
  return `Set bonus: ${name} (${req})`;
}

/**
 * @param {object|null|undefined} def
 * @returns {string}
 */
export function procSourceRarityForItem(def) {
  if (!def || typeof def !== 'object') return 'normal';
  if (isRelicItem(def)) return 'relic';
  const rarity = String(def.rarity || '').trim();
  return rarity || 'unique';
}

/**
 * @param {ParsedItemProc} parsed
 * @param {{ skillId: string, skillName: string, skillImage?: string|null, skillClass?: string }} skill
 * @param {object} source
 * @returns {ItemProcRow}
 */
function toProcRow(parsed, skill, source) {
  const itemDefId = source.itemDefId != null ? String(source.itemDefId) : '';
  const setId = source.setId != null ? String(source.setId) : '';
  const setRequired = source.setRequired != null ? String(source.setRequired) : '';
  const rowKey = [
    skill.skillId,
    parsed.level,
    parsed.chanceLabel,
    parsed.condition,
    source.sourceKind,
    itemDefId,
    setId,
    setRequired,
  ].join('|');
  return {
    skillId: skill.skillId,
    skillName: skill.skillName,
    skillImage: skill.skillImage || null,
    skillClass: skill.skillClass || '',
    chance: parsed.chance,
    chanceMax: parsed.chanceMax,
    chanceLabel: parsed.chanceLabel,
    level: parsed.level,
    condition: parsed.condition,
    sourceLabel: source.sourceLabel,
    sourceKind: source.sourceKind,
    sourceRarity: String(source.sourceRarity || 'normal'),
    itemDefId: itemDefId || undefined,
    setId: setId || undefined,
    setRequired: source.setRequired,
    rowKey,
  };
}

/**
 * @param {string} skillName
 * @param {(ref: string) => { id?: string, displayName?: string, image?: string, class?: string, className?: string }|null} resolveSkill
 * @returns {{ skillId: string, skillName: string, skillImage: string|null, skillClass: string }|null}
 */
function resolveProcSkill(skillName, resolveSkill) {
  const row = resolveSkill(skillName);
  if (!row?.id) return null;
  const display = String(row.displayName || skillName).trim() || skillName;
  const skillClass = String(row.class || row.className || '').trim();
  return {
    skillId: String(row.id),
    skillName: display,
    skillImage: row.image != null ? String(row.image) : null,
    skillClass,
  };
}

/**
 * @param {object[]} catalog
 * @param {Array<{ id?: string, name?: string, bonuses?: Array<{ required?: number|string, modifiers?: unknown }> }>} [sets]
 * @param {(ref: string) => { id?: string, displayName?: string }|null} [resolveSkill]
 * @returns {ItemProcRow[]}
 */
export function collectItemProcs(catalog, sets = [], resolveSkill = resolveCatalogRowBySkillRef) {
  /** @type {ItemProcRow[]} */
  const rows = [];
  const list = Array.isArray(catalog) ? catalog : [];
  for (const def of list) {
    if (!def || typeof def !== 'object') continue;
    const lines = flattenModifierLines(def.modifiers);
    for (const line of lines) {
      const parsed = parseProcFromModifierLine(line);
      if (!parsed) continue;
      const skill = resolveProcSkill(parsed.skillName, resolveSkill);
      if (!skill) continue;
      rows.push(
        toProcRow(parsed, skill, {
          sourceKind: 'item',
          sourceLabel: formatProcItemSourceLabel(def),
          sourceRarity: procSourceRarityForItem(def),
          itemDefId: def.id,
        })
      );
    }
  }

  const setList = Array.isArray(sets) ? sets : [];
  for (const setDef of setList) {
    if (!setDef || typeof setDef !== 'object') continue;
    const bonuses = Array.isArray(setDef.bonuses) ? setDef.bonuses : [];
    for (const bonus of bonuses) {
      const lines = flattenModifierLines(bonus?.modifiers);
      for (const line of lines) {
        const parsed = parseProcFromModifierLine(line);
        if (!parsed) continue;
        const skill = resolveProcSkill(parsed.skillName, resolveSkill);
        if (!skill) continue;
        rows.push(
          toProcRow(parsed, skill, {
            sourceKind: 'setBonus',
            sourceLabel: formatProcSetBonusSourceLabel(setDef, bonus.required),
            sourceRarity: 'set',
            setId: setDef.id,
            setRequired: bonus.required,
          })
        );
      }
    }
  }

  rows.sort((a, b) => {
    const bySkill = a.skillName.localeCompare(b.skillName, undefined, { sensitivity: 'base' });
    if (bySkill) return bySkill;
    const bySource = a.sourceLabel.localeCompare(b.sourceLabel, undefined, { sensitivity: 'base' });
    if (bySource) return bySource;
    if (a.level !== b.level) return a.level - b.level;
    return a.chance - b.chance;
  });
  return rows;
}

/**
 * Collapse procs that share skill, chance, level, and condition into one row
 * with stacked sources.
 * @param {ItemProcRow[]} rows
 * @returns {ItemProcRow[]}
 */
export function groupItemProcRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  /** @type {Map<string, ItemProcRow>} */
  const groups = new Map();
  for (const row of list) {
    if (!row) continue;
    const key = [
      row.skillId,
      row.level,
      row.chanceLabel,
      row.chanceMax,
      row.condition,
    ].join('|');
    let group = groups.get(key);
    if (!group) {
      group = {
        skillId: row.skillId,
        skillName: row.skillName,
        skillImage: row.skillImage,
        skillClass: row.skillClass,
        chance: row.chance,
        chanceMax: row.chanceMax,
        chanceLabel: row.chanceLabel,
        level: row.level,
        condition: row.condition,
        sourceLabel: row.sourceLabel,
        sourceKind: row.sourceKind,
        sourceRarity: row.sourceRarity,
        itemDefId: row.itemDefId,
        setId: row.setId,
        setRequired: row.setRequired,
        sources: [],
        rowKey: key,
      };
      groups.set(key, group);
    }
    const incoming = Array.isArray(row.sources) && row.sources.length ? row.sources : [row];
    for (const src of incoming) {
      group.sources.push({
        sourceLabel: src.sourceLabel,
        sourceKind: src.sourceKind,
        sourceRarity: String(src.sourceRarity || 'normal'),
        itemDefId: src.itemDefId,
        setId: src.setId,
        setRequired: src.setRequired,
      });
    }
  }

  const out = [...groups.values()];
  for (const group of out) {
    group.sources.sort((a, b) =>
      String(a.sourceLabel).localeCompare(String(b.sourceLabel), undefined, { sensitivity: 'base' })
    );
    const first = group.sources[0];
    group.sourceLabel = group.sources.map((src) => src.sourceLabel).join('\n');
    if (first) {
      group.sourceKind = first.sourceKind;
      group.sourceRarity = first.sourceRarity;
      group.itemDefId = first.itemDefId;
      group.setId = first.setId;
      group.setRequired = first.setRequired;
    }
  }
  out.sort((a, b) => {
    const bySkill = a.skillName.localeCompare(b.skillName, undefined, { sensitivity: 'base' });
    if (bySkill) return bySkill;
    if (a.level !== b.level) return a.level - b.level;
    if (a.chance !== b.chance) return a.chance - b.chance;
    return a.condition.localeCompare(b.condition, undefined, { sensitivity: 'base' });
  });
  return out;
}

/**
 * @param {ItemProcRow|null|undefined} row
 * @returns {ItemProcSource[]}
 */
export function procRowSources(row) {
  if (!row) return [];
  if (Array.isArray(row.sources) && row.sources.length) return row.sources;
  return [row];
}

/**
 * @param {import('@/stores/items.js').ItemDef[] | { catalog?: object[], sets?: object[], catalogLoaded?: boolean } | null | undefined} storeOrCatalog
 * @param {object[]} [sets]
 * @returns {ItemProcRow[]}
 */
export function getItemProcRows(storeOrCatalog, sets) {
  if (!storeOrCatalog) return [];
  if (Array.isArray(storeOrCatalog)) {
    return groupItemProcRows(collectItemProcs(storeOrCatalog, sets || []));
  }
  if (!storeOrCatalog.catalogLoaded && !Array.isArray(storeOrCatalog.catalog)) return [];
  return groupItemProcRows(collectItemProcs(storeOrCatalog.catalog || [], storeOrCatalog.sets || []));
}

/**
 * @param {string} skillId
 * @param {import('@/stores/items.js').ItemDef[] | { catalog?: object[], sets?: object[], catalogLoaded?: boolean } | null | undefined} storeOrCatalog
 * @param {object[]} [sets]
 * @returns {ItemProcRow[]}
 */
export function getProcSourcesForSkill(skillId, storeOrCatalog, sets) {
  const id = String(skillId || '');
  if (!id) return [];
  return getItemProcRows(storeOrCatalog, sets).filter((row) => row.skillId === id);
}
