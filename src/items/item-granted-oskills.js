/**
 * @file Collect item-granted oSkill levels and format skill names in item text.
 * @module items/item-granted-oskills
 */

import { useItemsStore } from '@/stores/items.js';
import { getCharacterInstance } from '@/character/planner-instance.js';
import { resolveCatalogRowBySkillRef } from '@/character/planner-build-io.js';
import {
  getCharmAffixSources,
  isCharmBonusActive,
  resolveCharmAffixText,
  defaultCharmRollsForDef,
} from '@/items/charm-items.js';
import {
  getRelicStatLines,
  isRelicBonusActive,
  defaultRelicAffixRolls,
} from '@/items/relic-items.js';
import {
  parseSkillBonusFromModifierLine,
  isSkillOnCharacterTree,
  sumSkillBonusFromModifierLines,
} from '@/items/skill-bonus-from-modifiers.js';
import { parseMaxBaseLevelBonusFromModifierLine } from '@/items/item-max-base-level.js';
import { parseProcFromModifierLine } from '@/items/item-procs.js';
import {
  applyResolvedRandomReanimates,
  decodeModifierLine,
  encodeModifierLine,
  isModifierLineActive,
  modifierLineText,
} from '@/items/item-modifier-line.js';
import {
  applyAffixRolls,
  parseAffixRanges,
  stripDisplayedRollRanges,
} from '@/items/affix-rolls.js';
import { EQUIPMENT_SLOTS } from '@/items/item-types.js';
import { countEquippedSetPieces, resolveSetBonuses } from '@/items/item-overlays.js';
import { escapeHtmlText, SCALING_DISPLAY_HTML_CLASSES } from '@/shared/utils.js';
import { lookupMergedDisplayNameByInternalName } from '@/shared/skill-data-store.js';
import {
  parseNestedSkillMarker,
  wrapNestedSkillTooltipHtml,
} from '@/shared/tooltip-html.js';

/** Must match {@link overlayAffixRollKey} prefix in item-overlays (avoid import cycle). */
const EQUIP_AFFIX_ROLL_PREFIX = 'modAffix:';

/**
 * Resolve equipped unique/runeword modifier strings (incl. orange) without item-stats cycle.
 * @param {object|null|undefined} def
 * @param {Record<string, number>|null|undefined} rolls
 * @param {string[]|null|undefined} [extras]
 * @returns {string[]}
 */
export function resolvedEquipmentModifierLines(def, rolls = null, extras = null) {
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

const DISPLAYED_ROLL_RANGE_RE = / \[(-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)\]/g;

const CHARM_PREFIX_RE = /^\[(?:Upgrade|Trophy)\]\s*/i;
const CHARGED_SKILL_RE = /^Level\s+(\d+)\s+(.+?)\s+\((\d+)\s*\/\s*(\d+)\s+Charges\)$/i;
const LEVEL_SKILL_GRANT_RE = /^Level\s+(\d+)\s+(.+)$/i;

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
 * @param {object|null|undefined} cat
 * @param {string} fallbackName
 * @returns {{ skillId: string, displayName: string, skillClass: string }|null}
 */
function catalogSkillFromRow(cat, fallbackName) {
  if (!cat?.id) return null;
  const parentId = cat.parentSkillId != null ? String(cat.parentSkillId).trim() : '';
  if (parentId) return null;
  const displayName =
    cat.displayName != null && String(cat.displayName).trim() !== ''
      ? String(cat.displayName).trim()
      : String(fallbackName || '').trim();
  if (!displayName) return null;
  return {
    skillId: String(cat.id),
    displayName,
    skillClass: cat.class != null ? String(cat.class).trim() : '',
  };
}

/**
 * Always-on item grants (`Level 1 Eagle Stance`) prefer `passive X` catalog clones.
 * @param {string} skillName
 * @param {{ preferPassive?: boolean }} [opts]
 * @returns {object|null}
 */
function resolveGrantCatalogRow(skillName, opts = {}) {
  const raw = String(skillName || '').trim();
  if (!raw) return null;
  if (opts.preferPassive) {
    const passiveKey = /^passive\s+/i.test(raw) ? raw : `passive ${raw}`;
    const passive = resolveCatalogRowBySkillRef(passiveKey);
    if (passive) return passive;
  }
  return resolveCatalogRowBySkillRef(raw);
}

/**
 * Match `Level X SkillName (Y/Z Charges)` to a catalog skill.
 * Charge counts are ignored until the charge system is implemented.
 * @param {string|null|undefined} line
 * @returns {{
 *   skillId: string,
 *   displayName: string,
 *   amount: number,
 *   skillClass: string,
 *   classOnly: boolean,
 *   skillNameInLine: string,
 * }|null}
 */
export function matchCatalogChargedSkillFromLine(line) {
  if (!isModifierLineActive(line)) return null;
  const body = stripDisplayedRollRanges(
    stripCharmDisplayPrefix(modifierLineText(line))
  ).trim();
  if (!body) return null;
  const match = CHARGED_SKILL_RE.exec(body);
  if (!match) return null;
  const amount = Number(match[1]);
  const skillNameInLine = String(match[2] || '').trim();
  if (!Number.isFinite(amount) || amount <= 0 || !skillNameInLine) return null;
  const cat = resolveGrantCatalogRow(skillNameInLine);
  const resolved = catalogSkillFromRow(cat, skillNameInLine);
  if (!resolved) return null;
  return {
    ...resolved,
    amount,
    classOnly: false,
    skillNameInLine,
  };
}

/**
 * Match `Level X SkillName` (no charges) to a catalog skill, preferring passive clones.
 * @param {string|null|undefined} line
 * @returns {{
 *   skillId: string,
 *   displayName: string,
 *   amount: number,
 *   skillClass: string,
 *   classOnly: boolean,
 *   skillNameInLine: string,
 * }|null}
 */
export function matchCatalogLevelSkillGrantFromLine(line) {
  if (!isModifierLineActive(line)) return null;
  const body = stripDisplayedRollRanges(
    stripCharmDisplayPrefix(modifierLineText(line))
  ).trim();
  if (!body) return null;
  if (CHARGED_SKILL_RE.test(body)) return null;
  const match = LEVEL_SKILL_GRANT_RE.exec(body);
  if (!match) return null;
  const amount = Number(match[1]);
  const skillNameInLine = String(match[2] || '').trim();
  if (!Number.isFinite(amount) || amount <= 0 || !skillNameInLine) return null;
  const cat = resolveGrantCatalogRow(skillNameInLine, { preferPassive: true });
  const resolved = catalogSkillFromRow(cat, skillNameInLine);
  if (!resolved) return null;
  return {
    ...resolved,
    amount,
    classOnly: false,
    skillNameInLine,
  };
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
  const body = stripDisplayedRollRanges(stripCharmDisplayPrefix(line));
  if (!body) return null;
  const parsed = parseSkillBonusFromModifierLine(body);
  if (!parsed || parsed.kind !== 'skill') return null;
  const amount = Number(parsed.amount);
  if (!Number.isFinite(amount) || amount === 0) return null;
  const cat = resolveGrantCatalogRow(parsed.skillName);
  const resolved = catalogSkillFromRow(cat, parsed.skillName);
  if (!resolved) return null;
  return {
    ...resolved,
    amount,
    classOnly: Boolean(parsed.className),
    skillNameInLine: parsed.skillName,
  };
}

/**
 * Charged, +N to skill, or Level N skill grant.
 * @param {string|null|undefined} line
 * @returns {ReturnType<typeof matchCatalogSkillGrantFromLine>|ReturnType<typeof matchCatalogChargedSkillFromLine>|ReturnType<typeof matchCatalogLevelSkillGrantFromLine>}
 */
export function matchAnyCatalogSkillGrantFromLine(line) {
  return (
    matchCatalogChargedSkillFromLine(line) ||
    matchCatalogSkillGrantFromLine(line) ||
    matchCatalogLevelSkillGrantFromLine(line)
  );
}

/**
 * Match a chance-to-cast line to a catalog skill for green name markup.
 * @param {string|null|undefined} line
 * @returns {{ skillId: string, displayName: string, skillNameInLine: string, level: number }|null}
 */
export function matchCatalogProcSkillFromLine(line) {
  const parsed = parseProcFromModifierLine(line);
  if (!parsed?.skillName) return null;
  const cat = resolveCatalogRowBySkillRef(parsed.skillName);
  if (!cat?.id) return null;
  const displayName =
    cat.displayName != null && String(cat.displayName).trim() !== ''
      ? String(cat.displayName).trim()
      : String(parsed.skillName).trim();
  const level = Math.floor(Number(parsed.level));
  return {
    skillId: String(cat.id),
    displayName,
    skillNameInLine: String(parsed.skillName).trim(),
    level: Number.isFinite(level) && level > 0 ? level : 1,
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
  const charged = matchCatalogChargedSkillFromLine(body);
  if (charged) {
    const skillName = charged.skillNameInLine || charged.displayName;
    if (skillName) {
      const marker =
        Number.isFinite(charged.amount) && charged.amount > 0
          ? `${charged.skillId}:${Math.floor(charged.amount)}`
          : charged.skillId;
      const re = new RegExp(
        `(Level\\s+\\d+\\s+)${escapeRegExp(skillName)}(\\s+\\()`,
        'i'
      );
      const replaced = body.replace(re, `$1[[${marker}]]$2`);
      if (replaced !== body) return prefix + replaced;
    }
  }

  const levelGrant = matchCatalogLevelSkillGrantFromLine(body);
  if (levelGrant) {
    const skillName = levelGrant.skillNameInLine || levelGrant.displayName;
    if (skillName) {
      const marker =
        Number.isFinite(levelGrant.amount) && levelGrant.amount > 0
          ? `${levelGrant.skillId}:${Math.floor(levelGrant.amount)}`
          : levelGrant.skillId;
      const re = new RegExp(
        `(Level\\s+\\d+\\s+)${escapeRegExp(skillName)}(\\s*)$`,
        'i'
      );
      const replaced = body.replace(re, `$1[[${marker}]]$2`);
      if (replaced !== body) return prefix + replaced;
    }
  }

  const grant = matchCatalogSkillGrantFromLine(body);
  if (grant) {
    const skillName = String(grant.skillNameInLine || grant.displayName || '').trim();
    if (!skillName) return text;
    const marker =
      Number.isFinite(grant.amount) && grant.amount > 0
        ? `${grant.skillId}:${Math.floor(grant.amount)}`
        : grant.skillId;
    const re = grant.classOnly
      ? new RegExp(
          `(\\s+to\\s+)${escapeRegExp(skillName)}(\\s+\\()`,
          'i'
        )
      : new RegExp(
          `(\\s+to\\s+)${escapeRegExp(skillName)}(\\s*)$`,
          'i'
        );
    return prefix + body.replace(re, `$1[[${marker}]]$2`);
  }

  const maxBase = parseMaxBaseLevelBonusFromModifierLine(body);
  if (maxBase) {
    const cat = resolveCatalogRowBySkillRef(maxBase.skillName);
    if (cat?.id) {
      const skillName =
        cat.displayName != null && String(cat.displayName).trim() !== ''
          ? String(cat.displayName).trim()
          : String(maxBase.skillName).trim();
      if (skillName) {
        const re = new RegExp(
          `(Maximum\\s+)${escapeRegExp(skillName)}(\\s+Base Level)`,
          'i'
        );
        const replaced = body.replace(re, `$1[[${cat.id}]]$2`);
        if (replaced !== body) return prefix + replaced;
      }
    }
  }

  const proc = matchCatalogProcSkillFromLine(prefix + body);
  if (!proc) return text;
  const skillName = proc.skillNameInLine || proc.displayName;
  if (!skillName) return text;
  const marker =
    Number.isFinite(proc.level) && proc.level > 0
      ? `${proc.skillId}:${Math.floor(proc.level)}:proc`
      : `${proc.skillId}:proc`;
  const re = new RegExp(
    `(level\\s+\\d+\\s+)${escapeRegExp(skillName)}(\\s+(?:on|when)\\s+)`,
    'i'
  );
  const replaced = body.replace(re, `$1[[${marker}]]$2`);
  if (replaced === body) return text;
  return prefix + replaced;
}

/**
 * Escape a modifier line and expand `[[skill_id]]` to has-text-success spans.
 * Roll suffixes like ` [10-20]` use `.item-mod-roll-range` (desaturated info).
 * @param {string|null|undefined} line
 * @returns {string}
 */
export function formatItemModifierLineHtml(line) {
  const decoded = decodeModifierLine(line);
  const text = decoded.text;
  const added = decoded.color === 'added';
  /** @type {string[]} */
  const rollRanges = [];
  const withoutRollRanges = String(text ?? '').replace(DISPLAYED_ROLL_RANGE_RE, (_, min, max) => {
    rollRanges.push(`[${min}-${max}]`);
    return '';
  });
  const marked = wrapNamedSkillGrantMarkers(withoutRollRanges);
  let out = '';
  let cursor = 0;
  const re = /\[\[(.*?)\]\]/g;
  let match;
  while ((match = re.exec(marked)) !== null) {
    out += escapeHtmlText(marked.slice(cursor, match.index));
    const { skillId, level, asProc } = parseNestedSkillMarker(match[1]);
    const display = lookupMergedDisplayNameByInternalName(skillId) || skillId;
    out += wrapNestedSkillTooltipHtml(
      skillId,
      escapeHtmlText(display),
      SCALING_DISPLAY_HTML_CLASSES.skill,
      level,
      asProc
    );
    cursor = match.index + match[0].length;
  }
  out += escapeHtmlText(marked.slice(cursor));
  for (const label of rollRanges) {
    out += ` <span class="item-mod-roll-range">${escapeHtmlText(label)}</span>`;
  }
  if (added && out) return `* ${out} *`;
  return out;
}

/**
 * @param {Array<{ kind: string, text: string }>} parts
 * @param {string} displayName
 * @param {(before: string, idx: number) => boolean} looksLikeMatch
 * @returns {Array<{ kind: string, text: string }>|null}
 */
function annotatePartsWithSkillName(parts, displayName, looksLikeMatch, extra = {}) {
  const lowerName = displayName.toLowerCase();
  /** @type {Array<{ kind: string, text: string, skillId?: string, skillLevel?: number|null }>} */
  const out = [];
  let replaced = false;

  for (const part of parts) {
    const kind = part?.kind || 'text';
    const text = String(part?.text ?? '');
    if (replaced || kind === 'value' || kind === 'skill') {
      out.push({ ...part, kind, text });
      continue;
    }
    const idx = text.toLowerCase().lastIndexOf(lowerName);
    if (idx < 0) {
      out.push({ kind, text });
      continue;
    }
    const before = text.slice(0, idx);
    const after = text.slice(idx + displayName.length);
    if (!looksLikeMatch(before, idx)) {
      out.push({ kind, text });
      continue;
    }
    if (before) out.push({ kind: 'text', text: before });
    out.push({
      kind: 'skill',
      text: displayName,
      skillId: extra.skillId,
      skillLevel: extra.skillLevel ?? null,
      skillAsProc: extra.skillAsProc === true,
    });
    if (after) out.push({ kind: 'text', text: after });
    replaced = true;
  }
  return replaced ? out : null;
}

/**
 * Annotate affix display parts so skill names use kind 'skill'.
 * @param {Array<{ kind: string, text: string }>} parts
 * @returns {Array<{ kind: string, text: string }>}
 */
export function annotateAffixDisplayPartsWithSkills(parts) {
  if (!Array.isArray(parts) || !parts.length) return parts || [];
  const plain = parts.map((p) => String(p?.text ?? '')).join('');
  const charged = matchCatalogChargedSkillFromLine(plain);
  if (charged) {
    const name = charged.skillNameInLine || charged.displayName;
    const annotated = annotatePartsWithSkillName(
      parts,
      name,
      (before) => /Level\s+\d+\s+$/i.test(before),
      {
        skillId: charged.skillId,
        skillLevel:
          Number.isFinite(charged.amount) && charged.amount > 0
            ? Math.floor(charged.amount)
            : null,
      }
    );
    if (annotated) return annotated;
  }

  const levelGrant = matchCatalogLevelSkillGrantFromLine(plain);
  if (levelGrant) {
    const name = levelGrant.skillNameInLine || levelGrant.displayName;
    const annotated = annotatePartsWithSkillName(
      parts,
      name,
      (before) => /Level\s+\d+\s+$/i.test(before),
      {
        skillId: levelGrant.skillId,
        skillLevel:
          Number.isFinite(levelGrant.amount) && levelGrant.amount > 0
            ? Math.floor(levelGrant.amount)
            : null,
      }
    );
    if (annotated) return annotated;
  }

  const grant = matchCatalogSkillGrantFromLine(plain);
  if (grant) {
    const annotated = annotatePartsWithSkillName(
      parts,
      grant.skillNameInLine || grant.displayName,
      (before, idx) =>
        /\sto\s+$/i.test(before) ||
        before.toLowerCase().endsWith('to ') ||
        idx === 0,
      {
        skillId: grant.skillId,
        skillLevel: Number.isFinite(grant.amount) && grant.amount > 0 ? Math.floor(grant.amount) : null,
      }
    );
    if (annotated) return annotated;
  }

  const maxBase = parseMaxBaseLevelBonusFromModifierLine(plain);
  if (maxBase) {
    const cat = resolveCatalogRowBySkillRef(maxBase.skillName);
    const displayName =
      cat?.displayName != null && String(cat.displayName).trim() !== ''
        ? String(cat.displayName).trim()
        : String(maxBase.skillName).trim();
    if (displayName) {
      const annotated = annotatePartsWithSkillName(
        parts,
        displayName,
        (before) => /Maximum\s+$/i.test(before),
        { skillId: cat?.id ? String(cat.id) : undefined, skillLevel: null }
      );
      if (annotated) return annotated;
    }
  }

  const proc = matchCatalogProcSkillFromLine(plain);
  if (!proc) return parts;
  const name = proc.skillNameInLine || proc.displayName;
  const annotated = annotatePartsWithSkillName(
    parts,
    name,
    (before) => /level\s+\d+\s+$/i.test(before),
    {
      skillId: proc.skillId,
      skillLevel: Number.isFinite(proc.level) && proc.level > 0 ? Math.floor(proc.level) : null,
      skillAsProc: true,
    }
  );
  return annotated || parts;
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
    const grant = matchAnyCatalogSkillGrantFromLine(line);
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
 * @param {{ className?: string|null }} [options]
 * @returns {string}
 */
function resolveGrantClassName(options = {}) {
  const provided = options.className != null ? String(options.className).trim() : '';
  if (provided) return provided;
  try {
    const character = getCharacterInstance();
    return character?.className != null ? String(character.className).trim() : '';
  } catch {
    return '';
  }
}

/**
 * @param {Record<string, string>|null|undefined} enabledMap
 * @param {object} itemsStore
 * @param {(def: object) => boolean} [isActive]
 * @returns {Array<{ def: object, rolls?: Record<string, number>|null }>}
 */
function enabledDefsWithRolls(enabledMap, itemsStore, isActive = null) {
  /** @type {Array<{ def: object, rolls?: Record<string, number>|null }>} */
  const out = [];
  for (const [defId, instanceId] of Object.entries(enabledMap || {})) {
    const def = itemsStore.catalogById?.[defId];
    if (!def) continue;
    const rolls = itemsStore.getRollsForInstance?.(instanceId) ?? null;
    if (typeof isActive === 'function' && !isActive(def, rolls)) continue;
    out.push({ def, rolls });
  }
  return out;
}

/**
 * @param {...Record<string, number>} maps
 * @returns {Record<string, number>}
 */
function mergeGrantMaps(...maps) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const map of maps) {
    for (const [id, amount] of Object.entries(map || {})) {
      out[id] = (out[id] || 0) + amount;
    }
  }
  return out;
}

/**
 * Collect oSkill grants from enabled charms in the store.
 * @param {{ className?: string|null }} [options]
 * @returns {Record<string, number>}
 */
export function collectEnabledCharmOSkillGrants(options = {}) {
  try {
    const className = resolveGrantClassName(options);
    const itemsStore = useItemsStore();
    const characterLevel = getCharacterInstance()?.level ?? null;
    const charms = enabledDefsWithRolls(itemsStore.enabledCharms, itemsStore, (def, rolls) =>
      isCharmBonusActive(def, characterLevel, { inInventory: true, rolls })
    );
    return collectOSkillGrantsFromCharmDefs(charms, { className });
  } catch {
    return {};
  }
}

/**
 * Collect oSkill grants from enabled relics in the store.
 * @param {{ className?: string|null }} [options]
 * @returns {Record<string, number>}
 */
export function collectEnabledRelicOSkillGrants(options = {}) {
  try {
    const className = resolveGrantClassName(options);
    const itemsStore = useItemsStore();
    const characterLevel = getCharacterInstance()?.level ?? null;
    const relics = enabledDefsWithRolls(itemsStore.enabledRelics, itemsStore, (def) =>
      isRelicBonusActive(def, characterLevel, { inInventory: true })
    );
    return collectOSkillGrantsFromRelicDefs(relics, { className });
  } catch {
    return {};
  }
}

/**
 * Collect oSkill grants from equipped gear that meets requirements.
 * @param {Array<{ def: object, rolls?: Record<string, number>|null, extras?: string[]|null }>} gear
 * @param {{ className?: string|null }} [ctx]
 * @returns {Record<string, number>}
 */
export function collectOSkillGrantsFromEquippedDefs(gear, ctx = {}) {
  /** @type {Record<string, number>} */
  const out = {};
  const className = ctx.className ?? null;
  for (const entry of Array.isArray(gear) ? gear : []) {
    const def = entry?.def;
    if (!def) continue;
    const rolls = entry.rolls && typeof entry.rolls === 'object' ? entry.rolls : null;
    const extras = Array.isArray(entry.extras) ? entry.extras : null;
    const lines = resolvedEquipmentModifierLines(def, rolls, extras);
    const grants = collectOSkillGrantsFromModifierLines(lines, { className });
    for (const [id, amount] of Object.entries(grants)) {
      out[id] = (out[id] || 0) + amount;
    }
  }
  return out;
}

/**
 * Collect oSkill grants from equipped planner gear (reqs met).
 * @param {{ className?: string|null }} [options]
 * @returns {Record<string, number>}
 */
export function collectEnabledEquippedOSkillGrants(options = {}) {
  try {
    const className = resolveGrantClassName(options);
    const itemsStore = useItemsStore();
    /** @type {Array<{ def: object, rolls?: Record<string, number>|null, extras?: string[] }>} */
    const gear = [];
    for (const slot of EQUIPMENT_SLOTS) {
      if (!itemsStore.equipmentSlotContributesBonuses?.(slot)) continue;
      const instanceId = itemsStore.equipment?.[slot];
      if (instanceId == null) continue;
      const def = itemsStore.getDefForInstance?.(instanceId);
      if (!def) continue;
      const rolls = itemsStore.getRollsForInstance?.(instanceId) ?? null;
      const extras = itemsStore.getExtrasForInstance?.(instanceId) ?? [];
      gear.push({ def, rolls, extras });
    }
    const fromGear = collectOSkillGrantsFromEquippedDefs(gear, { className });

    /** @type {Record<string, number>} */
    const fromSets = {};
    const equippedDefs = itemsStore.activeEquippedDefs || [];
    const counts = countEquippedSetPieces(equippedDefs);
    for (const setDef of itemsStore.sets || []) {
      if (!setDef?.id) continue;
      const equippedCount = counts[setDef.id] || 0;
      if (equippedCount <= 0) continue;
      const totalPieces = (itemsStore.catalog || []).filter((d) => d.setId === setDef.id).length;
      for (const bonus of resolveSetBonuses(setDef, equippedCount, totalPieces)) {
        if (!bonus.active) continue;
        const grants = collectOSkillGrantsFromModifierLines(bonus.modifiers, { className });
        for (const [id, amount] of Object.entries(grants)) {
          fromSets[id] = (fromSets[id] || 0) + amount;
        }
      }
    }

    return mergeGrantMaps(fromGear, fromSets);
  } catch {
    return {};
  }
}

/**
 * Collect item-granted oSkill levels from equipped gear + charms + relics.
 * @param {{ className?: string|null }} [options]
 * @returns {Record<string, number>} skillId -> total item points
 */
export function collectEnabledItemOSkillGrants(options = {}) {
  return mergeGrantMaps(
    collectEnabledEquippedOSkillGrants(options),
    collectEnabledCharmOSkillGrants(options),
    collectEnabledRelicOSkillGrants(options)
  );
}

/**
 * Soft +skills from equipped gear for an on-tree skill (rolled amount, not relic +3).
 * Off-tree generic grants are oSkill itemPoints — skipped here.
 * @param {{
 *   skillId?: string,
 *   displayName?: string,
 *   isOSkill?: boolean,
 *   className?: string,
 *   skillClass?: string,
 * }} [options]
 * @returns {number}
 */
export function getEquippedGearSkillBonusForSkill(options = {}) {
  if (options.isOSkill) return 0;
  try {
    const className =
      String(options.className || '').trim() || resolveGrantClassName(options);
    const displayName = String(options.displayName || '').trim();
    if (!displayName) return 0;
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
    const equippedDefs = itemsStore.activeEquippedDefs || [];
    const counts = countEquippedSetPieces(equippedDefs);
    for (const setDef of itemsStore.sets || []) {
      if (!setDef?.id) continue;
      const equippedCount = counts[setDef.id] || 0;
      if (equippedCount <= 0) continue;
      const totalPieces = (itemsStore.catalog || []).filter((d) => d.setId === setDef.id).length;
      for (const bonus of resolveSetBonuses(setDef, equippedCount, totalPieces)) {
        if (!bonus.active) continue;
        lines.push(...(bonus.modifiers || []));
      }
    }
    return sumSkillBonusFromModifierLines(lines, {
      displayName,
      skillClass: options.skillClass,
      isOSkill: false,
      className,
      onTreeGenericMode: 'amount',
    });
  } catch {
    return 0;
  }
}
