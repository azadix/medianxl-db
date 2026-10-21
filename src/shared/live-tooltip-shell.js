/**
 * @file Shared live tooltip portal shell (present/move/hide + pin/Alt wiring).
 * @module shared/live-tooltip-shell
 */

import {
  bindLiveTooltip,
  initTooltipPinning,
  setNestedSkillTooltipHandlers,
  shouldSuppressLiveTooltipHide,
  syncTooltipPinPlacement,
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
 * Inner node that should scroll when an item tooltip is taller than the viewport.
 * Always the item card so mystic-orb / side panels stay put.
 * @param {HTMLElement} node
 * @returns {HTMLElement|null}
 */
export function getItemTooltipScrollNode(node) {
  if (!node?.classList?.contains('item-tooltip')) return null;
  const card = node.querySelector('.item-tooltip-card');
  return card instanceof HTMLElement ? card : node;
}

/**
 * Cap item tooltips to the viewport and scroll the card (pin stays put).
 * @param {HTMLElement} node
 * @param {number} maxHeight
 */
export function applyItemTooltipOverflow(node, maxHeight) {
  if (!node?.classList?.contains('item-tooltip')) {
    node?.classList?.remove('tooltip-overflow');
    return;
  }
  const maxH = Math.max(0, maxHeight);
  node.style.setProperty('--tooltip-max-height', `${maxH}px`);
  const scroller = getItemTooltipScrollNode(node);
  const overflowing = Boolean(scroller && scroller.scrollHeight > maxH + 1);
  node.classList.toggle('tooltip-overflow', overflowing);
}

/**
 * Clamp a tooltip portal near the cursor inside the viewport.
 * Wide skill+SOURCES rows stack vertically when they cannot fit beside the cursor.
 * @param {HTMLElement} node
 * @param {number} clientX
 * @param {number} clientY
 * @param {{ offset?: number, viewportMargin?: number }} [opts]
 */
export function applyTooltipPosition(node, clientX, clientY, opts = {}) {
  if (!node) return;
  const offset = opts.offset ?? TOOLTIP_OFFSET;
  const margin = opts.viewportMargin ?? TOOLTIP_VIEWPORT_MARGIN;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const availWidth = Math.max(0, vw - margin * 2);

  const panels = node.querySelector('.skill-tooltip-panels');
  if (panels instanceof HTMLElement) {
    panels.classList.remove('is-stacked');
    const rowWidth = Math.max(panels.scrollWidth, node.getBoundingClientRect().width);
    if (rowWidth > availWidth) {
      panels.classList.add('is-stacked');
    }
  }

  applyItemTooltipOverflow(node, vh - margin * 2);

  const rect = node.getBoundingClientRect();
  const spaceRight = vw - clientX - offset - margin;
  const spaceLeft = clientX - offset - margin;
  let nextLeft;
  if (rect.width <= spaceRight) {
    nextLeft = clientX + offset;
  } else if (rect.width <= spaceLeft) {
    nextLeft = clientX - offset - rect.width;
  } else {
    nextLeft = Math.max(margin, vw - rect.width - margin);
  }
  if (nextLeft < margin) nextLeft = margin;
  const maxLeft = vw - rect.width - margin;
  if (nextLeft > maxLeft) nextLeft = Math.max(margin, maxLeft);

  let nextTop = clientY + offset;
  const maxTop = vh - rect.height - margin;
  if (nextTop > maxTop) nextTop = Math.max(margin, maxTop);

  node.style.left = `${nextLeft}px`;
  node.style.top = `${nextTop}px`;
  syncTooltipPinPlacement(node);
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
  let hideGeneration = 0;
  /** @type {(() => void)|null} */
  let portalLeaveCleanup = null;

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

  function unbindPortalLeaveHide() {
    portalLeaveCleanup?.();
    portalLeaveCleanup = null;
  }

  /**
   * Overflowing item tooltips capture the pointer, so a fast leave from the doll
   * can land on the portal and cancel hide. Keep it only while the pointer stays there.
   */
  function bindPortalLeaveHide() {
    unbindPortalLeaveHide();
    const node = resolvePortal();
    if (!node) return;

    const finish = () => {
      unbindPortalLeaveHide();
      if (!isShowing()) return;
      if (shouldSuppressLiveTooltipHide(resolvePortal())) return;
      hide(true);
    };

    const onPointerLeave = (e) => {
      if (e.relatedTarget instanceof Node && node.contains(e.relatedTarget)) return;
      finish();
    };

    const onPointerMove = (e) => {
      let el = null;
      try {
        el = document.elementFromPoint(e.clientX, e.clientY);
      } catch {
        return;
      }
      if (el instanceof Node && node.contains(el)) return;
      finish();
    };

    node.addEventListener('pointerleave', onPointerLeave);
    document.addEventListener('pointermove', onPointerMove, true);
    portalLeaveCleanup = () => {
      node.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('pointermove', onPointerMove, true);
    };
  }

  function clearPortal() {
    unbindPortalLeaveHide();
    if (positionRafId) {
      cancelAnimationFrame(positionRafId);
      positionRafId = 0;
    }
    const node = resolvePortal();
    if (!node) return;
    node.style.display = 'none';
    node.innerHTML = '';
    node.style.zIndex = '';
    node.classList.remove('tooltip-overflow');
    node.style.removeProperty('--tooltip-max-height');
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
    return true;
  }

  function detach() {
    hide(true);
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
    unbindPortalLeaveHide();
    hideGeneration += 1;
    attach();
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
    hideGeneration += 1;
    const getHtml = opts.getHtml !== undefined ? opts.getHtml : defaultGetHtml;
    if (opts.getHtml !== undefined) defaultGetHtml = opts.getHtml || null;
    node.innerHTML = html;
    updateLiveTooltipBinding(node, {
      getHtml: getHtml || null,
      meta: opts.meta && typeof opts.meta === 'object' ? opts.meta : {},
    });
    applyTooltipPosition(node, pendingClientX, pendingClientY, { offset, viewportMargin });
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
      const gen = hideGeneration;
      requestAnimationFrame(() => {
        if (gen !== hideGeneration) return;
        if (shouldSuppressLiveTooltipHide(resolvePortal())) return;
        if (isPointerOverPortal()) {
          bindPortalLeaveHide();
          return;
        }
        hideGeneration += 1;
        clearPortal();
      });
      return;
    }
    hideGeneration += 1;
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
