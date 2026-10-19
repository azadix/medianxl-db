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
import { getSkillPoints } from '@/character/planner-core.js';

/**
 * CTC packed level is `lvl`; `blvl` is tree hard points (not the proc number).
 * @param {number} packedLevel
 * @param {number} [treeBlvl]
 * @returns {{ packed: number, blvl: number, slvl: number }}
 */
export function procFormulaLevelParts(packedLevel, treeBlvl = 0) {
  const packed = Math.max(1, Math.floor(Number(packedLevel) || 1));
  const blvl = Math.max(0, Math.floor(Number(treeBlvl) || 0));
  return { packed, blvl, slvl: packed - blvl };
}

function treeHardPoints(skillId) {
  try {
    return Math.max(0, Math.floor(Number(getSkillPoints(skillId)) || 0));
  } catch {
    return 0;
  }
}

/** @type {Map<string, string>} */
const tooltipHtmlByKey = new Map();

/**
 * @param {string} skillId
 * @param {number} level
 * @param {boolean} showFormulas
 * @returns {string}
 */
function tooltipCacheKey(skillId, level, showFormulas, asProc, treeBlvl) {
  const folder = versionToTreeAssetFolder(getCurrentVersion());
  return `${folder}:${skillId}:lvl${level}:p${asProc ? 1 : 0}:b${treeBlvl}:f${showFormulas ? 1 : 0}`;
}

/**
 * @param {object} detail
 * @param {string|null|undefined} text
 * @param {number} packedLevel
 * @param {boolean} showFormulas
 * @param {boolean} asProc
 * @returns {Promise<string>}
 */
async function expandAtLevel(detail, text, packedLevel, showFormulas, asProc) {
  const source = String(text || '').trim();
  if (!source) return '';
  const skillId = String(detail.id);
  const parts = asProc
    ? procFormulaLevelParts(packedLevel, treeHardPoints(skillId))
    : { packed: packedLevel, blvl: packedLevel, slvl: 0 };
  const characterState = {
    level: Math.max(1, packedLevel),
    className: detail.className || null,
    blvl: { [skillId]: parts.blvl },
    lvl: { [skillId]: parts.slvl },
    treeSkillsCache: {},
    stats: {},
  };
  const expanded = await expandPlaceholdersWithScaling(
    skillId,
    packedLevel,
    source,
    skillId,
    characterState,
    showFormulas,
    null
  );
  return String(expanded || '');
}

/**
 * Build tooltip HTML for a skill as if it were exactly `level`.
 * Grants treat `level` as blvl. Procs (`asProc`) use packed CTC as lvl and tree hard points as blvl.
 * No planner sources panel — fixed preview only.
 * @param {string} skillId
 * @param {number} level
 * @param {{ showFormulas?: boolean, asProc?: boolean }} [options]
 * @returns {Promise<string>}
 */
export async function buildFixedLevelSkillTooltipHtml(skillId, level, options = {}) {
  const id = String(skillId || '').trim();
  const lvl = Math.max(1, Math.floor(Number(level) || 1));
  const showFormulas = Boolean(options?.showFormulas);
  const asProc = Boolean(options?.asProc);
  if (!id) return '';

  const treeBlvl = asProc ? treeHardPoints(id) : 0;
  const cacheKey = tooltipCacheKey(id, lvl, showFormulas, asProc, treeBlvl);
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
      descriptionExpanded: await expandAtLevel(detail, detail.description, lvl, showFormulas, asProc),
      effectExpanded: await expandAtLevel(detail, detail.skill_effect, lvl, showFormulas, asProc),
      restrictionExpanded: await expandAtLevel(detail, detail.restriction, lvl, showFormulas, asProc),
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
