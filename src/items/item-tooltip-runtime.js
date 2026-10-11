/**
 * @file Planner item tooltip show/hide/position (mirrors skill tooltip UX).
 * @module items/item-tooltip-runtime
 */

import { buildItemTooltipHtml } from '@/items/item-tooltip.js';
import { useItemsStore } from '@/stores/items.js';
import {
  bindLiveTooltip,
  initTooltipPinning,
  maybeAltStickLiveTooltip,
  refreshPinnedHosts,
  shouldSuppressLiveTooltipHide,
  updateLiveTooltipBinding,
} from '@/shared/tooltip-pinning.js';

const TOOLTIP_OFFSET = 15;
const TOOLTIP_VIEWPORT_MARGIN = 12;

/** @type {HTMLElement|null} */
let tooltipElement = null;
let positionRafId = 0;
let pendingClientX = 0;
let pendingClientY = 0;

/**
 * @typedef {{
 *   def: object,
 *   iconKey: string|null|undefined,
 *   rolls: Record<string, number>|null|undefined,
 *   options: Record<string, unknown>,
 * }} ItemTooltipState
 */

/** @type {ItemTooltipState|null} */
let lastState = null;

/**
 * Bind to `#item-tooltip-portal` (call from ItemTooltipHost onMounted).
 */
export function initItemTooltip() {
  tooltipElement = document.getElementById('item-tooltip-portal');
  initTooltipPinning();
  if (tooltipElement) {
    bindLiveTooltip(tooltipElement, {
      kind: 'item',
      getHtml: () => buildHtmlFromState(lastState),
      meta: {},
      onHideLive: () => {
        /* portal cleared by promote */
      },
    });
  }
}

export function destroyItemTooltip() {
  hideItemTooltip(true);
  tooltipElement = null;
  lastState = null;
}

function isShowing() {
  return Boolean(tooltipElement && tooltipElement.style.display !== 'none');
}

/**
 * @param {ItemTooltipState|null|undefined} state
 * @returns {string}
 */
function buildHtmlFromState(state) {
  if (!state?.def) return '';
  const instanceId = state.options?.instanceId;
  if (instanceId != null) {
    try {
      const store = useItemsStore();
      if (!store.instances[instanceId]) return '';
      const def = store.getDefForInstance(instanceId);
      if (!def) return '';
      const equipSlot =
        state.options?.equipSlot != null ? String(state.options.equipSlot) : null;
      const baseOpts = store.getTooltipOptionsForDef(def, equipSlot);
      return buildItemTooltipHtml(
        def,
        store.getIconForInstance(instanceId),
        store.getRollsForInstance(instanceId),
        {
          ...state.options,
          ...baseOpts,
          extras: store.getExtrasForInstance(instanceId),
          mysticOrbs: store.getMysticOrbsForInstance(instanceId),
          instanceId,
          equipSlot,
        }
      );
    } catch {
      // Pinia may be unavailable in some unit contexts.
    }
  }
  return buildItemTooltipHtml(state.def, state.iconKey, state.rolls, state.options);
}

/**
 * Snapshot state + getter for pinning (does not share mutable lastState).
 * @param {ItemTooltipState} state
 * @returns {() => string}
 */
function makeHtmlGetter(state) {
  const snapshot = {
    def: state.def,
    iconKey: state.iconKey,
    rolls: state.rolls,
    options: { ...state.options },
  };
  return () => buildHtmlFromState(snapshot);
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
export function moveItemTooltip(clientX, clientY) {
  pendingClientX = clientX;
  pendingClientY = clientY;
  if (positionRafId) return;
  positionRafId = requestAnimationFrame(() => {
    positionRafId = 0;
    const node = tooltipElement;
    if (!node || !isShowing()) return;
    // Keep last coords for hide hit-testing even when not repositioning.
    applyPosition(node, pendingClientX, pendingClientY);
  });
}

/**
 * @returns {boolean}
 */
function isPointerOverLiveTooltip() {
  const node = tooltipElement;
  if (!node || node.style.display === 'none') return false;
  try {
    return node.matches(':hover') || Boolean(node.querySelector(':hover'));
  } catch {
    return false;
  }
}

/**
 * @param {boolean} [force]
 */
export function hideItemTooltip(force = false) {
  if (!force && shouldSuppressLiveTooltipHide(tooltipElement)) return;
  if (!force) {
    // Moving from an item onto the pin button leaves the item first.
    requestAnimationFrame(() => {
      if (shouldSuppressLiveTooltipHide(tooltipElement)) return;
      if (isPointerOverLiveTooltip()) return;
      clearLiveTooltip();
    });
    return;
  }
  clearLiveTooltip();
}

function clearLiveTooltip() {
  if (positionRafId) {
    cancelAnimationFrame(positionRafId);
    positionRafId = 0;
  }
  const node = tooltipElement;
  if (node) {
    node.style.display = 'none';
    node.innerHTML = '';
  }
}

/**
 * @param {object|null|undefined} def
 * @param {string|null|undefined} iconKey
 * @param {number} clientX
 * @param {number} clientY
 * @param {Record<string, number>|null|undefined} [rolls]
 * @param {{
 *   characterLevel?: number|null,
 *   charmInInventory?: boolean,
 *   instanceId?: number|null,
 *   equipSlot?: string|null,
 *   [key: string]: unknown,
 * }} [options]
 */
export function showItemTooltip(def, iconKey, clientX, clientY, rolls = null, options = {}) {
  const node = tooltipElement;
  if (!node || !def) {
    hideItemTooltip(true);
    return;
  }
  const state = {
    def,
    iconKey,
    rolls,
    options: options && typeof options === 'object' ? { ...options } : {},
  };
  lastState = state;
  const html = buildItemTooltipHtml(def, iconKey, rolls, options);
  if (!html) {
    hideItemTooltip(true);
    return;
  }
  node.innerHTML = html;
  node.style.display = 'block';
  updateLiveTooltipBinding(node, {
    getHtml: makeHtmlGetter(state),
    meta: {
      instanceId: options.instanceId ?? null,
      itemId: def.id ?? null,
    },
  });
  moveItemTooltip(clientX, clientY);
  maybeAltStickLiveTooltip(node);
}

/**
 * Rebuild live + pinned item tooltips (e.g. after roll / equip changes).
 * @param {{ instanceId?: number|null }} [filter]
 * @returns {Promise<void>}
 */
export async function refreshItemTooltips(filter = {}) {
  const node = tooltipElement;
  if (node && isShowing() && lastState?.def) {
    const html = buildHtmlFromState(lastState);
    if (html) {
      node.innerHTML = html;
      updateLiveTooltipBinding(node, {
        getHtml: makeHtmlGetter(lastState),
        meta: {
          instanceId: lastState.options?.instanceId ?? null,
          itemId: lastState.def?.id ?? null,
        },
      });
    }
  }

  const wantId = filter.instanceId;
  await refreshPinnedHosts((host) => {
    if (host.kind !== 'item') return false;
    if (wantId == null) return true;
    return Number(host.meta?.instanceId) === Number(wantId);
  });
}
