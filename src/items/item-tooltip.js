/**
 * @file Item tooltip HTML (planner inventory / equipment).
 * @module items/item-tooltip-html
 */

import { escapeHtmlText } from '@/shared/utils.js';
import { formatItemModifierLineHtml } from '@/items/item-granted-oskills.js';
import {
  buildSkillTooltipHeaderHtml,
  buildSkillTooltipDescriptionBlock,
  wrapSkillTooltipContent,
} from '@/shared/tooltip-html.js';
import { ITEM_CATEGORY_LABEL, getItemStatLines } from '@/items/item-stats.js';
import { formatSetBonusLabel } from '@/items/item-overlays.js';
import { formatRunewordBadge, isRunewordItem } from '@/items/runeword-items.js';

/** @type {Readonly<Record<string, string>>} */
const RARITY_CLASS = Object.freeze({
  normal: 'item-tooltip-name--normal',
  magic: 'item-tooltip-name--magic',
  rare: 'item-tooltip-name--rare',
  unique: 'item-tooltip-name--unique',
  set: 'item-tooltip-name--set',
  runeword: 'item-tooltip-name--runeword',
  relic: 'item-tooltip-name--relic',
  crafted: 'item-tooltip-name--crafted',
});

/**
 * @param {object|null|undefined} def - Catalog item def
 * @param {string|null|undefined} [_iconKey] - Unused; kept for call-site compatibility
 * @param {Record<string, number>|null|undefined} [rolls] - Instance rolled values
 * @param {{
 *   characterLevel?: number|null,
 *   charmInInventory?: boolean,
 *   setBonuses?: Array<{ required: number|string, modifiers: string[], active: boolean }>,
 *   setName?: string|null,
 * }} [options]
 * @returns {string} HTML
 */
export function buildItemTooltipHtml(def, _iconKey = null, rolls = null, options = {}) {
  if (!def || typeof def !== 'object') return '';

  const name = escapeHtmlText(def.name || def.id || 'Unknown item');
  const rarity = String(def.rarity || 'normal');
  const rarityClass = RARITY_CLASS[rarity] || RARITY_CLASS.normal;
  const category = ITEM_CATEGORY_LABEL[def.category] || escapeHtmlText(def.category || '');

  const classRestriction = def.classRestriction
    ? escapeHtmlText(String(def.classRestriction))
    : '';
  const baseName = def.baseName ? escapeHtmlText(String(def.baseName)) : '';
  const setName = options.setName || def.setName;
  const rwBadge = isRunewordItem(def) ? formatRunewordBadge(def) : '';
  const tags = [
    category ? `<span class="is-size-7 has-text-grey">${category}</span>` : '',
    baseName ? `<div class="is-size-7 has-text-grey-light">${baseName}</div>` : '',
    rwBadge
      ? `<div class="is-size-7 has-text-warning">${escapeHtmlText(rwBadge)}</div>`
      : '',
    setName ? `<div class="is-size-7 has-text-success">${escapeHtmlText(String(setName))}</div>` : '',
    classRestriction
      ? `<div class="is-size-7 has-text-grey-light">${classRestriction}</div>`
      : '',
  ].join('');

  const header = buildSkillTooltipHeaderHtml({
    nameInnerHtml: `<span class="${rarityClass}">${name}</span>`,
    tagsHtml: tags ? `<div class="mt-1">${tags}</div>` : '',
    levelSectionHtml: '',
  });

  const lines = getItemStatLines(def, rolls, {
    characterLevel: options.characterLevel ?? null,
    charmInInventory: options.charmInInventory !== false,
  }).map((line) => formatItemModifierLineHtml(line));

  const body = buildSkillTooltipDescriptionBlock({
    effectExpanded: lines.join('\n'),
    effectLineClass: 'tooltip-effect has-text-centered is-size-6',
  });

  return wrapSkillTooltipContent(`${header}${body}${buildSetBonusSectionHtml(options.setBonuses)}`);
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
        .map(
          (mod) =>
            `<div class="item-tooltip-set-bonus-mod">${formatItemModifierLineHtml(mod)}</div>`
        )
        .join('');
      return `<fieldset class="${stateClass}"><legend class="item-tooltip-set-bonus-label">${escapeHtmlText(
        formatSetBonusLabel(bonus.required)
      )}</legend>${mods}</fieldset>`;
    })
    .join('');

  return `<div class="item-tooltip-set-bonuses">${groups}</div>`;
}
