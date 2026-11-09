/**
 * @file Innate elemental weapon damage ("Innate Lightning Damage: 62.0% of Dexterity").
 * @module items/innate-weapon-damage
 */

const INNATE_DAMAGE_RE =
  /innate\s+(fire|cold|lightning|magic|poison)\s+damage\s*:\s*(?:[\d,]+\s*)?\(\s*(\d+(?:\.\d+)?)\s*%\s*of\s+(strength|dexterity|vitality|energy)\s*\)/gi;

const ELEMENT_LABELS = Object.freeze({
  fire: 'Fire',
  cold: 'Cold',
  lightning: 'Lightning',
  magic: 'Magic',
  poison: 'Poison',
});

const ATTRIBUTE_LABELS = Object.freeze({
  strength: 'Strength',
  dexterity: 'Dexterity',
  vitality: 'Vitality',
  energy: 'Energy',
});

/**
 * Parse `Innate Lightning Damage: (62.0% of Dexterity)` weapon properties into flat
 * element damage that scales with an attribute (e.g. 62% of dexterity as lightning).
 *
 * @param {unknown} text
 * @returns {Array<{ type: string, attribute: string, percent: number }>}
 */
export function parseInnateWeaponDamage(text) {
  const raw = String(text ?? '');
  if (!raw) return [];
  const out = [];
  INNATE_DAMAGE_RE.lastIndex = 0;
  let match;
  while ((match = INNATE_DAMAGE_RE.exec(raw))) {
    const percent = Number(match[2]) / 100;
    if (!Number.isFinite(percent) || percent <= 0) continue;
    out.push({
      type: match[1].toLowerCase(),
      attribute: match[3].toLowerCase(),
      percent,
    });
  }
  return out;
}

/**
 * Render the innate line with its resolved value and effective percentage for the
 * current character, e.g. `Innate Lightning Damage: 4725 (99.8% of Dexterity)`.
 * Falls back to the raw catalog text when no character stats are available.
 *
 * @param {unknown} text
 * @param {Record<string, number>|null|undefined} stats
 * @returns {string[]}
 */
export function formatInnateDamageLines(text, stats = null) {
  const rawLines = String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!stats || typeof stats !== 'object') return rawLines;
  const entries = parseInnateWeaponDamage(text);
  if (!entries.length) return rawLines;

  const bonusPct =
    (Number(stats.innate_damage) || 0) + (Number(stats.innate_elemental_damage) || 0);
  return entries.map((entry) => {
    const effectivePct = entry.percent * 100 * (1 + bonusPct / 100);
    const attributeValue = Number(stats[entry.attribute]) || 0;
    const amount = Math.round((attributeValue * effectivePct) / 100);
    const element = ELEMENT_LABELS[entry.type] || entry.type;
    const attribute = ATTRIBUTE_LABELS[entry.attribute] || entry.attribute;
    return `Innate ${element} Damage: ${amount} (${effectivePct.toFixed(1)}% of ${attribute})`;
  });
}
