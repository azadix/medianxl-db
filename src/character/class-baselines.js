/**
 * Per-class default Life/Mana/attributes for the planner (from tree_data game_meta.classes).
 */

import { getFileSkillStore } from '@/tree/skill-data-store.js';

/** @param {unknown} value */
function parseOptionalNumber(value) {
  return value != null && value !== '' && !Number.isNaN(Number(value)) ? Number(value) : 0;
}

/**
 * Vitality/energy scaling uses only points above the class baseline vit/energy (row.vitality / row.energy).
 * @param {number} level Effective planner level (>= 1)
 * @param {number} vitality Current planner vitality
 * @param {number} energy Current planner energy
 * @param {{
 *   base_life: number, base_mana: number,
 *   vitality: number, energy: number,
 *   life_per_level: number, mana_per_level: number,
 *   life_per_vitality: number, mana_per_energy: number
 * }} row Class row from getClassPlannerStatDefaults (vitality/energy = base_vitality/base_energy)
 */
export function computeClassDerivedLifeMana(level, vitality, energy, row) {
  const lvl = Math.max(1, Number(level) || 1);
  const lvDelta = Math.max(0, lvl - 1);
  const vit = Math.max(0, Number(vitality) || 0);
  const ene = Math.max(0, Number(energy) || 0);
  const bl = parseOptionalNumber(row.base_life);
  const bm = parseOptionalNumber(row.base_mana);
  const baseVit = Math.max(0, parseOptionalNumber(row.vitality));
  const baseEne = Math.max(0, parseOptionalNumber(row.energy));
  const vitExtra = Math.max(0, vit - baseVit);
  const eneExtra = Math.max(0, ene - baseEne);
  const lpl = parseOptionalNumber(row.life_per_level);
  const mpl = parseOptionalNumber(row.mana_per_level);
  const lpv = parseOptionalNumber(row.life_per_vitality);
  const mpe = parseOptionalNumber(row.mana_per_energy);
  return {
    life: bl + lvDelta * lpl + vitExtra * lpv,
    mana: bm + lvDelta * mpl + eneExtra * mpe
  };
}

/**
 * Same math as {@link computeClassDerivedLifeMana}, split for tooltips / UI.
 * @param {number} level
 * @param {number} vitality
 * @param {number} energy
 * @param {object} row Same shape as {@link getClassPlannerStatDefaults} result
 */
export function computeClassDerivedLifeManaBreakdown(level, vitality, energy, row) {
  const lvl = Math.max(1, Number(level) || 1);
  const lvDelta = Math.max(0, lvl - 1);
  const vit = Math.max(0, Number(vitality) || 0);
  const ene = Math.max(0, Number(energy) || 0);
  const bl = parseOptionalNumber(row.base_life);
  const bm = parseOptionalNumber(row.base_mana);
  const baseVit = Math.max(0, parseOptionalNumber(row.vitality));
  const baseEne = Math.max(0, parseOptionalNumber(row.energy));
  const vitExtra = Math.max(0, vit - baseVit);
  const eneExtra = Math.max(0, ene - baseEne);
  const lpl = parseOptionalNumber(row.life_per_level);
  const mpl = parseOptionalNumber(row.mana_per_level);
  const lpv = parseOptionalNumber(row.life_per_vitality);
  const mpe = parseOptionalNumber(row.mana_per_energy);
  const lifeFromLevel = lvDelta * lpl;
  const lifeFromVitality = vitExtra * lpv;
  const manaFromLevel = lvDelta * mpl;
  const manaFromEnergy = eneExtra * mpe;
  return {
    effectiveLevel: lvl,
    levelsAbove1: lvDelta,
    baseLife: bl,
    lifePerLevel: lpl,
    lifeFromLevel,
    baseVitalityForScaling: baseVit,
    vitalityAboveBaseline: vitExtra,
    lifePerVitality: lpv,
    lifeFromVitality,
    lifeFromClassFormula: bl + lifeFromLevel + lifeFromVitality,
    baseMana: bm,
    manaPerLevel: mpl,
    manaFromLevel,
    baseEnergyForScaling: baseEne,
    energyAboveBaseline: eneExtra,
    manaPerEnergy: mpe,
    manaFromEnergy,
    manaFromClassFormula: bm + manaFromLevel + manaFromEnergy
  };
}

/**
 * Baselines + scaling coefficients for planner life/mana math.
 * @param {string} className
 * @returns {{
 *   base_life: number, base_mana: number,
 *   strength: number, dexterity: number, energy: number, vitality: number,
 *   life_per_level: number, mana_per_level: number,
 *   life_per_vitality: number, mana_per_energy: number
 * } | null}
 */
export function getClassPlannerStatDefaults(className) {
  if (!className) return null;
  const row = getFileSkillStore()?.gameMeta?.classes?.find((c) => c.name === className);
  if (!row) return null;
  const nonNegativeAttr = (value) => Math.max(0, parseOptionalNumber(value));
  return {
    base_life: parseOptionalNumber(row.base_life),
    base_mana: parseOptionalNumber(row.base_mana),
    strength: nonNegativeAttr(row.base_strength),
    dexterity: nonNegativeAttr(row.base_dexterity),
    energy: nonNegativeAttr(row.base_energy),
    vitality: nonNegativeAttr(row.base_vitality),
    life_per_level: parseOptionalNumber(row.life_per_level),
    mana_per_level: parseOptionalNumber(row.mana_per_level),
    life_per_vitality: parseOptionalNumber(row.life_per_vitality),
    mana_per_energy: parseOptionalNumber(row.mana_per_energy)
  };
}
