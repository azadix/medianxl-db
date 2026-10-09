/**
 * @file Item tooltip HTML (planner inventory / equipment).
 * @module items/item-tooltip-html
 */

import { escapeHtmlText, getItemIconUrl } from '@/shared/utils.js';
import {
  decodeModifierLine,
  modifierColorCssClass,
} from '@/items/item-modifier-line.js';
import { formatItemModifierLineHtml } from '@/items/item-granted-oskills.js';
import {
  formatItemTooltipSubtitle,
  getItemStatSections,
} from '@/items/item-stats.js';
import { formatSetBonusLabel } from '@/items/item-overlays.js';
import { formatRunewordBadge, isRunewordItem } from '@/items/runeword-items.js';

/** @type {Readonly<Record<string, string>>} */
export const ITEM_RARITY_NAME_CLASS = Object.freeze({
  normal: 'item-tooltip-name--normal',
  magic: 'item-tooltip-name--magic',
  rare: 'item-tooltip-name--rare',
  unique: 'item-tooltip-name--unique',
  set: 'item-tooltip-name--set',
  runeword: 'item-tooltip-name--runeword',
  relic: 'item-tooltip-name--relic',
  crafted: 'item-tooltip-name--crafted',
  honorific: 'item-tooltip-name--honorific',
  angelic: 'item-tooltip-name--angelic',
});

/**
 * Tooltip / list color class for an item rarity.
 * @param {string|null|undefined} rarity
 * @returns {string}
 */
export function itemRarityNameClass(rarity) {
  const key = String(rarity || 'normal');
  return ITEM_RARITY_NAME_CLASS[key] || ITEM_RARITY_NAME_CLASS.normal;
}

/**
 * Shared rarity frame class (tooltip card + doll slots).
 * @param {string|null|undefined} rarity
 * @returns {string}
 */
export function itemRarityFrameClass(rarity) {
  const key = String(rarity || 'normal');
  return ITEM_RARITY_NAME_CLASS[key] ? `item-rarity--${key}` : 'item-rarity--normal';
}

/**
 * @param {string} stem
 * @returns {string}
 */
function itemTooltipIconSrc(stem) {
  const key = String(stem || '').trim();
  if (!key) return '';
  if (typeof window === 'undefined') return `icons/item_icons/${key}.webp`;
  return getItemIconUrl(key);
}

/**
 * @param {string[]} lines
 * @returns {string}
 */
function renderStatLines(lines) {
  return lines
    .map((line) => {
      const cls = modifierColorCssClass(decodeModifierLine(line).color);
      const classAttr = cls ? ` ${cls}` : '';
      return `<div class="item-tooltip-line${classAttr}">${formatItemModifierLineHtml(line)}</div>`;
    })
    .join('');
}

/**
 * @param {import('@/items/item-requirements.js').ItemRequirements} reqs
 * @param {{
 *   characterLevel?: number|null,
 *   characterStrength?: number|null,
 *   characterDexterity?: number|null,
 * }} options
 * @returns {string}
 */
function buildRequirementsHtml(reqs, options) {
  const parts = [];
  if (reqs.reqLevel > 0) {
    const unmet =
      options.characterLevel != null && Number(options.characterLevel) < reqs.reqLevel;
    const cls = unmet ? ' item-tooltip-req--unmet' : '';
    parts.push(`<span class="item-tooltip-req${cls}">Level ${reqs.reqLevel}</span>`);
  }
  if (reqs.reqStr > 0) {
    const unmet =
      options.characterStrength != null && Number(options.characterStrength) < reqs.reqStr;
    const cls = unmet ? ' item-tooltip-req--unmet' : '';
    parts.push(`<span class="item-tooltip-req${cls}">${reqs.reqStr} Strength</span>`);
  }
  if (reqs.reqDex > 0) {
    const unmet =
      options.characterDexterity != null && Number(options.characterDexterity) < reqs.reqDex;
    const cls = unmet ? ' item-tooltip-req--unmet' : '';
    parts.push(`<span class="item-tooltip-req${cls}">${reqs.reqDex} Dexterity</span>`);
  }
  if (!parts.length) return '';
  return `<div class="item-tooltip-reqs">Requires: ${parts.join(', ')}</div>`;
}

/**
 * @param {object|null|undefined} def - Catalog item def
 * @param {string|null|undefined} [iconKey] - Instance icon stem; falls back to `def.icon`
 * @param {Record<string, number>|null|undefined} [rolls] - Instance rolled values
 * @param {{
 *   characterLevel?: number|null,
 *   characterStrength?: number|null,
 *   characterDexterity?: number|null,
 *   charmInInventory?: boolean,
 *   className?: string|null,
 *   setBonuses?: Array<{ required: number|string, modifiers: string[], active: boolean }>,
 *   setName?: string|null,
 *   socketables?: Array<object>|null,
 * }} [options]
 * @returns {string} HTML
 */
export function buildItemTooltipHtml(def, iconKey = null, rolls = null, options = {}) {
  if (!def || typeof def !== 'object') return '';

  const name = escapeHtmlText(def.name || def.id || 'Unknown item');
  const rarity = String(def.rarity || 'normal');
  const rarityClass = itemRarityNameClass(rarity);
  const frameClass = itemRarityFrameClass(rarity);
  const subtitle = escapeHtmlText(formatItemTooltipSubtitle(def));

  const classRestriction = def.classRestriction
    ? escapeHtmlText(String(def.classRestriction))
    : '';
  const baseName = def.baseName ? escapeHtmlText(String(def.baseName)) : '';
  const setName = options.setName || def.setName;
  const rwBadge = isRunewordItem(def) ? formatRunewordBadge(def) : '';
  const tags = [
    baseName ? `<div class="item-tooltip-tag">${baseName}</div>` : '',
    rwBadge ? `<div class="item-tooltip-tag item-tooltip-tag--runeword">${escapeHtmlText(rwBadge)}</div>` : '',
    setName ? `<div class="item-tooltip-tag item-tooltip-tag--set">${escapeHtmlText(String(setName))}</div>` : '',
    classRestriction ? `<div class="item-tooltip-tag">${classRestriction}</div>` : '',
  ].join('');

  const stem = (iconKey && String(iconKey).trim()) || (def.icon && String(def.icon).trim()) || '';
  const iconUrl = itemTooltipIconSrc(stem);
  const art = iconUrl
    ? `<div class="item-tooltip-art"><img class="item-tooltip-icon" src="${escapeHtmlText(iconUrl)}" alt=""></div>`
    : '';

  const sections = getItemStatSections(def, rolls, {
    characterLevel: options.characterLevel ?? null,
    charmInInventory: options.charmInInventory !== false,
    className: options.className ?? null,
    socketables: options.socketables ?? null,
  });

  const baseBlock = renderStatLines([...sections.base, ...sections.scaling]);
  const modsBlock = renderStatLines(sections.mods);
  const reqsHtml = buildRequirementsHtml(sections.requirements, options);

  const header = `<div class="item-tooltip-header">
      <div class="item-tooltip-header-text">
        <div class="item-tooltip-name ${rarityClass}">${name}</div>
        ${subtitle ? `<div class="item-tooltip-subtitle">${subtitle}</div>` : ''}
        ${tags ? `<div class="item-tooltip-tags">${tags}</div>` : ''}
      </div>
      ${art}
    </div>`;

  const body = [
    baseBlock ? `<div class="item-tooltip-section item-tooltip-section--base">${baseBlock}</div>` : '',
    modsBlock ? `<div class="item-tooltip-section item-tooltip-section--mods">${modsBlock}</div>` : '',
    reqsHtml,
    buildSetBonusSectionHtml(options.setBonuses),
  ].join('');

  return `<div class="tooltip-content item-tooltip-card ${frameClass}">${header}${body}</div>`;
}

/**
 * Grouped set-bonus blocks (active green / inactive grey).
 * @param {Array<{ required: number|string, modifiers: string[], active: boolean }>|null|undefined} setBonuses
 * @returns {string} HTML
 */
function buildSetBonusSectionHtml(setBonuses) {
  if (!Array.isArray(setBonuses) || !setBonuses.length) return '';

  const groups = setBonuses
    .map((bonus) => {
      const active = Boolean(bonus.active);
      const stateClass = active
        ? 'item-tooltip-set-bonus item-tooltip-set-bonus--active'
        : 'item-tooltip-set-bonus item-tooltip-set-bonus--inactive';
      const mods = (bonus.modifiers || [])
        .map((mod) => {
          const cls = modifierColorCssClass(decodeModifierLine(mod).color);
          const classAttr = cls ? ` ${cls}` : '';
          return `<div class="item-tooltip-set-bonus-mod${classAttr}">${formatItemModifierLineHtml(mod)}</div>`;
        })
        .join('');
      return `<fieldset class="${stateClass}"><legend class="item-tooltip-set-bonus-label">${escapeHtmlText(
        formatSetBonusLabel(bonus.required)
      )}</legend>${mods}</fieldset>`;
    })
    .join('');

  return `<div class="item-tooltip-set-bonuses">${groups}</div>`;
}
