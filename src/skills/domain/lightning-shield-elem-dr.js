/**
 * Lightning Shield elemental/magic damage reduced:
 * full on the Amazon tree, 1/3 from relic oSkill for non-Amazons, none for other oSkills.
 * @module skills/domain/lightning-shield-elem-dr
 */

export const LIGHTNING_SHIELD_SKILL_ID = 'lightning_shield';
export const LIGHTNING_SHIELD_ELEM_DR_STAT_KEY = 'elemental_magic_damage_reduced_flat';
export const LIGHTNING_SHIELD_RELIC_ELEM_DR_FACTOR = 1 / 3;

/**
 * @param {unknown} id
 * @returns {string}
 */
function normalizeId(id) {
  return String(id || '').trim().toLowerCase();
}

/**
 * @param {Iterable<unknown>|null|undefined} list
 * @param {unknown} id
 * @returns {boolean}
 */
function listHasId(list, id) {
  const want = normalizeId(id);
  if (!want || list == null) return false;
  const arr = list instanceof Set ? [...list] : Array.isArray(list) ? list : [];
  return arr.some((entry) => normalizeId(entry) === want);
}

/**
 * @param {string|null|undefined} skillId
 * @param {string|null|undefined} statKey
 * @returns {boolean}
 */
export function isLightningShieldElemDrStat(skillId, statKey) {
  return (
    normalizeId(skillId) === LIGHTNING_SHIELD_SKILL_ID &&
    String(statKey || '').trim().toLowerCase() === LIGHTNING_SHIELD_ELEM_DR_STAT_KEY
  );
}

/**
 * @param {object|null|undefined} character
 * @returns {string[]}
 */
export function oSkillIdsFromCharacter(character) {
  return (character?.oSkills || [])
    .map((row) => String(row?.skillName || '').trim())
    .filter(Boolean);
}

/**
 * @param {Record<string, number>|null|undefined} grants
 * @returns {string[]}
 */
export function relicOSkillIdsFromGrants(grants) {
  if (!grants || typeof grants !== 'object') return [];
  return Object.entries(grants)
    .filter(([, amount]) => Number(amount) > 0)
    .map(([id]) => String(id));
}

/**
 * @param {object|null|undefined} characterState
 * @param {string} [skillId]
 * @returns {number}
 */
export function lightningShieldElemDrFactor(
  characterState = {},
  skillId = LIGHTNING_SHIELD_SKILL_ID
) {
  if (normalizeId(skillId) !== LIGHTNING_SHIELD_SKILL_ID) return 1;
  const isOSkill = listHasId(characterState?.oSkillIds, skillId);
  if (!isOSkill) return 1;
  const isAmazon = String(characterState?.className || '').trim().toLowerCase() === 'amazon';
  const hasRelic = listHasId(characterState?.relicOSkillIds, skillId);
  if (hasRelic && !isAmazon) return LIGHTNING_SHIELD_RELIC_ELEM_DR_FACTOR;
  return 0;
}

/**
 * @param {unknown} raw
 * @param {number} factor
 * @returns {number}
 */
export function scaleLightningShieldElemDrValue(raw, factor) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  if (factor === 1) return Math.trunc(n);
  if (factor === 0) return 0;
  return Math.trunc(n * factor);
}

/**
 * @param {object} scaling
 * @param {string} key
 * @param {number} factor
 * @param {boolean} showFormulas
 */
function scaleSlot(scaling, key, factor, showFormulas) {
  const raw = scaling[key];
  if (raw == null || raw === '') return;
  const str = String(raw).trim();
  const isPureNumber = /^-?\d+(\.\d+)?$/.test(str);
  if (showFormulas && !isPureNumber) {
    scaling[key] = factor === 0 ? '0' : `(${str})/3`;
    const evalKey = `${key}_evaluated`;
    if (scaling[evalKey] != null && scaling[evalKey] !== '') {
      scaling[evalKey] = String(scaleLightningShieldElemDrValue(scaling[evalKey], factor));
    }
    return;
  }
  if (isPureNumber) {
    scaling[key] = String(scaleLightningShieldElemDrValue(str, factor));
  }
}

/**
 * @param {string} skillId
 * @param {string} statKey
 * @param {object|null|undefined} scaling
 * @param {object|null|undefined} characterState
 * @param {boolean} [showFormulas]
 * @returns {object|null|undefined}
 */
export function applyLightningShieldElemDrToScaling(
  skillId,
  statKey,
  scaling,
  characterState,
  showFormulas = false
) {
  if (!scaling || !isLightningShieldElemDrStat(skillId, statKey)) return scaling;
  const factor = lightningShieldElemDrFactor(characterState, skillId);
  if (factor === 1) return scaling;
  scaleSlot(scaling, 'value0', factor, showFormulas);
  return scaling;
}
