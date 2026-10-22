/**
 * Unique-item rules that override generic sockets / orbs / corruption reqs.
 * @module items/item-unique-rules
 */

/**
 * @param {string|null|undefined} text
 * @returns {string}
 */
function plainMod(text) {
  return String(text || '')
    .replace(/^(\{[^}]+\})+/, '')
    .trim();
}

/**
 * @param {object|null|undefined} def
 * @returns {string[]}
 */
export function uniqueRuleModifierTexts(def) {
  /** @type {string[]} */
  const out = [];
  for (const mod of Array.isArray(def?.modifiers) ? def.modifiers : []) {
    if (typeof mod === 'string') {
      const text = plainMod(mod);
      if (text) out.push(text);
      continue;
    }
    if (mod && typeof mod === 'object' && typeof /** @type {{ text?: string }} */ (mod).text === 'string') {
      const text = plainMod(/** @type {{ text: string }} */ (mod).text);
      if (text) out.push(text);
    }
  }
  return out;
}

/**
 * Mindflayer's Mayhem (and similar): no sockets, mystic orbs, or effigies.
 * @param {object|null|undefined} def
 * @returns {boolean}
 */
export function itemForbidsSocketsAndEnhancements(def) {
  if (!def) return false;
  if (String(def.id || '') === 'u:mindflayers-mayhem:su') return true;
  if (String(def.name || '').trim() === "Mindflayer's Mayhem") return true;
  return uniqueRuleModifierTexts(def).some((text) =>
    /Cannot have any sockets or enhancements/i.test(text)
  );
}

/**
 * Unique text `Successful corruptions increase Required Level by N`.
 * @param {object|null|undefined} def
 * @returns {number}
 */
export function uniqueCorruptionReqLevelPerSuccess(def) {
  for (const text of uniqueRuleModifierTexts(def)) {
    const match = /Successful corruptions increase Required Level by (\d+)/i.exec(text);
    if (match) {
      const n = Number(match[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return 0;
}

/**
 * Unique text `Can be corrupted N times`. 0 means use the generic slot limit.
 * @param {object|null|undefined} def
 * @returns {number}
 */
export function uniqueCorruptionMaxCount(def) {
  for (const text of uniqueRuleModifierTexts(def)) {
    const match = /Can be corrupted (\d+) times/i.exec(text);
    if (match) {
      const n = Number(match[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return 0;
}
