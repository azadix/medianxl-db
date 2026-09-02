/**
 * @file Collect item-granted oSkill levels and format skill names in item text.
 * @module items/item-granted-oskills
 */

import { useItemsStore } from '@/stores/items.js';
import { getCharacterInstance } from '@/character/planner-instance.js';
import { resolveCatalogRowBySkillRef } from '@/character/planner-build-io.js';
import {
  getCharmAffixSources,
  resolveCharmAffixText,
  defaultCharmRollsForDef,
} from '@/items/charm-items.js';
import {
  getRelicStatLines,
  defaultRelicAffixRolls,
} from '@/items/relic-items.js';
import {
  parseSkillBonusFromModifierLine,
  isSkillOnCharacterTree,
} from '@/items/skill-bonus-from-modifiers.js';
import {
  escapeHtmlText,
  SCALING_DISPLAY_HTML_CLASSES,
} from '@/shared/utils.js';
import { lookupMergedDisplayNameByInternalName } from '@/shared/skill-data-store.js';

const CHARM_PREFIX_RE = /^\[(?:Upgrade|Trophy)\]\s*/i;

/**
 * @param {string} text
 * @returns {string}
 */
function stripCharmDisplayPrefix(text) {
  return String(text || '').replace(CHARM_PREFIX_RE, '').trim();
}

/**
 * @param {string} s
 * @returns {string}
 */
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Match a resolved modifier line to a catalog skill grant (generic or Class Only).
 * @param {string|null|undefined} line
 * @returns {{
 *   skillId: string,
 *   displayName: string,
 *   amount: number,
 *   skillClass: string,
 *   classOnly: boolean,
 * }|null}
 */
export function matchCatalogSkillGrantFromLine(line) {
  const body = stripCharmDisplayPrefix(line);
  if (!body) return null;
  const parsed = parseSkillBonusFromModifierLine(body);
  if (!parsed || parsed.kind !== 'skill') return null;
  const amount = Number(parsed.amount);
  if (!Number.isFinite(amount) || amount === 0) return null;
  const cat = resolveCatalogRowBySkillRef(parsed.skillName);
  if (!cat?.id) return null;
  const parentId = cat.parentSkillId != null ? String(cat.parentSkillId).trim() : '';
  if (parentId) return null;
  const displayName =
    cat.displayName != null && String(cat.displayName).trim() !== ''
      ? String(cat.displayName).trim()
      : String(parsed.skillName).trim();
  const skillClass = cat.class != null ? String(cat.class).trim() : '';
  return {
    skillId: String(cat.id),
    displayName,
    amount,
    skillClass,
    classOnly: Boolean(parsed.className),
  };
}

/**
 * Wrap catalog skill names in `[[internal_id]]` for later HTML expansion.
 * @param {string|null|undefined} line
 * @returns {string}
 */
export function wrapNamedSkillGrantMarkers(line) {
  const text = String(line ?? '');
  if (!text) return text;
  const prefixMatch = text.match(/^(\[(?:Upgrade|Trophy)\]\s*)(.*)$/i);
  const prefix = prefixMatch ? prefixMatch[1] : '';
  const body = prefixMatch ? prefixMatch[2] : text;
  const grant = matchCatalogSkillGrantFromLine(body);
  if (!grant) return text;
  const skillName = String(
    parseSkillBonusFromModifierLine(stripCharmDisplayPrefix(body))?.skillName || grant.displayName
  ).trim();
  if (!skillName) return text;
  const re = grant.classOnly
    ? new RegExp(`(\\s+to\\s+)${escapeRegExp(skillName)}(\\s+\\()`, 'i')
    : new RegExp(`(\\s+to\\s+)${escapeRegExp(skillName)}(\\s*)$`, 'i');
  return prefix + body.replace(re, `$1[[${grant.skillId}]]$2`);
}

/**
 * Escape a modifier line and expand `[[skill_id]]` to has-text-success spans.
 * @param {string|null|undefined} line
 * @returns {string}
 */
export function formatItemModifierLineHtml(line) {
  const marked = wrapNamedSkillGrantMarkers(line);
  let out = '';
  let cursor = 0;
  const re = /\[\[(.*?)\]\]/g;
  let match;
  while ((match = re.exec(marked)) !== null) {
    out += escapeHtmlText(marked.slice(cursor, match.index));
    const id = String(match[1] || '').trim();
    const display = lookupMergedDisplayNameByInternalName(id) || id;
    out += `<span class="${SCALING_DISPLAY_HTML_CLASSES.skill}">${escapeHtmlText(display)}</span>`;
    cursor = match.index + match[0].length;
  }
  out += escapeHtmlText(marked.slice(cursor));
  return out;
}

/**
 * Annotate affix display parts so skill names use kind 'skill'.
 * @param {Array<{ kind: string, text: string }>} parts
 * @returns {Array<{ kind: string, text: string }>}
 */
export function annotateAffixDisplayPartsWithSkills(parts) {
  if (!Array.isArray(parts) || !parts.length) return parts || [];
  const plain = parts.map((p) => String(p?.text ?? '')).join('');
  const grant = matchCatalogSkillGrantFromLine(plain);
  if (!grant) return parts;

  const displayName = grant.displayName;
  const lowerName = displayName.toLowerCase();
  /** @type {Array<{ kind: string, text: string }>} */
  const out = [];
  let replaced = false;

  for (const part of parts) {
    const kind = part?.kind || 'text';
    const text = String(part?.text ?? '');
    if (replaced || kind === 'value' || kind === 'skill') {
      out.push({ kind, text });
      continue;
    }
    const idx = text.toLowerCase().lastIndexOf(lowerName);
    if (idx < 0) {
      out.push({ kind, text });
      continue;
    }
    // Prefer a " to SkillName" occurrence.
    const before = text.slice(0, idx);
    const after = text.slice(idx + displayName.length);
    const looksLikeGrant =
      /\sto\s+$/i.test(before) || before.toLowerCase().endsWith('to ');
    if (!looksLikeGrant && idx !== 0) {
      out.push({ kind, text });
      continue;
    }
    if (before) out.push({ kind: 'text', text: before });
    out.push({ kind: 'skill', text: displayName });
    if (after) out.push({ kind: 'text', text: after });
    replaced = true;
  }
  return replaced ? out : parts;
}

/**
 * Sum generic (non-Class-Only) catalog skill grants from resolved lines.
 * Skips on-tree skills for the given character class.
 * @param {string[]} lines
 * @param {{ className?: string|null }} [ctx]
 * @returns {Record<string, number>} skillId -> amount
 */
export function collectOSkillGrantsFromModifierLines(lines, ctx = {}) {
  /** @type {Record<string, number>} */
  const out = {};
  const className = String(ctx.className || '').trim();
  for (const line of Array.isArray(lines) ? lines : []) {
    const grant = matchCatalogSkillGrantFromLine(line);
    if (!grant || grant.classOnly) continue;
    if (
      isSkillOnCharacterTree({
        className,
        skillClass: grant.skillClass,
        isOSkill: false,
      })
    ) {
      continue;
    }
    out[grant.skillId] = (out[grant.skillId] || 0) + grant.amount;
  }
  return out;
}

/**
 * @param {Array<{ def: object, rolls?: Record<string, number>|null }>} charms
 * @param {{ className?: string|null }} [ctx]
 * @returns {Record<string, number>}
 */
export function collectOSkillGrantsFromCharmDefs(charms, ctx = {}) {
  /** @type {Record<string, number>} */
  const out = {};
  const className = ctx.className ?? null;
  for (const entry of Array.isArray(charms) ? charms : []) {
    const def = entry?.def;
    if (!def) continue;
    const rolls =
      entry.rolls && typeof entry.rolls === 'object'
        ? entry.rolls
        : defaultCharmRollsForDef(def, className);
    /** @type {string[]} */
    const lines = [];
    for (const source of getCharmAffixSources(def, rolls, className, { activeOnly: true })) {
      const text = resolveCharmAffixText(source.text, source.sourceKey, rolls, false);
      if (text == null) continue;
      lines.push(text);
    }
    const grants = collectOSkillGrantsFromModifierLines(lines, { className });
    for (const [id, amount] of Object.entries(grants)) {
      out[id] = (out[id] || 0) + amount;
    }
  }
  return out;
}

/**
 * @param {Array<{ def: object, rolls?: Record<string, number>|null }>} relics
 * @param {{ className?: string|null }} [ctx]
 * @returns {Record<string, number>}
 */
export function collectOSkillGrantsFromRelicDefs(relics, ctx = {}) {
  /** @type {Record<string, number>} */
  const out = {};
  const className = ctx.className ?? null;
  for (const entry of Array.isArray(relics) ? relics : []) {
    const def = entry?.def;
    if (!def) continue;
    const rolls =
      entry.rolls && typeof entry.rolls === 'object'
        ? entry.rolls
        : defaultRelicAffixRolls(def);
    const lines = getRelicStatLines(def, rolls);
    const grants = collectOSkillGrantsFromModifierLines(lines, { className });
    for (const [id, amount] of Object.entries(grants)) {
      out[id] = (out[id] || 0) + amount;
    }
  }
  return out;
}

/**
 * Collect item-granted oSkill levels from enabled charms + relics in the store.
 * @param {{ className?: string|null }} [options]
 * @returns {Record<string, number>} skillId -> total item points
 */
export function collectEnabledItemOSkillGrants(options = {}) {
  let className = options.className != null ? String(options.className).trim() : '';
  try {
    if (!className) {
      const character = getCharacterInstance();
      className = character?.className != null ? String(character.className).trim() : '';
    }
    const itemsStore = useItemsStore();
    /** @type {Array<{ def: object, rolls?: Record<string, number>|null }>} */
    const charms = [];
    for (const [defId, instanceId] of Object.entries(itemsStore.enabledCharms || {})) {
      const def = itemsStore.catalogById?.[defId];
      if (!def) continue;
      const rolls = itemsStore.getRollsForInstance?.(instanceId) ?? null;
      charms.push({ def, rolls });
    }
    /** @type {Array<{ def: object, rolls?: Record<string, number>|null }>} */
    const relics = [];
    for (const [defId, instanceId] of Object.entries(itemsStore.enabledRelics || {})) {
      const def = itemsStore.catalogById?.[defId];
      if (!def) continue;
      const rolls = itemsStore.getRollsForInstance?.(instanceId) ?? null;
      relics.push({ def, rolls });
    }
    /** @type {Record<string, number>} */
    const out = {};
    for (const [id, amount] of Object.entries(
      collectOSkillGrantsFromCharmDefs(charms, { className })
    )) {
      out[id] = (out[id] || 0) + amount;
    }
    for (const [id, amount] of Object.entries(
      collectOSkillGrantsFromRelicDefs(relics, { className })
    )) {
      out[id] = (out[id] || 0) + amount;
    }
    return out;
  } catch {
    return {};
  }
}
