/**
 * @file Stat aliases: a modifier stored under one registry key also contributes to
 * another stat with a different stacking operation.
 *
 * Examples:
 *   `maximum_life` is a % maximum-life modifier -> INC on `life`.
 *   `percent_vitality` is a % vitality modifier -> INC on `vitality`.
 *
 * The original contribution is kept so the panel can still show its own row.
 *
 * @module character/bucket/aliases
 */

/** @type {Readonly<Record<string, ReadonlyArray<{ stat: string, op: 'inc'|'more'|'base', stage: 'pre'|'post' }>>>} */
const STAT_ALIASES = Object.freeze({
  maximum_life: Object.freeze([{ stat: 'life', op: 'inc', stage: 'pre' }]),
  maximum_mana: Object.freeze([{ stat: 'mana', op: 'inc', stage: 'pre' }]),
  percent_strength: Object.freeze([{ stat: 'strength', op: 'inc', stage: 'pre' }]),
  percent_dexterity: Object.freeze([{ stat: 'dexterity', op: 'inc', stage: 'pre' }]),
  percent_vitality: Object.freeze([{ stat: 'vitality', op: 'inc', stage: 'pre' }]),
  percent_energy: Object.freeze([{ stat: 'energy', op: 'inc', stage: 'pre' }]),
});

/**
 * @param {object} contribution
 * @returns {object[]} The original contribution followed by any aliases.
 */
export function expandContributionAliases(contribution) {
  const aliases = contribution?.op === 'base' ? STAT_ALIASES[contribution?.stat] : null;
  if (!aliases || aliases.length === 0) return [contribution];
  const out = [contribution];
  for (let index = 0; index < aliases.length; index++) {
    const alias = aliases[index];
    out.push({
      ...contribution,
      id: `${contribution.id}:alias:${alias.stat}:${index}`,
      stat: alias.stat,
      op: alias.op,
      stage: alias.stage,
    });
  }
  return out;
}

/**
 * @param {string} stat
 * @returns {boolean}
 */
export function hasStatAliases(stat) {
  return Boolean(STAT_ALIASES[stat]);
}
