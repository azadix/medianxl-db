/**
 * Planner stats: tooltip wiring + helpers for {@link PlannerStatsPanel.vue}.
 */
import { getCharacterInstance, recomputeClassDerivedLifeMana } from './character-state.js';
import { buildPlannerStatBreakdownHtml } from './planner-stat-breakdown.js';

/** @type {HTMLElement | null} */
let statBreakdownTooltipEl = null;
/** @type {HTMLElement | null} */
let statBreakdownHoveredRow = null;
/** @type {string | null} */
let statBreakdownHoverKey = null;

function ensureStatBreakdownTooltip() {
  if (!statBreakdownTooltipEl) {
    statBreakdownTooltipEl = document.createElement('div');
    statBreakdownTooltipEl.className = 'planner-stat-tooltip';
    statBreakdownTooltipEl.setAttribute('role', 'tooltip');
    statBreakdownTooltipEl.setAttribute('aria-live', 'polite');
    document.body.appendChild(statBreakdownTooltipEl);
  }
  return statBreakdownTooltipEl;
}

function hideStatBreakdownTooltip() {
  statBreakdownHoveredRow = null;
  statBreakdownHoverKey = null;
  if (statBreakdownTooltipEl) {
    statBreakdownTooltipEl.classList.remove('is-active');
    statBreakdownTooltipEl.innerHTML = '';
  }
}

function positionStatBreakdownTooltip(el, row) {
  const rect = row.getBoundingClientRect();
  const gap = 10;
  const margin = 8;
  el.style.left = '0';
  el.style.top = '0';
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  let left = rect.right + gap;
  let top = rect.top + (rect.height - h) / 2;
  if (left + w > window.innerWidth - margin) {
    left = Math.max(margin, rect.left - w - gap);
  }
  if (top + h > window.innerHeight - margin) {
    top = Math.max(margin, window.innerHeight - h - margin);
  }
  if (top < margin) top = margin;
  if (left < margin) left = margin;
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

function showStatBreakdownTooltip(row) {
  const key = row.dataset.statKey;
  if (!key) return;
  statBreakdownHoverKey = key;
  statBreakdownHoveredRow = row;
  const el = ensureStatBreakdownTooltip();
  el.innerHTML = buildPlannerStatBreakdownHtml(key);
  el.classList.add('is-active');
  requestAnimationFrame(() => positionStatBreakdownTooltip(el, row));
}

/**
 * @param {HTMLElement} root
 */
export function setupPlannerStatRowTooltips(root) {
  let hideTimer = 0;
  const clearHide = () => {
    if (hideTimer) {
      window.clearTimeout(hideTimer);
      hideTimer = 0;
    }
  };
  const scheduleHide = () => {
    clearHide();
    hideTimer = window.setTimeout(() => hideStatBreakdownTooltip(), 80);
  };

  root.addEventListener(
    'mouseover',
    (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const row = t.closest('.planner-stat-row');
      if (!row || !root.contains(row)) return;
      clearHide();
      if (statBreakdownHoveredRow === row) return;
      showStatBreakdownTooltip(row);
    },
    true
  );

  root.addEventListener(
    'mouseout',
    (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const row = t.closest('.planner-stat-row');
      if (!row || !root.contains(row)) return;
      const rel = e.relatedTarget;
      if (rel instanceof Node && row.contains(rel)) return;
      scheduleHide();
    },
    true
  );

  const onScrollOrResize = () => hideStatBreakdownTooltip();
  window.addEventListener('scroll', onScrollOrResize, true);
  window.addEventListener('resize', onScrollOrResize);

  const refreshOpenTooltip = () => {
    const panel = document.getElementById('plannerStatsPanel');
    if (panel) resyncStatBreakdownTooltipAfterPanelRefresh(panel);
  };
  window.addEventListener('characterStatsChanged', refreshOpenTooltip);
  window.addEventListener('questCompletionChanged', refreshOpenTooltip);
  window.addEventListener('plannerStatsPanelRefresh', refreshOpenTooltip);
}

function resyncStatBreakdownTooltipAfterPanelRefresh(root) {
  if (!statBreakdownHoverKey || !root) return;
  const esc =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(statBreakdownHoverKey)
      : statBreakdownHoverKey;
  const newRow = root.querySelector(`.planner-stat-row[data-stat-key="${esc}"]`);
  if (newRow) {
    showStatBreakdownTooltip(newRow);
  } else {
    hideStatBreakdownTooltip();
  }
}

/**
 * @param {string} statKey
 * @param {string} raw
 */
export function applyPlannerStatInput(statKey, raw) {
  const ch = getCharacterInstance();
  if (!ch) return;
  ch.setStat(statKey, raw);
  if (statKey === 'vitality' || statKey === 'energy') {
    recomputeClassDerivedLifeMana();
  }
  syncAdvancedTextarea();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('characterStatsChanged', { detail: { statKey } }));
  }
}

function syncAdvancedTextarea() {
  const ta = document.getElementById('characterStats');
  const ch = getCharacterInstance();
  if (!ta || !ch) return;
  if (document.activeElement === ta) return;
  ta.value = ch.exportStatsToText();
}

/**
 * @param {string} statKey
 */
export function removePlannerStatByKey(statKey) {
  const ch = getCharacterInstance();
  if (ch) {
    ch.removeStat(statKey);
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('characterStatsChanged', { detail: { statKey, removed: true } }));
  }
}

/**
 * Notify the Vue stats panel (and any listeners) to resync from the character.
 */
export function refreshPlannerStatsPanelFromCharacter() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('plannerStatsPanelRefresh'));
  }
}
