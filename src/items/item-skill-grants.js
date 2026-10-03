/**
 * @file Parse item "+X to Skill" modifier lines and index them by skill.
 * @module items/item-skill-grants
 */

import { decodeModifierLine } from '@/items/item-modifier-line.js';
import { resolveCatalogRowBySkillRef } from '@/character/planner-build-io.js';
import {
  flattenModifierLines,
  formatProcItemSourceLabel,
  formatProcSetBonusSourceLabel,
  procSourceRarityForItem,
  stripProcLinePrefix,
} from '@/items/item-procs.js';

const GRANT_LINE_RE =
  /^\+?(?:(\d+(?:\.\d+)?)|\((\d+)\s+to\s+(\d+)\))\s+to\s+(.+)$/i;
const CLASS_ONLY_REST_RE = /^(.*?)\s+\((.+?)\s+Only\)$/i;

/**
 * @typedef {{
 *   amount: number,
 *   amountMax: number,
 *   amountLabel: string,
 *   skillName: string,
 *   classOnly: boolean,
 *   className: string,
 * }} ParsedSkillGrant
 *
 * @typedef {{
 *   skillId: string,
 *   skillName: string,
 *   amount: number,
 *   amountMax: number,
 *   amountLabel: string,
 *   classOnly: boolean,
 *   className: string,
 *   restrictionLabel: string,
 *   sourceLabel: string,
 *   sourceKind: 'item'|'setBonus',
 *   sourceRarity: string,
 *   itemDefId?: string,
 *   setId?: string,
 *   setRequired?: number|string,
 *   sources: import('@/items/item-procs.js').ItemProcSource[],
 *   rowKey: string,
 * }} ItemSkillGrantRow
 */

/**
 * @param {string|null|undefined} rest
 * @returns {boolean}
 */
function isNonSkillGrantRest(rest) {
  const text = String(rest || '').trim();
  if (!text) return true;
  if (/^All Skills\b/i.test(text)) return true;
  if (/\bSkill Levels$/i.test(text)) return true;
  if (/\bwhen\b/i.test(text)) return true;
  return false;
}

/**
 * Parse a catalog modifier line into a named +skill grant.
 * @param {string|null|undefined} line
 * @returns {ParsedSkillGrant|null}
 */
export function parseSkillGrantFromModifierLine(line) {
  const decoded = decodeModifierLine(line);
  if (decoded.color === 'grey') return null;
  const text = stripProcLinePrefix(decoded.text);
  if (!text) return null;
  const match = GRANT_LINE_RE.exec(text);
  if (!match) return null;

  const rest = String(match[4] || '').trim();
  if (isNonSkillGrantRest(rest)) return null;

  const classOnlyMatch = CLASS_ONLY_REST_RE.exec(rest);
  const skillName = classOnlyMatch ? String(classOnlyMatch[1] || '').trim() : rest;
  const className = classOnlyMatch ? String(classOnlyMatch[2] || '').trim() : '';
  if (!skillName) return null;

  const fixed = match[1] != null ? Number(match[1]) : null;
  const rangeMin = match[2] != null ? Number(match[2]) : null;
  const rangeMax = match[3] != null ? Number(match[3]) : null;
  const amount = Number.isFinite(fixed) ? fixed : rangeMin;
  const amountMax = Number.isFinite(rangeMax) ? rangeMax : amount;
  if (!Number.isFinite(amount) || !Number.isFinite(amountMax)) return null;
  if (amount === 0 && amountMax === 0) return null;

  const amountLabel =
    Number.isFinite(fixed) || amount === amountMax ? `+${amount}` : `+(${amount} to ${amountMax})`;

  return {
    amount,
    amountMax,
    amountLabel,
    skillName,
    classOnly: Boolean(className),
    className,
  };
}

/**
 * @param {string} skillName
 * @param {(ref: string) => { id?: string, displayName?: string, parentSkillId?: string|null }|null} resolveSkill
 * @returns {{ skillId: string, skillName: string }|null}
 */
function resolveGrantSkill(skillName, resolveSkill) {
  const row = resolveSkill(skillName);
  if (!row?.id) return null;
  const parentId = row.parentSkillId != null ? String(row.parentSkillId).trim() : '';
  if (parentId) return null;
  const display = String(row.displayName || skillName).trim() || skillName;
  return { skillId: String(row.id), skillName: display };
}

/**
 * @param {ParsedSkillGrant} parsed
 * @param {{ skillId: string, skillName: string }} skill
 * @param {object} source
 * @returns {ItemSkillGrantRow}
 */
function toGrantRow(parsed, skill, source) {
  const itemDefId = source.itemDefId != null ? String(source.itemDefId) : '';
  const setId = source.setId != null ? String(source.setId) : '';
  const setRequired = source.setRequired != null ? String(source.setRequired) : '';
  const restrictionLabel = parsed.classOnly && parsed.className ? `${parsed.className} Only` : '';
  const rowKey = [
    skill.skillId,
    parsed.amountLabel,
    parsed.amountMax,
    restrictionLabel,
    source.sourceKind,
    itemDefId,
    setId,
    setRequired,
  ].join('|');
  return {
    skillId: skill.skillId,
    skillName: skill.skillName,
    amount: parsed.amount,
    amountMax: parsed.amountMax,
    amountLabel: parsed.amountLabel,
    classOnly: parsed.classOnly,
    className: parsed.className,
    restrictionLabel,
    sourceLabel: source.sourceLabel,
    sourceKind: source.sourceKind,
    sourceRarity: String(source.sourceRarity || 'normal'),
    itemDefId: itemDefId || undefined,
    setId: setId || undefined,
    setRequired: source.setRequired,
    sources: [],
    rowKey,
  };
}

/**
 * @param {object[]} catalog
 * @param {Array<{ id?: string, name?: string, bonuses?: Array<{ required?: number|string, modifiers?: unknown }> }>} [sets]
 * @param {(ref: string) => { id?: string, displayName?: string }|null} [resolveSkill]
 * @returns {ItemSkillGrantRow[]}
 */
export function collectItemSkillGrants(catalog, sets = [], resolveSkill = resolveCatalogRowBySkillRef) {
  /** @type {ItemSkillGrantRow[]} */
  const rows = [];
  const list = Array.isArray(catalog) ? catalog : [];
  for (const def of list) {
    if (!def || typeof def !== 'object') continue;
    const lines = flattenModifierLines(def.modifiers);
    for (const line of lines) {
      const parsed = parseSkillGrantFromModifierLine(line);
      if (!parsed) continue;
      const skill = resolveGrantSkill(parsed.skillName, resolveSkill);
      if (!skill) continue;
      rows.push(
        toGrantRow(parsed, skill, {
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
        const parsed = parseSkillGrantFromModifierLine(line);
        if (!parsed) continue;
        const skill = resolveGrantSkill(parsed.skillName, resolveSkill);
        if (!skill) continue;
        rows.push(
          toGrantRow(parsed, skill, {
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
    if (a.amount !== b.amount) return a.amount - b.amount;
    if (a.amountMax !== b.amountMax) return a.amountMax - b.amountMax;
    return a.sourceLabel.localeCompare(b.sourceLabel, undefined, { sensitivity: 'base' });
  });
  return rows;
}

/**
 * Collapse grants that share skill, amount, and restriction into one row
 * with stacked sources.
 * @param {ItemSkillGrantRow[]} rows
 * @returns {ItemSkillGrantRow[]}
 */
export function groupItemSkillGrantRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  /** @type {Map<string, ItemSkillGrantRow>} */
  const groups = new Map();
  for (const row of list) {
    if (!row) continue;
    const key = [row.skillId, row.amountLabel, row.amountMax, row.restrictionLabel].join('|');
    let group = groups.get(key);
    if (!group) {
      group = {
        skillId: row.skillId,
        skillName: row.skillName,
        amount: row.amount,
        amountMax: row.amountMax,
        amountLabel: row.amountLabel,
        classOnly: row.classOnly,
        className: row.className,
        restrictionLabel: row.restrictionLabel,
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
    if (a.amount !== b.amount) return a.amount - b.amount;
    if (a.amountMax !== b.amountMax) return a.amountMax - b.amountMax;
    return String(a.restrictionLabel).localeCompare(String(b.restrictionLabel), undefined, {
      sensitivity: 'base',
    });
  });
  return out;
}

/**
 * @param {import('@/stores/items.js').ItemDef[] | { catalog?: object[], sets?: object[], catalogLoaded?: boolean } | null | undefined} storeOrCatalog
 * @param {object[]} [sets]
 * @returns {ItemSkillGrantRow[]}
 */
export function getItemSkillGrantRows(storeOrCatalog, sets) {
  if (!storeOrCatalog) return [];
  if (Array.isArray(storeOrCatalog)) {
    return groupItemSkillGrantRows(collectItemSkillGrants(storeOrCatalog, sets || []));
  }
  if (!storeOrCatalog.catalogLoaded && !Array.isArray(storeOrCatalog.catalog)) return [];
  return groupItemSkillGrantRows(
    collectItemSkillGrants(storeOrCatalog.catalog || [], storeOrCatalog.sets || [])
  );
}

/**
 * @param {string} skillId
 * @param {import('@/stores/items.js').ItemDef[] | { catalog?: object[], sets?: object[], catalogLoaded?: boolean } | null | undefined} storeOrCatalog
 * @param {object[]} [sets]
 * @returns {ItemSkillGrantRow[]}
 */
export function getSkillGrantSourcesForSkill(skillId, storeOrCatalog, sets) {
  const id = String(skillId || '');
  if (!id) return [];
  return getItemSkillGrantRows(storeOrCatalog, sets).filter((row) => row.skillId === id);
}
