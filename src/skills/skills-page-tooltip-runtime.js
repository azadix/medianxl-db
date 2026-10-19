/**
 * @file Skills-page item/skill tooltip portals (separate from planner keep-alive IDs).
 * @module skills/skills-page-tooltip-runtime
 */

import { buildItemTooltipHtml } from '@/items/item-tooltip.js';
import { useItemsStore } from '@/stores/items.js';
import { buildFixedLevelSkillTooltipHtml } from '@/skills/fixed-level-skill-tooltip.js';
import { readNestedSkillTooltipAttrs } from '@/shared/tooltip-html.js';
import { shouldSuppressLiveTooltipHide } from '@/shared/tooltip-pinning.js';
import {
  NESTED_SKILL_TOOLTIP_Z,
  createLiveTooltipShell,
} from '@/shared/live-tooltip-shell.js';

export const SKILLS_PAGE_ITEM_TOOLTIP_ID = 'skills-page-item-tooltip';
export const SKILLS_PAGE_SKILL_TOOLTIP_ID = 'skills-page-skill-tooltip';

/** @type {{ kind: 'item'|'skill', target: HTMLElement|null, skillId?: string, level?: number }|null} */
let lastPresent = null;

/** @type {'item'|'skill'|null} */
let activeKind = null;

const itemShell = createLiveTooltipShell({
  portalId: SKILLS_PAGE_ITEM_TOOLTIP_ID,
  kind: 'item',
  getHtml: () => rebuildLastHtml(),
});

const skillShell = createLiveTooltipShell({
  portalId: SKILLS_PAGE_SKILL_TOOLTIP_ID,
  kind: 'skill',
  getHtml: () => rebuildLastHtml(),
});

function activeShell() {
  if (activeKind === 'item') return itemShell;
  if (activeKind === 'skill') return skillShell;
  return null;
}

export function initSkillsPageTooltips() {
  itemShell.attach({ getHtml: () => rebuildLastHtml() });
  skillShell.attach({ getHtml: () => rebuildLastHtml() });
  bindSkillsPageNestedSkillTooltipHandlers();
}

/**
 * Re-bind nested skill-name hover handlers for the skills-page portals.
 * Call on keep-alive activate after other pages override the global handlers.
 */
export function bindSkillsPageNestedSkillTooltipHandlers() {
  skillShell.attach();
  skillShell.setNestedHandlers({
    showSkill: async (skillId, clientX, clientY, fromEl) => {
      const nested = readNestedSkillTooltipAttrs(fromEl instanceof Element ? fromEl : null);
      const level = nested.level != null ? nested.level : 1;
      const asProc = nested.asProc;
      const html = await buildFixedLevelSkillTooltipHtml(skillId, level, { asProc });
      if (!html) return;
      lastPresent = { kind: 'skill', target: null, skillId, level, asProc };
      presentOnShell(skillShell, 'skill', html, clientX, clientY, {
        getHtml: () => buildFixedLevelSkillTooltipHtml(skillId, level, { asProc }),
        meta: { skillId, nested: true, fixedLevel: level, asProc },
        zIndex: NESTED_SKILL_TOOLTIP_Z,
      });
    },
    moveSkill: (clientX, clientY) => moveSkillsPageTooltip(clientX, clientY),
    hideSkill: () => hideSkillsPageTooltips(true),
    isShowing: () => skillShell.isShowing(),
  });
}

export function destroySkillsPageTooltips() {
  hideSkillsPageTooltips(true);
  itemShell.detach();
  skillShell.detach();
  skillShell.setNestedHandlers(null);
  activeKind = null;
  lastPresent = null;
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
      return buildFixedLevelSkillTooltipHtml(lastPresent.skillId, lastPresent.level || 1, {
        asProc: Boolean(lastPresent.asProc),
      });
    }
  }
  return '';
}

/**
 * @param {ReturnType<typeof createLiveTooltipShell>} shell
 * @param {'item'|'skill'} kind
 * @param {string} html
 * @param {number} clientX
 * @param {number} clientY
 * @param {{ getHtml?: (() => string|Promise<string>)|null, meta?: Record<string, unknown>, zIndex?: string }} [opts]
 */
function presentOnShell(shell, kind, html, clientX, clientY, opts = {}) {
  if (!html) {
    hideSkillsPageTooltips();
    return;
  }
  const other = kind === 'item' ? skillShell : itemShell;
  if (!shouldSuppressLiveTooltipHide(other.getPortal())) {
    other.hide(true);
  }
  activeKind = kind;
  shell.present(html, clientX, clientY, opts);
}

/**
 * @param {number} clientX
 * @param {number} clientY
 */
export function moveSkillsPageTooltip(clientX, clientY) {
  activeShell()?.move(clientX, clientY);
}

/**
 * @param {boolean} [force]
 */
export function hideSkillsPageTooltips(force = false) {
  if (!force) {
    if (shouldSuppressLiveTooltipHide(activeShell()?.getPortal())) return;
    if (
      shouldSuppressLiveTooltipHide(itemShell.getPortal()) ||
      shouldSuppressLiveTooltipHide(skillShell.getPortal())
    ) {
      return;
    }
  }
  itemShell.hide(force);
  skillShell.hide(force);
  if (force || (!itemShell.isShowing() && !skillShell.isShowing())) {
    activeKind = null;
  }
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
  presentOnShell(itemShell, 'item', buildSkillsPageItemTooltipHtml(target), clientX, clientY, {
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
  return buildFixedLevelSkillTooltipHtml(skillId, level, { asProc: true });
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
  presentOnShell(skillShell, 'skill', html, clientX, clientY, {
    getHtml: () => rebuildLastHtml(),
    meta: {
      skillId: lastPresent?.skillId || target?.getAttribute?.('data-proc-skill-id'),
    },
  });
}
