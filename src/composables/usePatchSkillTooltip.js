/**
 * @file Patch notes skill highlight tooltips (hover/focus).
 * @module src/composables/usePatchSkillTooltip
 */
import { onMounted, onUnmounted, ref } from 'vue';
import {
  buildTooltipHtmlForSkill,
  getCachedPatchSkillTooltipHtml,
  getSkillRecordFromElement,
} from './usePatchNotesData.js';

const TOOLTIP_OFFSET = 18;
const TOOLTIP_VIEWPORT_MARGIN = 12;

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

  function presentTooltip(node, html, clientX, clientY) {
    node.innerHTML = html;
    node.style.display = 'block';
    updateTooltipPosition(clientX, clientY);
  }

  function hideSkillTooltip() {
    if (positionRafId) {
      cancelAnimationFrame(positionRafId);
      positionRafId = 0;
    }
    currentHoveredTarget = null;
    const node = tooltipElement.value;
    if (node) node.style.display = 'none';
  }

  async function showSkillTooltip(target, clientX, clientY) {
    const skillRecord = getSkillRecordFromElement(target);
    if (!skillRecord) {
      hideSkillTooltip();
      return;
    }

    const node = tooltipElement.value;
    if (!node) return;

    if (currentHoveredTarget === target && isTooltipShowing()) {
      updateTooltipPosition(clientX, clientY);
      return;
    }

    currentHoveredTarget = target;

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
      hideSkillTooltip();
      return;
    }
    if (currentHoveredTarget !== target) return;

    presentTooltip(node, html, clientX, clientY);
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
      hideSkillTooltip();
    }
  }

  onMounted(async () => {
    await loadPatchData();
    const root = patchNotesRoot.value;
    if (!root) return;
    const node = tooltipElement.value;
    if (node) node.style.display = 'none';
    root.addEventListener('mouseover', onPatchMouseOver);
    root.addEventListener('mousemove', onPatchMouseMove);
    root.addEventListener('mouseout', onPatchMouseOut);
    root.addEventListener('focusin', onPatchFocusIn);
    root.addEventListener('focusout', onPatchFocusOut);
    root.addEventListener('keydown', onPatchKeyDown);
  });

  onUnmounted(() => {
    if (positionRafId) {
      cancelAnimationFrame(positionRafId);
      positionRafId = 0;
    }
    const root = patchNotesRoot.value;
    if (!root) return;
    root.removeEventListener('mouseover', onPatchMouseOver);
    root.removeEventListener('mousemove', onPatchMouseMove);
    root.removeEventListener('mouseout', onPatchMouseOut);
    root.removeEventListener('focusin', onPatchFocusIn);
    root.removeEventListener('focusout', onPatchFocusOut);
    root.removeEventListener('keydown', onPatchKeyDown);
  });

  return {
    tooltipElement,
    hideSkillTooltip,
  };
}
