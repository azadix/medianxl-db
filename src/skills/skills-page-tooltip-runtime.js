/**
 * @file Skills-page item/skill tooltip portals (separate from planner keep-alive IDs).
 * @module skills/skills-page-tooltip-runtime
 */

import { buildItemTooltipHtml } from '@/items/item-tooltip.js';
import { useItemsStore } from '@/stores/items.js';
import { buildFixedLevelSkillTooltipHtml } from '@/skills/fixed-level-skill-tooltip.js';
import {
  bindLiveTooltip,
  initTooltipPinning,
  maybeAltStickLiveTooltip,
  setNestedSkillTooltipHandlers,
  shouldSuppressLiveTooltipHide,
  updateLiveTooltipBinding,
} from '@/shared/tooltip-pinning.js';

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

/** @type {{ kind: 'item'|'skill', target: HTMLElement|null, skillId?: string, level?: number }|null} */
let lastPresent = null;

export function initSkillsPageTooltips() {
  itemPortal = document.getElementById(SKILLS_PAGE_ITEM_TOOLTIP_ID);
  skillPortal = document.getElementById(SKILLS_PAGE_SKILL_TOOLTIP_ID);
  initTooltipPinning();
  if (itemPortal) {
    bindLiveTooltip(itemPortal, {
      kind: 'item',
      getHtml: () => rebuildLastHtml(),
      meta: {},
    });
  }
  if (skillPortal) {
    bindLiveTooltip(skillPortal, {
      kind: 'skill',
      getHtml: () => rebuildLastHtml(),
      meta: {},
    });
  }
  bindSkillsPageNestedSkillTooltipHandlers();
}

/**
 * Re-bind nested skill-name hover handlers for the skills-page portals.
 * Call on keep-alive activate after other pages override the global handlers.
 */
export function bindSkillsPageNestedSkillTooltipHandlers() {
  if (!skillPortal) {
    skillPortal = document.getElementById(SKILLS_PAGE_SKILL_TOOLTIP_ID);
  }
  if (!skillPortal) return;
  setNestedSkillTooltipHandlers({
    showSkill: async (skillId, clientX, clientY) => {
      if (!skillPortal) return;
      skillPortal.style.left = `${Math.max(0, clientX + 15)}px`;
      skillPortal.style.top = `${Math.max(0, clientY + 15)}px`;
      skillPortal.style.zIndex = '10070';
      const html = await buildFixedLevelSkillTooltipHtml(skillId, 1);
      if (!html) return;
      lastPresent = { kind: 'skill', target: null, skillId, level: 1 };
      present(skillPortal, html, clientX, clientY, {
        getHtml: () => buildFixedLevelSkillTooltipHtml(skillId, 1),
        meta: { skillId, nested: true },
      });
      if (skillPortal) skillPortal.style.zIndex = '10070';
    },
    moveSkill: (clientX, clientY) => moveSkillsPageTooltip(clientX, clientY),
    hideSkill: () => hideSkillsPageTooltips(true),
    isShowing: () => isShowing(skillPortal),
  });
}

export function destroySkillsPageTooltips() {
  hideSkillsPageTooltips(true);
  itemPortal = null;
  skillPortal = null;
  activePortal = null;
  lastPresent = null;
}

function isShowing(node) {
  return Boolean(node && node.style.display !== 'none');
}

/**
 * @returns {string|Promise<string>}
 */
function rebuildLastHtml() {
  if (!lastPresent) return '';
  if (lastPresent.kind === 'item' && lastPresent.target) {
    return buildSkillsPageItemTooltipHtml(lastPresent.target);
  }
  if (lastPresent.kind === 'skill') {
    if (lastPresent.target) return buildSkillsPageSkillTooltipHtml(lastPresent.target);
    if (lastPresent.skillId) {
      return buildFixedLevelSkillTooltipHtml(lastPresent.skillId, lastPresent.level || 1);
    }
  }
  return '';
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

/**
 * @param {boolean} [force]
 */
export function hideSkillsPageTooltips(force = false) {
  if (!force) {
    if (shouldSuppressLiveTooltipHide(activePortal)) return;
    if (shouldSuppressLiveTooltipHide(itemPortal) || shouldSuppressLiveTooltipHide(skillPortal)) {
      return;
    }
  }
  if (positionRafId) {
    cancelAnimationFrame(positionRafId);
    positionRafId = 0;
  }
  for (const node of [itemPortal, skillPortal]) {
    if (!node) continue;
    if (!force && shouldSuppressLiveTooltipHide(node)) continue;
    node.style.display = 'none';
    node.innerHTML = '';
    node.style.zIndex = '';
  }
  if (
    force ||
    (!isShowing(itemPortal) && !isShowing(skillPortal))
  ) {
    activePortal = null;
  }
}

/**
 * @param {HTMLElement|null} node
 * @param {string} html
 * @param {number} clientX
 * @param {number} clientY
 * @param {{ getHtml?: () => string|Promise<string>, meta?: Record<string, unknown> }} [binding]
 */
function present(node, html, clientX, clientY, binding = {}) {
  if (!node || !html) {
    hideSkillsPageTooltips();
    return;
  }
  for (const other of [itemPortal, skillPortal]) {
    if (!other || other === node) continue;
    if (shouldSuppressLiveTooltipHide(other)) continue;
    other.style.display = 'none';
    other.innerHTML = '';
  }
  node.innerHTML = html;
  node.style.display = 'block';
  activePortal = node;
  updateLiveTooltipBinding(node, {
    getHtml: binding.getHtml || (() => rebuildLastHtml()),
    meta: binding.meta || {},
  });
  moveSkillsPageTooltip(clientX, clientY);
  maybeAltStickLiveTooltip(node);
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
  lastPresent = { kind: 'item', target };
  present(itemPortal, buildSkillsPageItemTooltipHtml(target), clientX, clientY, {
    getHtml: () => buildSkillsPageItemTooltipHtml(target),
    meta: {
      itemId: target.getAttribute('data-proc-item-id'),
      setId: target.getAttribute('data-proc-set-id'),
    },
  });
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
 * @param {HTMLElement|null} [target]
 */
export function presentSkillsPageSkillTooltip(html, clientX, clientY, target = null) {
  if (target) {
    const skillId = target.getAttribute('data-proc-skill-id') || '';
    const levelRaw = parseInt(String(target.getAttribute('data-proc-level') || '1'), 10);
    lastPresent = {
      kind: 'skill',
      target,
      skillId,
      level: Number.isFinite(levelRaw) ? levelRaw : 1,
    };
  }
  present(skillPortal, html, clientX, clientY, {
    getHtml: () => rebuildLastHtml(),
    meta: {
      skillId: lastPresent?.skillId || target?.getAttribute?.('data-proc-skill-id'),
    },
  });
}
