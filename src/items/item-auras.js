/**
 * @file Item-granted passives ("Level 10 Nephalem Weapons") from item_auras.json.
 *
 * Items list the passive as an orange line and then a block of descriptive lines
 * (`Adds Fire and Lightning Damage:`, `20-30% of base Strength and Dexterity`, …).
 * The aura definition owns the actual values; the block lines are display-only.
 *
 * @module items/item-auras
 */

import { createContribution, createSource } from '@/character/bucket/contributions.js';
import { getFileSkillStore } from '@/shared/skill-data-store.js';

/** `Level 10 Nephalem Weapons` */
const AURA_GRANT_RE = /^Level\s+(\d+)\s+(.+?)\s*$/i;

/** Descriptive lines that belong to an aura block. */
const AURA_DETAIL_PATTERNS = [
  /^Adds\s+.+?\s+Damage:?$/i,
  /^\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?%\s+of\s+base\s+(?:Strength|Dexterity|Vitality|Energy)(?:\s+and\s+(?:Strength|Dexterity|Vitality|Energy))?$/i,
  /^\d+(?:\.\d+)?%\s+Innate Elemental Damage$/i,
];

/**
 * @param {string|null|undefined} text
 * @returns {{ name: string, level: number, aura: object }|null}
 */
export function parseItemAuraGrant(text) {
  const match = AURA_GRANT_RE.exec(String(text ?? '').trim());
  if (!match) return null;
  const level = Number(match[1]);
  if (!Number.isFinite(level) || level <= 0) return null;
  const name = String(match[2]).trim();
  const aura = getFileSkillStore()?.getItemAuraByName?.(name) ?? null;
  if (!aura) return null;
  if (!aura.levels || !aura.levels[String(level)]) return null;
  return { name, level, aura };
}

/**
 * @param {string|null|undefined} text
 * @returns {boolean}
 */
export function isItemAuraDetailLine(text) {
  const value = String(text ?? '').trim();
  if (!value) return false;
  return AURA_DETAIL_PATTERNS.some((re) => re.test(value));
}

/**
 * @param {object|null|undefined} character
 * @param {string} attribute
 * @returns {number}
 */
function baseAttribute(character, attribute) {
  const key = String(attribute ?? '').trim().toLowerCase();
  if (!key) return 0;
  const raw = character?.getRawStat?.(key);
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Turn resolved aura grants into character-stat contributions.
 *
 * Attribute damage is based on the raw (base) attributes, like the in-game text
 * "of base Strength and Dexterity": min% uses the lower bound, max% the upper bound.
 *
 * @param {Array<{ name: string, level: number, aura: object }>} grants
 * @param {object|null|undefined} character
 * @returns {object[]}
 */
export function buildItemAuraContributions(grants, character) {
  /** @type {object[]} */
  const contributions = [];
  for (const grant of Array.isArray(grants) ? grants : []) {
    const levelDef = grant?.aura?.levels?.[String(grant.level)];
    if (!levelDef) continue;
    const label = `${grant.name} (level ${grant.level})`;
    const source = createSource({
      kind: 'item',
      id: `aura:${grant.aura.key || grant.name}:${grant.level}`,
      label,
    });
    const push = (stat, value) => {
      const amount = Math.floor(Number(value) || 0);
      if (!Number.isFinite(amount) || amount === 0) return;
      contributions.push(
        createContribution({
          id: `${source.id}:${stat}`,
          stat,
          op: 'base',
          stage: 'pre',
          value: amount,
          source,
        })
      );
    };

    for (const [stat, value] of Object.entries(levelDef.stats || {})) {
      push(String(stat).toLowerCase(), value);
    }

    for (const group of Array.isArray(levelDef.attributeDamage) ? levelDef.attributeDamage : []) {
      let min = 0;
      let max = 0;
      for (const part of Array.isArray(group.sources) ? group.sources : []) {
        const attributes = Array.isArray(part.attributes) ? part.attributes : [];
        const total = attributes.reduce((sum, attribute) => sum + baseAttribute(character, attribute), 0);
        min += Math.floor((total * (Number(part.minPercent) || 0)) / 100);
        max += Math.floor((total * (Number(part.maxPercent) || 0)) / 100);
      }
      for (const element of Array.isArray(group.elements) ? group.elements : []) {
        push(`minimum_${String(element).toLowerCase()}_damage`, min);
        push(`maximum_${String(element).toLowerCase()}_damage`, max);
      }
    }
  }
  return contributions;
}
