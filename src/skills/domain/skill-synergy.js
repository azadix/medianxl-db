/**
 * @file Skill damage synergy (DmgSymPerCalc / EDmgSymPerCalc) resolution engine.
 *
 * The translated synergy/engine formulas still reference runtime tokens:
 *   - [[skill_id]] -> other skill blvl
 *   - [[skill_id]].{{stat}} -> other skill calc/level/aura/damage token
 *   - clcN -> this skill's own calcN (from `engine.calcN`)
 *   - synN -> this skill's sumskillN (from `engine.sumskill`, synergy-skill context)
 *   - astN / pstN -> aura / passive stats
 *   - blvl / slvl / lvl / ulvl -> levels (left for the main evaluator)
 *   - {{stat}} -> character stats (left for the main evaluator)
 * @module skills/domain/skill-synergy
 */

import { getFileSkillStore } from '@/shared/skill-data-store.js';

const MAX_DEPTH = 10;

/**
 * @param {string} displayName
 * @param {object} store
 * @returns {string|null} internal skill id
 */
function internalIdByDisplayName(displayName, store) {
  const want = String(displayName || '').trim().toLowerCase();
  if (!want) return null;
  for (const row of store?.catalogByInternalId?.values() || []) {
    if (String(row.displayName || '').trim().toLowerCase() === want) return String(row.id);
  }
  return null;
}

/**
 * @param {string} skillId internal id
 * @param {number} n calc index (1-4)
 * @param {object} store
 * @returns {string|null} raw calc formula
 */
function getCalc(skillId, n, store) {
  return store?.catalogByInternalId?.get(skillId)?.engine?.[`calc${n}`] || null;
}

/**
 * Resolve a formula's runtime tokens for one skill's context. `{{stat}}` and the
 * current-skill `blvl`/`lvl`/`ulvl` are left untouched for the main evaluator.
 * @param {string} skillId internal skill id
 * @param {string} formula
 * @param {object|null|undefined} characterState
 * @param {object} store
 * @param {number} [depth]
 * @returns {string}
 */
export function resolveEngineFormula(skillId, formula, characterState, store, depth = 0) {
  if (!formula || depth > MAX_DEPTH) return formula || '';
  let s = String(formula);

  // [[id]].{{stat}} then [[id]] (blvl), then legacy skill("Name"#id, stat).
  // Resolve first so inner clcN/synN run in the other skill's context.
  s = s.replace(/\[\[([a-zA-Z_][a-zA-Z0-9_]*)\]\]\.\{\{([a-zA-Z0-9_]+)\}\}/g, (m, id, stat) =>
    resolveSkillRef(String(id), String(stat), characterState, store, depth + 1)
  );
  s = s.replace(/\[\[([a-zA-Z_][a-zA-Z0-9_]*)\]\]/g, (m, id) => {
    // Bare skill refs use effective level (hard + soft), not just hard points.
    if (String(id) === String(skillId)) return 'lvl';
    return resolveSkillRef(String(id), 'lvl', characterState, store, depth + 1);
  });
  s = s.replace(/skill\("([^"]+)"#(\d+)\s*,\s*([a-zA-Z0-9_]+)\)/g, (m, name, _id, stat) =>
    resolveSkillRef(String(name), String(stat), characterState, store, depth + 1)
  );

  // clcN -> this skill's own calcN (recursive, same context)
  s = s.replace(/\bclc(\d+)\b/g, (m, n) => {
    const calc = getCalc(skillId, Number(n), store);
    return calc ? `(${resolveEngineFormula(skillId, calc, characterState, store, depth + 1)})` : '0';
  });

  // synN -> this skill's synergy slot (syn1 = +skill bonus; syn2..4 = sumskill level)
  s = s.replace(/\bsyn(\d+)\b/g, (m, n) =>
    resolveSynSkill(skillId, Number(n), characterState, store)
  );

  // astN / pstN -> this skill's own aura/passive calc
  s = s.replace(/\b(ast|pst)(\d+)\b/g, (m, kind, n) => {
    const key = kind === 'ast' ? `ast${n}` : `pst${n}`;
    const calc = store?.catalogByInternalId?.get(skillId)?.engine?.[key];
    return calc ? `(${resolveEngineFormula(skillId, calc, characterState, store, depth + 1)})` : '0';
  });

  return s;
}

/**
 * Resolve syn1/syn2/syn3/syn4.
 * syn1 = +skill bonus (soft level); syn2..4 = sumskill1..3 (else reqskill1..3) hard level.
 * @param {string} skillId internal id of the skill whose sumskill we resolve
 * @param {number} n 1-based syn index
 * @returns {string} resolved expression
 */
function synergySlotId(slots, n) {
  if (!slots) return '';
  if (!Array.isArray(slots)) return String(slots[`syn${n}`] || '').trim();
  return String(slots[n - 2] || '').trim();
}

function resolveSynSkill(skillId, n, characterState, store) {
  if (n === 1) {
    return String(levelsFor(skillId, characterState).slvl);
  }
  const slots = store?.catalogByInternalId?.get(skillId)?.engine?.synergySlots;
  const ref = synergySlotId(slots, n);
  if (ref) {
    const otherId = store?.catalogByInternalId?.has(ref) ? ref : internalIdByDisplayName(ref, store);
    if (otherId) return String(levelsFor(otherId, characterState).blvl);
  }
  return '0';
}

const ELEMENTAL_DMG_STAT_KEYS = [
  'fire_damage', 'cold_damage', 'lightning_damage', 'magic_damage', 'poison_dot', 'fire_dot',
];

/**
 * Get another skill's base damage formula (scaling-constant value0/value1) for a damage token.
 * @param {string} otherId
 * @param {string} which edmn/edmx/enma/exma/pdmn/pdmx
 * @param {object} store
 * @returns {string}
 */
function getOtherSkillDamageFormula(otherId, which, store) {
  const row = store?.catalogByInternalId?.get(otherId);
  const byKey = {};
  for (const c of row?.scalingConstants || []) byKey[c.statKey] = c;
  if (which === 'pdmn' || which === 'pdmx') {
    const p = byKey.physical_damage;
    if (!p) return '0';
    return which === 'pdmn' ? (p.value0 || '0') : (p.value1 || '0');
  }
  for (const k of ELEMENTAL_DMG_STAT_KEYS) {
    const c = byKey[k];
    if (c) return (which === 'edmn' || which === 'enma') ? (c.value0 || '0') : (c.value1 || '0');
  }
  return '0';
}

/**
 * @param {string} ref internal skill id or display name
 * @param {string} stat
 * @returns {string} resolved expression
 */
function resolveSkillRef(ref, stat, characterState, store, depth) {
  const key = String(ref || '');
  const otherId = store?.catalogByInternalId?.has(key) ? key : internalIdByDisplayName(key, store);
  if (otherId) {
    const levels = levelsFor(otherId, characterState);
    if (stat === 'blvl') return String(levels.blvl);
    if (stat === 'slvl') return String(levels.slvl);
    if (stat === 'lvl') return String(levels.lvl);
    const clc = /^clc(\d+)$/.exec(stat);
    if (clc) {
      const calc = getCalc(otherId, Number(clc[1]), store);
      if (calc) {
        let s = resolveEngineFormula(otherId, calc, characterState, store, depth + 1);
        s = s.replace(/\bblvl\b/g, String(levels.blvl)).replace(/\bslvl\b/g, String(levels.slvl));
        s = s.replace(/\blvl\b/g, String(levels.lvl));
        return `(${s})`;
      }
      return '0';
    }
    // skillcalc `aura` (aura_90): 1 if that skill's aura is on. Planner has no buff toggle yet.
    if (stat === 'aura' || /^aura_\d+$/.test(stat)) {
      return '0';
    }
    const syn = /^syn(\d+)$/.exec(stat);
    if (syn) {
      return resolveSynSkill(otherId, Number(syn[1]), characterState, store);
    }
    const astPst = /^(ast|pst)(\d+)$/.exec(stat);
    if (astPst) {
      const key = astPst[1] === 'ast' ? `ast${astPst[2]}` : `pst${astPst[2]}`;
      const calc = store?.catalogByInternalId?.get(otherId)?.engine?.[key];
      if (calc) {
        let s = resolveEngineFormula(otherId, calc, characterState, store, depth + 1);
        s = s.replace(/\bblvl\b/g, String(levels.blvl)).replace(/\bslvl\b/g, String(levels.slvl));
        s = s.replace(/\blvl\b/g, String(levels.lvl));
        return `(${s})`;
      }
      return '0';
    }
    const dmg = /^(edmn|edmx|enma|exma|pdmn|pdmx)$/.exec(stat);
    if (dmg) {
      const formula = getOtherSkillDamageFormula(otherId, dmg[1], store);
      if (formula && formula !== '0') {
        let s = resolveEngineFormula(otherId, formula, characterState, store, depth + 1);
        s = s.replace(/\bblvl\b/g, String(levels.blvl)).replace(/\bslvl\b/g, String(levels.slvl));
        s = s.replace(/\blvl\b/g, String(levels.lvl));
        return `(${s})`;
      }
      return '0';
    }
  }
  // unresolved (astN/pstN/aura without registry) -> 0
  return '0';
}

/**
 * @param {string} skillId
 * @param {object|null|undefined} characterState
 * @returns {{ blvl: number, slvl: number, lvl: number }}
 */
function levelsFor(skillId, characterState) {
  const blvl = Number(characterState?.blvl?.[skillId] || 0) || 0;
  const slvl = Number(characterState?.lvl?.[skillId] || 0) || 0;
  return { blvl, slvl, lvl: blvl + slvl };
}

/**
 * Evaluate the synergy % for a skill (physical or elemental).
 * @param {object} skill skill row (with `synergy` field)
 * @param {'physical'|'elemental'} kind
 * @param {object|null|undefined} characterState
 * @returns {number|null} synergy percent, or null if not present
 */
export function synergyPct(skill, kind, characterState) {
  const formula = skill?.synergy?.[kind];
  if (!formula) return null;
  const store = getFileSkillStore();
  if (!store) return null;
  const resolved = resolveEngineFormula(String(skill.id), formula, characterState, store);
  return resolved;
}

/**
 * Whether a skill has any synergy data.
 * @param {object|null|undefined} skill
 * @returns {boolean}
 */
export function hasSynergy(skill) {
  return Boolean(skill?.synergy && (skill.synergy.physical || skill.synergy.elemental));
}
