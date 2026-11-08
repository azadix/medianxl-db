/**
 * @file Character bucket contribution and report records.
 * @module character/bucket/contributions
 */

/** Stacking operation for a numeric contribution. */
export const MOD_OPS = Object.freeze(['base', 'inc', 'more', 'override', 'flag']);
/** Additive contributions are applied before (`pre`) or after (`post`) the multipliers. */
export const MOD_STAGES = Object.freeze(['pre', 'post']);
/** Parser status for a modifier line. */
export const SUPPORT_STATUSES = Object.freeze(['supported', 'unsupported', 'ignored', 'flavor']);

const SOURCE_KINDS = Object.freeze([
  'class',
  'quest',
  'item',
  'set',
  'skill',
  'condition',
  'import',
  'manual',
  'derived',
]);

/**
 * @typedef {object} ContributionSource
 * @property {'class'|'quest'|'item'|'set'|'skill'|'condition'|'import'|'manual'|'derived'} kind Source category.
 * @property {string} id Stable source id (instance id, skill id, quest id, ...).
 * @property {string} label Display label used by breakdowns.
 * @property {string} [slot] Equipment slot for item sources.
 * @property {string} [line] Raw modifier text, when the source came from a line.
 * @property {string} [scope] `global` or `skill:<id>`.
 */

/**
 * @typedef {object} Contribution
 * @property {string} id Stable contribution id.
 * @property {string} stat Registry key.
 * @property {'base'|'inc'|'more'|'override'|'flag'} op Stacking operation.
 * @property {'pre'|'post'} stage Only meaningful for `base`.
 * @property {number|boolean} value Numeric amount (or bool for flags).
 * @property {ContributionSource} source Where the modifier came from.
 * @property {string[]} conditions All listed condition keys must be selected.
 * @property {boolean} unique Whether this is an orange/unique modifier.
 */

/**
 * @typedef {object} ModifierReport
 * @property {string} id Stable report id.
 * @property {string} [stat] Registry key, when one could be inferred.
 * @property {'supported'|'unsupported'|'ignored'|'flavor'} status Classification of the line.
 * @property {string} [reason] Machine-readable reason code.
 * @property {string} text Original line text.
 * @property {ContributionSource} source Where the line came from.
 * @property {string[]} conditions Conditions that gate the line.
 * @property {boolean} unique Whether this is an orange/unique modifier.
 */

/**
 * @param {string} value
 * @returns {string}
 */
function lowerKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

/**
 * @param {Partial<ContributionSource> & { kind: string, id: string }} input
 * @returns {ContributionSource}
 */
export function createSource(input) {
  const kind = String(input.kind || '').trim();
  if (!SOURCE_KINDS.includes(kind)) {
    throw new Error(`Unknown contribution source kind: ${kind}`);
  }
  const id = String(input.id ?? '').trim();
  if (!id) throw new Error('Contribution source id is required');
  /** @type {ContributionSource} */
  const source = {
    kind,
    id,
    label: String(input.label ?? id).trim() || id,
  };
  if (input.slot != null && String(input.slot).trim() !== '') source.slot = String(input.slot).trim();
  if (input.line != null) source.line = String(input.line);
  if (input.scope != null && String(input.scope).trim() !== '') {
    source.scope = String(input.scope).trim();
  }
  return Object.freeze(source);
}

/**
 * Create a counted contribution. Invalid values fail loudly so a parser bug is not
 * silently displayed as a zero stat.
 * @param {{
 *   id?: string,
 *   stat: string,
 *   op?: 'base'|'inc'|'more'|'override'|'flag',
 *   stage?: 'pre'|'post',
 *   value: number|boolean,
 *   source: ContributionSource,
 *   conditions?: string[],
 *   unique?: boolean,
 * }} input
 * @returns {Contribution}
 */
export function createContribution(input) {
  const stat = lowerKey(input.stat);
  if (!stat) throw new Error('Contribution stat is required');
  const op = String(input.op || 'base');
  if (!MOD_OPS.includes(op)) throw new Error(`Unknown contribution op: ${op}`);
  const stage = String(input.stage || 'pre');
  if (!MOD_STAGES.includes(stage)) throw new Error(`Unknown contribution stage: ${stage}`);
  const value = input.value;
  if (op === 'flag') {
    if (typeof value !== 'boolean') throw new Error('Flag contributions require a boolean value');
  } else if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Contribution "${stat}" requires a finite numeric value`);
  }
  const source = input.source && input.source.kind ? input.source : createSource(input.source);
  const id = String(
    input.id ||
      `${source.kind}:${source.id}:${source.line ?? ''}:${stat}:${op}:${stage}:${String(value)}`
  );
  return Object.freeze({
    id,
    stat,
    op: /** @type {'base'|'inc'|'more'|'override'|'flag'} */ (op),
    stage: /** @type {'pre'|'post'} */ (stage),
    value,
    source,
    conditions: Object.freeze(
      (input.conditions || []).map(lowerKey).filter((key) => key !== '')
    ),
    unique: input.unique === true,
  });
}

/**
 * Report a line that is known but intentionally not counted (requirements, sockets,
 * flavour, proc text handled by another module).
 * @param {{
 *   id?: string,
 *   text: string,
 *   source: ContributionSource,
 *   stat?: string,
 *   reason?: string,
 *   conditions?: string[],
 * }} input
 * @returns {ModifierReport}
 */
export function ignoredReport(input) {
  return createReport({ ...input, status: 'ignored', reason: input.reason || 'not-a-stat' });
}

/**
 * Report a line that looks like a real modifier but has no handler/stat yet.
 * @param {{
 *   id?: string,
 *   text: string,
 *   source: ContributionSource,
 *   stat?: string,
 *   reason?: string,
 *   conditions?: string[],
 *   unique?: boolean,
 * }} input
 * @returns {ModifierReport}
 */
export function unsupportedReport(input) {
  return createReport({
    ...input,
    status: 'unsupported',
    reason: input.reason || 'unknown-stat',
    unique: input.unique === true,
  });
}

/**
 * Report a line that is lore, flavour or crafting instructions. It stays visible on
 * the item but is never parsed as a stat.
 * @param {{
 *   id?: string,
 *   text: string,
 *   source: ContributionSource,
 *   reason?: string,
 *   conditions?: string[],
 * }} input
 * @returns {ModifierReport}
 */
export function flavorReport(input) {
  return createReport({
    ...input,
    status: 'flavor',
    reason: input.reason || 'flavor-text',
  });
}

/**
 * Explicitly supported line that does not emit a numeric contribution (state flags).
 * @param {object} input
 * @returns {object}
 */
export function supportedReport(input) {
  return createReport({
    ...input,
    status: 'supported',
    reason: input.reason || 'supported',
  });
}

/**
 * @param {{
 *   id?: string,
 *   text: string,
 *   source: ContributionSource,
 *   stat?: string,
 *   status: 'supported'|'unsupported'|'ignored'|'flavor',
 *   reason?: string,
 *   conditions?: string[],
 *   unique?: boolean,
 * }} input
 * @returns {ModifierReport}
 */
function createReport(input) {
  const status = String(input.status);
  if (!SUPPORT_STATUSES.includes(status)) throw new Error(`Unknown report status: ${status}`);
  const source = input.source && input.source.kind ? input.source : createSource(input.source);
  const stat = input.stat != null ? lowerKey(input.stat) : '';
  const text = String(input.text ?? '');
  const id = String(input.id || `${source.kind}:${source.id}:${text}`);
  /** @type {ModifierReport} */
  const report = {
    id,
    status: /** @type {'supported'|'unsupported'|'ignored'|'flavor'} */ (status),
    text,
    source,
    conditions: Object.freeze((input.conditions || []).map(lowerKey).filter(Boolean)),
    unique: input.unique === true,
  };
  if (stat) report.stat = stat;
  if (input.reason) report.reason = String(input.reason);
  return Object.freeze(report);
}
