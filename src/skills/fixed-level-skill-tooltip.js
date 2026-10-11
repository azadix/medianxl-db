/**
 * @file Skill tooltip HTML at a fixed level (no planner +all skills / relics).
 * @module skills/fixed-level-skill-tooltip
 */

import {
  expandPlaceholdersWithScaling,
  escapeHtmlText,
  getSkillIconHTML,
} from '@/shared/utils.js';
import {
  buildSkillTooltipDescriptionBlock,
  buildSkillTooltipHeaderHtml,
  buildSkillTooltipRestrictionBlock,
  wrapSkillTooltipContent,
} from '@/shared/tooltip-html.js';
import { getFileSkillStore } from '@/shared/skill-data-store.js';
import { getCurrentVersion, versionToTreeAssetFolder } from '@/shared/version-config.js';

/** @type {Map<string, string>} */
const tooltipHtmlByKey = new Map();

/**
 * @param {string} skillId
 * @param {number} level
 * @param {boolean} showFormulas
 * @returns {string}
 */
function tooltipCacheKey(skillId, level, showFormulas) {
  const folder = versionToTreeAssetFolder(getCurrentVersion());
  return `${folder}:${skillId}:lvl${level}:f${showFormulas ? 1 : 0}`;
}

/**
 * @param {object} detail
 * @param {string|null|undefined} text
 * @param {number} level
 * @param {boolean} showFormulas
 * @returns {Promise<string>}
 */
async function expandAtLevel(detail, text, level, showFormulas) {
  const source = String(text || '').trim();
  if (!source) return '';
  const skillId = String(detail.id);
  const characterState = {
    level: Math.max(1, level),
    className: detail.className || null,
    blvl: { [skillId]: level },
    lvl: { [skillId]: 0 },
    treeSkillsCache: {},
    stats: {},
  };
  const expanded = await expandPlaceholdersWithScaling(
    skillId,
    level,
    source,
    skillId,
    characterState,
    showFormulas,
    null
  );
  return String(expanded || '');
}

/**
 * Build tooltip HTML for a skill as if it were exactly `level` (proc/grant slvl).
 * No planner sources panel — fixed preview only.
 * @param {string} skillId
 * @param {number} level
 * @param {{ showFormulas?: boolean }} [options]
 * @returns {Promise<string>}
 */
export async function buildFixedLevelSkillTooltipHtml(skillId, level, options = {}) {
  const id = String(skillId || '').trim();
  const lvl = Math.max(1, Math.floor(Number(level) || 1));
  const showFormulas = Boolean(options?.showFormulas);
  if (!id) return '';

  const cacheKey = tooltipCacheKey(id, lvl, showFormulas);
  if (tooltipHtmlByKey.has(cacheKey)) {
    return tooltipHtmlByKey.get(cacheKey) || '';
  }

  const store = getFileSkillStore();
  const detail = store?.getSkillDetail(id);
  if (!detail) return '';

  const iconFolder = versionToTreeAssetFolder(getCurrentVersion());
  const iconHtml = getSkillIconHTML(
    detail.image || '',
    detail.className || 'Other',
    'is-64x64',
    iconFolder
  );

  let expandedBlocks;
  try {
    expandedBlocks = {
      descriptionExpanded: await expandAtLevel(detail, detail.description, lvl, showFormulas),
      effectExpanded: await expandAtLevel(detail, detail.skill_effect, lvl, showFormulas),
      restrictionExpanded: await expandAtLevel(detail, detail.restriction, lvl, showFormulas),
    };
  } catch (error) {
    console.warn('Fixed-level skill tooltip expansion failed:', error);
    expandedBlocks = {
      descriptionExpanded: escapeHtmlText(detail.description || ''),
      effectExpanded: escapeHtmlText(detail.skill_effect || ''),
      restrictionExpanded: escapeHtmlText(detail.restriction || ''),
    };
  }
  const { descriptionExpanded, effectExpanded, restrictionExpanded } = expandedBlocks;

  const tagsLine = [detail.className, detail.tabName].filter(Boolean).join(' / ');
  const tagsHtml = tagsLine
    ? `<p class="is-size-7 has-text-grey-lighter">${escapeHtmlText(tagsLine)}</p>`
    : '';
  const headerHtml = buildSkillTooltipHeaderHtml({
    iconHtml,
    nameInnerHtml: escapeHtmlText(detail.display_name || id),
    tagsHtml,
    levelSectionHtml: `<div class="is-size-6 has-text-weight-bold has-text-warning-light">Level ${lvl}</div>`,
  });

  const bodyParts = [
    buildSkillTooltipRestrictionBlock(restrictionExpanded),
    buildSkillTooltipDescriptionBlock({
      mainDescHtml: descriptionExpanded,
      levelIndicatorHtml: effectExpanded.trim()
        ? `<div class="tooltip-level-indicator is-italic">Level ${lvl} values:</div>`
        : '',
      effectExpanded,
    }),
  ].filter(Boolean);

  const html = wrapSkillTooltipContent(headerHtml + bodyParts.join(''));
  tooltipHtmlByKey.set(cacheKey, html);
  return html;
}

export function resetFixedLevelSkillTooltipCacheForTests() {
  tooltipHtmlByKey.clear();
}
