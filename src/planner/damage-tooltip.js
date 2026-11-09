/**
 * @file Hover tooltip for the damage panel entries.
 * Uses the shared live tooltip shell so it supports the same pin / Alt-lock behaviour
 * as skill and item tooltips.
 * @module planner/damage-tooltip
 */

import { createLiveTooltipShell } from '@/shared/live-tooltip-shell.js';

export const DAMAGE_TOOLTIP_PORTAL_ID = 'damage-tooltip-portal';
const DAMAGE_TOOLTIP_Z = '10060';

/** @type {((id: string) => string|null)|null} */
let htmlProvider = null;
/** @type {string|null} */
let currentId = null;
/** @type {ReturnType<typeof createLiveTooltipShell>|null} */
let shell = null;

/**
 * @returns {ReturnType<typeof createLiveTooltipShell>}
 */
function getShell() {
  if (shell) return shell;
  shell = createLiveTooltipShell({
    portalId: DAMAGE_TOOLTIP_PORTAL_ID,
    kind: 'damage',
    offset: 12,
    getHtml: () => (currentId ? htmlProvider?.(currentId) ?? '' : ''),
    onHideLive: () => {
      currentId = null;
    },
  });
  return shell;
}

/**
 * @returns {HTMLElement|null}
 */
function ensurePortal() {
  if (typeof document === 'undefined') return null;
  let el = document.getElementById(DAMAGE_TOOLTIP_PORTAL_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = DAMAGE_TOOLTIP_PORTAL_ID;
    el.className = 'skill-tooltip damage-tooltip';
    el.style.display = 'none';
    document.body.appendChild(el);
  }
  return el;
}

/**
 * @param {(id: string) => string|null} provider
 */
export function setDamageTooltipProvider(provider) {
  htmlProvider = typeof provider === 'function' ? provider : null;
}

export function initDamageTooltip() {
  if (!ensurePortal()) return;
  getShell().attach();
}

/**
 * @param {string} id
 * @param {number} clientX
 * @param {number} clientY
 */
export function showDamageTooltip(id, clientX, clientY) {
  const key = String(id ?? '').trim();
  if (!key || !htmlProvider) return;
  const html = htmlProvider(key);
  if (!html) return;
  currentId = key;
  getShell().present(html, clientX, clientY, {
    getHtml: () => htmlProvider?.(key) ?? '',
    meta: { damageId: key },
    zIndex: DAMAGE_TOOLTIP_Z,
  });
}

/**
 * @param {number} clientX
 * @param {number} clientY
 */
export function moveDamageTooltip(clientX, clientY) {
  getShell().move(clientX, clientY);
}

export function hideDamageTooltip() {
  // Keep the tooltip alive when the pointer moves onto it (pin button) so it can be
  // pinned like the other tooltips.
  getShell().hide(false, { deferIfOverPortal: true });
}

export function destroyDamageTooltip() {
  currentId = null;
  htmlProvider = null;
  if (shell) shell.hide(true);
}
