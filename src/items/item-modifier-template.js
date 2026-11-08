/**
 * @file Line-level modifier templates for item stat resolution.
 *
 * A resolved item line (rolls already applied, but before support classification) is a
 * template: the same text with the same character-level context always classifies the
 * same way. Cache that parse so repeated instances / tooltips reuse it instead of
 * re-running the classifier.
 *
 * @module items/item-modifier-template
 */

import { classifyCharacterStatModifierLine } from '@/items/item-character-stat-bonuses.js';
import {
  decodeModifierLine,
  MODIFIER_COLOR_GREY,
  MODIFIER_COLOR_ORANGE,
} from '@/items/item-modifier-line.js';

/** @type {ReadonlyArray<RegExp>} */
export const FLAVOR_LINE_PATTERNS = Object.freeze([
  /^(?:Cube|Transmute|Can be upgraded|Keep in Inventory|Unlocks Mastery Skill)\b/i,
  /^Level \d+\s*$/i,
  /\b(?:for crafting|to create|to open|opens? a portal|quest item)\b/i,
  /^(?:Only one|This item|It is said|Legend|The .+ (?:was|is|has))\b/i,
  /^He who fights with monsters\b/i,
  /^might take care lest he\b/i,
  /^thereby become a monster\b/i,
  /^And if you gaze for long into an abyss\b/i,
  /^the abyss gazes also into you\b/i,
  /^[-–—]?\s*I can afford this because\b/i,
  /^the Essence of Time and the Vial of Elder Blood\b/i,
  /^Knowledge is Power\b/i,
  /^The hunter persists\. The prey falters$/i,
  /^While in human form:$/i,
]);

/**
 * @param {string} text
 * @returns {boolean}
 */
export function isFlavorItemLine(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  return FLAVOR_LINE_PATTERNS.some((pattern) => pattern.test(value));
}

/** @type {Map<string, { text: string, flavor: boolean, classified: object }>} */
const templateCache = new Map();
const MAX_TEMPLATES = 5000;

/** @type {WeakMap<object, { id: string, modifiersJson: string, signature: string, modifierTemplates: ReadonlyArray<object> }>} */
const definitionCache = new WeakMap();

/**
 * Per-definition template metadata: decode each catalog modifier once, record its
 * display-only/unique classification, and cache a stable signature for the resolver.
 * Numeric roll substitution still happens per instance in the line renderer.
 * @param {object|null|undefined} def
 * @returns {{
 *   id: string,
 *   modifiersJson: string,
 *   signature: string,
 *   modifierTemplates: ReadonlyArray<{ raw: string, text: string, color: string, conditions: string[], flavor: boolean, unique: boolean }>,
 * }}
 */
export function getItemDefinitionTemplate(def) {
  if (!def || typeof def !== 'object') {
    return { id: '', modifiersJson: '[]', signature: ':[]', modifierTemplates: [] };
  }
  const cached = definitionCache.get(def);
  if (cached) return cached;
  const id = String(def.id || '');
  const modifiers = Array.isArray(def.modifiers) ? def.modifiers : [];
  const modifiersJson = JSON.stringify(modifiers);
  const modifierTemplates = Object.freeze(
    modifiers.map((raw) => {
      const decoded = decodeModifierLine(raw);
      const text = String(decoded.text || '').trim();
      return Object.freeze({
        raw: String(raw || ''),
        text,
        color: decoded.color,
        conditions: decoded.showCondition || [],
        flavor: isFlavorItemLine(text),
        unique:
          decoded.color === MODIFIER_COLOR_ORANGE || decoded.color === MODIFIER_COLOR_GREY,
      });
    })
  );
  const template = Object.freeze({
    id,
    modifiersJson,
    signature: `${id}:${modifiersJson.length}:${modifiersJson}`,
    modifierTemplates,
  });
  definitionCache.set(def, template);
  return template;
}

/**
 * Parse/cached-classify one item line template.
 * @param {string} text
 * @param {{ characterLevel?: number|null }} [options]
 * @returns {{ text: string, flavor: boolean, classified: object }}
 */
export function getItemModifierTemplate(text, options = {}) {
  const value = String(text || '').trim();
  const level = Number(options.characterLevel) || 0;
  const key = `${level}|${value}`;
  const cached = templateCache.get(key);
  if (cached) return cached;
  const template = Object.freeze({
    text: value,
    flavor: isFlavorItemLine(value),
    classified: classifyCharacterStatModifierLine(value, {
      characterLevel: options.characterLevel ?? null,
    }),
  });
  if (templateCache.size >= MAX_TEMPLATES) templateCache.clear();
  templateCache.set(key, template);
  return template;
}

export function clearItemModifierTemplateCache() {
  templateCache.clear();
}
