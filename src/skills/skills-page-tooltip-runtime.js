/**
 * @file Skills-page item/skill tooltip portals (separate from planner keep-alive IDs).
 * @module skills/skills-page-tooltip-runtime
 */

import { buildItemTooltipHtml } from '@/items/item-tooltip.js';
import { useItemsStore } from '@/stores/items.js';
import { buildFixedLevelSkillTooltipHtml } from '@/skills/fixed-level-skill-tooltip.js';

export const SKILLS_PAGE_ITEM_TOOLTIP_ID = 'skills-page-item-tooltip';
export const SKILLS_PAGE_SKILL_TOOLTIP_ID = 'skills-page-skill-tooltip';

const TOOLTIP_OFFSET = 15;
const TOOLTIP_VIEWPORT_MARGIN = 12;

/** @type {HTMLElement|null} */
let itemPortal = null;
/** @type {HTMLElement|null} */
let skillPortal = null;
let positionRafId = 0;
let pendingClientX = 0;
let pendingClientY = 0;
/** @type {HTMLElement|null} */
let activePortal = null;

export function initSkillsPageTooltips() {
  itemPortal = document.getElementById(SKILLS_PAGE_ITEM_TOOLTIP_ID);
  skillPortal = document.getElementById(SKILLS_PAGE_SKILL_TOOLTIP_ID);
}

export function destroySkillsPageTooltips() {
  hideSkillsPageTooltips();
  itemPortal = null;
  skillPortal = null;
  activePortal = null;
}

function isShowing(node) {
  return Boolean(node && node.style.display !== 'none');
}

/**
 * @param {HTMLElement} node
 * @param {number} clientX
 * @param {number} clientY
 */
function applyPosition(node, clientX, clientY) {
  const baseLeft = clientX + TOOLTIP_OFFSET;
  const baseTop = clientY + TOOLTIP_OFFSET;
  const rect = node.getBoundingClientRect();
  let nextLeft = baseLeft;
  let nextTop = baseTop;
  const maxLeft = window.innerWidth - rect.width - TOOLTIP_VIEWPORT_MARGIN;
  const maxTop = window.innerHeight - rect.height - TOOLTIP_VIEWPORT_MARGIN;
  if (nextLeft > maxLeft) nextLeft = Math.max(TOOLTIP_VIEWPORT_MARGIN, maxLeft);
  if (nextTop > maxTop) nextTop = Math.max(TOOLTIP_VIEWPORT_MARGIN, maxTop);
  node.style.left = `${nextLeft}px`;
  node.style.top = `${nextTop}px`;
}

/**
 * @param {number} clientX
 * @param {number} clientY
 */
export function moveSkillsPageTooltip(clientX, clientY) {
  pendingClientX = clientX;
  pendingClientY = clientY;
  if (positionRafId) return;
  positionRafId = requestAnimationFrame(() => {
    positionRafId = 0;
    const node = activePortal;
    if (!node || !isShowing(node)) return;
    applyPosition(node, pendingClientX, pendingClientY);
  });
}

export function hideSkillsPageTooltips() {
  if (positionRafId) {
    cancelAnimationFrame(positionRafId);
    positionRafId = 0;
  }
  for (const node of [itemPortal, skillPortal]) {
    if (!node) continue;
    node.style.display = 'none';
    node.innerHTML = '';
  }
  activePortal = null;
}

/**
 * @param {HTMLElement|null} node
 * @param {string} html
 * @param {number} clientX
 * @param {number} clientY
 */
function present(node, html, clientX, clientY) {
  if (!node || !html) {
    hideSkillsPageTooltips();
    return;
  }
  hideSkillsPageTooltips();
  node.innerHTML = html;
  node.style.display = 'block';
  activePortal = node;
  moveSkillsPageTooltip(clientX, clientY);
}

/**
 * @param {object|null|undefined} setDef
 * @param {number|string|null|undefined} required
 * @returns {object|null}
 */
function setBonusTooltipDef(setDef, required) {
  if (!setDef) return null;
  const bonuses = Array.isArray(setDef.bonuses) ? setDef.bonuses : [];
  const bonus = bonuses.find((b) => String(b.required) === String(required));
  const modifiers = Array.isArray(bonus?.modifiers) ? bonus.modifiers.map(String) : [];
  return {
    name: String(setDef.name || setDef.id || 'Set bonus'),
    rarity: 'set',
    category: 'other',
    setName: setDef.name || null,
    modifiers,
  };
}

/**
 * @param {HTMLElement} target
 * @returns {string}
 */
export function buildSkillsPageItemTooltipHtml(target) {
  const store = useItemsStore();
  const setId = target.getAttribute('data-proc-set-id');
  if (setId) {
    const setDef = store.setsById[setId];
    const required = target.getAttribute('data-proc-set-required');
    const def = setBonusTooltipDef(setDef, required);
    return def ? buildItemTooltipHtml(def, null, null, { setName: setDef?.name }) : '';
  }
  const itemId = target.getAttribute('data-proc-item-id');
  if (!itemId) return '';
  const def = store.catalogById[itemId];
  return def ? buildItemTooltipHtml(def) : '';
}

/**
 * @param {HTMLElement} target
 * @param {number} clientX
 * @param {number} clientY
 */
export function showSkillsPageItemTooltipFromTarget(target, clientX, clientY) {
  present(itemPortal, buildSkillsPageItemTooltipHtml(target), clientX, clientY);
}

/**
 * @param {HTMLElement} target
 * @returns {Promise<string>}
 */
export async function buildSkillsPageSkillTooltipHtml(target) {
  const skillId = target.getAttribute('data-proc-skill-id');
  if (!skillId) return '';
  const levelRaw = parseInt(String(target.getAttribute('data-proc-level') || '1'), 10);
  const level = Number.isFinite(levelRaw) ? levelRaw : 1;
  return buildFixedLevelSkillTooltipHtml(skillId, level);
}

/**
 * @param {string} html
 * @param {number} clientX
 * @param {number} clientY
 */
export function presentSkillsPageSkillTooltip(html, clientX, clientY) {
  present(skillPortal, html, clientX, clientY);
}
