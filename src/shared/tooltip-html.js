/**
 * @file Shared skill tooltip HTML fragments (planner tree + patch notes).
 * @module src/shared/tooltip-html
 */

/**
 * @typedef {object} SkillTooltipHeaderOptions
 * @property {string} [iconHtml] - Output of `getSkillIconHTML`; omit to hide the icon column
 * @property {string} nameInnerHtml - Name line HTML (may include variant markup)
 * @property {string} [tagsHtml] - Optional tags paragraph HTML
 * @property {string} [subskillHtml] - Optional subskill-of line HTML
 * @property {string} levelSectionHtml - Inner HTML for the level column
 */

/**
 * @typedef {object} SkillTooltipDescriptionOptions
 * @property {string} [mainDescHtml] - Expanded description HTML
 * @property {string} [levelIndicatorHtml] - e.g. "Level N values:" line
 * @property {string} [effectExpanded] - Expanded effect text (newline-separated)
 * @property {string} [effectLineClass] - Class on each effect row (default `tooltip-effect has-text-centered`)
 * @property {boolean} [preserveBlankEffectLines] - Keep blank lines as `&nbsp;` rows (planner tree)
 * @property {string} [wrapperClass] - Description wrapper class (default `tooltip-description`)
 */

/**
 * Split expanded placeholder text into tooltip row divs.
 * @param {string} expandedBlock
 * @param {string} lineClassName
 * @param {{ preserveBlankLines?: boolean }} [options]
 * @returns {string}
 */
export function toTooltipLineHtml(expandedBlock, lineClassName, options = {}) {
  const lines = String(expandedBlock || '').split('\n');
  const preserveBlank = Boolean(options.preserveBlankLines);

  return lines
    .map((line) => {
      if (!preserveBlank && !line.trim()) return '';
      if (preserveBlank && !line.trim()) {
        return '<div>&nbsp;</div>';
      }
      return `<div class="${lineClassName}">${line}</div>`;
    })
    .filter(Boolean)
    .join('');
}

/**
 * @param {SkillTooltipHeaderOptions} options
 * @returns {string}
 */
export function buildSkillTooltipHeaderHtml(options) {
  const {
    iconHtml = '',
    nameInnerHtml,
    tagsHtml = '',
    subskillHtml = '',
    levelSectionHtml,
  } = options;

  const iconBlock = String(iconHtml || '').trim()
    ? `<div class="tooltip-icon">${iconHtml}</div>`
    : '';

  return `<div class="tooltip-header">
      ${iconBlock}
      <div class="tooltip-name-container">
        <div class="tooltip-name-section">
          <div class="is-size-4 has-text-weight-bold">
            ${nameInnerHtml}
            ${tagsHtml}
            ${subskillHtml}
          </div>
        </div>
        <div class="tooltip-level-section">
          ${levelSectionHtml}
        </div>
      </div>
    </div>`;
}

/**
 * @param {string} expandedRestriction - Newline-separated expanded restriction text
 * @returns {string}
 */
export function buildSkillTooltipRestrictionBlock(expandedRestriction) {
  const trimmed = String(expandedRestriction || '').trim();
  if (!trimmed) return '';
  const inner = toTooltipLineHtml(trimmed, 'has-text-warning');
  if (!inner) return '';
  return `<div class="tooltip-warning">${inner}</div>`;
}

/**
 * @param {SkillTooltipDescriptionOptions} options
 * @returns {string}
 */
export function buildSkillTooltipDescriptionBlock(options) {
  const {
    mainDescHtml = '',
    levelIndicatorHtml = '',
    effectExpanded = '',
    effectLineClass = 'tooltip-effect has-text-centered',
    preserveBlankEffectLines = false,
    wrapperClass = 'tooltip-description',
  } = options;

  const hasMain = Boolean(String(mainDescHtml).trim());
  const effectInner = toTooltipLineHtml(effectExpanded, effectLineClass, {
    preserveBlankLines: preserveBlankEffectLines,
  });
  const hasEffect = Boolean(effectInner);
  // Don't show "Level N values:" with nothing under it (e.g. Move Only / Unsummon).
  const hasIndicator = hasEffect && Boolean(String(levelIndicatorHtml).trim());

  if (!hasMain && !hasEffect && !hasIndicator) return '';

  let html = `<div class="${wrapperClass}">`;
  if (hasMain) {
    html += `<div class="tooltip-main-desc has-text-centered mb-2">${mainDescHtml}</div>`;
  }
  if (hasIndicator) {
    html += levelIndicatorHtml;
  }
  if (hasEffect) {
    html += effectInner;
  }
  html += '</div>';
  return html;
}

export const NESTED_SKILL_ATTR = 'data-tooltip-skill-id';
export const NESTED_SKILL_LEVEL_ATTR = 'data-tooltip-skill-level';
export const NESTED_SKILL_AS_PROC_ATTR = 'data-tooltip-skill-as-proc';

/**
 * Wrap a skill display name as a nested-hover target.
 * @param {string} skillId
 * @param {string} displayHtmlAlreadyEscaped
 * @param {string} [className]
 * @param {number|null|undefined} [level] - Fixed skill level from the host line (grant/proc)
 * @param {boolean} [asProc] - CTC packed level; blvl stays tree hard points
 * @returns {string}
 */
export function wrapNestedSkillTooltipHtml(
  skillId,
  displayHtmlAlreadyEscaped,
  className = '',
  level = null,
  asProc = false
) {
  const id = String(skillId || '').trim();
  if (!id) return displayHtmlAlreadyEscaped;
  const cls = ['js-nested-tooltip-skill', className].filter(Boolean).join(' ');
  const safeId = id.replace(/"/g, '&quot;');
  const lvl = Math.floor(Number(level));
  const levelAttr =
    Number.isFinite(lvl) && lvl > 0 ? ` ${NESTED_SKILL_LEVEL_ATTR}="${lvl}"` : '';
  const procAttr = asProc ? ` ${NESTED_SKILL_AS_PROC_ATTR}="1"` : '';
  return `<span class="${cls}" ${NESTED_SKILL_ATTR}="${safeId}"${levelAttr}${procAttr}>${displayHtmlAlreadyEscaped}</span>`;
}

/**
 * Parse optional fixed level from a nested skill marker like `id`, `id:23`, or `id:23:proc`.
 * @param {string|null|undefined} raw
 * @returns {{ skillId: string, level: number|null, asProc: boolean }}
 */
export function parseNestedSkillMarker(raw) {
  const text = String(raw || '').trim();
  if (!text) return { skillId: '', level: null, asProc: false };
  let asProc = false;
  let rest = text;
  if (/:proc$/i.test(rest)) {
    asProc = true;
    rest = rest.slice(0, -5);
  }
  const colon = rest.lastIndexOf(':');
  if (colon <= 0) return { skillId: rest, level: null, asProc };
  const skillId = rest.slice(0, colon).trim();
  const lvl = Math.floor(Number(rest.slice(colon + 1)));
  if (!skillId || !Number.isFinite(lvl) || lvl <= 0) return { skillId: text, level: null, asProc };
  return { skillId, level: lvl, asProc };
}

/**
 * @param {Element|null|undefined} fromEl
 * @returns {{ level: number|null, asProc: boolean }}
 */
export function readNestedSkillTooltipAttrs(fromEl) {
  if (!(fromEl instanceof Element)) return { level: null, asProc: false };
  const raw = fromEl.getAttribute(NESTED_SKILL_LEVEL_ATTR);
  const parsed = Math.floor(Number(raw));
  const level =
    raw != null && String(raw).trim() !== '' && Number.isFinite(parsed) && parsed > 0
      ? parsed
      : null;
  return {
    level,
    asProc: fromEl.getAttribute(NESTED_SKILL_AS_PROC_ATTR) === '1',
  };
}

/**
 * @typedef {{ label: string, valueHtml: string }} SkillBonusSourceRow
 */

/**
 * Alt-held skill bonus sources panel.
 * @param {SkillBonusSourceRow[]} rows
 * @returns {string}
 */
export function buildSkillBonusSourcesTableHtml(rows) {
  if (!Array.isArray(rows) || !rows.length) return '';
  const body = rows
    .map((row) => {
      const label = String(row?.label ?? '');
      const valueHtml = String(row?.valueHtml ?? '');
      return `<div class="skill-bonus-sources-row"><span class="skill-bonus-sources-label">${label}</span><span class="skill-bonus-sources-value">${valueHtml}</span></div>`;
    })
    .join('');
  return `<div class="skill-tooltip-sources" aria-label="Skill bonus sources">
      <div class="skill-bonus-sources-title">SOURCES</div>
      <div class="skill-bonus-sources-table">${body}</div>
    </div>`;
}

/**
 * @param {string} innerHtml - Header + body fragments (no outer wrapper)
 * @param {string} [sourcesHtml] - Optional Alt-held sources panel HTML
 * @returns {string}
 */
export function wrapSkillTooltipContent(innerHtml, sourcesHtml = '') {
  const main = `<div class="tooltip-content">${innerHtml}</div>`;
  const sources = String(sourcesHtml || '').trim();
  if (!sources) return main;
  return `<div class="skill-tooltip-panels">${main}${sources}</div>`;
}

/**
 * Planner bonus-toggle banner. Shown only when bonuses are off.
 * @param {boolean} [disabled]
 * @returns {string}
 */
export function buildSkillTooltipDisabledBannerHtml(disabled = true) {
  if (!disabled) return '';
  return '<div class="has-text-centered has-text-grey has-text-weight-semibold is-size-5">Disabled (bonuses not applied)</div>';
}

/**
 * Planner prerequisite / devotion warning block.
 * @param {string} warningMessage - Newline-separated text
 * @returns {string}
 */
export function buildSkillTooltipPrerequisiteWarningHtml(warningMessage) {
  const trimmed = String(warningMessage || '').trim();
  if (!trimmed) return '';
  const inner = toTooltipLineHtml(trimmed, 'has-text-danger');
  if (!inner) return '';
  return `<div class="tooltip-restriction">${inner}</div>`;
}

/**
 * Max-level modifier lines (planner tree).
 * @param {string[]} lines - Plain text lines (escaped here)
 * @returns {string}
 */
export function buildSkillTooltipScalingBlockHtml(lines) {
  if (!Array.isArray(lines) || !lines.length) return '';
  let html = '<div class="tooltip-scaling">';
  for (const line of lines) {
    const safe = String(line)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    html += `<div class="has-text-info">${safe}</div>`;
  }
  html += '</div>';
  return html;
}
