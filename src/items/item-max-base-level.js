/**
 * @file Parse and sum item "+N to Maximum Skill Base Level" modifiers.
 * @module items/item-max-base-level
 */

import { useItemsStore } from '@/stores/items.js';
import { getFileSkillStore } from '@/shared/skill-data-store.js';
import {
  applyResolvedRandomReanimates,
  isModifierLineActive,
  modifierLineText,
  decodeModifierLine,
  encodeModifierLine,
} from '@/items/item-modifier-line.js';
import { stripDisplayedRollRanges, applyAffixRolls, parseAffixRanges } from '@/items/affix-rolls.js';
import { EQUIPMENT_SLOTS } from '@/items/item-types.js';

/** Must match {@link overlayAffixRollKey} prefix in item-overlays (avoid import cycle). */
const EQUIP_AFFIX_ROLL_PREFIX = 'modAffix:';

const MAX_BASE_LEVEL_RE = /^([+-]?\d+(?:\.\d+)?)\s+to\s+Maximum\s+(.+?)\s+Base Level$/i;

/**
 * @typedef {{
 *   amount: number,
 *   skillName: string,
 * }} ParsedMaxBaseLevelBonus
 */

/**
 * @param {object|null|undefined} def
 * @param {Record<string, number>|null|undefined} rolls
 * @returns {string[]}
 */
function resolvedEquipmentModifierLines(def, rolls = null, extras = null) {
  /** @type {string[]} */
  const lines = [];
  if (!def || typeof def !== 'object') return lines;
  let i = 0;
  for (const mod of Array.isArray(def.modifiers) ? def.modifiers : []) {
    if (typeof mod !== 'string' || !mod.trim()) continue;
    const { text, color, showCondition } = decodeModifierLine(mod);
    if (!text) continue;
    const sourceKey = `base:m${i}`;
    let resolved = text;
    if (parseAffixRanges(text).length) {
      resolved = applyAffixRolls(
        text,
        rolls,
        (rangeIndex) => `${EQUIP_AFFIX_ROLL_PREFIX}${sourceKey}:r${rangeIndex}`,
        { hideRanges: false, showRollRanges: false }
      );
    }
    i += 1;
    if (resolved == null) continue;
    lines.push(encodeModifierLine(resolved, color, showCondition));
  }
  const merged = applyResolvedRandomReanimates(lines, extras);
  return [...merged.mods, ...merged.extras];
}

/**
 * @param {string|null|undefined} a
 * @param {string|null|undefined} b
 * @returns {boolean}
 */
function namesEqual(a, b) {
  const left = String(a || '').trim().toLowerCase();
  const right = String(b || '').trim().toLowerCase();
  return Boolean(left && right && left === right);
}

/**
 * Resolve skill name from a max-base-level mod to catalog id / display name.
 * @param {string} skillName
 * @returns {{ id: string, displayName: string }|null}
 */
function resolveSkillRef(skillName) {
  const name = String(skillName || '').trim();
  if (!name) return null;
  try {
    const store = getFileSkillStore();
    const catalog = store?.catalog;
    if (!catalog) return null;
    let row = catalog.find((c) => c.id === name);
    if (!row) row = catalog.find((c) => String(c.displayName ?? '') === name);
    if (!row) {
      const lower = name.toLowerCase();
      row = catalog.find((c) => String(c.displayName ?? '').toLowerCase() === lower) ?? null;
    }
    if (!row?.id) return null;
    const displayName =
      row.displayName != null && String(row.displayName).trim() !== ''
        ? String(row.displayName).trim()
        : String(row.id);
    return { id: String(row.id), displayName };
  } catch {
    return null;
  }
}

/**
 * @param {string|null|undefined} line
 * @returns {ParsedMaxBaseLevelBonus|null}
 */
export function parseMaxBaseLevelBonusFromModifierLine(line) {
  if (!isModifierLineActive(line)) return null;
  const text = stripDisplayedRollRanges(modifierLineText(line)).trim();
  if (!text) return null;
  const match = MAX_BASE_LEVEL_RE.exec(text);
  if (!match) return null;
  const amount = Number(match[1]);
  const skillName = String(match[2] || '')
    .trim()
    .replace(/^passive\s+/i, '')
    .trim();
  if (!Number.isFinite(amount) || amount === 0 || !skillName) return null;
  return { amount, skillName };
}

/**
 * Whether a modifier line is a "+N to Maximum Skill Base Level" affix.
 * @param {string|null|undefined} line
 * @returns {boolean}
 */
export function isMaxBaseLevelBonusModifierLine(line) {
  return parseMaxBaseLevelBonusFromModifierLine(line) != null;
}

/**
 * @param {string} skillId
 * @param {string} [displayName]
 * @returns {string}
 */
function resolveDisplayName(skillId, displayName) {
  const provided = String(displayName || '').trim();
  if (provided) return provided;
  const id = String(skillId || '').trim();
  if (!id) return '';
  try {
    const store = getFileSkillStore();
    return store?.lookupDisplayNameByInternalName?.(id) || id;
  } catch {
    return id;
  }
}

/**
 * Sum max-base-level bonuses from resolved modifier lines for one skill.
 * @param {string[]} lines
 * @param {{ skillId?: string, displayName?: string }} [ctx]
 * @returns {number}
 */
export function sumMaxBaseLevelBonusFromModifierLines(lines, ctx = {}) {
  const skillId = String(ctx.skillId || '').trim();
  const displayName = resolveDisplayName(skillId, ctx.displayName);
  if (!skillId && !displayName) return 0;

  let total = 0;
  for (const line of Array.isArray(lines) ? lines : []) {
    const parsed = parseMaxBaseLevelBonusFromModifierLine(line);
    if (!parsed) continue;
    const cat = resolveSkillRef(parsed.skillName);
    if (skillId && cat?.id && cat.id === skillId) {
      total += parsed.amount;
      continue;
    }
    const catDisplay = cat?.displayName || parsed.skillName;
    if (namesEqual(catDisplay, displayName) || namesEqual(parsed.skillName, displayName)) {
      total += parsed.amount;
    }
  }
  return total;
}

/**
 * Max base level bonus from equipped gear that meets requirements.
 * @param {{ skillId?: string, displayName?: string }} [options]
 * @returns {number}
 */
export function getEquippedMaxBaseLevelBonusForSkill(options = {}) {
  try {
    const skillId = String(options.skillId || '').trim();
    const displayName = resolveDisplayName(skillId, options.displayName);
    if (!skillId && !displayName) return 0;

    const itemsStore = useItemsStore();
    /** @type {string[]} */
    const lines = [];
    for (const slot of EQUIPMENT_SLOTS) {
      if (!itemsStore.equipmentSlotContributesBonuses?.(slot)) continue;
      const instanceId = itemsStore.equipment?.[slot];
      if (instanceId == null) continue;
      const def = itemsStore.getDefForInstance?.(instanceId);
      if (!def) continue;
      const rolls = itemsStore.getRollsForInstance?.(instanceId) ?? null;
      const extras = itemsStore.getExtrasForInstance?.(instanceId) ?? [];
      lines.push(...resolvedEquipmentModifierLines(def, rolls, extras));
    }

    return sumMaxBaseLevelBonusFromModifierLines(lines, { skillId, displayName });
  } catch {
    return 0;
  }
}
