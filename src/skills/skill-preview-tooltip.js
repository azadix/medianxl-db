/**
 * @file Hover Play button -> scaled skill-preview GIF tooltip.
 * @module skills/skill-preview-tooltip
 */

import { createLiveTooltipShell } from '@/shared/live-tooltip-shell.js';
import { shouldSuppressLiveTooltipHide } from '@/shared/tooltip-pinning.js';
import { SKILL_PREVIEW_ID_ATTR, SKILL_PREVIEW_PLAY_CLASS } from '@/shared/tooltip-html.js';
import { escapeHtmlText, getSkillPreviewUrl } from '@/shared/utils.js';
import { hasSkillPreview } from '@/skills/skill-preview-catalog.js';

export const SKILL_PREVIEW_TOOLTIP_ID = 'skill-preview-tooltip-portal';
export const SKILL_PREVIEW_TOOLTIP_Z = '10080';

const PLAY_SELECTOR = `.${SKILL_PREVIEW_PLAY_CLASS}`;

let listenersBound = false;
/** @type {string|null} */
let currentSkillId = null;

const shell = createLiveTooltipShell({
  portalId: SKILL_PREVIEW_TOOLTIP_ID,
  kind: 'skill-preview',
  offset: 8,
  getHtml: () => (currentSkillId ? buildPreviewHtml(currentSkillId) : ''),
  onHideLive: () => {
    currentSkillId = null;
  },
});

/**
 * @param {string} skillId
 * @returns {string}
 */
function buildPreviewHtml(skillId) {
  const id = String(skillId || '').trim();
  if (!id || !hasSkillPreview(id)) return '';
  const src = getSkillPreviewUrl(id);
  if (!src) return '';
  return `<div class="skill-preview-tooltip-frame"><img src="${escapeHtmlText(src)}" alt="${escapeHtmlText('Skill animation')}" /></div>`;
}

/**
 * @param {EventTarget|Node|null|undefined} node
 * @returns {HTMLElement|null}
 */
function closestPlay(node) {
  if (node instanceof Element) return node.closest(PLAY_SELECTOR);
  if (node instanceof Node && node.parentElement) {
    return node.parentElement.closest(PLAY_SELECTOR);
  }
  return null;
}

/**
 * @param {EventTarget|Node|null|undefined} node
 * @returns {HTMLElement|null}
 */
function closestPreviewTooltip(node) {
  const el = node instanceof Element ? node : node instanceof Node ? node.parentElement : null;
  if (!el) return null;
  const preview = el.closest('.skill-preview-tooltip');
  return preview instanceof HTMLElement && preview.style.display !== 'none' ? preview : null;
}

/**
 * True when the node is the Play button or a live/pinned preview GIF tooltip.
 * @param {EventTarget|Node|null|undefined} node
 * @returns {boolean}
 */
export function isSkillPreviewUiTarget(node) {
  return Boolean(closestPlay(node) || closestPreviewTooltip(node));
}

function getPortal() {
  return shell.getPortal();
}

export function hideSkillPreviewTooltip(force = false) {
  const node = getPortal();
  if (!force && shouldSuppressLiveTooltipHide(node)) return;
  currentSkillId = null;
  shell.hide(force);
}

/**
 * @param {HTMLElement} playEl
 */
function showPreview(playEl) {
  const id = String(playEl.getAttribute(SKILL_PREVIEW_ID_ATTR) || '').trim();
  if (!id || !hasSkillPreview(id)) return;
  if (currentSkillId === id && shell.isShowing()) return;

  const html = buildPreviewHtml(id);
  if (!html) return;

  currentSkillId = id;
  const rect = playEl.getBoundingClientRect();
  shell.present(html, rect.right, rect.top, {
    getHtml: () => buildPreviewHtml(id),
    meta: { skillId: id },
    zIndex: SKILL_PREVIEW_TOOLTIP_Z,
  });
}

/**
 * @param {MouseEvent} e
 */
function onMouseOver(e) {
  const play = closestPlay(e.target);
  if (!play) return;
  showPreview(play);
}

/**
 * @param {MouseEvent} e
 */
function onMouseOut(e) {
  if (!shell.isShowing()) return;
  const leavingPlay = closestPlay(e.target);
  const leavingPreview = closestPreviewTooltip(e.target);
  if (!leavingPlay && !leavingPreview) return;

  const dest = e.relatedTarget;
  if (isSkillPreviewUiTarget(dest)) return;

  if (!(dest instanceof Element)) {
    requestAnimationFrame(() => {
      let el;
      try {
        el = document.elementFromPoint(e.clientX, e.clientY);
      } catch {
        return;
      }
      if (isSkillPreviewUiTarget(el)) return;
      hideSkillPreviewTooltip();
    });
    return;
  }

  hideSkillPreviewTooltip();
}

export function initSkillPreviewTooltip() {
  shell.attach();
  if (listenersBound) return;
  listenersBound = true;
  document.addEventListener('mouseover', onMouseOver);
  document.addEventListener('mouseout', onMouseOut);
}

export function destroySkillPreviewTooltip() {
  if (listenersBound) {
    document.removeEventListener('mouseover', onMouseOver);
    document.removeEventListener('mouseout', onMouseOut);
    listenersBound = false;
  }
  hideSkillPreviewTooltip(true);
}
