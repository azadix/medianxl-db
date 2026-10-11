/**
 * @file Shared live tooltip portal shell (present/move/hide + pin/Alt wiring).
 * @module shared/live-tooltip-shell
 */

import {
  bindLiveTooltip,
  initTooltipPinning,
  maybeAltStickLiveTooltip,
  setNestedSkillTooltipHandlers,
  shouldSuppressLiveTooltipHide,
  updateLiveTooltipBinding,
} from '@/shared/tooltip-pinning.js';

export const TOOLTIP_OFFSET = 15;
export const TOOLTIP_VIEWPORT_MARGIN = 12;
export const NESTED_SKILL_TOOLTIP_Z = '10070';

/**
 * @typedef {{
 *   showSkill: (skillId: string, clientX: number, clientY: number, fromEl: HTMLElement) => void|Promise<void>,
 *   moveSkill?: (clientX: number, clientY: number) => void,
 *   hideSkill?: () => void,
 *   isShowing?: () => boolean,
 * }} NestedSkillHandlers
 */

/**
 * @typedef {{
 *   portalId?: string,
 *   portal?: HTMLElement|null,
 *   kind?: string,
 *   offset?: number,
 *   viewportMargin?: number,
 *   getHtml?: (() => string|Promise<string>)|null,
 *   onHideLive?: (() => void)|null,
 * }} LiveTooltipShellOptions
 */

/**
 * Clamp a tooltip portal near the cursor inside the viewport.
 * @param {HTMLElement} node
 * @param {number} clientX
 * @param {number} clientY
 * @param {{ offset?: number, viewportMargin?: number }} [opts]
 */
export function applyTooltipPosition(node, clientX, clientY, opts = {}) {
  if (!node) return;
  const offset = opts.offset ?? TOOLTIP_OFFSET;
  const margin = opts.viewportMargin ?? TOOLTIP_VIEWPORT_MARGIN;
  const baseLeft = clientX + offset;
  const baseTop = clientY + offset;
  const rect = node.getBoundingClientRect();
  let nextLeft = baseLeft;
  let nextTop = baseTop;
  const maxLeft = window.innerWidth - rect.width - margin;
  const maxTop = window.innerHeight - rect.height - margin;
  if (nextLeft > maxLeft) nextLeft = Math.max(margin, maxLeft);
  if (nextTop > maxTop) nextTop = Math.max(margin, maxTop);
  node.style.left = `${nextLeft}px`;
  node.style.top = `${nextTop}px`;
}

/**
 * @param {LiveTooltipShellOptions} options
 */
export function createLiveTooltipShell(options = {}) {
  const kind = String(options.kind || 'tooltip');
  const offset = options.offset ?? TOOLTIP_OFFSET;
  const viewportMargin = options.viewportMargin ?? TOOLTIP_VIEWPORT_MARGIN;
  /** @type {HTMLElement|null} */
  let portal =
    options.portal ||
    (options.portalId ? document.getElementById(options.portalId) : null);
  /** @type {(() => string|Promise<string>)|null} */
  let defaultGetHtml = options.getHtml || null;
  /** @type {(() => void)|null} */
  let onHideLive = options.onHideLive || null;
  let positionRafId = 0;
  let pendingClientX = 0;
  let pendingClientY = 0;
  let attached = false;

  function resolvePortal() {
    if (portal && portal.isConnected) return portal;
    if (options.portalId) {
      portal = document.getElementById(options.portalId);
    }
    return portal;
  }

  function isShowing() {
    const node = resolvePortal();
    return Boolean(node && node.style.display !== 'none');
  }

  function isPointerOverPortal() {
    const node = resolvePortal();
    if (!node || node.style.display === 'none') return false;
    try {
      return node.matches(':hover') || Boolean(node.querySelector(':hover'));
    } catch {
      return false;
    }
  }

  function clearPortal() {
    if (positionRafId) {
      cancelAnimationFrame(positionRafId);
      positionRafId = 0;
    }
    const node = resolvePortal();
    if (!node) return;
    node.style.display = 'none';
    node.innerHTML = '';
    node.style.zIndex = '';
  }

  /**
   * @param {Partial<{ getHtml: (() => string|Promise<string>)|null, onHideLive: (() => void)|null }>} [patch]
   */
  function attach(patch = {}) {
    const node = resolvePortal();
    if (!node) return false;
    if ('getHtml' in patch) defaultGetHtml = patch.getHtml || null;
    if ('onHideLive' in patch) onHideLive = patch.onHideLive || null;
    initTooltipPinning();
    bindLiveTooltip(node, {
      kind,
      getHtml: defaultGetHtml,
      meta: {},
      onHideLive: () => {
        onHideLive?.();
      },
    });
    attached = true;
    return true;
  }

  function detach() {
    hide(true);
    attached = false;
  }

  /**
   * @param {string} html
   * @param {number} clientX
   * @param {number} clientY
   * @param {{
   *   meta?: Record<string, unknown>,
   *   getHtml?: (() => string|Promise<string>)|null,
   *   zIndex?: string|number|null,
   * }} [opts]
   */
  function present(html, clientX, clientY, opts = {}) {
    const node = resolvePortal();
    if (!node || !html) {
      hide(true);
      return false;
    }
    if (!attached) attach();
    const getHtml = opts.getHtml !== undefined ? opts.getHtml : defaultGetHtml;
    if (opts.getHtml !== undefined) defaultGetHtml = opts.getHtml || null;
    node.innerHTML = html;
    node.style.display = 'block';
    if (opts.zIndex != null && opts.zIndex !== '') {
      node.style.zIndex = String(opts.zIndex);
    }
    // Sync position before Alt-stick can promote.
    applyTooltipPosition(node, clientX, clientY, { offset, viewportMargin });
    pendingClientX = clientX;
    pendingClientY = clientY;
    updateLiveTooltipBinding(node, {
      getHtml: getHtml || null,
      meta: opts.meta && typeof opts.meta === 'object' ? opts.meta : {},
    });
    maybeAltStickLiveTooltip(node);
    return true;
  }

  /**
   * Replace live HTML without repositioning or Alt-stick (e.g. roll refresh).
   * @param {string} html
   * @param {{
   *   meta?: Record<string, unknown>,
   *   getHtml?: (() => string|Promise<string>)|null,
   * }} [opts]
   */
  function updateContent(html, opts = {}) {
    const node = resolvePortal();
    if (!node || !html || !isShowing()) return false;
    const getHtml = opts.getHtml !== undefined ? opts.getHtml : defaultGetHtml;
    if (opts.getHtml !== undefined) defaultGetHtml = opts.getHtml || null;
    node.innerHTML = html;
    updateLiveTooltipBinding(node, {
      getHtml: getHtml || null,
      meta: opts.meta && typeof opts.meta === 'object' ? opts.meta : {},
    });
    return true;
  }

  /**
   * @param {number} clientX
   * @param {number} clientY
   */
  function move(clientX, clientY) {
    pendingClientX = clientX;
    pendingClientY = clientY;
    if (positionRafId) return;
    positionRafId = requestAnimationFrame(() => {
      positionRafId = 0;
      const node = resolvePortal();
      if (!node || !isShowing()) return;
      applyTooltipPosition(node, pendingClientX, pendingClientY, {
        offset,
        viewportMargin,
      });
    });
  }

  /**
   * @param {boolean} [force]
   * @param {{ deferIfOverPortal?: boolean }} [opts]
   */
  function hide(force = false, opts = {}) {
    const node = resolvePortal();
    if (!force && shouldSuppressLiveTooltipHide(node)) return;
    if (!force && opts.deferIfOverPortal) {
      requestAnimationFrame(() => {
        if (shouldSuppressLiveTooltipHide(resolvePortal())) return;
        if (isPointerOverPortal()) return;
        clearPortal();
      });
      return;
    }
    clearPortal();
  }

  /**
   * @param {NestedSkillHandlers|null} handlers
   */
  function setNestedHandlers(handlers) {
    setNestedSkillTooltipHandlers(handlers);
  }

  return {
    attach,
    detach,
    present,
    updateContent,
    move,
    hide,
    isShowing,
    setNestedHandlers,
    getPortal: resolvePortal,
    isPointerOverPortal,
    get offset() {
      return offset;
    },
  };
}
