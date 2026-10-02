/**
 * @file Hover/focus tooltips for proc skill names and item sources on the skills page.
 * @module src/composables/useSkillsPageTooltips
 */
import { onMounted, onUnmounted } from 'vue';
import {
  destroySkillsPageTooltips,
  hideSkillsPageTooltips,
  initSkillsPageTooltips,
  moveSkillsPageTooltip,
  presentSkillsPageSkillTooltip,
  showSkillsPageItemTooltipFromTarget,
  buildSkillsPageSkillTooltipHtml,
} from '@/skills/skills-page-tooltip-runtime.js';

/**
 * @param {object} opts
 * @param {import('vue').Ref<HTMLElement|null>} opts.rootEl
 */
export function useSkillsPageTooltips({ rootEl }) {
  let tooltipTokenCounter = 0;
  /** @type {HTMLElement|null} */
  let currentTarget = null;

  function closestProcTarget(eventTarget) {
    if (!(eventTarget instanceof Element)) {
      return eventTarget instanceof Node
        ? eventTarget.parentElement?.closest('.js-proc-skill, .js-proc-source') || null
        : null;
    }
    return eventTarget.closest('.js-proc-skill, .js-proc-source');
  }

  /**
   * @param {HTMLElement} target
   * @param {number} clientX
   * @param {number} clientY
   */
  async function showForTarget(target, clientX, clientY) {
    if (currentTarget === target) {
      moveSkillsPageTooltip(clientX, clientY);
      return;
    }
    currentTarget = target;
    const token = ++tooltipTokenCounter;
    if (target.classList.contains('js-proc-source')) {
      showSkillsPageItemTooltipFromTarget(target, clientX, clientY);
      return;
    }
    const html = await buildSkillsPageSkillTooltipHtml(target);
    if (token !== tooltipTokenCounter) return;
    if (currentTarget !== target) return;
    if (!html) {
      hideSkillsPageTooltips();
      return;
    }
    presentSkillsPageSkillTooltip(html, clientX, clientY);
  }

  function onMouseOver(event) {
    const target = closestProcTarget(event.target);
    if (!target) return;
    void showForTarget(target, event.clientX || 0, event.clientY || 0);
  }

  function onMouseMove(event) {
    const target = closestProcTarget(event.target);
    if (!target) return;
    if (currentTarget !== target) {
      void showForTarget(target, event.clientX || 0, event.clientY || 0);
      return;
    }
    moveSkillsPageTooltip(event.clientX || 0, event.clientY || 0);
  }

  function onMouseOut(event) {
    const leavingFrom = closestProcTarget(event.target);
    if (!leavingFrom) return;
    const stillInside = closestProcTarget(event.relatedTarget);
    if (stillInside === leavingFrom) return;
    if (stillInside) {
      void showForTarget(stillInside, event.clientX || 0, event.clientY || 0);
      return;
    }
    currentTarget = null;
    tooltipTokenCounter += 1;
    hideSkillsPageTooltips();
  }

  function onFocusIn(event) {
    const target = closestProcTarget(event.target);
    if (!target) return;
    const rect = target.getBoundingClientRect();
    void showForTarget(target, rect.left + rect.width / 2, rect.bottom);
  }

  function onFocusOut(event) {
    const from = closestProcTarget(event.target);
    if (!from) return;
    const to = closestProcTarget(event.relatedTarget);
    if (to === from || to) return;
    currentTarget = null;
    tooltipTokenCounter += 1;
    hideSkillsPageTooltips();
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      currentTarget = null;
      tooltipTokenCounter += 1;
      hideSkillsPageTooltips();
    }
  }

  onMounted(() => {
    initSkillsPageTooltips();
    const root = rootEl.value;
    if (!root) return;
    root.addEventListener('mouseover', onMouseOver);
    root.addEventListener('mousemove', onMouseMove);
    root.addEventListener('mouseout', onMouseOut);
    root.addEventListener('focusin', onFocusIn);
    root.addEventListener('focusout', onFocusOut);
    root.addEventListener('keydown', onKeyDown);
  });

  onUnmounted(() => {
    const root = rootEl.value;
    if (root) {
      root.removeEventListener('mouseover', onMouseOver);
      root.removeEventListener('mousemove', onMouseMove);
      root.removeEventListener('mouseout', onMouseOut);
      root.removeEventListener('focusin', onFocusIn);
      root.removeEventListener('focusout', onFocusOut);
      root.removeEventListener('keydown', onKeyDown);
    }
    destroySkillsPageTooltips();
  });
}
