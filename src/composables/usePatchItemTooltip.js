/**
 * @file Patch notes item highlight tooltips (hover/focus).
 * @module src/composables/usePatchItemTooltip
 */
import { onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from 'vue';
import { ensureSkillStoreForFolder } from './usePatchNotesData.js';
import {
  getPatchItemRecordFromElement,
  patchItemTooltipOptions,
} from '@/items/patch-item-catalog.js';
import {
  buildItemTooltipHtml,
  buildMysticOrbTooltipHtml,
  buildRuneTooltipHtml,
  buildSetOverviewTooltipHtml,
} from '@/items/item-tooltip.js';
import { buildFixedLevelSkillTooltipHtml } from '@/skills/fixed-level-skill-tooltip.js';
import { readNestedSkillTooltipAttrs } from '@/shared/tooltip-html.js';
import {
  NESTED_SKILL_TOOLTIP_Z,
  createLiveTooltipShell,
} from '@/shared/live-tooltip-shell.js';
import { hideSkillPreviewTooltip, isSkillPreviewUiTarget } from '@/skills/skill-preview-tooltip.js';

export const PATCH_NOTE_ITEM_TOOLTIP_ID = 'patch-note-item-tooltip-portal';

const tooltipHtmlByKey = new Map();

/**
 * @param {object|null|undefined} record
 * @returns {string}
 */
function recordCacheKey(record) {
  if (!record) return '';
  const name = record.displayName || record.loweredName || '';
  return `${record.folderKey || ''}:${record.kind || 'item'}:${name}`;
}

/**
 * @param {object} record
 * @returns {Promise<string>}
 */
async function buildTooltipHtmlForPatchItem(record) {
  if (!record) return '';
  const key = recordCacheKey(record);
  if (key && tooltipHtmlByKey.has(key)) return tooltipHtmlByKey.get(key) || '';
  if (record.folderKey) {
    await ensureSkillStoreForFolder(record.folderKey);
  }
  const html =
    record.kind === 'set'
      ? buildSetOverviewTooltipHtml(record.setDef, record.pieces)
      : record.kind === 'rune'
        ? buildRuneTooltipHtml(record.row)
        : record.kind === 'mo'
          ? buildMysticOrbTooltipHtml(record.row)
          : buildItemTooltipHtml(record.def, null, null, patchItemTooltipOptions(record));
  if (key) tooltipHtmlByKey.set(key, html);
  return html;
}

/**
 * @param {object} opts
 * @param {import('vue').Ref<HTMLElement|null>} opts.patchNotesRoot
 * @param {() => void} [opts.hideSkillTooltip]
 * @returns {object}
 */
export function usePatchItemTooltip({ patchNotesRoot, hideSkillTooltip }) {
  const itemTooltipElement = ref(null);
  let tooltipTokenCounter = 0;
  /** @type {HTMLElement|null} */
  let currentHoveredTarget = null;
  /** @type {string} */
  let lastHtml = '';
  /** @type {object|null} */
  let lastRecord = null;
  let nestedActive = false;

  const shell = createLiveTooltipShell({
    portalId: PATCH_NOTE_ITEM_TOOLTIP_ID,
    kind: 'item',
    offset: 18,
    getHtml: () => rebuildLastHtml(),
    onHideLive: () => {
      currentHoveredTarget = null;
    },
  });

  /**
   * @returns {string}
   */
  function rebuildLastHtml() {
    if (lastHtml) return lastHtml;
    if (!lastRecord) return '';
    return tooltipHtmlByKey.get(recordCacheKey(lastRecord)) || '';
  }

  function presentTooltip(html, clientX, clientY) {
    lastHtml = html;
    shell.present(html, clientX, clientY, {
      getHtml: () => rebuildLastHtml(),
      meta: {
        itemKind: lastRecord?.kind ?? null,
        nested: nestedActive,
      },
      zIndex: nestedActive ? NESTED_SKILL_TOOLTIP_Z : null,
    });
  }

  /**
   * @param {boolean} [force]
   */
  function hideItemTooltip(force = false) {
    hideSkillPreviewTooltip();
    shell.hide(force);
    if (force || !shell.isShowing()) {
      currentHoveredTarget = null;
      nestedActive = false;
    }
  }

  async function showItemTooltip(target, clientX, clientY) {
    const record = getPatchItemRecordFromElement(target);
    if (!record) {
      hideItemTooltip(true);
      return;
    }

    if (currentHoveredTarget === target && shell.isShowing()) {
      shell.move(clientX, clientY);
      return;
    }

    hideSkillTooltip?.();
    currentHoveredTarget = target;
    lastRecord = record;
    nestedActive = false;

    const cached = tooltipHtmlByKey.get(recordCacheKey(record));
    if (cached) {
      presentTooltip(cached, clientX, clientY);
      return;
    }

    const token = ++tooltipTokenCounter;
    let html;
    try {
      html = await buildTooltipHtmlForPatchItem(record);
    } catch (error) {
      console.warn('Patch-note item tooltip build failed:', error);
    }
    if (token !== tooltipTokenCounter) return;
    if (!html) {
      hideItemTooltip(true);
      return;
    }
    if (currentHoveredTarget !== target) return;

    presentTooltip(html, clientX, clientY);
  }

  /**
   * @param {string} skillId
   * @param {number} clientX
   * @param {number} clientY
   * @param {HTMLElement|null} [fromEl]
   */
  async function showNestedSkillTooltip(skillId, clientX, clientY, fromEl = null) {
    const id = String(skillId || '').trim();
    if (!id) return;
    nestedActive = true;
    currentHoveredTarget = null;
    if (lastRecord?.folderKey) {
      await ensureSkillStoreForFolder(lastRecord.folderKey);
    }
    const nested = readNestedSkillTooltipAttrs(fromEl instanceof Element ? fromEl : null);
    const level = nested.level != null ? nested.level : 1;
    const html = await buildFixedLevelSkillTooltipHtml(id, level, { asProc: nested.asProc });
    if (!html || !nestedActive) return;
    presentTooltip(html, clientX, clientY);
  }

  function attachPinningAndNestedHandlers() {
    const node = itemTooltipElement.value || shell.getPortal();
    if (node && !node.id) node.id = PATCH_NOTE_ITEM_TOOLTIP_ID;
    shell.attach({
      getHtml: () => rebuildLastHtml(),
      onHideLive: () => {
        currentHoveredTarget = null;
      },
    });
    shell.setNestedHandlers({
      showSkill: (skillId, clientX, clientY, fromEl) =>
        showNestedSkillTooltip(skillId, clientX, clientY, fromEl),
      moveSkill: (clientX, clientY) => shell.move(clientX, clientY),
      hideSkill: () => hideItemTooltip(true),
      isShowing: () => shell.isShowing(),
    });
  }

  function closestItemTarget(eventTarget) {
    if (eventTarget instanceof Element) {
      return eventTarget.closest('.patch-item-highlight');
    }
    if (eventTarget instanceof Node && eventTarget.nodeType === Node.TEXT_NODE) {
      return eventTarget.parentElement?.closest('.patch-item-highlight') || null;
    }
    return null;
  }

  function onPatchMouseOver(event) {
    const target = closestItemTarget(event.target);
    if (!target) return;
    showItemTooltip(target, event.clientX || 0, event.clientY || 0);
  }

  function onPatchMouseMove(event) {
    if (!shell.isShowing()) return;
    const target = closestItemTarget(event.target);
    if (!target) return;
    shell.move(event.clientX || 0, event.clientY || 0);
  }

  function onPatchMouseOut(event) {
    const leavingFrom = closestItemTarget(event.target);
    if (!leavingFrom) return;
    const stillInside = closestItemTarget(event.relatedTarget);
    if (stillInside === leavingFrom) return;
    if (stillInside) return;
    if (isSkillPreviewUiTarget(event.relatedTarget)) return;
    hideItemTooltip();
  }

  function onPatchFocusIn(event) {
    const target = closestItemTarget(event.target);
    if (!target) return;
    const rect = target.getBoundingClientRect();
    showItemTooltip(target, rect.left + rect.width / 2, rect.bottom);
  }

  function onPatchFocusOut(event) {
    const from = closestItemTarget(event.target);
    if (!from) return;
    const to = closestItemTarget(event.relatedTarget);
    if (to === from) return;
    if (to) return;
    hideItemTooltip();
  }

  function onPatchKeyDown(event) {
    if (event.key === 'Escape') {
      hideItemTooltip(true);
    }
  }

  function bindRootListeners() {
    const root = patchNotesRoot.value;
    if (!root) return;
    root.addEventListener('mouseover', onPatchMouseOver);
    root.addEventListener('mousemove', onPatchMouseMove);
    root.addEventListener('mouseout', onPatchMouseOut);
    root.addEventListener('focusin', onPatchFocusIn);
    root.addEventListener('focusout', onPatchFocusOut);
    root.addEventListener('keydown', onPatchKeyDown);
  }

  function unbindRootListeners() {
    const root = patchNotesRoot.value;
    if (!root) return;
    root.removeEventListener('mouseover', onPatchMouseOver);
    root.removeEventListener('mousemove', onPatchMouseMove);
    root.removeEventListener('mouseout', onPatchMouseOut);
    root.removeEventListener('focusin', onPatchFocusIn);
    root.removeEventListener('focusout', onPatchFocusOut);
    root.removeEventListener('keydown', onPatchKeyDown);
  }

  onMounted(() => {
    const node = itemTooltipElement.value;
    if (node) node.style.display = 'none';
    bindRootListeners();
    attachPinningAndNestedHandlers();
  });

  onActivated(() => {
    attachPinningAndNestedHandlers();
  });

  onDeactivated(() => {
    hideItemTooltip(true);
    shell.setNestedHandlers(null);
  });

  onUnmounted(() => {
    unbindRootListeners();
    hideItemTooltip(true);
    shell.setNestedHandlers(null);
    shell.detach();
  });

  watch(itemTooltipElement, (node) => {
    if (node) attachPinningAndNestedHandlers();
  });

  return {
    itemTooltipElement,
    hideItemTooltip,
  };
}
