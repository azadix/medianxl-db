/**
 * @file Planner item tooltip show/hide/position (mirrors skill tooltip UX).
 * @module items/item-tooltip-runtime
 */

import { buildItemTooltipHtml } from '@/items/item-tooltip.js';
import { useItemsStore } from '@/stores/items.js';
import { refreshPinnedHosts } from '@/shared/tooltip-pinning.js';
import { createLiveTooltipShell } from '@/shared/live-tooltip-shell.js';

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

const shell = createLiveTooltipShell({
  portalId: 'item-tooltip-portal',
  kind: 'item',
  getHtml: () => buildHtmlFromState(lastState),
});

/**
 * Bind to `#item-tooltip-portal` (call from ItemTooltipHost onMounted).
 */
export function initItemTooltip() {
  shell.attach({
    getHtml: () => buildHtmlFromState(lastState),
  });
}

export function destroyItemTooltip() {
  shell.detach();
  lastState = null;
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
          socketables: store.getSocketablesForInstance(instanceId),
          ...store.getItemBonusOptionsForInstance(instanceId),
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
 * @param {number} clientX
 * @param {number} clientY
 */
export function moveItemTooltip(clientX, clientY) {
  shell.move(clientX, clientY);
}

/**
 * @param {boolean} [force]
 */
export function hideItemTooltip(force = false) {
  shell.hide(force, { deferIfOverPortal: !force });
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
  if (!def) {
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
  const html = buildHtmlFromState(state);
  if (!html) {
    hideItemTooltip(true);
    return;
  }
  shell.present(html, clientX, clientY, {
    getHtml: makeHtmlGetter(state),
    meta: {
      instanceId: options.instanceId ?? null,
      itemId: def.id ?? null,
    },
  });
}

/**
 * Rebuild live + pinned item tooltips (e.g. after roll / equip changes).
 * @param {{ instanceId?: number|null }} [filter]
 * @returns {Promise<void>}
 */
export async function refreshItemTooltips(filter = {}) {
  if (shell.isShowing() && lastState?.def) {
    const html = buildHtmlFromState(lastState);
    if (html) {
      shell.updateContent(html, {
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
