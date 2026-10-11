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
  NESTED_SKILL_TOOLTIP_Z,
  createLiveTooltipShell,
} from '@/shared/live-tooltip-shell.js';

export const PATCH_NOTE_SKILL_TOOLTIP_ID = 'patch-note-skill-tooltip-portal';

/**
 * @param {object} opts
 * @param {import('vue').Ref<HTMLElement|null>} opts.patchNotesRoot
 * @param {() => Promise<void>} opts.loadPatchData
 * @returns {object}
 */
export function usePatchSkillTooltip({ patchNotesRoot, loadPatchData }) {
  const tooltipElement = ref(null);
  let tooltipTokenCounter = 0;
  /** @type {HTMLElement|null} */
  let currentHoveredTarget = null;
  /** @type {string} */
  let lastHtml = '';
  /** @type {object|null} */
  let lastSkillRecord = null;
  let nestedActive = false;

  const shell = createLiveTooltipShell({
    portalId: PATCH_NOTE_SKILL_TOOLTIP_ID,
    kind: 'skill',
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
    if (!lastSkillRecord) return '';
    return getCachedPatchSkillTooltipHtml(lastSkillRecord) || '';
  }

  function presentTooltip(html, clientX, clientY) {
    lastHtml = html;
    shell.present(html, clientX, clientY, {
      getHtml: () => rebuildLastHtml(),
      meta: {
        skillId: lastSkillRecord?.id ?? null,
        nested: nestedActive,
      },
      zIndex: nestedActive ? NESTED_SKILL_TOOLTIP_Z : null,
    });
  }

  /**
   * @param {boolean} [force]
   */
  function hideSkillTooltip(force = false) {
    shell.hide(force);
    if (force || !shell.isShowing()) {
      currentHoveredTarget = null;
      nestedActive = false;
    }
  }

  async function showSkillTooltip(target, clientX, clientY) {
    const skillRecord = getSkillRecordFromElement(target);
    if (!skillRecord) {
      hideSkillTooltip(true);
      return;
    }

    if (currentHoveredTarget === target && shell.isShowing()) {
      shell.move(clientX, clientY);
      return;
    }

    currentHoveredTarget = target;
    lastSkillRecord = skillRecord;
    nestedActive = false;

    const cached = getCachedPatchSkillTooltipHtml(skillRecord);
    if (cached) {
      presentTooltip(cached, clientX, clientY);
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

    presentTooltip(html, clientX, clientY);
  }

  /**
   * Nested skill tooltip from a pinned/stuck patch-note tooltip.
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
    lastSkillRecord = { id };
    const rawLevel = fromEl instanceof Element ? fromEl.getAttribute('data-tooltip-skill-level') : null;
    const parsedLevel = Math.floor(Number(rawLevel));
    const level =
      rawLevel != null && Number.isFinite(parsedLevel) && parsedLevel > 0 ? parsedLevel : 1;
    const html = await buildFixedLevelSkillTooltipHtml(id, level);
    if (!html || !nestedActive) return;
    presentTooltip(html, clientX, clientY);
  }

  function attachPinningAndNestedHandlers() {
    const node = tooltipElement.value || shell.getPortal();
    if (node && !node.id) node.id = PATCH_NOTE_SKILL_TOOLTIP_ID;
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
      hideSkill: () => hideSkillTooltip(true),
      isShowing: () => shell.isShowing(),
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
    if (!shell.isShowing()) return;
    const target = closestSkillTarget(event.target);
    if (!target) return;
    shell.move(event.clientX || 0, event.clientY || 0);
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
    shell.setNestedHandlers(null);
  });

  onUnmounted(() => {
    unbindRootListeners();
    hideSkillTooltip(true);
    shell.setNestedHandlers(null);
    shell.detach();
  });

  watch(tooltipElement, (node) => {
    if (node) attachPinningAndNestedHandlers();
  });

  return {
    tooltipElement,
    hideSkillTooltip,
  };
}
