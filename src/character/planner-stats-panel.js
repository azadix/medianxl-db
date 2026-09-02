/**
 * Planner stats: tooltip wiring + helpers for {@link PlannerStatsPanel.vue}.
 */
import { getCharacterInstance, recomputeClassDerivedLifeMana, runPlannerSkillStatRecompute } from './planner-core.js';
import { buildPlannerStatBreakdownHtml } from './planner-stat-breakdown.js';
import { escapeHtmlText } from '@/shared/utils.js';

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

/** @type {HTMLElement | null} */
let minLevelPoolTooltipEl = null;
/** @type {HTMLElement | null} */
let minLevelPoolHoveredAnchor = null;
let minLevelPoolTooltipSetup = false;

/**
 * @param {number|string} basePoints
 * @param {number|string} questPoints
 * @param {number|string} effectiveLevel
 */
function buildMinLevelSkillPoolTooltipHtml(basePoints, questPoints, effectiveLevel) {
  const base = Math.max(0, Math.floor(Number(basePoints) || 0));
  const quest = Math.max(0, Math.floor(Number(questPoints) || 0));
  const lvl = Math.max(1, Math.floor(Number(effectiveLevel) || 1));
  const total = base + quest;
  return `<div class="planner-stat-tooltip-body">
  <p class="planner-stat-tooltip-title mb-2">Available skill points</p>
  <p class="planner-stat-tooltip-meta mb-2">At level ${escapeHtmlText(lvl)} (minimum required for this allocation).</p>
  <ul class="planner-stat-tooltip-list">
    <li><span class="planner-stat-tooltip-k">Base skill points</span> <span class="planner-stat-tooltip-v">+${escapeHtmlText(base)}</span></li>
    <li><span class="planner-stat-tooltip-k">Quest skill points</span> <span class="planner-stat-tooltip-v">+${escapeHtmlText(quest)}</span></li>
  </ul>
  <p class="planner-stat-tooltip-meta mb-0">Total: ${escapeHtmlText(total)}</p>
</div>`;
}

function ensureMinLevelPoolTooltip() {
  if (!minLevelPoolTooltipEl) {
    minLevelPoolTooltipEl = document.createElement('div');
    minLevelPoolTooltipEl.className = 'planner-stat-tooltip';
    minLevelPoolTooltipEl.setAttribute('role', 'tooltip');
    minLevelPoolTooltipEl.setAttribute('aria-live', 'polite');
    document.body.appendChild(minLevelPoolTooltipEl);
  }
  return minLevelPoolTooltipEl;
}

function hideMinLevelPoolTooltip() {
  minLevelPoolHoveredAnchor = null;
  if (minLevelPoolTooltipEl) {
    minLevelPoolTooltipEl.classList.remove('is-active');
    minLevelPoolTooltipEl.innerHTML = '';
  }
}

function positionPlannerTooltip(el, anchor) {
  const rect = anchor.getBoundingClientRect();
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

function readSkillPoolFromAnchor(anchor) {
  const base = anchor.dataset.poolBase ?? '0';
  const quest = anchor.dataset.poolQuest ?? '0';
  const level = anchor.dataset.poolLevel ?? '1';
  return { base, quest, level };
}

function showMinLevelPoolTooltip(anchor) {
  if (!(anchor instanceof HTMLElement)) return;
  hideStatBreakdownTooltip();
  minLevelPoolHoveredAnchor = anchor;
  const { base, quest, level } = readSkillPoolFromAnchor(anchor);
  const el = ensureMinLevelPoolTooltip();
  el.innerHTML = buildMinLevelSkillPoolTooltipHtml(base, quest, level);
  el.classList.add('is-active');
  requestAnimationFrame(() => positionPlannerTooltip(el, anchor));
}

function resyncMinLevelPoolTooltipIfOpen() {
  const anchor = minLevelPoolHoveredAnchor;
  if (!anchor || !minLevelPoolTooltipEl?.classList.contains('is-active')) return;
  if (!document.body.contains(anchor)) {
    hideMinLevelPoolTooltip();
    return;
  }
  const { base, quest, level } = readSkillPoolFromAnchor(anchor);
  minLevelPoolTooltipEl.innerHTML = buildMinLevelSkillPoolTooltipHtml(base, quest, level);
  requestAnimationFrame(() => positionPlannerTooltip(minLevelPoolTooltipEl, anchor));
}

function showStatBreakdownTooltip(anchor) {
  hideMinLevelPoolTooltip();
  const key = anchor.dataset.statKey;
  if (!key) return;
  statBreakdownHoverKey = key;
  statBreakdownHoveredRow = anchor;
  const el = ensureStatBreakdownTooltip();
  el.innerHTML = buildPlannerStatBreakdownHtml(key);
  el.classList.add('is-active');
  requestAnimationFrame(() => positionPlannerTooltip(el, anchor));
}

/**
 * @param {HTMLElement} root
 * @param {string} key
 * @returns {HTMLElement | null}
 */
function findStatBreakdownAnchorForKey(root, key) {
  const esc =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(key) : key;
  const row = root.querySelector(`.planner-stat-row[data-stat-key="${esc}"]`);
  if (row) return row;
  return root.querySelector(`.planner-vital-tile[data-stat-key="${esc}"]`);
}

/**
 * @param {EventTarget | null} t
 * @param {HTMLElement} root
 * @returns {HTMLElement | null}
 */
function statBreakdownHoverAnchorFromTarget(t, root) {
  if (!(t instanceof Element)) return null;
  const row = t.closest('.planner-stat-row');
  if (row && row.dataset.statKey && root.contains(row)) return row;
  const vital = t.closest('.planner-vital-tile[data-stat-key]');
  if (vital && root.contains(vital)) return vital;
  return null;
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
      const anchor = statBreakdownHoverAnchorFromTarget(t, root);
      if (!anchor) return;
      clearHide();
      if (statBreakdownHoveredRow === anchor) return;
      showStatBreakdownTooltip(anchor);
    },
    true
  );

  root.addEventListener(
    'mouseout',
    (e) => {
      const t = e.target;
      const anchor = statBreakdownHoverAnchorFromTarget(t, root);
      if (!anchor) return;
      const rel = e.relatedTarget;
      if (rel instanceof Node && anchor.contains(rel)) return;
      scheduleHide();
    },
    true
  );

  const onScrollOrResize = () => {
    hideStatBreakdownTooltip();
    hideMinLevelPoolTooltip();
  };
  window.addEventListener('scroll', onScrollOrResize, true);
  window.addEventListener('resize', onScrollOrResize);

  const refreshOpenTooltip = () => {
    const hoverRoot =
      document.getElementById('plannerStatBreakdownRoot') ||
      document.getElementById('plannerStatsPanel');
    if (hoverRoot) resyncStatBreakdownTooltipAfterPanelRefresh(hoverRoot);
  };
  window.addEventListener('characterStatsChanged', refreshOpenTooltip);
  window.addEventListener('questCompletionChanged', refreshOpenTooltip);
  window.addEventListener('plannerStatsPanelRefresh', refreshOpenTooltip);
}

/**
 * Hover target: `#minLevelAvailPart` in the planner header.
 */
export function setupPlannerMinLevelSkillPoolTooltips() {
  if (minLevelPoolTooltipSetup) return;
  const root = document.getElementById('tree-section') || document.body;
  if (!root) return;
  minLevelPoolTooltipSetup = true;

  let hideTimer = 0;
  const clearHide = () => {
    if (hideTimer) {
      window.clearTimeout(hideTimer);
      hideTimer = 0;
    }
  };
  const scheduleHide = () => {
    clearHide();
    hideTimer = window.setTimeout(() => hideMinLevelPoolTooltip(), 80);
  };

  root.addEventListener(
    'mouseover',
    (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const anchor = t.closest('.planner-skill-pool-tooltip-target');
      if (!anchor || !root.contains(anchor)) return;
      clearHide();
      if (minLevelPoolHoveredAnchor === anchor) return;
      showMinLevelPoolTooltip(anchor);
    },
    true
  );

  root.addEventListener(
    'mouseout',
    (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const anchor = t.closest('.planner-skill-pool-tooltip-target');
      if (!anchor || !root.contains(anchor)) return;
      const rel = e.relatedTarget;
      if (rel instanceof Node && anchor.contains(rel)) return;
      scheduleHide();
    },
    true
  );

  const refreshPoolTooltip = () => resyncMinLevelPoolTooltipIfOpen();
  window.addEventListener('skillPointsChanged', refreshPoolTooltip);
  window.addEventListener('questCompletionChanged', refreshPoolTooltip);
  window.addEventListener('characterLevelChanged', refreshPoolTooltip);
  window.addEventListener('plannerStateChanged', refreshPoolTooltip);
}

// Recompute planner stats when config conditions change
if (typeof window !== 'undefined') {
  window.addEventListener('plannerConfigChanged', () => {
    try {
      if (typeof console !== 'undefined' && console.debug) {
        console.debug('[planner-stats] plannerConfigChanged -> recompute');
      }
      runPlannerSkillStatRecompute({ immediate: true });
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) console.error('recompute error', e);
    }
  });
}

function resyncStatBreakdownTooltipAfterPanelRefresh(root) {
  if (!statBreakdownHoverKey || !root) return;
  const newAnchor = findStatBreakdownAnchorForKey(root, statBreakdownHoverKey);
  if (newAnchor) {
    showStatBreakdownTooltip(newAnchor);
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
  runPlannerSkillStatRecompute();
  syncPlannerCharacterStatsTextareaFromCharacter();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('characterStatsChanged', { detail: { statKey } }));
  }
}

/**
 * Push current character raw stats into the advanced Character Stats textarea (when not focused).
 */
export function syncPlannerCharacterStatsTextareaFromCharacter() {
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
