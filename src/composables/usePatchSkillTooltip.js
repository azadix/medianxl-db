/**
 * @file Patch notes skill highlight tooltips (hover/focus).
 * @module src/composables/usePatchSkillTooltip
 */
import { onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from 'vue';
import {
  buildTooltipHtmlForSkill,
  getCachedPatchSkillTooltipHtml,
  getSkillRecordFromElement,
} from './usePatchNotesData.js';
import { buildFixedLevelSkillTooltipHtml } from '@/skills/fixed-level-skill-tooltip.js';
import {
  bindLiveTooltip,
  initTooltipPinning,
  maybeAltStickLiveTooltip,
  setNestedSkillTooltipHandlers,
  shouldSuppressLiveTooltipHide,
  updateLiveTooltipBinding,
} from '@/shared/tooltip-pinning.js';
export const PATCH_NOTE_SKILL_TOOLTIP_ID = 'patch-note-skill-tooltip-portal';

const TOOLTIP_OFFSET = 18;
const TOOLTIP_VIEWPORT_MARGIN = 12;
const NESTED_SKILL_TOOLTIP_Z = '10070';

/**
 * @param {object} opts
 * @param {import('vue').Ref<HTMLElement|null>} opts.patchNotesRoot
 * @param {() => Promise<void>} opts.loadPatchData
 * @returns {object}
 */
export function usePatchSkillTooltip({ patchNotesRoot, loadPatchData }) {
  const tooltipElement = ref(null);
  let tooltipTokenCounter = 0;
  let positionRafId = 0;
  let pendingClientX = 0;
  let pendingClientY = 0;
  /** @type {HTMLElement|null} */
  let currentHoveredTarget = null;
  /** @type {string} */
  let lastHtml = '';
  /** @type {object|null} */
  let lastSkillRecord = null;
  let nestedActive = false;

  function isTooltipShowing() {
    const node = tooltipElement.value;
    return Boolean(node && node.style.display !== 'none');
  }

  function applyTooltipPosition(node, clientX, clientY) {
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

  function updateTooltipPosition(clientX, clientY) {
    pendingClientX = clientX;
    pendingClientY = clientY;
    if (positionRafId) return;
    positionRafId = requestAnimationFrame(() => {
      positionRafId = 0;
      const node = tooltipElement.value;
      if (!node || !isTooltipShowing()) return;
      applyTooltipPosition(node, pendingClientX, pendingClientY);
    });
  }

  /**
   * @returns {string}
   */
  function rebuildLastHtml() {
    if (lastHtml) return lastHtml;
    if (!lastSkillRecord) return '';
    return getCachedPatchSkillTooltipHtml(lastSkillRecord) || '';
  }

  function presentTooltip(node, html, clientX, clientY) {
    lastHtml = html;
    node.innerHTML = html;
    node.style.display = 'block';
    // Sync position before Alt-stick can promote (avoid -9999px flash).
    applyTooltipPosition(node, clientX, clientY);
    updateLiveTooltipBinding(node, {
      getHtml: () => rebuildLastHtml(),
      meta: {
        skillId: lastSkillRecord?.id ?? null,
        nested: nestedActive,
      },
    });
    maybeAltStickLiveTooltip(node);
  }

  /**
   * @param {boolean} [force]
   */
  function hideSkillTooltip(force = false) {
    const node = tooltipElement.value;
    if (!force && shouldSuppressLiveTooltipHide(node)) return;
    if (positionRafId) {
      cancelAnimationFrame(positionRafId);
      positionRafId = 0;
    }
    currentHoveredTarget = null;
    nestedActive = false;
    if (node) {
      node.style.display = 'none';
      node.style.zIndex = '';
    }
  }

  async function showSkillTooltip(target, clientX, clientY) {
    const skillRecord = getSkillRecordFromElement(target);
    if (!skillRecord) {
      hideSkillTooltip(true);
      return;
    }

    const node = tooltipElement.value;
    if (!node) return;

    if (currentHoveredTarget === target && isTooltipShowing()) {
      updateTooltipPosition(clientX, clientY);
      return;
    }

    currentHoveredTarget = target;
    lastSkillRecord = skillRecord;
    nestedActive = false;
    node.style.zIndex = '';

    const cached = getCachedPatchSkillTooltipHtml(skillRecord);
    if (cached) {
      presentTooltip(node, cached, clientX, clientY);
      return;
    }

    const token = ++tooltipTokenCounter;
    let html;
    try {
      html = await buildTooltipHtmlForSkill(skillRecord);
    } catch (error) {
      console.warn('Patch-note tooltip build failed:', error);
    }
    if (token !== tooltipTokenCounter) return;
    if (!html) {
      hideSkillTooltip(true);
      return;
    }
    if (currentHoveredTarget !== target) return;

    presentTooltip(node, html, clientX, clientY);
  }

  /**
   * Nested skill tooltip from a pinned/stuck patch-note tooltip.
   * @param {string} skillId
   * @param {number} clientX
   * @param {number} clientY
   */
  async function showNestedSkillTooltip(skillId, clientX, clientY) {
    const node = tooltipElement.value;
    const id = String(skillId || '').trim();
    if (!node || !id) return;
    nestedActive = true;
    currentHoveredTarget = null;
    lastSkillRecord = { id };
    node.style.left = `${Math.max(0, clientX + TOOLTIP_OFFSET)}px`;
    node.style.top = `${Math.max(0, clientY + TOOLTIP_OFFSET)}px`;
    node.style.zIndex = NESTED_SKILL_TOOLTIP_Z;
    const html = await buildFixedLevelSkillTooltipHtml(id, 1);
    if (!html || !nestedActive) return;
    presentTooltip(node, html, clientX, clientY);
    node.style.zIndex = NESTED_SKILL_TOOLTIP_Z;
  }

  function attachPinningAndNestedHandlers() {
    const node = tooltipElement.value;
    if (!node) return;
    if (!node.id) node.id = PATCH_NOTE_SKILL_TOOLTIP_ID;
    initTooltipPinning();
    bindLiveTooltip(node, {
      kind: 'skill',
      getHtml: () => rebuildLastHtml(),
      meta: {},
      onHideLive: () => {
        currentHoveredTarget = null;
      },
    });
    setNestedSkillTooltipHandlers({
      showSkill: (skillId, clientX, clientY) => showNestedSkillTooltip(skillId, clientX, clientY),
      moveSkill: (clientX, clientY) => updateTooltipPosition(clientX, clientY),
      hideSkill: () => hideSkillTooltip(true),
      isShowing: () => isTooltipShowing(),
    });
  }

  function closestSkillTarget(eventTarget) {
    if (eventTarget instanceof Element) {
      return eventTarget.closest('.patch-skill-highlight');
    }
    if (eventTarget instanceof Node && eventTarget.nodeType === Node.TEXT_NODE) {
      return eventTarget.parentElement?.closest('.patch-skill-highlight') || null;
    }
    return null;
  }

  function onPatchMouseOver(event) {
    const target = closestSkillTarget(event.target);
    if (!target) return;
    showSkillTooltip(target, event.clientX || 0, event.clientY || 0);
  }

  function onPatchMouseMove(event) {
    if (!isTooltipShowing()) return;
    const target = closestSkillTarget(event.target);
    if (!target) return;
    updateTooltipPosition(event.clientX || 0, event.clientY || 0);
  }

  function onPatchMouseOut(event) {
    const leavingFrom = closestSkillTarget(event.target);
    if (!leavingFrom) return;
    const stillInside = closestSkillTarget(event.relatedTarget);
    if (stillInside === leavingFrom) return;
    if (stillInside) return;
    hideSkillTooltip();
  }

  function onPatchFocusIn(event) {
    const target = closestSkillTarget(event.target);
    if (!target) return;
    const rect = target.getBoundingClientRect();
    showSkillTooltip(target, rect.left + rect.width / 2, rect.bottom);
  }

  function onPatchFocusOut(event) {
    const from = closestSkillTarget(event.target);
    if (!from) return;
    const to = closestSkillTarget(event.relatedTarget);
    if (to === from) return;
    if (to) return;
    hideSkillTooltip();
  }

  function onPatchKeyDown(event) {
    if (event.key === 'Escape') {
      hideSkillTooltip(true);
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

  onMounted(async () => {
    await loadPatchData();
    const node = tooltipElement.value;
    if (node) node.style.display = 'none';
    bindRootListeners();
    attachPinningAndNestedHandlers();
  });

  onActivated(() => {
    attachPinningAndNestedHandlers();
  });

  onDeactivated(() => {
    hideSkillTooltip(true);
    setNestedSkillTooltipHandlers(null);
  });

  onUnmounted(() => {
    if (positionRafId) {
      cancelAnimationFrame(positionRafId);
      positionRafId = 0;
    }
    unbindRootListeners();
    hideSkillTooltip(true);
    setNestedSkillTooltipHandlers(null);
  });

  watch(tooltipElement, (node) => {
    if (node) attachPinningAndNestedHandlers();
  });

  return {
    tooltipElement,
    hideSkillTooltip,
  };
}
