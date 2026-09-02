/**
 * @file Parse item/relic modifier lines into skill-level bonuses.
 * @module items/skill-bonus-from-modifiers
 */

import { useItemsStore } from '@/stores/items.js';
import { getCharacterInstance } from '@/character/planner-instance.js';
import { getFileSkillStore } from '@/shared/skill-data-store.js';
import {
  defaultRelicAffixRolls,
  getRelicStatLines,
  isRelicBonusActive,
} from '@/items/relic-items.js';

/**
 * Soft levels when a relic's generic `+# to Skill` applies to a skill already
 * on the character's class tree (no matching Class Only line).
 */
export const RELIC_ON_TREE_SKILL_BONUS = 3;

/**
 * @typedef {'all'|'class'|'skill'} SkillBonusKind
 * @typedef {{
 *   kind: SkillBonusKind,
 *   amount: number,
 *   skillName?: string,
 *   className?: string,
 * }} ParsedSkillBonus
 *
 * @typedef {{
 *   displayName?: string,
 *   isOSkill?: boolean,
 *   className?: string,
 *   skillClass?: string,
 * }} SkillBonusContext
 */

const ALL_SKILLS_RE = /^([+-]?\d+(?:\.\d+)?)\s+to\s+All Skills$/i;
const CLASS_SKILLS_RE = /^([+-]?\d+(?:\.\d+)?)\s+to\s+(.+?)\s+Skill Levels$/i;
const CLASS_ONLY_SKILL_RE = /^([+-]?\d+(?:\.\d+)?)\s+to\s+(.+?)\s+\((.+?)\s+Only\)$/i;
const GENERIC_TO_RE = /^([+-]?\d+(?:\.\d+)?)\s+to\s+(.+)$/i;

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
 * Skill is on the current character's class tree (not taken as an oSkill).
 * @param {SkillBonusContext} ctx
 * @returns {boolean}
 */
export function isSkillOnCharacterTree(ctx = {}) {
  if (ctx.isOSkill) return false;
  const className = String(ctx.className || '').trim();
  const skillClass = String(ctx.skillClass || '').trim();
  if (!className || !skillClass) return false;
  return namesEqual(skillClass, className);
}

/**
 * Parse a single resolved modifier line (ranges already rolled).
 * @param {string|null|undefined} line
 * @returns {ParsedSkillBonus|null}
 */
export function parseSkillBonusFromModifierLine(line) {
  const text = String(line || '').trim();
  if (!text) return null;

  let match = ALL_SKILLS_RE.exec(text);
  if (match) {
    const amount = Number(match[1]);
    if (!Number.isFinite(amount)) return null;
    return { kind: 'all', amount };
  }

  match = CLASS_SKILLS_RE.exec(text);
  if (match) {
    const amount = Number(match[1]);
    const className = String(match[2] || '').trim();
    if (!Number.isFinite(amount) || !className) return null;
    return { kind: 'class', amount, className };
  }

  match = CLASS_ONLY_SKILL_RE.exec(text);
  if (match) {
    const amount = Number(match[1]);
    const skillName = String(match[2] || '').trim();
    const className = String(match[3] || '').trim();
    if (!Number.isFinite(amount) || !skillName || !className) return null;
    return { kind: 'skill', amount, skillName, className };
  }

  match = GENERIC_TO_RE.exec(text);
  if (match) {
    const amount = Number(match[1]);
    const skillName = String(match[2] || '').trim();
    if (!Number.isFinite(amount) || !skillName) return null;
    if (/^All Skills\b/i.test(skillName) || /\bwhen\b/i.test(skillName)) return null;
    return { kind: 'skill', amount, skillName };
  }

  return null;
}

/**
 * Per-line helper kept for tests; prefer {@link sumSkillBonusFromModifierLines}
 * so Class Only / generic interactions are correct.
 * @param {ParsedSkillBonus} parsed
 * @param {SkillBonusContext} ctx
 * @returns {number}
 */
export function skillBonusAmountForContext(parsed, ctx = {}) {
  if (!parsed || typeof parsed !== 'object') return 0;
  const amount = Number(parsed.amount);
  if (!Number.isFinite(amount)) return 0;

  const displayName = String(ctx.displayName || '').trim();
  const className = String(ctx.className || '').trim();
  const isOSkill = Boolean(ctx.isOSkill);
  const onTree = isSkillOnCharacterTree(ctx);

  if (parsed.kind === 'all') {
    return amount === 0 ? 0 : amount;
  }

  if (parsed.kind === 'class') {
    if (isOSkill) return 0;
    if (!namesEqual(parsed.className, className)) return 0;
    return amount === 0 ? 0 : amount;
  }

  if (parsed.kind === 'skill') {
    if (!namesEqual(parsed.skillName, displayName)) return 0;
    if (parsed.className) {
      if (!namesEqual(parsed.className, className)) return 0;
      return amount === 0 ? 0 : amount;
    }
    // Generic per-skill grants become oSkill itemPoints (slvl) when off-tree; do not soft-stack.
    if (isOSkill) return 0;
    // Generic alone: +3 on-tree.
    if (onTree) return RELIC_ON_TREE_SKILL_BONUS;
    return amount === 0 ? 0 : amount;
  }

  return 0;
}

/**
 * Sum skill bonuses from resolved modifier lines for one skill context.
 *
 * Rules for per-skill lines targeting this skill:
 * - Matching Class Only → that value only (generic line ignored).
 * - Generic only + skill on character tree → +3.
 * - Generic only + skill not on tree → rolled amount (tree soft path only).
 * - Generic + oSkill context → 0 (grant is oSkill itemPoints / slvl, not extra relic soft).
 *
 * @param {string[]} lines
 * @param {SkillBonusContext} ctx
 * @returns {number}
 */
export function sumSkillBonusFromModifierLines(lines, ctx = {}) {
  const displayName = String(ctx.displayName || '').trim();
  const className = String(ctx.className || '').trim();
  const isOSkill = Boolean(ctx.isOSkill);
  const onTree = isSkillOnCharacterTree(ctx);

  let total = 0;
  let classOnlySum = 0;
  let hasClassOnlyMatch = false;
  let genericSum = 0;
  let hasGeneric = false;

  for (const line of Array.isArray(lines) ? lines : []) {
    const parsed = parseSkillBonusFromModifierLine(line);
    if (!parsed) continue;

    if (parsed.kind === 'all') {
      const amount = Number(parsed.amount);
      if (Number.isFinite(amount) && amount !== 0) total += amount;
      continue;
    }

    if (parsed.kind === 'class') {
      if (isOSkill) continue;
      if (!namesEqual(parsed.className, className)) continue;
      const amount = Number(parsed.amount);
      if (Number.isFinite(amount) && amount !== 0) total += amount;
      continue;
    }

    if (parsed.kind === 'skill') {
      if (!namesEqual(parsed.skillName, displayName)) continue;
      const amount = Number(parsed.amount);
      if (!Number.isFinite(amount)) continue;
      if (parsed.className) {
        if (!namesEqual(parsed.className, className)) continue;
        hasClassOnlyMatch = true;
        classOnlySum += amount;
        continue;
      }
      // Off-tree generic grants sync into oSkill itemPoints (slvl); skip relic soft double-count.
      if (isOSkill) continue;
      hasGeneric = true;
      genericSum += amount;
    }
  }

  if (hasClassOnlyMatch) {
    // Class Only replaces the on-tree +3 / generic roll for this skill.
    total += classOnlySum;
  } else if (hasGeneric) {
    total += onTree ? RELIC_ON_TREE_SKILL_BONUS : genericSum;
  }

  return total;
}

/**
 * Sum skill bonuses from relic defs + rolls (no Pinia).
 * @param {Array<{ def: object, rolls?: Record<string, number>|null }>} relics
 * @param {SkillBonusContext & {
 *   characterLevel?: number|null,
 *   requireLevel?: boolean,
 * }} ctx
 * @returns {number}
 */
export function sumRelicSkillBonusFromDefs(relics, ctx = {}) {
  let total = 0;
  const characterLevel = ctx.characterLevel;
  const requireLevel = ctx.requireLevel !== false;
  for (const entry of Array.isArray(relics) ? relics : []) {
    const def = entry?.def;
    if (!def) continue;
    if (requireLevel && !isRelicBonusActive(def, characterLevel, { inInventory: true })) {
      continue;
    }
    const rolls =
      entry.rolls && typeof entry.rolls === 'object'
        ? entry.rolls
        : defaultRelicAffixRolls(def);
    const lines = getRelicStatLines(def, rolls);
    total += sumSkillBonusFromModifierLines(lines, ctx);
  }
  return total;
}

/**
 * @param {string} skillId
 * @param {string} displayName
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
 * @param {string} skillId
 * @param {string} skillClass
 * @returns {string}
 */
function resolveSkillClass(skillId, skillClass) {
  const provided = String(skillClass || '').trim();
  if (provided) return provided;
  const id = String(skillId || '').trim();
  if (!id) return '';
  try {
    const store = getFileSkillStore();
    const detail = store?.getSkillDetail?.(id);
    const fromDetail = detail?.class != null ? String(detail.class).trim() : '';
    if (fromDetail) return fromDetail;
    const row = store?.catalogByInternalId?.get?.(id);
    return row?.class != null ? String(row.class).trim() : '';
  } catch {
    return '';
  }
}

/**
 * Relic skill-level bonus for one skill from enabled planner relics.
 * Overview all/class inputs are separate — do not include them here.
 *
 * Enabled relics always count for planner soft levels (reqLevel is shown on the
 * item, but does not zero the Alt sources / effective level while building).
 *
 * // TODO: Items — sum +skills from equipped gear
 *
 * @param {{
 *   skillId?: string,
 *   displayName?: string,
 *   isOSkill?: boolean,
 *   className?: string,
 *   skillClass?: string,
 * }} [options]
 * @returns {number}
 */
export function getRelicSkillBonusForSkill(options = {}) {
  const skillId = String(options.skillId || '').trim();
  const displayName = resolveDisplayName(skillId, options.displayName);
  const skillClass = resolveSkillClass(skillId, options.skillClass);
  const isOSkill = Boolean(options.isOSkill);
  let className = String(options.className || '').trim();

  try {
    const character = getCharacterInstance();
    if (!className) {
      className = character?.className != null ? String(character.className).trim() : '';
    }

    // TODO: Items — sum +skills from equipped gear

    const itemsStore = useItemsStore();
    /** @type {Array<{ def: object, rolls?: Record<string, number>|null }>} */
    const relics = [];
    for (const [defId, instanceId] of Object.entries(itemsStore.enabledRelics || {})) {
      const def = itemsStore.catalogById?.[defId];
      if (!def) continue;
      const rolls = itemsStore.getRollsForInstance?.(instanceId) ?? null;
      relics.push({ def, rolls });
    }

    return sumRelicSkillBonusFromDefs(relics, {
      displayName,
      skillClass,
      isOSkill,
      className,
      requireLevel: false,
    });
  } catch {
    return 0;
  }
}
