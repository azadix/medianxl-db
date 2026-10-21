/**
 * @file Map charm-unlocked tree skills and detect missing charms on import.
 * @module items/charm-skill-unlocks
 */

import { getParagonHammerConfig } from '@/items/charm-items.js';

const MASTERY_UNLOCK_RE = /^Unlocks Mastery Skill:\s*(.+)$/i;
const ENNEAD_UNLOCK_RE = /^Unlocks your Ennead Skill$/i;
const BLACK_ROAD_UNLOCK_RE = /^Unlocks your Black Road Skill$/i;

/** Class charm → Ennead reward skill. */
export const ENNEAD_SKILL_BY_CLASS = Object.freeze({
  Amazon: { id: 'spellbind', name: 'Spellbind' },
  Assassin: { id: 'prismatic_cloak', name: 'Prismatic Cloak' },
  Barbarian: { id: 'immortal', name: 'Immortal' },
  Druid: { id: 'mythal', name: 'Mythal' },
  Necromancer: { id: 'talons_hold', name: "Talon's Hold" },
  Paladin: { id: 'divine_apparition', name: 'Divine Apparition' },
  Sorceress: { id: 'symbol_of_esu', name: 'Symbol of Esu' },
});

/** The Black Road → Black Road reward skill. */
export const BLACK_ROAD_SKILL_BY_CLASS = Object.freeze({
  Amazon: { id: 'war_spirit', name: 'War Spirit' },
  Assassin: { id: 'vampiric_icon', name: 'Vampiric Icon' },
  Barbarian: { id: 'thundergod', name: 'Thundergod' },
  Druid: { id: 'symbiosis', name: 'Symbiosis' },
  Necromancer: { id: 'land_of_the_dead', name: 'Land of the Dead' },
  Paladin: { id: 'blessed_life', name: 'Blessed Life' },
  Sorceress: { id: 'force_blast', name: 'Force Blast' },
});

const SUNSTONE_SKILL = Object.freeze({ id: 'gale_force', name: 'Gale Force' });

/**
 * @param {object} charm
 * @param {string} className
 * @returns {boolean}
 */
function charmMatchesClass(charm, className) {
  const cls = String(className || '').trim();
  if (!cls) return false;
  const restriction = String(charm?.classRestriction || '').trim();
  if (!restriction) return true;
  return restriction.toLowerCase().includes(cls.toLowerCase());
}

/**
 * @param {string} name
 * @returns {string}
 */
function slugifySkillName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function stringList(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((v) => typeof v === 'string').map((v) => String(v));
}

/**
 * Flatten charm text that can unlock skills (base mods + upgrade/trophy/paragon lines).
 * @param {object} def
 * @returns {string[]}
 */
export function charmUnlockTexts(def) {
  /** @type {string[]} */
  const out = [];
  const push = (text) => {
    const t = String(text || '').trim();
    if (t) out.push(t);
  };
  for (const line of stringList(def?.modifiers)) push(line);
  for (const line of stringList(def?.upgrade)) push(line);
  for (const line of stringList(def?.trophy)) push(line);
  if (Array.isArray(def?.upgrades)) {
    for (const step of def.upgrades) {
      if (Array.isArray(step)) {
        for (const line of stringList(step)) push(line);
      } else if (step && typeof step === 'object') {
        for (const line of stringList(/** @type {{ affixes?: unknown }} */ (step).affixes)) push(line);
      }
    }
  }
  if (Array.isArray(def?.trophyOptions)) {
    for (const opt of def.trophyOptions) {
      if (!opt || typeof opt !== 'object') continue;
      for (const line of stringList(/** @type {{ affixes?: unknown }} */ (opt).affixes)) push(line);
    }
  }
  const paragon = getParagonHammerConfig(def);
  if (paragon) {
    for (const path of Array.isArray(paragon.paragonPaths) ? paragon.paragonPaths : []) {
      for (const line of stringList(path?.affixes)) push(line);
    }
  }
  return out;
}

/**
 * @typedef {{ skillId: string, skillName: string, charmIds: string[], charmNames: string[] }} CharmSkillUnlockReq
 */

/**
 * Build skill → required charm(s) from the charms catalog.
 * @param {object[]} charms
 * @param {string|null|undefined} [className]
 * @returns {Map<string, CharmSkillUnlockReq>}
 */
export function buildCharmSkillUnlockRequirements(charms, className = null) {
  /** @type {Map<string, CharmSkillUnlockReq>} */
  const bySkill = new Map();
  const cls = String(className || '').trim();

  /**
   * @param {string} skillId
   * @param {string} skillName
   * @param {object} charm
   */
  const add = (skillId, skillName, charm) => {
    const id = String(skillId || '').trim();
    if (!id) return;
    const charmId = String(charm.id || '').trim();
    const charmName = String(charm.name || charmId).trim();
    let entry = bySkill.get(id);
    if (!entry) {
      entry = { skillId: id, skillName: skillName || id, charmIds: [], charmNames: [] };
      bySkill.set(id, entry);
    }
    if (charmId && !entry.charmIds.includes(charmId)) entry.charmIds.push(charmId);
    if (charmName && !entry.charmNames.includes(charmName)) entry.charmNames.push(charmName);
  };

  for (const charm of Array.isArray(charms) ? charms : []) {
    if (!charm || typeof charm !== 'object') continue;
    const texts = charmUnlockTexts(charm);
    for (const text of texts) {
      const mastery = MASTERY_UNLOCK_RE.exec(text);
      if (mastery) {
        const skillName = String(mastery[1] || '').trim();
        add(slugifySkillName(skillName), skillName, charm);
        continue;
      }
      if (ENNEAD_UNLOCK_RE.test(text) && cls && ENNEAD_SKILL_BY_CLASS[cls] && charmMatchesClass(charm, cls)) {
        const skill = ENNEAD_SKILL_BY_CLASS[cls];
        add(skill.id, skill.name, charm);
        continue;
      }
      if (BLACK_ROAD_UNLOCK_RE.test(text) && cls && BLACK_ROAD_SKILL_BY_CLASS[cls]) {
        const skill = BLACK_ROAD_SKILL_BY_CLASS[cls];
        add(skill.id, skill.name, charm);
        continue;
      }
    }
    if (/^Sunstone of the Twin Seas$/i.test(String(charm.name || ''))) {
      add(SUNSTONE_SKILL.id, SUNSTONE_SKILL.name, charm);
    }
  }

  return bySkill;
}

/**
 * Skills that have spent points but none of their unlocking charms are enabled.
 * @param {{
 *   skillPoints?: Record<string, number>|null,
 *   ownedCharmIds?: Iterable<string>|null,
 *   charms?: object[]|null,
 *   className?: string|null,
 *   skillDisplayNames?: Record<string, string>|null,
 * }} opts
 * @returns {Array<{ skillId: string, skillName: string, charmNames: string[], points: number }>}
 */
export function findMissingCharmSkillUnlocks(opts = {}) {
  const skillPoints = opts.skillPoints && typeof opts.skillPoints === 'object' ? opts.skillPoints : {};
  /** @type {Set<string>} */
  const owned = new Set();
  for (const id of opts.ownedCharmIds || []) {
    const key = String(id || '').trim();
    if (key) owned.add(key);
  }
  const reqs = buildCharmSkillUnlockRequirements(opts.charms || [], opts.className);
  const names = opts.skillDisplayNames && typeof opts.skillDisplayNames === 'object' ? opts.skillDisplayNames : {};

  /** @type {Array<{ skillId: string, skillName: string, charmNames: string[], points: number }>} */
  const missing = [];
  for (const [skillId, pointsRaw] of Object.entries(skillPoints)) {
    const points = Number(pointsRaw);
    if (!Number.isFinite(points) || points <= 0) continue;
    const req = reqs.get(skillId);
    if (!req) continue;
    if (req.charmIds.some((id) => owned.has(id))) continue;
    const mapped = String(names[skillId] || '').trim();
    missing.push({
      skillId,
      skillName: mapped || req.skillName || skillId,
      charmNames: req.charmNames.slice(),
      points,
    });
  }
  missing.sort((a, b) => a.skillName.localeCompare(b.skillName, 'en'));
  return missing;
}
