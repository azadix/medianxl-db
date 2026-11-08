/**
 * Human-readable breakdown of planner stat values for tooltips (bucket snapshot).
 */
import {
  isPlannerBaseStatKey,
  getPlannerStatLabel,
} from './planner-stats-config.js';
import { escapeHtmlText } from '@/shared/utils.js';
import { getCharacterSnapshot } from './stats-snapshot.js';

/** Bucket group titles mapped to the existing tooltip wording. */
const BUCKET_GROUP_TITLES = Object.freeze({
  'pre-class': 'Class & level scaling',
  'pre-quest': 'Quests',
  'pre-item': 'Items',
  'pre-set': 'Items',
  'pre-skill': 'Skills (bonuses)',
  'pre-derived': 'Derived',
  'pre-manual': 'Manual / saved',
  'pre-import': 'Imported',
  inc: 'Increased',
  more: 'More',
  post: 'Post-%',
  override: 'Imported / manual',
});

/**
 * @param {number} value
 * @param {boolean} percent
 * @returns {string}
 */
function formatBucketValue(value, percent = false) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';
  const text = Math.abs(num - Math.round(num)) < 1e-9 ? String(Math.round(num)) : num.toFixed(2);
  const signed = num > 0 ? `+${text}` : text;
  return percent ? `${signed}%` : signed;
}

/**
 * @param {object} breakdown
 * @returns {string}
 */
function renderBucketBreakdownHtml(breakdown) {
  const snapshot = getCharacterSnapshot();
  const unsupported = (snapshot?.unsupported || []).filter(
    (row) => String(row.stat || '').toLowerCase() === breakdown.stat
  );
  let html = `<div class="planner-stat-tooltip-body">`;
  html += `<p class="planner-stat-tooltip-title mb-2">${escapeHtmlText(breakdown.label)}</p>`;
  for (const group of breakdown.groups || []) {
    if (!group.rows || group.rows.length === 0) continue;
    const title = BUCKET_GROUP_TITLES[group.id] || group.title;
    html += `<div class="planner-stat-tooltip-section mb-2">`;
    html += `<div class="planner-stat-tooltip-h">${escapeHtmlText(title)}</div>`;
    html += `<ul class="planner-stat-tooltip-list">`;
    for (const row of group.rows) {
      const inactive = row.active === false;
      const percent = group.id === 'inc' || group.id === 'more';
      html += `<li>`;
      html += `<span class="planner-stat-tooltip-k${inactive ? ' has-text-grey has-text-weight-semibold' : ''}">${escapeHtmlText(row.label)}</span>`;
      html += ` <span class="planner-stat-tooltip-v${inactive ? ' has-text-grey' : ''}">${escapeHtmlText(formatBucketValue(row.value, percent))}</span>`;
      if (row.line) {
        html += `<div class="planner-stat-tooltip-d">${escapeHtmlText(row.line)}</div>`;
      }
      html += `</li>`;
    }
    if (group.subtotal != null) {
      const text =
        group.id === 'inc'
          ? `× ${(1 + Number(group.subtotal) / 100).toFixed(2)}`
          : group.id === 'more'
            ? `× ${Number(group.subtotal).toFixed(2)}`
            : formatBucketValue(group.subtotal);
      html += `<li><span class="planner-stat-tooltip-k">Subtotal</span> <span class="planner-stat-tooltip-v">${escapeHtmlText(text)}</span></li>`;
    }
    html += `</ul></div>`;
  }
  html += `<div class="planner-stat-tooltip-section mb-2">`;
  html += `<div class="planner-stat-tooltip-h">Total</div>`;
  html += `<ul class="planner-stat-tooltip-list"><li><span class="planner-stat-tooltip-v planner-stat-tooltip-total-num">${escapeHtmlText(String(breakdown.value))}</span></li></ul>`;
  html += `</div>`;
  const importedValue = Number(snapshot?.imported?.[breakdown.stat]);
  if (Number.isFinite(importedValue)) {
    const delta = Number(breakdown.value) - importedValue;
    html += `<div class="planner-stat-tooltip-section mb-2">`;
    html += `<div class="planner-stat-tooltip-h">Game import (comparison)</div>`;
    html += `<ul class="planner-stat-tooltip-list">`;
    html += `<li><span class="planner-stat-tooltip-k">In-game value</span> <span class="planner-stat-tooltip-v">${escapeHtmlText(String(importedValue))}</span></li>`;
    html += `<li><span class="planner-stat-tooltip-k">Difference</span> <span class="planner-stat-tooltip-v">${escapeHtmlText(formatBucketValue(delta))}</span></li>`;
    html += `</ul></div>`;
  }
  if (unsupported.length > 0) {
    html += `<div class="planner-stat-tooltip-section mb-2">`;
    html += `<div class="planner-stat-tooltip-h">Not supported</div>`;
    html += `<ul class="planner-stat-tooltip-list">`;
    for (const row of unsupported) {
      html += `<li><span class="planner-stat-tooltip-k">${escapeHtmlText(String(row.text || row.reason || 'Unknown'))}</span> <span class="mod-support-badge" title="${escapeHtmlText(String(row.reason || 'unsupported'))}">Not supported</span></li>`;
    }
    html += `</ul></div>`;
  }
  html += `</div>`;
  return html;
}

/**
 * @param {string} statKey
 * @returns {string} HTML fragment (safe, escaped)
 */
export function buildPlannerStatBreakdownHtml(statKey) {
  const key = String(statKey || '').toLowerCase();
  const snapshot = getCharacterSnapshot();
  const breakdown = snapshot?.getBreakdown(key);
  if (breakdown) return renderBucketBreakdownHtml(breakdown);

  if (!isPlannerBaseStatKey(key)) {
    return `<div class="planner-stat-tooltip-body">
      <p class="mb-1"><strong>${escapeHtmlText(key)}</strong></p>
      <p class="planner-stat-tooltip-meta mb-0">Unknown stat (not in character_stats registry).</p>
    </div>`;
  }
  return `<div class="planner-stat-tooltip-body">
    <p class="planner-stat-tooltip-title mb-2">${escapeHtmlText(getPlannerStatLabel(key))}</p>
    <p class="planner-stat-tooltip-meta mb-0">No breakdown available (character data not loaded yet).</p>
  </div>`;
}
