/**
 * @file Shared skill tooltip HTML fragments (planner tree + patch notes).
 * @module src/shared/tooltip-html
 */

/**
 * @typedef {object} SkillTooltipHeaderOptions
 * @property {string} iconHtml - Output of `getSkillIconHTML`
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
    iconHtml,
    nameInnerHtml,
    tagsHtml = '',
    subskillHtml = '',
    levelSectionHtml,
  } = options;

  return `<div class="tooltip-header">
      <div class="tooltip-icon">${iconHtml}</div>
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
  const hasIndicator = Boolean(String(levelIndicatorHtml).trim());

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

/**
 * @param {string} innerHtml - Header + body fragments (no outer wrapper)
 * @returns {string}
 */
export function wrapSkillTooltipContent(innerHtml) {
  return `<div class="tooltip-content">${innerHtml}</div>`;
}

/**
 * Planner-only disabled banner.
 * @returns {string}
 */
export function buildSkillTooltipDisabledBannerHtml() {
  return '<div class="has-text-centered has-text-danger has-text-weight-semibold is-size-5">DISABLED (bonuses not applied)</div>';
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
